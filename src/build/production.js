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

   A STATION RUNS UNATTENDED. The owner: "all automation systems should run
   when im not present." A machine you have to stand next to is a slower pair
   of hands, not a factory, and the whole arc of this game is toward machines
   that work while you are elsewhere.

   It repeats THE JOB IT WAS LAST ASKED FOR, from its own store, for as long
   as the inputs last and the output has somewhere to go. Two safeguards make
   that honest rather than magic:

     - AN UNATTENDED RUN NEVER TOUCHES THE PLAYER'S PACK. Only what has been
       delivered into the station is consumed. A forge quietly emptying your
       backpack while you stood beside it would be a theft, not automation.
     - IT JAMS RATHER THAN OVERFLOWS. If the store has no room for what the
       next run would make, the station stops and waits to be emptied.
       Unattended is not infinite: inputs in, output away, or it stops dead.
       The scarcity stays in the logistics, which is where lane D is building.

   DISTANCE CANNOT CHANGE THE RESULT, and here it cannot by construction
   rather than by careful arithmetic: every structure ticks every tick,
   whether the player is beside it or a thousand pixels away. There is no
   catch-up model to get subtly wrong, and nothing that has to happen on load
   - which matters, because the game opens paused and no tick() runs until
   the player presses something.

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
import { RECIPES, recipe } from "../content/recipes.js";
import { BUILDINGS } from "../content/buildings.js";
import { ITEM_DATA } from "../content/items.js";

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
  /* Remembered so the station can carry on with it unattended. The player
     sets the task by asking for it once; the station repeats that and
     nothing else, so a kiln holding both clay and wood never decides for
     itself which one you wanted. */
  s.recipe = r.id;
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
  if(!s.built) return;

  /* AN IDLE STATION PICKS ITS TASK BACK UP when material arrives. Repeating
     only at the end of a job would leave a forge that had run dry sitting
     there for good after a cart refilled it - automation that stops the
     first time it runs out is not automation. */
  if(!s.job){
    const standing = recipe(s.recipe);
    if(standing) startFromStore(s, standing);
    return;
  }
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

  /* Carry on with the same job while the delivered material lasts. */
  const again = recipe(s.recipe);
  if(!again || !startFromStore(s, again)){
    if(s.recipe) bus.emit("station:idle", { defId: s.defId, x: s.x, y: s.y,
                                            recipeId: s.recipe,
                                            why: jamReason(s, again) });
  }
}

/* What the station is holding, in kilograms. */
function storeMass(s){
  let m = 0;
  for(const id in s.store.items){
    const d = ITEM_DATA[id];
    m += s.store.items[id] * (d ? d.mass : 0);
  }
  return m;
}

/* Could this station run `r` on its OWN material, and put the result
   somewhere? Both halves matter: a station that ran on the player's pack
   would rob them, and one that ran with nowhere to put the output would
   either overflow or destroy what it made. */
export function canRunFromStore(s, r){
  if(!s.built || !s.store || !r) return false;
  for(const id in r.inputs)
    if((s.store.items[id] || 0) < r.inputs[id]) return false;

  let delta = 0;
  for(const id in r.inputs){
    const d = ITEM_DATA[id];
    delta -= r.inputs[id] * (d ? d.mass : 0);
  }
  for(const id in r.outputs){
    const d = ITEM_DATA[id];
    delta += r.outputs[id] * (d ? d.mass : 0);
  }
  return storeMass(s) + delta <= s.store.cap + 1e-9;
}

/* Start a run on the station's OWN material, taking the inputs as it goes.

   craft() consumes before calling startJob, because it may draw partly off
   the player's back. An unattended run has no such caller, so it must take
   its own - and startJob alone does not, which for a few minutes here meant
   a kiln producing charcoal out of nothing at all. */
export function startFromStore(s, r){
  if(!canRunFromStore(s, r)) return false;
  for(const id in r.inputs){
    s.store.items[id] -= r.inputs[id];
    if(s.store.items[id] <= 0) delete s.store.items[id];
  }
  bus.emit("storage:changed", { id:null, count:0, x:s.x, y:s.y });
  startJob(s, r);
  return true;
}

/* Why it stopped, so a screen can say "the forge is full" rather than
   leaving the player to work out why their base went quiet. */
function jamReason(s, r){
  if(!r) return "no recipe";
  for(const id in r.inputs)
    if((s.store.items[id] || 0) < r.inputs[id]) return "out of materials";
  return "full";
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
