/* Rolling stock. LANE D (industry).

   THE ONE RULE THIS FILE EXISTS TO KEEP: at the end of every tick, every item
   in the game is in exactly one place. A load is in the pack, or in a
   container, or in this wagon, or lying on the ground, or back in the
   landscape as pixels - never in two, never in none. That is what "the ore
   arrives as real material and not teleporting" means, and it is the reason
   every transfer below is written add-first-then-take: if the destination
   would not take it, the source still has it.

   THE SHAPE IS COPIED FROM A KILN, deliberately. Lane C's stations already
   run unattended - a job, progress, a store, and an interruption that gives
   the material back (src/build/production.js). A wagon is the same object
   with a position: it works while the player is elsewhere, it holds real
   goods, and when it comes to grief the goods still exist.

   WHAT A DERAILMENT IS HERE. The brief asks that track surviving the ground
   being dug out should look like a derailment, not a crash. So a wagon that
   finds no rail under it stops dead where it stands and keeps its load. It is
   lying over with the ore in it; recovering it is work, and the work is the
   punishment. Spilling the load would have been the showier choice and it is
   the wrong one - fifteen hundred kilos of ore is three hundred chunks on the
   ground, which is a frame-rate event and a tedious clean-up, not a lesson. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { railTopAt, railAt } from "./rails.js";
import { WAGON_W, WAGON_H, WAGON_TARE, wagonCapacity, topSpeed,
         GRAVITY, ROLL, BRAKE_A, SHOVE, PUSH_REACH,
         UNLOAD_KG, TIP_PER_TICK, DOCK_REACH } from "./spec.js";

export const wagons = [];
let nextId = 1;

/* Below this a wagon counts as standing still, so it can be unloaded. Small
   enough that it is genuinely stopped, large enough that rolling resistance
   reaches it in finite time. */
const STOP_EPS = 0.02;

/* How far ahead and behind the gradient is measured. Half a segment: shorter
   and a wagon reads the joint between two rails as a cliff. */
const GRADE_DX = 12;

/* A runaway is a real thing and it should be possible, but not unbounded. */
const RUNAWAY = 2.0;

export function clearWagons(){ wagons.length = 0; nextId = 1; }

export function makeWagon(x, y){
  return {
    id: nextId++,
    x, y,
    w: WAGON_W, h: WAGON_H,
    v: 0,
    brake: false,
    shove: 0,                 /* set by shove(), spent this tick */
    derailed: false,
    tipping: false,
    store: { cap: wagonCapacity(), items: Object.create(null) },
    /* kilos owed to the destination but not yet handed over, so a rated
       transfer can move a fraction of an item's mass per tick without ever
       having a fraction of an item exist anywhere */
    owed: 0
  };
}

/* Put a wagon on the track. It has to be ON track: a wagon on the ground is
   a wagon you have to lift, and lifting is a later machine. */
export function placeWagon(x, y){
  const top = railTopAt(Math.round(x), y);
  if(top === null) return { ok:false, reason:"needs track under it" };
  const w = makeWagon(Math.round(x), top - WAGON_H);
  wagons.push(w);
  bus.emit("wagon:placed", { x: w.x, y: w.y });
  return { ok:true, wagon:w };
}

export function removeWagon(w){
  const i = wagons.indexOf(w);
  if(i >= 0) wagons.splice(i, 1);
  return i >= 0;
}

export function wagonAt(x, y, r = 16){
  let best = null, bestD = Infinity;
  for(const w of wagons){
    const dx = w.x - x, dy = w.y + w.h/2 - y;
    const d = dx*dx + dy*dy;
    if(d < bestD && d <= r*r){ bestD = d; best = w; }
  }
  return best;
}

/* ---------------------------------------------------------------- load --- */

/* The same add/take/mass/fits vocabulary as the backpack and as a chest.
   That is the point of it being the same: anything that can fill a chest can
   fill a wagon with no new code on either side. */
