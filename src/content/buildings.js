/* BUILDINGS - placeable structures and the stations that gate crafting.
   LANE F (content). Data only; lane C implements placement (build.api).

   A building is not crafted and carried. It is built where it stands, out of
   materials hauled to that spot, and it does not float - see the laws in
   docs/GAME_DESIGN.md section 2. Its cost lives here and nowhere else, so a
   balance change is one edit.

   Fields
     id          stable key. Recipes name it in their `station` field, and
     name        what the build menu and the guidebook call it.
     w, h        footprint in world pixels. The player is 6 wide and 16 tall,
                 so a 20x12 workbench is about waist height on them.
     materials   { itemId: count } consumed to build it. The hauling cost of
                 these is the real cost of the building - a workbench is
                 104 kg of wood and rock, which is three backpack trips.
     time        seconds of work to raise it, once the materials are on site.
     buildsAt    "hand" if it can be built with nothing, otherwise the id of
                 the station whose tools are needed to build it.
     timed       does crafting HERE take time? docs/DECISIONS.md: hand and
                 workbench crafts complete instantly; the kiln and the forge
                 take time, because they are transformations rather than
                 assembly - you are waiting on a fire, not on your own hands.
                 A timed station keeps working while the player is elsewhere,
                 which is what makes the wait a scheduling cost rather than a
                 staring cost. Recipes at an untimed station ignore `time`.
     support     what has to hold it up:
                   ground   fraction of the footprint width that must be
                            solid underneath, 0..1. Nothing floats.
                   indoors  true if it may not be rained on / must be in a
                            sheltered space. Reserved; nothing sets it yet.
     stage       progression stage it becomes available (docs/PROGRESSION.md).
     enables     one line of prose, NOT a list of recipe ids. The real link is
                 recipesAt(buildingId) in recipes.js, so the two can never
                 disagree about what a station makes.
     note        one line: why this building exists.

   Scope: stages 0-2 only, which is as far as docs/PROGRESSION.md actually
   costs things out. The sawmill and forge wait on the stage 3 ordering
   question in docs/STATUS.md - inventing their costs now would be guessing.
*/

const DATA = [
  /* ---------------- stage 0 ---------------- */

  { id: "campfire", timed: false, name: "Campfire", w: 12, h: 8,
    materials: { rock: 6, wood: 2, stick: 3 }, time: 25, buildsAt: "hand",
    support: { ground: 1.0, indoors: false }, stage: 0,
    enables: "Cooking, warmth and a pool of light that does not burn out like a torch.",
    note: "The only thing you can build on the first night. The ring of rock is why it stays put." },

  /* ---------------- stage 1 ---------------- */

  { id: "workbench", timed: false, name: "Workbench", w: 20, h: 12,
    materials: { wood: 12, rock: 4 }, time: 40, buildsAt: "hand",
    support: { ground: 0.8, indoors: false }, stage: 1,
    enables: "Wooden and simple metal goods: shovel, pickaxe, wheelbarrow, chest, better torches.",
    note: "The hinge out of bare hands. Costed straight from docs/PROGRESSION.md stage 1: 12 wood, 4 stone." },

  { id: "chest", timed: false, name: "Chest", w: 12, h: 10,
    materials: { wood: 8, rope: 2 }, time: 15, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false }, stage: 1,
    enables: "Storage that is not your back. The first answer to a 35 kg carry limit.",
    note: "Cheap on purpose: the backpack limit should push you to build these early and often." },

  /* ---------------- stage 2 ---------------- */

  { id: "kiln", timed: true, name: "Kiln", w: 20, h: 22,
    materials: { clay: 20, rock: 10 }, time: 90, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false }, stage: 2,
    enables: "Charcoal, bricks, quicklime and glass - the first heat hot enough to matter.",
    note: "Costed from docs/PROGRESSION.md stage 2: 20 clay, 10 stone. 126 kg of haulage, which is four backpack trips and the reason the wheelbarrow comes first." },


  /* ---------------- stage 3 ---------------- */

  { id: "sawmill", timed: false, name: "Sawmill", w: 28, h: 18,
    materials: { wood: 20, rock: 8, rope: 4 }, time: 100, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false },
    stage: 3,
    enables: "Sawn planks, and beyond them the scaffolds and ladders that let you build upwards.",
    note: "Wood, stone and rope - no metal - so water power is reachable before you have smelted anything (docs/DECISIONS.md). Wants moving water or a wheel beside it." },

  /* ---------------- stage 4 ---------------- */

  { id: "forge", timed: true, name: "Forge", w: 26, h: 20,
    materials: { brick: 18, quicklime: 6, plank: 8 }, time: 120, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false }, stage: 4,
    enables: "Smelting ore into bars, and forging the metal tools that reach the next layer of the map.",
    note: "The hinge of the whole game. Everything before it is preparation for being able to build it, and everything after it is downstream of the bars it makes." }

];

export const BUILDINGS = Object.create(null);
for (const b of DATA) BUILDINGS[b.id] = b;

/* Stable order for the build menu. */
export const BUILDING_IDS = DATA.map(b => b.id);

export function building(id){ return BUILDINGS[id] || null; }

/* Everything placeable at or before a stage - what the guidebook offers. */
export function buildingsUpTo(stage){
  return BUILDING_IDS.map(id => BUILDINGS[id]).filter(b => b.stage <= stage);
}

/* Total hauled mass of a building, in kg. The guidebook quotes this, because
   "12 wood and 4 stone" means nothing until you know it is three trips. */
export function buildMass(id, itemData){
  const b = BUILDINGS[id];
  if (!b) return 0;
  let kg = 0;
  for (const item in b.materials) {
    const d = itemData(item);
    if (d) kg += d.mass * b.materials[item];
  }
  return Math.round(kg * 10) / 10;
}
