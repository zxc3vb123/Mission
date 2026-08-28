/* Is there something built here? LANE C (build).

   The actor collides against world.isSolid - the pixel material - and nothing
   else. Structures live in this lane's list and are drawn by render_build.js,
   so until now every plank floor, beam, foundation and workbench in the game
   was a picture the player walked through. A house you fall through is not a
   house.

   The shape matches climbableAt, which already works and which lane B already
   consumes: a QUERY, not a stored flag. That matters beyond consistency - a
   player standing on a plank that is taken down, or whose footing collapses,
   should fall the instant it is gone, and a query cannot go stale the way a
   written flag can.

   WHAT IS SOLID:
     - only FINISHED structures. A part-built thing you can stand on is how a
       player seals themselves inside their own scaffolding.
     - not climbables. A ladder is for going up, not for standing on the
       shaft you dug; colliding with one would make it furniture.
     - anything lane F marks `solid: false`, for whatever wants to be scenery.

   IT MUST NOT COST A SCAN PER PIXEL. Lane B tests solidity several times a
   tick per probe point, so walking a list of structures would make the game
   slower the more the player builds - precisely backwards. Points are bucketed
   into a coarse grid and only the few structures sharing a bucket are
   examined; the index is rebuilt lazily, and only when something has actually
   changed. */

import { building } from "../content/buildings.js";

/* Bigger than the largest footprint, so a structure lands in few buckets,
   and small enough that a bucket holds few structures. */
const CELL = 32;

let grid = null;
let builtFor = -1;

function key(cx, cy){ return cx + "," + cy; }

/* Only what a body can stand on. */
export function isSolidDef(defId){
  const def = building(defId);
  if(!def) return false;
  if(def.solid === false) return false;
  if(def.climb) return false;
  return true;
}

export function rebuildIndex(structures){
  grid = new Map();
  for(const s of structures){
    if(!s.built || !isSolidDef(s.defId)) continue;
    const x0 = Math.floor(s.x / CELL), x1 = Math.floor((s.x + s.w - 1) / CELL);
    const y0 = Math.floor(s.y / CELL), y1 = Math.floor((s.y + s.h - 1) / CELL);
    for(let cx = x0; cx <= x1; cx++){
      for(let cy = y0; cy <= y1; cy++){
        const k = key(cx, cy);
        const list = grid.get(k);
        if(list) list.push(s); else grid.set(k, [s]);
      }
    }
  }
  return grid;
}

/* How many structures the last query actually looked at. Published so the
   suite can prove the index is doing its job rather than timing it, which
   would be flaky on a shared machine. */
let lastProbeCost = 0;
export function probeCost(){ return lastProbeCost; }

/* The finished structure occupying this point, or null. `version` is bumped
   by structures.js whenever the list changes, so the index rebuilds only
   when it must. */
export function solidAt(structures, version, x, y){
  if(grid === null || builtFor !== version){
    rebuildIndex(structures);
    builtFor = version;
  }
  const list = grid.get(key(Math.floor(x / CELL), Math.floor(y / CELL)));
  lastProbeCost = list ? list.length : 0;
  if(!list) return null;
  for(let i = 0; i < list.length; i++){
    const s = list[i];
    if(x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return s;
  }
  return null;
}

export function invalidate(){ grid = null; builtFor = -1; }
