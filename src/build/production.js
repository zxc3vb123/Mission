/* Stations that do work. LANE C (build).

   The owner's line (docs/DECISIONS.md): making is instant, PROCESSING takes
   time. Tying a rope should not put a progress bar between the player and
   the thing they decided to make; burning wood down to charcoal should,
   because a fire is doing that, not a person.

   The consequence that matters more than the timer: A STATION KEEPS WORKING
   WHILE THE PLAYER IS ELSEWHERE. Load a kiln, walk away, come back to the
   charcoal. That is the first thing in the game that works without you, and
   it is the seam lane D's machines plug into - a forge with a job is already
   the shape of every machine that comes after it.

   Two rules follow from that, and both are deliberate:

     - THE OUTPUT WAITS INSIDE THE STATION, in its own store, reachable
       through the same storageAt() vocabulary as a chest. So lane D can pull
       a finished bar out of a forge on day one without anything new.
     - IF THE STATION IS DESTROYED MID-JOB, THE INPUTS COME BACK as real
       chunks on the ground. Conservation of matter does not get an exception
       for being mid-smelt, and a game that silently eats a player's iron is
       a game people stop trusting.

   No wall-clock time and no unseeded randomness here: a job is counted in
   simulation ticks, so two machines running the same seed agree. */

import { bus } from "../core/bus.js";
import { RECIPES } from "../content/recipes.js";
import { BUILDINGS } from "../content/buildings.js";

export const TICKS_PER_SECOND = 36;

/* LANE F: which stations process rather than assemble, and how much output
   they can hold, are both data - see docs/REQUESTS.md. Read from BUILDINGS
   the moment those fields exist; until then these are the owner's two named
   stations, "conversions a fire performs". */
const PROCESSING_FALLBACK = ["kiln", "forge"];
const STORE_KG_FALLBACK = { chest: 200, kiln: 120, forge: 120 };

export function isProcessingStation(defId){
  const b = BUILDINGS[defId];
  if(b && typeof b.processing === "boolean") return b.processing;
  return PROCESSING_FALLBACK.includes(defId);
}

export function storeCapacity(defId){
  const b = BUILDINGS[defId];
  if(b && b.storage > 0) return b.storage;
  return STORE_KG_FALLBACK[defId] || 0;
}

/* A recipe made AT a processing station is work the station does. Anything
   else - hand, workbench, sawmill - is the player making a thing. */
export function isTimed(recipeId){
  const r = RECIPES[recipeId];
  return !!(r && r.station && isProcessingStation(r.station));
}

export function jobTicks(r){
  return Math.max(1, Math.round((r.time || 1) * TICKS_PER_SECOND));
}

/* Put a job on a station. The inputs are already out of the player's pack by
   the time this is called; the station holds them until it is done or until
   somebody digs its footing away. */
export function startJob(s, r){
  s.job = {
    recipeId: r.id,
    ticks: 0,
    need: jobTicks(r),
    inputs: Object.assign({}, r.inputs)
  };
  bus.emit("job:started", { defId: s.defId, recipeId: r.id, x: s.x, y: s.y,
                            need: s.job.need });
  return s.job;
}

export function jobProgress(s){
  if(!s.job) return 0;
  return Math.min(1, s.job.ticks / s.job.need);
}

/* One tick of work. Only a FINISHED station works: a half-built kiln is a
   pile of clay. */
export function tickJob(s){
  if(!s.built || !s.job) return;
  const job = s.job;
  if(++job.ticks < job.need) return;

  const r = RECIPES[job.recipeId];
  s.job = null;
  if(!r) return;

  /* The output waits in the station. It is put there without a capacity
     check on purpose: refusing to finish work already paid for would strand
     the inputs, and the store is sized to hold what the station can make. */
  const made = {};
  for(const id in r.outputs){
    s.store.items[id] = (s.store.items[id] || 0) + r.outputs[id];
    made[id] = r.outputs[id];
  }
  bus.emit("craft:done", { recipeId: r.id, outputs: made, x: s.x, y: s.y,
                           station: s.defId });
}

/* How close you have to be for a station to hand you what it made. Generous
   on purpose, like the chunk pickup radius: the player should never have to
   click a finished bar out of a forge. */
export const COLLECT_R = 26;

/* Walk into a working station and it gives you what it has made. Chests are
   deliberately excluded - a chest is where you PUT things, and one that
   emptied itself into your pack every time you walked past would be worse
   than useless. A kiln is where things APPEAR, so taking them is the
   expected move.

   Follows the same rule as chunks on the ground: while you are carrying
   enough to be slowed, nothing is taken unless you ask for it. */
export function collectFrom(s, inventory, px, py){
  if(!s.built || !s.store || !isProcessingStation(s.defId)) return 0;
  const dx = s.x + s.w/2 - px, dy = s.y + s.h/2 - py;
  if(dx*dx + dy*dy > COLLECT_R*COLLECT_R) return 0;

  let taken = 0;
  for(const id in s.store.items){
    const have = s.store.items[id];
    if(have <= 0) continue;
    const got = inventory.add(id, have);
    if(got <= 0) continue;
    s.store.items[id] -= got;
    if(s.store.items[id] <= 0) delete s.store.items[id];
    taken += got;
    bus.emit("item:collected", { id, x: s.x + s.w/2, y: s.y, from: s.defId });
  }
  return taken;
}

/* Everything the station is holding that belongs to the player: the inputs
   of a job in progress, and any finished output not yet collected. Used when
   a building comes down, so none of it is lost. */
export function heldBy(s){
  const held = Object.create(null);
  if(s.job) for(const id in s.job.inputs) held[id] = (held[id]||0) + s.job.inputs[id];
  if(s.store) for(const id in s.store.items) held[id] = (held[id]||0) + s.store.items[id];
  return held;
}
