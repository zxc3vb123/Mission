/* Making things. LANE C (items).

   Recipes are lane F's data and are never hard-coded here: this file is the
   mechanics that read RECIPES. The recipe list IS the tech tree
   (docs/GAME_DESIGN.md §3), so anything that decides what can be made has to
   come from that table or the tree stops being the visible form of progress.

   Three rules the table encodes and this file enforces:

     - `station: "hand"` means anywhere with nothing built. Anything else is
       a building id, and a FINISHED one of those must be standing nearby.
     - `tool` is a CAPABILITY, not an ingredient: required in the pack, never
       consumed. The whole stage 0 chain hangs off one stone knife.
     - inputs are consumed, outputs are carried. Both are mass, and the pack
       is mass-limited, so a craft you cannot carry the result of is refused
       rather than silently overfilling you.

   MAKING IS INSTANT; PROCESSING TAKES TIME (docs/DECISIONS.md). A rope or a
   pickaxe is a person deciding to make a thing, and a progress bar between
   them and it helps nobody. Charcoal and iron bars are conversions a fire
   performs, so the kiln and the forge take a job, keep working while the
   player walks away, and leave the output waiting inside themselves.

   PUBLISHED API:
     canCraft(recipeId)            -> a verdict, without making anything
     craft(recipeId, stationId)    -> { ok, reason?, outputs?, started?, time? }
     nearbyStations()              -> Set of station ids you may work at
     craftProgress()               -> jobs running at the stations you are at

   A verdict is structured, never a sentence: { ok, reason, missing:[{id,
   need, have}], needsStation, needsTool }. The UI writes the copy - "missing
   4 wood" is its wording to choose, and the guidebook says the same fact in
   a different voice from the same data.

   EVENTS:
     "craft:done"  { recipeId, outputs } */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { RECIPES, HAND, recipe } from "../content/recipes.js";
import { building } from "../content/buildings.js";
import { inventory } from "./inventory.js";
import { itemDef } from "./itemdefs.js";
/* Both folders are lane C, and structures.js imports nothing from items, so
   this is an intra-lane import and not a cycle. */
import { structuresNear } from "../build/structures.js";
import { isTimed, startJob, jobProgress, jobTicks } from "../build/production.js";

/* How near a finished station has to be to work at it. Matches the radius
   build.api.stationsNear defaults to, so the crafting screen and the build
   lane never disagree about whether you are standing at a workbench. */
export const STATION_R = 40;

/* Every station you could work at right now. Your hands are always one of
   them, which is what makes the stage 0 list craftable on the first night. */
export function nearbyStations(){
  const set = new Set([HAND]);
  const p = state.player;
  for(const s of structuresNear(p.x, p.y, STATION_R)) if(s.built) set.add(s.defId);
  return set;
}

/* The actual building you are working at, not just its id - a job has to go
   on a particular kiln. Nearest wins, so standing between two kilns loads
   the one you are closer to. */
function stationHere(defId){
  const p = state.player;
  let best = null, bestD = Infinity;
  for(const s of structuresNear(p.x, p.y, STATION_R)){
    if(!s.built || s.defId !== defId) continue;
    const d = Math.hypot(s.x + s.w/2 - p.x, s.y + s.h/2 - p.y);
    if(d < bestD){ bestD = d; best = s; }
  }
  return best;
}

function stationName(id){
  const b = building(id);
  return (b && b.name) || id;
}

/* Mass after the swap: inputs leave the pack, outputs arrive in it. A recipe
   whose result you could not carry is refused with a reason, rather than
   quietly putting you over the limit. */
function roomFor(r){
  let delta = 0;
  for(const id in r.inputs)  delta -= r.inputs[id]  * itemDef(id).mass;
  for(const id in r.outputs) delta += r.outputs[id] * itemDef(id).mass;
  return inventory.carriedMass() + delta <= inventory.capacity() + 1e-9;
}

/* The single verdict. Ordered so the reason names the first real obstacle:
   where you are, then what you are holding, then what you have. */
