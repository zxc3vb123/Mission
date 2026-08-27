/* RECIPES - what can be made, out of what, and where. LANE F (content).

   Data only. Lane C implements crafting and reads this table; it never
   hard-codes a cost. The recipe list IS the tech tree - see
   docs/GAME_DESIGN.md section 3, "The recipe list is the tech tree".

   Fields
     id          stable key. Also the string lane C's craft(recipeId) takes.
     name        what the crafting screen calls it.
     station     "hand" means anywhere, with nothing built. Anything else is
                 a building id from src/content/buildings.js, and the player
                 has to be standing at one.
     tool        an item id that must be in the inventory but is NOT consumed,
                 or null. This is how a stone knife becomes the first craft
                 that matters: it is not spent, it is a capability.
                 LANE C: honouring this is a crafting-side gate, not new tool
                 behaviour - no change needed in lane B.
     inputs      { itemId: count } consumed on success.
     outputs     { itemId: count } produced, always carried items.
                 Buildings are NOT crafted - they are placed, and their cost
                 lives in src/content/buildings.js so one number has one home.
     time        seconds of work at the station. The simulation runs at a
                 fixed 36 Hz, so lane C multiplies by 36 for ticks.
     stage       progression stage this unlocks at (docs/PROGRESSION.md).
     note        one line: why this recipe exists at all.

   Rules this table obeys, all enforced by tools/tests/content.test.js:
     - every input and item output exists in ITEM_DATA
     - nothing is craftable before its ingredients are obtainable
     - a recipe never sits at an earlier stage than the things it consumes
     - electricity cannot be reached before stage 6, no matter how tempting
*/

const DATA = [
  /* ---------------- stage 0: hand crafts, no station ---------------- */

  { id: "rope", name: "Rope", station: "hand", tool: "stone_knife",
    inputs: { plant_fibre: 4 }, outputs: { rope: 1 },
    time: 8, stage: 0,
    note: "Needs a blade to cut strands long enough to twist. Fibre wadded by hand still makes a torch head, which is why the torch has no tool requirement." },

  { id: "torch", name: "Torch", station: "hand", tool: null,
    inputs: { stick: 1, plant_fibre: 2 }, outputs: { torch: 1 },
    time: 4, stage: 0,
    note: "The first answer to darkness, and craftable with literally nothing, because the first night arrives before any station does." },

  { id: "stone_knife", name: "Stone knife", station: "hand", tool: null,
    inputs: { rock: 1, stick: 1, plant_fibre: 2 }, outputs: { stone_knife: 1 },
    time: 12, stage: 0,
    note: "The first real craft. Costs only gathered things, and unlocks rope, which unlocks the axe." },

  { id: "stone_axe", name: "Stone axe", station: "hand", tool: null,
    inputs: { rock: 2, stick: 1, rope: 1 }, outputs: { stone_axe: 1 },
    time: 20, stage: 0,
    note: "Fells trees, which is the only source of wood, which is the workbench. The whole of stage 1 hangs off this one item." },

  { id: "bandage", name: "Bandage", station: "hand", tool: "stone_knife",
    inputs: { plant_fibre: 3 }, outputs: { bandage: 1 },
    time: 5, stage: 0,
    note: "Falls are the main early injury and healing otherwise needs food and rest. Cheap on purpose - survival pressure is light." }

];

export const RECIPES = Object.create(null);
for (const r of DATA) RECIPES[r.id] = r;

/* Stable order for the crafting screen. */
export const RECIPE_IDS = DATA.map(r => r.id);

/* "hand" is not a building; lane C treats it as "craftable anywhere". */
export const HAND = "hand";

export function recipe(id){ return RECIPES[id] || null; }

/* Every recipe made at a given station, in display order. */
export function recipesAt(station){
  return RECIPE_IDS.map(id => RECIPES[id]).filter(r => r.station === station);
}

/* Every recipe unlocked at or before a stage - what the guidebook shows. */
export function recipesUpTo(stage){
  return RECIPE_IDS.map(id => RECIPES[id]).filter(r => r.stage <= stage);
}
