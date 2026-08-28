/* The industry system. LANE D (industry).

   Everything that does work so the player does not have to. Today that is
   the first rung of it that is a machine rather than a tool: RAIL HAULAGE.
   A wagon holds forty backpacks, runs where track runs, rolls downhill on
   its own, and empties itself into whatever is standing at the end of the
   line. Lane F priced that rung (src/content/haulage.js) and this lane
   builds it.

   PUBLISHED API (industry.api):
     canLayRail(x, y)      -> { ok, reason?, missing?, site? }
     layRail(x, y)         -> the same verdict, and lays it when ok
     layRun(x0, x1)        -> lay a whole run along the ground
     takeUpRail(x, y)      -> pull one up, materials back on the floor
     railAt(x, y) railTopAt(x, nearY) rails()
     canBuildWagon(x, y)   -> { ok, reason?, missing? }
     buildWagon(x, y)      -> put one on the track here
     wagonAt(x, y) wagons()
     wagonStore(wagon)     -> add/take/mass/free/count/all/fits/capacity
     shove(wagon, dir)  brake(wagon, on)  tip(wagon)  rerail(wagon)
     removeWagon(wagon)
     haulage(rungId)       -> lane F's rung, for the guidebook
     powerAt(x, y)         -> 0 everywhere, honestly: nothing generates yet

   EVENTS emitted:
     "rail:laid"       { x, y, w }
     "rail:removed"    { x, y, why, returned }
     "wagon:placed"    { x, y }
     "wagon:changed"   { id, count, x, y }
     "wagon:derailed"  { x, y, load }
     "wagon:rerailed"  { x, y }
     "wagon:unloaded"  { x, y, moved, into }
     "rig:raised"      { id, count, x, y }
     "rig:idle"        { x, y, why }      no beam, or no shaft under it
     "rig:jammed"      { x, y, why }      the tank is full
     "well:dry"        { x, y, lifted }

   INPUT. Two keys, both bound here rather than waiting for a screen, and
   both registered in ARCHITECTURE section 4a in the commit that binds them.
   Lane C set the precedent for a lane opening its own door (their rotate and
   remove keys) and docs/WORKFLOW.md section 4c is why: a capability with no
   call site is the most expensive failure this project has, three times over.
   The UI lane may take either of these into a screen; say the word and they
   go.

     q   TRACK.  On bare ground it lays a rail; on track it takes one up.
     e   WAGON.  On track it builds a wagon; on a wagon it loads from your
                 pack, and tips the load out when you have nothing to give it.

   PUSHING HAS NO KEY, on purpose. You push a wagon by walking into it, which
   is what a person does to a cart and what nobody has to be told. It also
   costs no input the other lanes could have wanted. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { mouse } from "../core/input.js";
import { HAULAGE, haulage } from "../content/haulage.js";
import { rails, clearRails, railAt, railTopAt, canLay, layRail, layRun,
         removeRailAt, updateRails,
         serialiseRails, restoreRails } from "./rails.js";
import { wagons, clearWagons, placeWagon, removeWagon, wagonAt, wagonStore,
         updateWagons, rerail, shove, loadedMass,
         serialiseWagons, restoreWagons } from "./wagon.js";
import { updateDerricks, clearPumps, pumpState, beamBeside, boreIntake,
         pipeLengthFor, wellReading } from "./oil.js";
import { renderRails, renderWagons } from "./render_ind.js";
import { WAGON_COST, WAGON_W, WAGON_H, PUSH_REACH } from "./spec.js";

export const TRACK_KEY = "q";
export const WAGON_KEY = "e";

/* How much the player has to move in a tick to count as leaning on a cart.
   Below this they are shuffling or being nudged by the ground, and a wagon
   should not creep away from somebody standing still beside it. */
const PUSH_MOVE = 0.15;
/* And how level with it they have to be, so a cart cannot be pushed from a
   ledge above the track. */
const PUSH_LIFT = 22;

/* One boot, one set of listeners - the same note as lane C's build/index.js
   and items/drops.js. */
let detach = [];