export function wagonStore(w, itemDef){
  if(!w) return null;
  const store = w.store;

  const mass = () => {
    let m = 0;
    for(const id in store.items) m += store.items[id] * itemDef(id).mass;
    return m;
  };
  const fits = (id, n) => {
    const m = itemDef(id).mass;
    if(m <= 0) return n;
    return Math.max(0, Math.min(n, Math.floor((store.cap - mass() + 1e-9)/m)));
  };

  return {
    wagon: w,
    capacity: () => store.cap,
    mass,
    free: () => Math.max(0, store.cap - mass()),
    count: id => store.items[id] || 0,
    all: () => Object.assign({}, store.items),
    fits,
    add(id, n = 1){
      const room = fits(id, n);
      if(room <= 0) return 0;
      store.items[id] = (store.items[id] || 0) + room;
      bus.emit("wagon:changed", { id, count: store.items[id], x:w.x, y:w.y });
      return room;
    },
    take(id, n = 1){
      const have = store.items[id] || 0;
      const many = Math.min(n, have);
      if(many <= 0) return 0;
      store.items[id] = have - many;
      if(store.items[id] === 0) delete store.items[id];
      bus.emit("wagon:changed", { id, count: store.items[id] || 0, x:w.x, y:w.y });
      return many;
    }
  };
}

export function loadedMass(w, itemDef){
  let m = WAGON_TARE;
  for(const id in w.store.items) m += w.store.items[id] * itemDef(id).mass;
  return m;
}

/* Move goods between any two things that speak the store vocabulary. ADD
   FIRST, THEN TAKE: a destination that refuses leaves the source untouched,
   so a full chest cannot swallow a load into nowhere. */
export function transfer(from, to, id, n){
  const have = from.count(id);
  const want = Math.min(n, have);
  if(want <= 0) return 0;
  const moved = to.add(id, want);
  if(moved <= 0) return 0;
  from.take(id, moved);
  return moved;
}

/* ------------------------------------------------------------- pushing --- */

/* A shove is a FORCE, not a speed: dv = force / mass. An empty wagon starts
   at a touch and a full one takes several seconds of leaning on it, which is
   the whole reason a player would rather dig a gradient than push. */
export function shove(w, dir, px, py, itemDef){
  if(!w || w.derailed) return false;
  if(px !== undefined && Math.hypot(w.x - px, w.y + w.h/2 - py) > PUSH_REACH)
    return false;
  w.shove = Math.sign(dir) * SHOVE / loadedMass(w, itemDef);
  return true;
}

/* -------------------------------------------------------------- unload --- */

/* Is the cart standing at something it can be emptied into? A cross of probe
   points beside and below the wagon, so a chest or a station ALONGSIDE the
   track counts - the alternative is demanding the player put a forge on the
   rails, which is not how a siding works. */
function containerBeside(build, w){
  for(const dx of [-DOCK_REACH, 0, DOCK_REACH]){
    for(const dy of [0, 6, 12]){
      const c = build.storageAt(Math.round(w.x + dx), Math.round(w.y + w.h/2 + dy));
      if(c) return c;
    }
  }
  return null;
}

function anyLoad(w){
  for(const id in w.store.items) if(w.store.items[id] > 0) return id;
  return null;
}

/* Hand over a metered number of kilos. The meter is in MASS rather than in
   items so that a tonne of ore and a tonne of charcoal take the same time to
   shovel across, which is the honest reading of "unloading is work". */
function handOver(w, dest, itemDef){
  w.owed += UNLOAD_KG;
  let moved = 0;
  for(const id in w.store.items){
    const m = Math.max(0.01, itemDef(id).mass);
    while(w.owed >= m){
      const n = transfer(wagonStore(w, itemDef), dest, id, 1);
      if(n <= 0){ w.owed = 0; return moved; }   /* destination is full */
      w.owed -= m;
      moved += n;
    }
    if(w.owed < 0.01) break;
  }
  return moved;
}

/* --------------------------------------------------------------- tick ---- */

