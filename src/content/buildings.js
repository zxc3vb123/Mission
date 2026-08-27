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
     support     what has to hold it up. Nothing floats, but not everything
                 is founded on the ground:
                   ground   fraction of the footprint width that must be
                            solid underneath, 0..1.
                   wall     true: fixed to solid material beside it instead.
                            A ladder is held by the shaft wall, not the floor.
                   anchor   "above": hangs from solid material overhead, so it
                            can only be rigged from the top going down.
                   indoors  true if it may not be rained on. Reserved.
     climb       true if the player can go up it. Lane B reads this through
                 build.api.climbableAt.
     processing  true if it converts materials rather than just storing them.
     storage     kilograms it can hold, for chests and station buffers.
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


  { id: "ladder", timed: false, name: "Ladder", w: 6, h: 12,
    materials: { wood: 1, rope: 1 }, time: 3, buildsAt: "hand",
    support: { wall: true, ground: 0, indoors: false }, climb: true, stage: 0,
    enables: "Getting back out of a shaft you dug straight down - the first hole every player digs, and the first way every player gets stuck.",
    note: "STAGE 0 AND HAND-BUILT ON PURPOSE: the problem it answers arrives in the first ten minutes, long before a workbench, so gating it behind one would be answering a question the player has already given up on. Height is lane C's number, not mine - it is stacking geometry - and a rope ladder is exactly three sections of it so the two line up when stacked. Lane C flagged wood 2 as possibly miserable and was right - at two logs a section, climbing out of an ordinary shaft cost four backpack trips." },

  { id: "rope_ladder", timed: false, name: "Rope ladder", w: 6, h: 36,
    materials: { rope: 3, stick: 2 }, time: 5, buildsAt: "hand",
    support: { anchor: "above", ground: 0, indoors: false }, climb: true, stage: 1,
    enables: "Dropping a long way down a shaft you are standing at the top of.",
    note: "Twice the drop of a rigid ladder for a third of the weight, and the trade is that it hangs from something solid overhead - so you can only fit one from the top, going down. The rigid ladder is what you build climbing up; this is what you rig before descending." },

  /* ---------------- stage 1 ---------------- */

  { id: "workbench", timed: false, name: "Workbench", w: 20, h: 12,
    materials: { wood: 12, rock: 4 }, time: 40, buildsAt: "hand",
    support: { ground: 0.8, indoors: false }, stage: 1,
    enables: "Wooden and simple metal goods: shovel, pickaxe, wheelbarrow, chest, better torches.",
    note: "The hinge out of bare hands. Costed straight from docs/PROGRESSION.md stage 1: 12 wood, 4 stone." },

  { id: "chest", timed: false, storage: 200, name: "Chest", w: 12, h: 10,
    materials: { wood: 8, rope: 2 }, time: 15, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false }, stage: 1,
    enables: "Storage that is not your back. The first answer to a 35 kg carry limit.",
    note: "Cheap on purpose: the backpack limit should push you to build these early and often." },

  /* ---------------- stage 2 ---------------- */

  { id: "kiln", timed: true, processing: true, storage: 100, name: "Kiln", w: 20, h: 22,
    materials: { clay: 20, rock: 10 }, time: 90, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false }, stage: 2,
    enables: "Charcoal, bricks, quicklime and glass - the first heat hot enough to matter.",
    note: "Costed from docs/PROGRESSION.md stage 2: 20 clay, 10 stone. 126 kg of haulage, which is four backpack trips and the reason the wheelbarrow comes first." },


  /* ---------------- stage 3 ---------------- */

  { id: "sawmill", timed: true, storage: 100, name: "Sawmill", w: 28, h: 18,
    materials: { wood: 20, rock: 8, rope: 4 }, time: 100, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false },
    stage: 3,
    enables: "Sawn planks, and beyond them the scaffolds and ladders that let you build upwards.",
    /* NOT flagged `processing` yet, deliberately. The owner ruled the sawmill
       timed, and a water-driven machine converting logs while you are away is
       processing by every test the kiln passes - so this SHOULD carry the flag.
       Setting it broke lane C's suite: their production code reads `processing`
       to decide whether a recipe is station work or player work, and their
       sawmill flow is still the latter. The flag lands the day they are ready;
       until then the ruling is recorded here rather than half-implemented. */
    note: "Wood, stone and rope - no metal - so water power is reachable before you have smelted anything (docs/DECISIONS.md). Wants moving water or a wheel beside it." },

  /* ---------------- stage 4 ---------------- */

  { id: "forge", timed: true, processing: true, storage: 100, name: "Forge", w: 26, h: 20,
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

/* What share of a finished building's mass you get back by taking it apart,
   0..1. The guidebook should quote this before someone commits to a site:
   "almost all of it" and "you will lose most of the brick" are different
   decisions. Mirrors lane C's recoverFraction, which reads the same field. */
export function recoveryFraction(id, itemData){
  const b = BUILDINGS[id];
  if (!b) return 0;
  let put = 0, back = 0;
  for (const item in b.materials) {
    const d = itemData(item);
    if (!d) continue;
    const n = b.materials[item];
    const rate = typeof d.recover === "number" ? d.recover : 1;
    put += d.mass * n;
    back += d.mass * Math.floor(n * rate);
  }
  return put > 0 ? back / put : 0;
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