export function canCraft(recipeId){
  const r = recipe(recipeId);
  if(!r) return { ok:false, reason:"no such recipe" };

  const base = { ok:false, recipe:r, missing:[], needsStation:null, needsTool:null };

  if(r.station && r.station !== HAND){
    const at = stationHere(r.station);
    if(!at){
      return Object.assign(base, {
        needsStation: r.station,
        reason: "needs a " + stationName(r.station)
      });
    }
    /* One job at a time. A station already working is not a missing station,
       and saying so is the difference between "build another" and "wait". */
    if(at.job){
      return Object.assign(base, {
        busy: true, station: at,
        reason: "the " + stationName(r.station).toLowerCase() + " is still working"
      });
    }
  }

  /* required, and still in the pack afterwards */
  if(r.tool && !inventory.has(r.tool, 1)){
    return Object.assign(base, {
      needsTool: r.tool,
      reason: "needs a " + itemDef(r.tool).name.toLowerCase()
    });
  }

  const missing = [];
  for(const id in r.inputs){
    const need = r.inputs[id], have = inventory.count(id);
    if(have < need) missing.push({ id, need, have });
  }
  if(missing.length) return Object.assign(base, { missing, reason: "missing materials" });

  /* A timed job leaves its output in the station, so the pack only has to
     have room for what an instant craft hands straight back. */
  if(!isTimed(recipeId) && !roomFor(r))
    return Object.assign(base, { reason: "no room in your pack" });

  return { ok:true, recipe:r, missing:[], needsStation:null, needsTool:null,
           timed: isTimed(recipeId) };
}

/* Make it. The station argument is accepted for the caller's convenience and
   checked against the recipe: a recipe knows where it is made, and being
   told otherwise is a mistake worth reporting rather than obeying. */
export function craft(recipeId, stationId){
  const verdict = canCraft(recipeId);
  if(!verdict.ok) return verdict;

  const r = verdict.recipe;
  if(stationId && stationId !== r.station){
    return { ok:false, reason:"that is not made at a " + stationName(stationId) };
  }

  for(const id in r.inputs) inventory.take(id, r.inputs[id]);

  /* PROCESSING: hand the inputs to the station and walk away. The output
     arrives on craft:done, into the station's own store, whether or not the
     player is still standing there. */
  if(isTimed(recipeId)){
    const at = stationHere(r.station);
    if(!at){
      /* cannot happen after canCraft, but losing the inputs to a race is not
         an acceptable failure - put them back */
      for(const id in r.inputs) inventory.add(id, r.inputs[id]);
      return { ok:false, reason:"needs a " + stationName(r.station) };
    }
    startJob(at, r);
    return { ok:true, started:true, timed:true, time:r.time,
             ticks:jobTicks(r), station:at, recipe:r, outputs:{} };
  }

  /* MAKING: instant. Outputs are added after inputs are gone, so the pack is
     at its lightest when the new thing goes in - roomFor() checked that. */
  const made = {};
  for(const id in r.outputs){
    made[id] = inventory.add(id, r.outputs[id]);
  }

  bus.emit("craft:done", { recipeId: r.id, outputs: made });
  return { ok:true, started:false, timed:false, outputs: made, recipe: r };
}

/* What the stations around you are working on, for a progress bar. */
export function craftProgress(){
  const p = state.player;
  const out = [];
  for(const s of structuresNear(p.x, p.y, STATION_R)){
    if(!s.built || !s.job) continue;
    out.push({ defId: s.defId, recipeId: s.job.recipeId,
               progress: jobProgress(s), ticksLeft: s.job.need - s.job.ticks,
               x: s.x, y: s.y });
  }
  return out;
}

/* Everything makeable right now, for a screen that wants to show only what
   is possible. Ordered as lane F's table is. */
export function craftable(){
  const out = [];
  for(const id in RECIPES) if(canCraft(id).ok) out.push(id);
  return out;
}
