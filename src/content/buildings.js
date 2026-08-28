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
     props       true if standing this under a roof holds it up. Lane A's
                 cave-in span rule reads support registered through
                 addSupport; this is what marks a thing worth registering.
     fired       true if it works by BURNING something. A kiln and a forge do;
                 a sawmill is water-driven and a derrick is worked by a beam,
                 and neither burns anything to do its job. `timed` and
                 `processing` say a station does work over time; only this
                 says the work is heat, and only heat needs fuel.
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


  { id: "timber_prop", timed: false, name: "Timber prop", w: 4, h: 20,
    materials: { wood: 1 }, time: 3, buildsAt: "hand",
    support: { ground: 1.0, indoors: false }, props: true, stage: 0,
    enables: "Holding up the roof of a tunnel cut through loose ground, which will otherwise come down on you.",
    note: "STAGE 0 AND ONE LOG, because cave-ins are live from the first tunnel and until now there was nothing in the game to prop one with - the earliest timber piece was the plank beam, three stages away. Loose ground holds about 26 px of unsupported roof, so this is a HIGH-FREQUENCY cost like a house piece rather than a one-off like a station: a long drift through earth wants one every few paces, and the price is set for that. LANE C/A: `props: true` is the flag to register it through addSupport." },

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

  { id: "kiln", timed: true, processing: true, fired: true, storage: 100, name: "Kiln", w: 20, h: 22,
    materials: { clay: 20, rock: 10 }, time: 90, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false }, stage: 2,
    enables: "Charcoal, bricks, quicklime and glass - the first heat hot enough to matter.",
    note: "Costed from docs/PROGRESSION.md stage 2: 20 clay, 10 stone. 126 kg of haulage, which is four backpack trips and the reason the wheelbarrow comes first." },


  /* ---------------- stage 3 ---------------- */

  { id: "sawmill", timed: true, processing: true, storage: 100, name: "Sawmill", w: 28, h: 18,
    materials: { wood: 20, rock: 8, rope: 4 }, time: 100, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false },
    stage: 3,
    enables: "Sawn planks, and beyond them the scaffolds and ladders that let you build upwards.",
    /* `processing` because the owner ruled the sawmill timed, and a
       water-driven machine converting logs while you are elsewhere is
       processing by every test the kiln passes. Lane C's isTimed() reads this
       flag and nothing else, so setting it is what makes planks a job the
       station does rather than work the player stands and does. Its output
       waits inside the mill until someone walks in, which is why it needs
       `storage`. */
    note: "Wood, stone and rope - no metal - so water power is reachable before you have smelted anything (docs/DECISIONS.md). Wants moving water or a wheel beside it." },


  /* ---------------- pieces: the parts you build a house out of ----------------
     A second mode alongside the prefab stations. A forge is a thing you place;
     a house is a thing you assemble. Both are the same kind of object so they
     share placement, support, saving and deconstruction - the only difference
     is that you place ONE forge and several hundred pieces, and that changes
     what matters about the cost.

     A STATION'S COST IS A DECISION; A PIECE'S COST IS A MULTIPLIER. Nobody
     agonises over one workbench, but a modest house is forty-odd pieces, so a
     per-piece price is really a per-house price with a factor of forty on it.
     These are therefore deliberately cheap per unit, and the pressure comes
     from how many you need rather than from what each one costs. */

  { id: "brick_foundation", timed: false, name: "Brick foundation", w: 24, h: 6,
    materials: { brick: 4 }, time: 6, buildsAt: "hand",
    support: { ground: 1.0, indoors: false }, piece: true, foundation: true, stage: 2,
    enables: "Something for a timber frame to stand on that will not rot into the ground.",
    note: "Stage 2, so a foundation is available a whole stage before the planks that sit on it - you can lay out a house before you can build one, which is the right order to learn a plan in. Costs four bricks and gives two back: the mortar is what you lose." },

  { id: "plank_beam", timed: false, name: "Plank beam", w: 24, h: 4,
    materials: { plank: 1 }, time: 2, buildsAt: "hand",
    support: { piece: true, ground: 0, indoors: false }, piece: true, props: true, stage: 3,
    enables: "The frame: rotated upright it is a post, laid flat it is a beam, and it is one object either way.",
    note: "ONE entry rather than a separate post, deliberately. They are mechanically the same rectangle and two ids for one object is drift waiting to happen - someone eventually prices them differently. The build menu can say it rotates; the guidebook does." },

  { id: "plank_floor", timed: false, name: "Plank floor", w: 24, h: 3, 
    materials: { plank: 1 }, time: 2, buildsAt: "hand",
    support: { piece: true, ground: 0, indoors: false }, piece: true, stage: 3,
    enables: "The surface: decking underfoot, and rotated it is the wall that closes a room in.",
    note: "Thinner than a beam because it carries only itself and whatever stands on it. Same price, because charging differently for two things a player cannot tell apart while building teaches nothing." },


  /* ---------------- stage 3 ---------------- */

  { id: "stockpile", timed: false, storage: 1500, name: "Stockpile", w: 48, h: 16,
    materials: { plank: 12, wood: 8 }, time: 60, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false }, stage: 3,
    enables: "Open storage sized for what a cart brings rather than what a person carries.",
    note: "Lane D spotted the gap and it falls straight out of the haulage ladder: a chest holds two hundred kilograms and a wagon carries fifteen hundred, so ONE WAGON-LOAD IS SEVEN CHESTS. The moment a railway exists the game needs somewhere to put a trainload, and there was nothing. Deliberately exactly one wagon-load, so the relationship is legible: a cart arrives, a stockpile takes it. Cheap per kilogram and enormous per footprint, which is what open ground buys you." },

  /* ---------------- stage 5 ---------------- */

  { id: "derrick", timed: true, processing: true, storage: 400, name: "Derrick", w: 18, h: 48,
    materials: { wood: 24, rope: 8 }, time: 150, buildsAt: "workbench",
    support: { ground: 1.0, indoors: false }, stage: 5,
    enables: "Sinking and holding a bore down to an oil pocket, and a tank at the foot of it for what comes up.",
    note: "TIMBER AND ROPE, NO METAL, at lane D's ask and it is the right call - the same argument that put the sawmill on wood, stone and rope. What gates oil is not the tower, it is finding the stuff: oil is a middle-band material, so you need an iron pickaxe to reach the depth at all. The gate is the tool tier, and a cheap derrick on top of an expensive tool reads better than the reverse. PROGRESSION said steel and pipe; it was written before the tier system existed and I have corrected it." },

  { id: "walking_beam", timed: false, name: "Walking beam", w: 34, h: 22,
    materials: { wood: 10, iron_bar: 4, rope: 4 }, time: 90, buildsAt: "forge",
    support: { ground: 1.0, indoors: false }, stage: 5,
    enables: "Working the pump rod up and down, so the bore actually delivers rather than merely existing.",
    note: "TWO ENTRIES RATHER THAN ONE, which is the opposite of the call I made on the beam-and-post - and for the opposite reason. Those were one rectangle rotated; a tower and an engine are genuinely different objects doing different jobs, and splitting them lets the timber half arrive cheap while the METAL half is what actually costs. Sinking a bore you cannot yet pump is a real intermediate state and a good one: the hole is dug, the machine is what you are short of." },

  /* ---------------- stage 4 ---------------- */

  { id: "forge", timed: true, processing: true, fired: true, storage: 100, name: "Forge", w: 26, h: 20,
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

/* HOW LONG TAKING ONE APART TAKES, as a share of how long it took to raise.

   A fraction rather than a number per building, so it stays right on its own
   as build times are tuned - there is nothing to forget to update.

   Why shorter: prying a thing apart is genuinely quicker than aligning,
   seating and mortaring it. Why not much shorter, and why not instant: a free
   undo would delete the decision that placement is supposed to be. You should
   feel you chose a site.

   Why not longer, which is the part worth stating: the real cost of moving a
   building is already the material it does not give back - a forge is fifty
   per cent. Charging a long wait on top would punish the same mistake twice,
   which is the trap the metal chain fell into when craft times became real.
   The mass is the cost; the time is the friction. */
export const DECONSTRUCT_FRACTION = 0.6;

/* HOW FAR AN UNSUPPORTED RUN OF PIECES REACHES before it needs something
   under it. A piece sitting on ground or on another piece is span zero; a
   piece held only from the side is its neighbour's span plus one; past this
   it falls.

   This one number decides whether building feels like carpentry or like
   magic, so here is the reasoning rather than just the value. At a piece
   width of 24 px it means an overhang - a balcony, a landing, a floor with a
   post at one end only - reaches about four player-widths and then stops,
   which reads as a ledge rather than a floating platform. A floor supported
   at BOTH ends spans twice that plus one, so a properly posted room is
   generously large while an improperly posted one visibly is not. That gap
   between the two is the whole lesson, and it is what a player infers from
   the world instead of reading in a table.

   Lower and every room needs a forest of posts; higher and floors start
   hanging in space, which is the one thing the physics of this game has never
   allowed anywhere else. */
export const MAX_SPAN = 3;

export function deconstructTime(id){
  const b = BUILDINGS[id];
  if (!b) return 0;
  return Math.max(1, Math.round(b.time * DECONSTRUCT_FRACTION));
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
