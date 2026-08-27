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
import { BUILDINGS, building } from "../content/buildings.js";
import { storeCapacity, tickJob, heldBy } from "./production.js";

export const TICKS_PER_SECOND = 36;

/* Support is re-checked on a slow beat: a building cannot fall in less time
   than it takes to notice, and checking every footprint every tick is waste. */
const SUPPORT_EVERY = 12;

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

export function isSupported(world, s){
  const def = building(s.defId);
  const want = def && def.support ? (def.support.ground ?? 1) : 1;
  return groundFraction(world, s.x, s.y, s.w, s.h) >= want - 1e-9;
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