export function updateWagons(deps){
  const { world, items, build } = deps;
  const itemDef = items.itemDef;

  for(const w of wagons){
    const shoveThisTick = w.shove;
    w.shove = 0;

    if(w.derailed){ w.v = 0; continue; }

    /* WHERE AM I. No graph, just the ground truth of what is under the
       wheels. Nothing there means the wagon has run off the end of the
       track, or the track has gone from under it. */
    const top = railTopAt(Math.round(w.x), w.y + w.h);
    if(top === null){
      w.derailed = true;
      w.v = 0;
      bus.emit("wagon:derailed", { x: w.x, y: w.y, load: Object.assign({}, w.store.items) });
      continue;
    }
    w.y = top - w.h;

    /* GRADIENT. y grows downward, so track that is lower ahead of the wagon
       than behind it is track running downhill to the right. */
    const ahead = railTopAt(Math.round(w.x + GRADE_DX), w.y + w.h);
    const behind = railTopAt(Math.round(w.x - GRADE_DX), w.y + w.h);
    let slope = 0;
    if(ahead !== null && behind !== null) slope = (ahead - behind) / (2 * GRADE_DX);
    else if(ahead !== null) slope = (ahead - top) / GRADE_DX;
    else if(behind !== null) slope = (top - behind) / GRADE_DX;

    w.v += GRAVITY * slope;
    w.v += shoveThisTick;

    /* A cart standing at something it can be emptied into pulls up at it.
       An EMPTY cart rolls straight past, or every siding on the line would
       be a stop and the return trip would never happen. */
    const dest = (build && anyLoad(w)) ? containerBeside(build, w) : null;
    const braking = w.brake || !!dest;

    /* Rolling resistance, then the brake. Both oppose motion and neither may
       drive the wagon backwards through zero. */
    const drag = ROLL + (braking ? BRAKE_A : 0);
    if(Math.abs(w.v) <= drag) w.v = 0;
    else w.v -= Math.sign(w.v) * drag;

    const vmax = topSpeed("mine_wagon") * RUNAWAY;
    if(w.v > vmax) w.v = vmax;
    if(w.v < -vmax) w.v = -vmax;
    if(Math.abs(w.v) < STOP_EPS) w.v = 0;

    w.x += w.v;

    /* UNLOADING, once it is actually standing. A moving cart is not being
       emptied; someone has to be shovelling. */
    if(dest && w.v === 0){
      const moved = handOver(w, dest, itemDef);
      if(moved > 0)
        bus.emit("wagon:unloaded", { x: w.x, y: w.y, moved,
                                     into: dest.structure ? dest.structure.defId : null });
    } else if(!dest){
      w.owed = 0;
    }

    /* TIPPING. Spoil goes back into the landscape as landscape, through lane
       A's pour, which settles it by the ordinary rules - so a heap a wagon
       tips is a heap the world agrees with. What is not ground goes on the
       floor as chunks. Either way the wagon only lets go of what was taken. */
    if(w.tipping && w.v === 0){
      let n = TIP_PER_TICK;
      while(n-- > 0){
        const id = anyLoad(w);
        if(!id){ w.tipping = false; break; }
        if(world.materialForItem(id) >= 0){
          const r = world.dumpItem(Math.round(w.x), Math.round(w.y + w.h + 2), id, 1);
          if(r.accepted > 0) w.store.items[id] -= r.accepted;
          else { w.tipping = false; break; }        /* nowhere to put it */
        } else {
          items.spawnDrop(w.x, w.y + w.h/2, id);
          w.store.items[id] -= 1;
        }
        if(w.store.items[id] <= 0) delete w.store.items[id];
        bus.emit("wagon:changed", { id, count: w.store.items[id] || 0, x:w.x, y:w.y });
      }
    }
  }
}

/* Put a derailed wagon back on the rails. There has to be track under it,
   which is the point: you re-lay the length that fell in, then re-rail. */
export function rerail(w){
  if(!w || !w.derailed) return false;
  const top = railTopAt(Math.round(w.x), w.y + w.h);
  if(top === null) return false;
  w.derailed = false;
  w.y = top - w.h;
  w.v = 0;
  bus.emit("wagon:rerailed", { x: w.x, y: w.y });
  return true;
}

/* --------------------------------------------------------------- save ---- */

export function serialiseWagons(){
  return wagons.map(w => ({ x: Math.round(w.x), y: Math.round(w.y),
                            v: w.v, derailed: w.derailed,
                            items: Object.assign({}, w.store.items) }));
}
export function restoreWagons(data){
  clearWagons();
  if(!Array.isArray(data)) return;
  for(const d of data){
    const w = makeWagon(d.x, d.y);
    w.v = d.v || 0;
    w.derailed = !!d.derailed;
    w.store.items = Object.assign(Object.create(null), d.items || {});
    wagons.push(w);
  }
}

export { STOP_EPS, GRADE_DX };
