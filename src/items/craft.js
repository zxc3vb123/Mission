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
   need, have, inStore, inPack}], inputs (the same for EVERY input, short or
   not), needsStation, needsTool, busy, overBy }. The UI writes the
   copy - "missing 4 wood", "0.3 kg too heavy" - and the guidebook says the
   same fact in a different voice from the same data. Every refusal that has
   a number behind it hands over the number, not a sentence to parse.

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
import { storageApi } from "../build/storage.js";

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

/* A STATION EATS ITS OWN PILE FIRST, then the pack.

   A cart can deliver ore into a forge, and until now the forge could not use
   it: craft() took from the player's back, so a delivered heap was scenery.
   That is the difference between automation and a shorter walk.

   THE STORE IS PREFERRED, DELIBERATELY. Not only because a delivered pile
   should mean something, but because the other way round is backwards - a
   player standing at a forge with two iron in hand would burn their own
   while forty sat in the hopper, so automation would engage only when
   nobody was there to benefit from it. A smith feeds the fire from the pile
   beside them. Mixed draws are fine and physical: two off the heap and one
   off your back is what happens when the heap runs short.

   What a station will NOT do is start work on its own. A forge that keeps
   smelting while carts arrive is a production line, which is a far larger
   design step than this one and should be decided rather than arrive by
   accident. A job still begins because somebody asked for it. */
function sourcesFor(r, at){
  const box = at && at.store ? storageApi(at, itemDef) : null;
  const fromStore = Object.create(null);
  const fromPack = Object.create(null);
  const missing = [];

  /* Every input, not only the short ones. The UI lane asked for this and the
     reason is good: from `missing` alone a screen can tell you what is short
     but not where a SATISFIED input is sitting, so a chip beside a ready row
     could only show a combined figure and hope. */
  const inputs = [];

  for(const id in r.inputs){
    const need = r.inputs[id];
    const inStore = box ? box.count(id) : 0;
    const inPack = inventory.count(id);
    const takeStore = Math.min(need, inStore);
    const takePack = Math.min(need - takeStore, inPack);

    if(takeStore > 0) fromStore[id] = takeStore;
    if(takePack > 0) fromPack[id] = takePack;
    inputs.push({ id, need, have: inStore + inPack, inStore, inPack,
                  short: Math.max(0, need - inStore - inPack) });
    if(takeStore + takePack < need)
      missing.push({ id, need, have: inStore + inPack, inStore, inPack });
  }
  return { box, fromStore, fromPack, missing, inputs };
}

/* Mass after the swap: only inputs taken OFF YOUR BACK lighten the pack, and
   an instant craft's outputs arrive on it. A recipe whose result you could
   not carry is refused with a reason rather than quietly overfilling you.

   NO CRAFT CAN CURRENTLY TRIP THIS, and the story of why is worth keeping.
   The test for it used to stand on rope, which weighed 0.9 kg and was made
   from 0.6 kg of fibre - so twisting it created three hundred grams out of
   nothing. It was the ONLY mass-gaining craft in the game, which is exactly
   why it was the only case the test could find, and the fixture said as much
   in a comment that nobody read as a bug report. Lane F's conservation guard
   found it; the rope's MASS was wrong, not its recipe.

   The branch stays because it becomes reachable the moment a recipe draws
   its inputs from a STATION'S STORE and hands the output to the pack - a
   forge holds 100 kg against a 35 kg back. The suite arms itself for that
   day rather than asserting a bug in the meantime.

   THE LESSON, since this is the second time on this project a note-to-self
   turned out to be an unread bug report: "this is the only case that can
   trigger X" is a finding about the content, not a convenient fixture. In a
   game whose first law is that matter is conserved, "only one thing gains
   mass" was the answer to a question nobody had asked yet. */
function roomFor(r, src){
  let delta = 0;
  for(const id in src.fromPack) delta -= src.fromPack[id] * itemDef(id).mass;
  for(const id in r.outputs)    delta += r.outputs[id]    * itemDef(id).mass;
  const over = (inventory.carriedMass() + delta) - inventory.capacity();
  return { ok: over <= 1e-9, over: Math.max(0, Math.round(over*100)/100) };
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

  /* what the station has, then what you are carrying */
  const at = (r.station && r.station !== HAND) ? stationHere(r.station) : null;
  const src = sourcesFor(r, at);
  if(src.missing.length)
    return Object.assign(base, { missing: src.missing, inputs: src.inputs,
                                 reason: "missing materials" });

  /* A timed job leaves its output in the station, so the pack only has to
     have room for what an instant craft hands straight back. */
  if(!isTimed(recipeId)){
    const room = roomFor(r, src);
    /* overBy is the shortfall in kg, structured so a screen can say "0.3 kg
       too heavy" in its own words rather than parsing this sentence. */
    if(!room.ok) return Object.assign(base, { reason: "no room in your pack",
                                              overBy: room.over });
  }

  return { ok:true, recipe:r, missing:[], needsStation:null, needsTool:null,
           timed: isTimed(recipeId), inputs: src.inputs,
           fromStore: src.fromStore, fromPack: src.fromPack };
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

  /* the station's own pile first, then the rest off your back */
  const at = (r.station && r.station !== HAND) ? stationHere(r.station) : null;
  const src = sourcesFor(r, at);
  if(src.missing.length)
    return { ok:false, reason:"missing materials", missing: src.missing };
  for(const id in src.fromStore) src.box.take(id, src.fromStore[id]);
  for(const id in src.fromPack)  inventory.take(id, src.fromPack[id]);
  const usedStore = Object.keys(src.fromStore).length > 0;

  /* PROCESSING: hand the inputs to the station and walk away. The output
     arrives on craft:done, into the station's own store, whether or not the
     player is still standing there. */
  if(isTimed(recipeId)){
    const at = stationHere(r.station);
    if(!at){
      /* cannot happen after canCraft, but losing the inputs to a race is not
         an acceptable failure - put them back */
      for(const id in src.fromStore) src.box.add(id, src.fromStore[id]);
      for(const id in src.fromPack)  inventory.add(id, src.fromPack[id]);
      return { ok:false, reason:"needs a " + stationName(r.station) };
    }
    startJob(at, r);
    return { ok:true, started:true, timed:true, time:r.time,
             ticks:jobTicks(r), station:at, recipe:r, outputs:{},
             fromStore: src.fromStore, fromPack: src.fromPack, usedStore };
  }

  /* MAKING: instant. Outputs are added after inputs are gone, so the pack is
     at its lightest when the new thing goes in - roomFor() checked that. */
  const made = {};
  for(const id in r.outputs){
    made[id] = inventory.add(id, r.outputs[id]);
  }

  bus.emit("craft:done", { recipeId: r.id, outputs: made });
  return { ok:true, started:false, timed:false, outputs: made, recipe: r,
           fromStore: src.fromStore, fromPack: src.fromPack, usedStore };
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
