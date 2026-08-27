/* STAGES - the spine of progression. LANE F (content).

   Eight stages, from bare hands to launch. This table says what counts as
   having *reached* a stage and what reaching it opens up. Data only; lane E
   renders the guidebook from it and lane C emits `stage:advanced`.

   REACHING A STAGE IS PHYSICAL, NOT NOTIONAL.
   You have reached a stage when the thing that defines it exists in the
   world - not when you happen to be carrying enough to build it. That is
   docs/GAME_DESIGN.md's rule that "a new capability must be unlocked by a
   physical thing the player built" applied to the progression state itself.
   The guidebook is free to say "you are nearly at stage 2"; it computes that
   from ITEM_DATA and BUILDINGS, and it is not what STAGES records.

   Fields
     id          0..7, and the array index. Stages are ordered and gapless.
     name        what the guidebook calls this stage.
     goal        one sentence: what the player is trying to do right now.
     reachedWhen what must physically exist. null means "not costed yet" -
                 see PLANNED FROM below.
                   buildings  every id in this list must exist in the world
                   items      { itemId: count } ever obtained
                 An empty object means "reached at the start of the game".
     unlocks     one line of prose. NOT a list of ids: the real link is
                 recipesAt()/buildingsUpTo() in the other tables, so the two
                 can never disagree.
     note        why this stage is a stage at all.

   PLANNED FROM
   Stages 3 and up have reachedWhen: null, because buildings.js deliberately
   stops at the kiln - that is as far as docs/PROGRESSION.md actually costs
   things out. Inventing a forge cost before the mechanics exist would be
   guessing. The content test enforces that the null stages are a *suffix*:
   you can never have a costed stage sitting above an uncosted one, so this
   fills in from the bottom and cannot rot.
*/

const DATA = [
  { id: 0, name: "Bare hands",
    goal: "Make a blade, then a rope, then an axe, and fell your first tree before dark.",
    reachedWhen: {},
    unlocks: "Hand crafting anywhere: torch, rope, stone knife, stone axe, bandage, and a campfire to sit by.",
    note: "The one stage that needs nothing. It exists so the first hour has a shape: gather, craft a knife, and the rest follows." },

  { id: 1, name: "Tools and light",
    goal: "Raise a workbench, then cut a shaft into rock and find coal and iron.",
    reachedWhen: { buildings: ["workbench"] },
    unlocks: "Shovel and pickaxe, so rock stops being a wall. Wheelbarrow and chest, so the 35 kg limit stops being the game.",
    note: "The pickaxe opens rock and the wheelbarrow multiplies haulage. This is the first stage where the world stops fighting you." },

  { id: 2, name: "Fire and clay",
    goal: "Build a kiln and burn the first things hot enough to matter.",
    reachedWhen: { buildings: ["kiln"] },
    unlocks: "Charcoal, bricks, quicklime and glass. Charcoal is the first fuel hot enough for metal; bricks are the first structure that survives a cave-in.",
    note: "126 kg of clay and stone hauled to one spot. The cost is the point - it is the first build that makes you want a wheelbarrow first." },

  { id: 3, name: "Wood at scale, water power",
    goal: "Put a water wheel on moving water and let a machine work while you sleep.",
    reachedWhen: null,
    unlocks: "Sawmill, planks, beams, scaffolds and ladders; the first shaft-and-belt line; farm plots and cooking.",
    note: "The sawmill is wood, stone and rope, so water power is reachable on wood alone - no metal needed to get here (docs/DECISIONS.md, 2026-08-27)." },

  { id: 4, name: "Iron and steam",
    goal: "Smelt iron, raise a boiler, and put a steam pump at the bottom of a flooded shaft.",
    reachedWhen: null,
    unlocks: "Forge and foundry; iron, steel, bronze and brass; boiler and piston; steam pumps, rails, wagons, elevators.",
    note: "The hinge of the whole game. Pumps beat groundwater, so deep mines become possible, and rails move spoil in tonnes rather than kilos." },

  { id: 5, name: "Oil and chemistry",
    goal: "Sink a derrick into an oil field and refine what comes up.",
    reachedWhen: null,
    unlocks: "Derrick and oil pump, refinery, kerosene, lubricant, tar and plastics; explosives.",
    note: "Explosives break rock fast and scatter the spoil out of reach. Fast and lossy against slow and lossless is a real choice, not a free win." },

  { id: 6, name: "Electricity",
    goal: "Drive a dynamo from steam or water, and run a cable to a machine that is nowhere near it.",
    reachedWhen: null,
    unlocks: "Generators, cables, motors, electric light, conveyors, electric furnace and electrolysis - which is what makes aluminium possible.",
    note: "Deliberately late. Electricity is not a new resource, it is a distribution technology, and it arrives only once coal, iron, copper and steam are routine." },

  { id: 7, name: "The rocket",
    goal: "Assemble the sections on the pad, fuel them, and leave.",
    reachedWhen: null,
    unlocks: "Assembly hall, rocket structure and tanks, engine, avionics, propellant, launch pad - and the ending.",
    note: "Everything the world has: aluminium, steel, titanium, nickel, gold, rare earths, and a fuel chain. The last stage is a bill for all the others." }
];

export const STAGES = DATA;
export const STAGE_COUNT = DATA.length;
export const FIRST_STAGE = 0;
export const LAST_STAGE = DATA.length - 1;

export function stage(id){ return DATA[id] || null; }

/* The highest stage whose conditions are met, walking up from 0 and stopping
   at the first one that is not. Progression is a ladder, not a set: you do not
   skip stage 2 by happening to own a kiln's worth of clay.

     hasBuilding(id) -> bool     is one standing in the world
     everObtained(id, n) -> bool has the player ever held n of this

   A stage whose reachedWhen is null is not yet costed, so the ladder stops
   there. That is honest: the game currently ends at the top of stage 2. */
export function highestStageReached(hasBuilding, everObtained){
  let reached = FIRST_STAGE;
  for(let i = FIRST_STAGE + 1; i < DATA.length; i++){
    const need = DATA[i].reachedWhen;
    if(!need) break;
    let ok = true;
    for(const id of (need.buildings || [])) if(!hasBuilding(id)){ ok = false; break; }
    if(ok) for(const id in (need.items || {})) if(!everObtained(id, need.items[id])){ ok = false; break; }
    if(!ok) break;
    reached = i;
  }
  return reached;
}

/* The last stage with a machine-checkable condition. Above this the tables
   are prose only, and the guidebook should say so rather than pretend. */
export function highestCostedStage(){
  let last = FIRST_STAGE;
  for(let i = FIRST_STAGE + 1; i < DATA.length; i++){
    if(!DATA[i].reachedWhen) break;
    last = i;
  }
  return last;
}
