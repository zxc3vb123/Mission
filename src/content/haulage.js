/* HAULAGE - the ladder from a full backpack to a conveyor. LANE F (content).

   Data only. Lane D builds these machines and reads these numbers.

   WHY THIS TABLE EXISTS
   Moving material is the actual game. Every rung has to be a real multiple of
   the one below it, or there is no reason to build it - and every rung has to
   keep the one below it useful, or the ladder is just a sequence of things
   that make each other obsolete. Those are two different failures and this
   table is tested against both:

     capacity climbs by a real multiple  ->  building the next rung is worth it
     every rung has a `constraint`       ->  the rung below still has a job

   THE LADDER IS NOT ONE LINE, AND THIS SURPRISED ME.
   docs/lanes/content.md lists the curve as backpack -> wheelbarrow -> wagon ->
   rail -> conveyor, which reads as one rising line of tonnage. It is not. A
   locomotive hauling a rake genuinely moves more material per hour than a belt
   does; real mines run both for that exact reason. The conveyor's win is on a
   different axis: it is the only rung that does not cost the player's own time.
   A train needs driving, loading and turning round. A belt is fed at one end
   and simply runs.

   So the table climbs in throughput up to the train, and the conveyor is a
   *choice against* the train rather than a replacement for it: less tonnage,
   no attention. The tests check those as two separate properties, because
   asserting one rising line would have forced me to inflate the belt's numbers
   into a lie.

   The constraint is the load-bearing field. A wheelbarrow that could climb a
   ladder would delete the backpack; a conveyor that could be moved freely
   would delete rail. What stops each rung swallowing the last is a physical
   limit, not a number.

   Fields
     id          stable key. Lane D's machine ids should match these.
     name        display name.
     stage       progression stage it becomes available (docs/PROGRESSION.md).
     capacity    kg it moves in one go, or null if it never stops (see
                 `continuous`). The backpack rung is CARRY_START by import,
                 not by a copied number, so there is one source of truth.
     continuous  true for a machine that flows rather than makes trips.
     speed       pace of a loaded trip, relative to a loaded walk. Pushing a
                 barrow is slower than walking; a train is much faster.
                 null when continuous.
     throughput  what actually matters: how much this shifts over time, as a
                 multiple of a person with a backpack. For batch rungs this is
                 capacity x speed, and the test checks it really is.
     attended    true if it costs the player's own time and presence. Every
                 batch hauler does: someone loads it, walks it and empties it.
                 This is the second axis of the ladder, and the conveyor is
                 the only rung that changes it - see THE LADDER IS NOT ONE
                 LINE below.
     constraint  what this CANNOT do. The reason the rung below survives.
     keepsAlive  which rung it fails to replace, and at which part of the job.
     setup       what it costs to put in place, in kind rather than in numbers
                 - the counts live in BUILDINGS and RECIPES when they exist.
     note        one line: why this rung is on the ladder at all.

   No digits in the prose fields, same rule as the guidebook: a number written
   into a sentence is a number that goes stale the moment it is tuned, and
   tuning is what this lane does.
*/

import { CARRY_START } from "./items.js";

/* Everything is quoted against one loaded person, which is the unit the
   player actually feels. */
export const REFERENCE_LOAD = CARRY_START;

const DATA = [
  { id: "backpack", name: "Backpack", stage: 0,
    capacity: CARRY_START, continuous: false, attended: true, speed: 1.0, throughput: 1,
    constraint: "Nothing. It goes down a rope, up a ladder, through a crawlway and into water - which is exactly why nothing ever replaces it.",
    keepsAlive: "It is the bottom of the ladder, and the only rung that can reach a face you have not yet made room around.",
    setup: "None. You start with it.",
    note: "The unit everything else is measured against. A pack is not slow because it is small; it is slow because it is a person." },

  { id: "wheelbarrow", name: "Wheelbarrow", stage: 1,
    capacity: 150, continuous: false, attended: true, speed: 0.85, throughput: 3.6,
    constraint: "Needs ground you can push it along: roughly level, roughly clear. It cannot climb a ladder, take a steep slope, or cross a gap, and you tip it by hand at both ends.",
    keepsAlive: "The backpack still does the last leg, from the face to wherever the barrow can actually stand.",
    setup: "Built at a workbench out of wood and rope. Cheap, and the first thing that makes a shaft feel worth digging.",
    note: "The first rung, and the one that changes the game most: it is the moment hauling stops being the whole of your day." },

  { id: "mine_wagon", name: "Mine wagon", stage: 4,
    capacity: 1500, continuous: false, attended: true, speed: 1.0, throughput: 43,
    constraint: "Runs only where rails run. Track has to be laid, kept level and kept clear, it will not take a sharp turn, and steel is expensive - so rail goes where the traffic justifies it and nowhere else.",
    keepsAlive: "The barrow still does the face-to-railhead leg, because the railhead is never at the face - it follows the face at a distance.",
    setup: "Rails, points and a wagon, all steel from the forge. The track is the real cost; the wagon is almost an afterthought.",
    note: "The first rung where the machine, not the person, is the thing doing the work." },

  { id: "rail_train", name: "Locomotive and rake", stage: 5,
    capacity: 6000, continuous: false, attended: true, speed: 2.2, throughput: 377,
    constraint: "Needs a locomotive with fuel and water, and a graded route with gentle curves. It cannot serve a face directly and it cannot be re-routed on a whim - laying the road is most of the work.",
    keepsAlive: "It pulls wagons; it does not replace them. And it only pays on a long haul, so short runs stay with the wagon alone.",
    setup: "A boiler and piston on wheels, plus a route worth building. Fuel and water have to reach it, which is its own small logistics problem.",
    note: "The first haulage that can outrun the mine's ability to fill it, which is a good problem and a new one." },

  { id: "conveyor", name: "Conveyor", stage: 6,
    capacity: null, continuous: true, attended: false, speed: null, throughput: 120,
    constraint: "Fixed to one route and hungry for continuous power. Change where the material has to go and you rebuild it. Cut the power and it stops with the load still on it.",
    keepsAlive: "Rail still moves anything that is not on that one route, and moves it further. A conveyor is a committed decision about a single flow.",
    setup: "Electric motors, belt and framing, and a generator that can feed it without stopping.",
    note: "Lower tonnage than a train, and it never stops, never sleeps and needs nobody to drive it. It is a choice against rail, not a rung above it." }
];

export const HAULAGE = Object.create(null);
for (const h of DATA) HAULAGE[h.id] = h;

/* The ladder, in order. Index is the rung. */
export const HAULAGE_IDS = DATA.map(h => h.id);

export function haulage(id){ return HAULAGE[id] || null; }

/* The rungs that cost the player's time. This is the part of the ladder that
   has to climb, and the part `stepUpFrom` is meaningful across. */
export const BATCH_LADDER = DATA.filter(h => h.attended).map(h => h.id);

/* Everything on the ladder available at or before a stage. */
export function haulageUpTo(stage){
  return DATA.filter(h => h.stage <= stage);
}

/* How much better this rung is than the one below it, by throughput. The
   guidebook should quote this rather than raw kilograms: "about four times
   what you can carry" lands where "one hundred and fifty" does not. */
export function stepUpFrom(id){
  const i = BATCH_LADDER.indexOf(id);
  if(i <= 0) return null;
  return HAULAGE[BATCH_LADDER[i]].throughput / HAULAGE[BATCH_LADDER[i-1]].throughput;
}
