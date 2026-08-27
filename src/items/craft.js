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

   PUBLISHED API:
     canCraft(recipeId)            -> a verdict, without making anything
     craft(recipeId, stationId)    -> { ok, reason?, outputs? }
     nearbyStations()              -> Set of station ids you may work at

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
    if(!nearbyStations().has(r.station)){
      return Object.assign(base, {
        needsStation: r.station,
        reason: "needs a " + stationName(r.station)
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

  if(!roomFor(r)) return Object.assign(base, { reason: "no room in your pack" });

  return { ok:true, recipe:r, missing:[], needsStation:null, needsTool:null };
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

  /* Outputs are added after inputs are gone, so the pack is at its lightest
     when the new thing goes in - roomFor() checked exactly this order. */
  const made = {};
  for(const id in r.outputs){
    made[id] = inventory.add(id, r.outputs[id]);
  }

  bus.emit("craft:done", { recipeId: r.id, outputs: made });
  return { ok:true, outputs: made, recipe: r };
}

/* Everything makeable right now, for a screen that wants to show only what
   is possible. Ordered as lane F's table is. */
export function craftable(){
  const out = [];
  for(const id in RECIPES) if(canCraft(id).ok) out.push(id);
  return out;
}