export function createIndustry(world, items, build){
  let lastPx = null;

  /* Building a wagon spends materials out of the pack, exactly as lane C's
     place() does for a building. A wagon is assembled where it will run. */
  function canBuildWagon(x, y){
    const top = railTopAt(Math.round(x), y);
    if(top === null) return { ok:false, reason:"needs track to stand on" };
    if(wagonAt(x, top - WAGON_H/2, WAGON_W))
      return { ok:false, reason:"there is a wagon there already" };
    const p = state.player;
    if(Math.hypot(x - p.x, top - p.y) > PUSH_REACH)
      return { ok:false, reason:"too far away" };
    const missing = [];
    for(const id in WAGON_COST){
      const have = items.inventory.count(id), need = WAGON_COST[id];
      if(have < need) missing.push({ id, need, have });
    }
    if(missing.length) return { ok:false, reason:"missing materials", missing };
    return { ok:true };
  }

  function buildWagon(x, y){
    const v = canBuildWagon(x, y);
    if(!v.ok) return v;
    for(const id in WAGON_COST) items.inventory.take(id, WAGON_COST[id]);
    return placeWagon(x, y);
  }

  /* Move as much of the pack into the wagon as it will take. Add first, then
     take: a wagon that is full leaves the goods on the player's back. */
  function loadFromPack(w){
    const store = wagonStore(w, items.itemDef);
    let moved = 0;
    for(const id in items.inventory.all()){
      const have = items.inventory.count(id);
      if(have <= 0) continue;
      const took = store.add(id, have);
      if(took > 0){ items.inventory.take(id, took); moved += took; }
    }
    return moved;
  }

  /* What the pack is holding that this wagon could take. Nothing means the
     player has come to the cart empty-handed, which is what "tip it out" is. */
  function packHasCargo(w){
    const store = wagonStore(w, items.itemDef);
    for(const id in items.inventory.all())
      if(items.inventory.count(id) > 0 && store.fits(id, 1) > 0) return true;
    return false;
  }

  for(const off of detach) off();
  detach = [
    bus.on("world:generated", () => {
      clearRails(); clearWagons(); clearPumps(); lastPx = null;
    }),

    bus.on("input:key", e => {
      if(!e.down || state.paused) return;

      if(e.key === TRACK_KEY){
        /* one key for the whole verb: lay where there is none, take up where
           there is. A mis-press costs nothing, because taking track up hands
           the steel straight back. */
        if(railAt(mouse.wx, mouse.wy, 6)){
          if(!wagonAt(mouse.wx, mouse.wy, WAGON_W))
            removeRailAt(mouse.wx, mouse.wy, items.spawnDrop);
          return;
        }
        const r = layRail(world, items, mouse.wx, mouse.wy);
        if(!r.ok) bus.emit("rail:refused", { reason: r.reason, missing: r.missing });
        return;
      }

      if(e.key === WAGON_KEY){
        const w = wagonAt(mouse.wx, mouse.wy, WAGON_W);
        if(w){
          if(packHasCargo(w)) loadFromPack(w);
          else w.tipping = !w.tipping;
          return;
        }
        const r = buildWagon(mouse.wx, mouse.wy);
        if(!r.ok) bus.emit("wagon:refused", { reason: r.reason, missing: r.missing });
      }
    })
  ];

  /* Walking into a cart pushes it. The player's own velocity is lane B's and
     not published, so this reads the pose that is: how far they moved this
     tick, which is the same fact. */
  function pushByWalking(){
    const p = state.player;
    if(lastPx === null){ lastPx = p.x; return; }
    const dx = p.x - lastPx;
    lastPx = p.x;
    if(Math.abs(dx) < PUSH_MOVE) return;

    const dir = Math.sign(dx);
    for(const w of wagons){
      if(w.derailed) continue;
      if(Math.abs(w.y + w.h/2 - p.y) > PUSH_LIFT) continue;
      const gap = w.x - p.x;
      if(Math.abs(gap) > PUSH_REACH) continue;
      if(Math.sign(gap) !== dir) continue;     /* pushing away, not through */
      shove(w, dir, p.x, p.y, items.itemDef);
    }
  }

  return {
    name: "industry",

    tick(){
      pushByWalking();
      updateRails(world, items.spawnDrop, state.tick);
      updateWagons({ world, items, build });
      /* Wells. Ordinary per-tick work, near or far - see the long note in
         oil.js on why a walking beam being slow is what makes that cheap. */
      updateDerricks(world, build, items.itemDef);
    },

    /* After lane C's structures, so a wagon standing at a chest draws in
       front of it - which is what a cart at a loading dock looks like. */
    renderBuild(ctx){
      renderRails(ctx);
      renderWagons(ctx, items.itemDef);
    },

    serialise(){
      if(!rails.length && !wagons.length) return undefined;
      return { rails: serialiseRails(), wagons: serialiseWagons() };
    },
    restore(data){
      if(!data) return;
      restoreRails(data.rails);
      restoreWagons(data.wagons);
    },

    api: {
      canLayRail: (x, y, opts) => canLay(world, items, x, y, opts),
      layRail: (x, y, opts) => layRail(world, items, x, y, opts),
      layRun: (x0, x1, opts) => layRun(world, items, x0, x1, opts),
      takeUpRail: (x, y) => removeRailAt(x, y, items.spawnDrop),
      railAt, railTopAt,
      rails: () => rails.slice(),

      canBuildWagon, buildWagon,
      wagonAt, wagons: () => wagons.slice(),
      wagonStore: w => wagonStore(w, items.itemDef),
      loadedMass: w => loadedMass(w, items.itemDef),
      loadFromPack,
      shove: (w, dir) => shove(w, dir, state.player.x, state.player.y, items.itemDef),
      brake(w, on){ if(w) w.brake = on !== false; return !!(w && w.brake); },
      tip(w, on){ if(w) w.tipping = on !== false; return !!(w && w.tipping); },
      rerail,
      removeWagon,

      /* ---- oil ----
         The derrick and the walking beam are lane F's BUILDINGS entries and
         lane C places them; this lane only makes the pair work. */
      wellAt(x, y){
        const s = build.structureAt(x, y);
        if(!s || s.defId !== "derrick") return null;
        const st = pumpState(s);
        return { structure: s, built: s.built,
                 beam: !!beamBeside(build, s),
                 lifted: st.lifted, pixels: st.pixels,
                 dry: st.dry, jammed: st.jammed,
                 pipe: pipeLengthFor(s),
                 bore: boreIntake(world, s, pipeLengthFor(s)) };
      },
      wellReading: rig => wellReading(world, rig),
      beamFor: s => beamBeside(build, s),

      /* Lane F's ladder, passed through rather than copied, so the guidebook
         and this lane can never disagree about what a rung is worth. */
      haulage, HAULAGE,

      /* HONEST ZERO. Lane C's structures are told they may ask whether they
         are driven; nothing in the game generates power yet, so the answer
         is nought everywhere and will be until a water wheel exists. A stub
         that returned something would be worse than not publishing it. */
      powerAt(){ return 0; },

      pushReach: PUSH_REACH,
      trackKey: TRACK_KEY, wagonKey: WAGON_KEY
    }
  };
}
