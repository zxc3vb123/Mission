/* Structures standing in the world. LANE C (build).

   A building is not an item and not a landscape pixel: it is an object that
   occupies a rectangle, is raised over time out of hauled materials, and
   falls down when the ground under it is dug away. The landscape belongs to
   lane A and we never write to it - a structure sits ON the world, it is not
   part of it.

   Two laws from docs/GAME_DESIGN.md drive everything here:
     - Nothing floats. Support is checked when it is placed and again while
       it stands, so digging out a hut's footing brings the hut down.
     - Matter is conserved. A collapse returns its materials to the world as
       real chunks rather than deleting them. */

import { bus } from "../core/bus.js";
import { rnd } from "../core/rng.js";
import { BUILDINGS, building, deconstructTime } from "../content/buildings.js";
import { storeCapacity, tickJob, heldBy } from "./production.js";
import { ITEM_DATA } from "../content/items.js";

export const TICKS_PER_SECOND = 36;

/* Support is re-checked on a slow beat: a building cannot fall in less time
   than it takes to notice, and checking every footprint every tick is waste. */
const SUPPORT_EVERY = 12;

/* HOW MUCH COMES BACK IS A PROPERTY OF THE MATERIAL, NOT A TAX ON THE
   PLAYER. A fired brick prised out of a wall is still a brick. Quicklime
   slaked into mortar is chemically part of that wall and does not come back
   as quicklime - it was transformed, not confiscated. That is the difference
   between conservation of matter and an arbitrary penalty, and it is why the
   lever is per-material rather than a flat "you lose a quarter".

   LANE F owns the numbers: put `recover: 0..1` on an entry in items.js and
   this reads it. The default is 1, full recovery, because destroying a
   player's property needs a designed reason and silence is not one. */
export function recoverFraction(id){
  const d = ITEM_DATA[id];
  return (d && typeof d.recover === "number") ? d.recover : 1;
}

export const structures = [];
let nextId = 1;

export function clearStructures(){ structures.length = 0; nextId = 1; }

export function makeStructure(defId, x, y){
  const def = building(defId);
  if(!def) return null;
  const s = {
    id: nextId++,
    defId, x, y, w: def.w, h: def.h,
    progress: 0,
    need: Math.max(1, Math.round((def.time||1) * TICKS_PER_SECOND)),
    built: false,
    taking: null,               /* deconstruction in progress */
    /* A chest is where you put things; a kiln is where things appear. Both
       need somewhere to hold them, and both answer to storageAt(). */
    store: storeCapacity(defId)
      ? { cap: storeCapacity(defId), items: Object.create(null) }
      : null,
    job: null
  };
  return s;
}

export function rect(s){ return { x0:s.x, y0:s.y, x1:s.x+s.w, y1:s.y+s.h }; }

