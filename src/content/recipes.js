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
    note: "Falls are the main early injury and healing otherwise needs food and rest. Cheap on purpose - survival pressure is light." },

  /* ------------- stage 1: the workbench, and why it was worth 104 kg -------------
     The workbench has to pay for itself the moment it exists, or hauling the
     wood for it was a punishment rather than a step. These three are that
     payment: soft ground gets faster, rock opens at all, and haulage stops
     being a person with a bag. */

  { id: "stone_shovel", name: "Stone shovel", station: "workbench", tool: null,
    inputs: { wood: 1, rock: 2, rope: 1 }, outputs: { stone_shovel: 1 },
    time: 30, stage: 1,
    note: "Soft ground several times faster. It does nothing to rock, which is what keeps the pickaxe worth making too." },

  { id: "stone_pickaxe", name: "Stone pickaxe", station: "workbench", tool: null,
    inputs: { wood: 1, rock: 3, rope: 1 }, outputs: { stone_pickaxe: 1 },
    time: 35, stage: 1,
    note: "The single most important object in the early game: it is the only thing that opens rock, and everything below the first rock layer is behind it." },

  { id: "wheelbarrow", name: "Wheelbarrow", station: "workbench", tool: null,
    inputs: { wood: 6, rope: 2 }, outputs: { wheelbarrow: 1 },
    time: 60, stage: 1,
    note: "Costed from docs/PROGRESSION.md stage 1: wood and rope. The first rung of the haulage ladder above your own back." },

  /* ------------- stage 2: the kiln -------------
     Each of these is a conversion, and each loses something on the way, which
     is what makes fuel and flux a supply problem rather than a formality. */

  { id: "charcoal", name: "Charcoal", station: "kiln", tool: null,
    inputs: { wood: 4 }, outputs: { charcoal: 3 },
    time: 90, stage: 2,
    note: "Burns wood down to the fuel that will actually melt metal. Lossy on purpose: fuelling a forge should mean felling trees, not flicking a switch." },

  { id: "brick", name: "Bricks", station: "kiln", tool: null,
    inputs: { clay: 2 }, outputs: { brick: 3 },
    time: 45, stage: 2,
    note: "Clay is heavy and bricks are not much lighter, so a brick building is still a hauling job - but it survives weather and a cave-in." },

  { id: "quicklime", name: "Quicklime", station: "kiln", tool: null,
    inputs: { limestone: 2 }, outputs: { quicklime: 2 },
    time: 60, stage: 2,
    note: "Mortar for the bricks, and the flux without which a smelt at stage four simply does not work." },

  { id: "glass", name: "Glass", station: "kiln", tool: null,
    inputs: { sand: 3 }, outputs: { glass: 1 },
    time: 75, stage: 2,
    note: "Expensive in sand and slow to fire, because it is the one stage two output that reaches all the way to the rocket's instruments." },


  /* ------------- stage 3: the sawmill ------------- */

  { id: "plank", name: "Planks", station: "sawmill", tool: null,
    inputs: { wood: 1 }, outputs: { plank: 2 },
    time: 15, stage: 3,
    note: "A log becomes two planks, which is the first time the world gives back more pieces than you put in. The forge is built of these, so stage four rests on stage three." },

  /* ------------- stage 4: the forge -------------
     Ore to bar to better tool, and the better tool is what opens the next
     band of the map. This is the loop the whole middle game runs on. */

  { id: "iron_bar", name: "Iron bar", station: "forge", tool: null,
    inputs: { iron_ore: 2, charcoal: 2, quicklime: 1 }, outputs: { iron_bar: 1 },
    time: 60, stage: 4,
    note: "Ore, fuel and flux. Iron is tier one ground, so this is reachable with the stone pickaxe you already have - which is what stops the tool ladder eating its own tail." },

  { id: "steel_bar", name: "Steel bar", station: "forge", tool: null,
    inputs: { iron_bar: 2, coal: 3 }, outputs: { steel_bar: 1 },
    time: 90, stage: 4,
    note: "Iron and coal together, both from the shallow band. The deep metals are gated by knowing how, not by having already dug deeper." },

  { id: "iron_shovel", name: "Iron shovel", station: "forge", tool: null,
    inputs: { iron_bar: 1, wood: 1 }, outputs: { iron_shovel: 1 },
    time: 40, stage: 4,
    note: "Faster in loose ground and still unable to touch stone. A better tool of a kind is faster, never deeper." },

  { id: "iron_pickaxe", name: "Iron pickaxe", station: "forge", tool: null,
    inputs: { iron_bar: 2, wood: 1 }, outputs: { iron_pickaxe: 1 },
    time: 50, stage: 4,
    note: "The middle band opens. This is the first moment the world gets deeper because of something you made rather than something you endured." },

  { id: "steel_shovel", name: "Steel shovel", station: "forge", tool: null,
    inputs: { steel_bar: 1, wood: 1 }, outputs: { steel_shovel: 1 },
    time: 55, stage: 4,
    note: "The fastest shovel there is, and it stops at exactly the same ground the stone one did." },

  { id: "steel_pickaxe", name: "Steel pickaxe", station: "forge", tool: null,
    inputs: { steel_bar: 2, wood: 1 }, outputs: { steel_pickaxe: 1 },
    time: 70, stage: 4,
    note: "Nickel, silver, gold and titanium. Titanium matters most, because it is the tip of the next pickaxe." },

  { id: "titanium_pickaxe", name: "Titanium-tipped pickaxe", station: "forge", tool: null,
    inputs: { steel_bar: 2, titanium_ore: 3, wood: 1 }, outputs: { titanium_pickaxe: 1 },
    time: 120, stage: 6,
    note: "The last rung, standing on the one below it: a steel pick earns the titanium that tips the tool which reaches the bottom of the world." }

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