export function overlaps(a, b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

/* How close under the footprint ground still counts as holding it up. A
   pixel landscape is never laser-flat, so demanding solid at exactly one row
   would make most of the real surface unbuildable. A few pixels of hollow is
   a building bridging a dip; more than that is a building in mid-air. */
export const SUPPORT_DEPTH = 4;

/* What fraction of the footprint's width has ground under it. */
export function groundFraction(world, x, y, w, h){
  let solid = 0;
  for(let cx = x; cx < x+w; cx++){
    for(let d = 0; d < SUPPORT_DEPTH; d++){
      if(world.isSolid(cx, y+h+d)){ solid++; break; }
    }
  }
  return w > 0 ? solid/w : 0;
}

/* How much of the footprint is buried in the landscape. A building goes in a
   space, not inside a hill. */
export function buriedFraction(world, x, y, w, h){
  let solid = 0, total = 0;
  for(let cy = y; cy < y+h; cy++){
    for(let cx = x; cx < x+w; cx++){
      total++;
      if(world.isSolid(cx, cy)) solid++;
    }
  }
  return total > 0 ? solid/total : 0;
}

/* Some things do not stand on the ground: a ladder is nailed to the wall of
   the shaft you dug, and demanding a foundation under it would make it
   useless exactly where it is wanted. So support has two kinds, and a
   building says which it needs.

   A wall counts if there is solid material against either side of the
   footprint over enough of its height. Half is deliberate: a ladder crossing
   a doorway or a seam of loose earth should not fall off the wall. */
const WALL_FRACTION = 0.5;

export function wallFraction(world, x, y, w, h){
  let left = 0, right = 0;
  for(let cy = y; cy < y+h; cy++){
    if(world.isSolid(x-1, cy)) left++;
    if(world.isSolid(x+w, cy)) right++;
  }
  return h > 0 ? Math.max(left, right)/h : 0;
}

/* Something solid directly overhead, for anything that hangs. */
export function anchorAbove(world, x, y, w){
  for(let cx = x; cx < x+w; cx++) if(world.isSolid(cx, y-1)) return true;
  return false;
}

/* Whatever holds this particular building up, still holding it. */
export function isSupported(world, s){
  const def = building(s.defId);
  const sup = (def && def.support) || {};

  if(sup.wall)
    return wallFraction(world, s.x, s.y, s.w, s.h) >= WALL_FRACTION - 1e-9;
  if(sup.anchor === "above")
    return anchorAbove(world, s.x, s.y, s.w) || hangsFromStructure(s);

  const want = sup.ground ?? 1;
  if(want <= 0) return true;
  return groundFraction(world, s.x, s.y, s.w, s.h) >= want - 1e-9;
}

/* A hanging thing may also hang off another one, so a rope can be extended
   downwards a length at a time. */
function hangsFromStructure(s){
  for(const o of structures){
    if(o === s) continue;
    const def = building(o.defId);
    if(!def || !def.climb) continue;
    if(o.x < s.x + s.w && o.x + o.w > s.x && Math.abs((o.y + o.h) - s.y) <= 1)
      return true;
  }
  return false;
}

/* Can the clonk go up this? Lane B asks through build.api.climbableAt. */
export function climbableAt(x, y){
  for(const s of structures){
    if(!s.built) continue;
    const def = building(s.defId);
    if(!def || !def.climb) continue;
    if(x >= s.x-1 && x < s.x+s.w+1 && y >= s.y && y < s.y+s.h) return s;
  }
  return null;
}

/* Everything it was made of, back on the ground - AND everything it was
   holding. Conservation of matter is a hard rule and it does not get an
   exception for being mid-smelt: the iron in an interrupted job comes back,
   and so does output nobody had collected yet. A game that silently eats a
   player's ore is a game they stop trusting. */
function scatterMaterials(spawnDrop, s){
  const def = building(s.defId);
  if(!def) return { dropped: 0, held: {} };

  /* A half-built structure has only had part of its materials worked in, but
     all of them were carried to the site, so all of them come back. */
  let n = 0;
  const put = (id, count) => {
    for(let i=0;i<count;i++){
      spawnDrop(s.x + rnd()*s.w, s.y + rnd()*s.h*0.5, id, { hold: 30 });
      n++;
    }
  };
  for(const id in def.materials) put(id, def.materials[id]);

  const held = heldBy(s);
  for(const id in held) put(id, held[id]);

  return { dropped: n, held };
}

/* What a deliberate takedown would give back: the recoverable share of what
   it is made of, plus EVERYTHING it is merely holding. A job's inputs and an
   uncollected output were never built into the walls, so they come back
   whole however the building goes away. */
export function recoverableFrom(s){
  const def = building(s.defId);
  const out = Object.create(null);
  if(!def) return out;

  /* A half-built structure has had only part of its materials worked in, so
     the unworked share is still loose on the site and comes back whole. */
  const worked = s.built ? 1 : Math.min(1, s.progress / s.need);
  for(const id in def.materials){
    const total = def.materials[id];
    const builtIn = Math.round(total * worked);
    const loose = total - builtIn;
    out[id] = loose + Math.floor(builtIn * recoverFraction(id));
  }

  const held = heldBy(s);
  for(const id in held) out[id] = (out[id] || 0) + held[id];

  for(const id in out) if(out[id] <= 0) delete out[id];
  return out;
}

/* Start taking one apart. Deliberate, unlike a collapse, so it takes time
   and can be called off. */
export function startDeconstruct(s){
  if(s.taking) return s.taking;
  /* How long is lane F's, as a fraction of the build rather than a number per
     building, so it stays right while they tune. Quicker than raising, and
     deliberately not instant: a free undo would delete the decision that
     placing something is supposed to be. */
  s.taking = {
    ticks: 0,
    need: Math.max(1, Math.round(deconstructTime(s.defId) * TICKS_PER_SECOND))
  };
  bus.emit("structure:deconstructing", { defId: s.defId, x: s.x, y: s.y,
                                         need: s.taking.need,
                                         returns: recoverableFrom(s) });
  return s.taking;
}

export function cancelDeconstruct(s){
  if(!s.taking) return false;
  s.taking = null;
  bus.emit("structure:deconstruct_cancelled", { defId: s.defId, x: s.x, y: s.y });
  return true;
}

export function deconstructProgress(s){
  return s.taking ? Math.min(1, s.taking.ticks / s.taking.need) : 0;
}

export function collapse(spawnDrop, s, why){
  const i = structures.indexOf(s);
  if(i < 0) return false;
  structures.splice(i, 1);
  const out = scatterMaterials(spawnDrop, s);
  /* The event names what was inside, so a UI can say "your iron came back"
     rather than leaving the player to work out what they just lost. */
  bus.emit("structure:collapsed", {
    defId: s.defId, x: s.x, y: s.y, why,
    dropped: out.dropped, held: out.held,
    interrupted: s.job ? s.job.recipeId : null
  });
  return true;
}

/* One simulation step for everything standing. */
export function updateStructures(world, spawnDrop, tick){
  for(let i=structures.length-1;i>=0;i--){
    const s = structures[i];

    if(!s.built){
      s.progress++;
      if(s.progress >= s.need){
        s.built = true;
        bus.emit("structure:built", { defId: s.defId, x: s.x, y: s.y });
      }
    }

    /* A station works whether or not anybody is watching it. */
    tickJob(s);

    /* Being taken apart on purpose. */
    if(s.taking && ++s.taking.ticks >= s.taking.need){
      const returns = recoverableFrom(s);
      structures.splice(i, 1);
      let n = 0;
      for(const id in returns){
        for(let k=0;k<returns[id];k++){
          spawnDrop(s.x + rnd()*s.w, s.y + rnd()*s.h*0.5, id, { hold: 30 });
          n++;
        }
      }
      bus.emit("structure:removed", { defId: s.defId, x: s.x, y: s.y,
                                      why: "deconstructed",
                                      returned: returns, dropped: n });
      continue;
    }

    if(tick % SUPPORT_EVERY === 0 && !isSupported(world, s)){
      collapse(spawnDrop, s, "unsupported");
    }
  }
}

export function structuresNear(x, y, r){
  const out = [];
  const r2 = r*r;
  for(const s of structures){
    const cx = s.x + s.w/2, cy = s.y + s.h/2;
    const dx = cx-x, dy = cy-y;
    if(dx*dx + dy*dy <= r2) out.push(s);
  }
  return out;
}

export function has(defId){
  for(const s of structures) if(s.defId === defId && s.built) return true;
  return false;
}

export function serialiseStructures(){
  return structures.map(s => ({
    id:s.id, defId:s.defId, x:s.x, y:s.y, progress:s.progress, built:s.built,
    store: s.store ? { cap:s.store.cap, items:Object.assign({}, s.store.items) } : null,
    taking: s.taking ? Object.assign({}, s.taking) : null,
    job: s.job ? Object.assign({}, s.job, { inputs: Object.assign({}, s.job.inputs) }) : null
  }));
}

export function restoreStructures(list){
  clearStructures();
  if(!Array.isArray(list)) return;
  for(const d of list){
    if(!d || !BUILDINGS[d.defId]) continue;
    const s = makeStructure(d.defId, +d.x||0, +d.y||0);
    if(!s) continue;
    s.progress = +d.progress || 0;
    s.built = !!d.built;
    if(s.store && d.store){
      s.store.cap = +d.store.cap || s.store.cap;
      for(const id in d.store.items) s.store.items[id] = d.store.items[id];
    }
    if(d.taking && d.taking.need > 0){
      s.taking = { ticks: +d.taking.ticks || 0, need: +d.taking.need };
    }
    /* A kiln left burning when the game was saved is still burning. */
    if(d.job && d.job.recipeId){
      s.job = { recipeId: d.job.recipeId, ticks: +d.job.ticks || 0,
                need: +d.job.need || 1,
                inputs: Object.assign({}, d.job.inputs || {}) };
    }
    s.id = +d.id || s.id;
    nextId = Math.max(nextId, s.id + 1);
    structures.push(s);
  }
}
