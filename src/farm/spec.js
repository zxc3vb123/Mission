/* What a crop costs, drinks and yields. LANE J (farming).

   NUMBERS ARE LANE F'S, AND THESE ARE NOT LANE F'S YET.

   Same arrangement lane D used in src/industry/spec.js and lane C used for
   `processing` before that field existed: implement the mechanic, mark every
   number that has a home elsewhere as a fallback, file the request, and read
   the real table the day it lands. Never keep a second quiet copy of a number
   that belongs to somebody else.

   ONE NUMBER HERE IS NOT A FALLBACK AND MUST NOT BE HAND-SET: how much water
   a plant drinks. It is DERIVED from the mass it will produce, because
   conservation of matter is the first law of this game (GAME_DESIGN 2,
   WORKFLOW 5c) and a plant is a machine for turning water into food. Set the
   yield, and the thirst follows. Set both by hand and they drift apart on the
   day somebody retunes a bucket, which is exactly the shape that let a kiln
   print charcoal. */

import { ITEM_DATA } from "../content/items.js";

/* ------------------------------------------------------- the crop item ---
   LANE F FALLBACK - the two items a wheat plot is made of. Registered at
   startup through items.api.registerItem, the way lane D registers refined
   goods, and skipped entirely once lane F names them in ITEM_DATA. */
export const SEED_ID  = "wheat_seed";
export const GRAIN_ID = "wheat";

export const SEED_DEF = {
  name: "Wheat seed", mass: 0.05, category: "seed", band: "surface",
  stage: 0, tier: 0, col: "#c8b070", dark: "#8a7440",
  use: "A pinch of grain kept back rather than eaten. Planted in damp soil it is the difference between a meal and a field."
};
export const GRAIN_DEF = {
  name: "Wheat", mass: 0.65, category: "food", band: "surface",
  stage: 0, tier: 0, col: "#d8b45c", dark: "#8f7228",
  food: { nutrition: 6 },
  use: "Ears on the stalk, threshed by hand. Edible raw and dull; the point of it is that bread, once there is a fire and a quern, is worth several times this."
};

/* LANE F FALLBACK - what one ripe plot gives back.
   Three ears go in the pack as food and two are kept back for seed: a field
   that did not reseed itself would make farming a consumable rather than an
   industry, and one that reseeded ten times over would make the first
   handful of wild grain the last decision the player ever makes about food.
   Two seeds out of one is slow, honest growth. */
export const YIELD_GRAIN = 3;
export const YIELD_SEED  = 2;

/* LANE F FALLBACK - a wild plant found growing is worth much less than a
   tended one. It is the START of farming, never a substitute for it. */
export const WILD_GRAIN = 1;
export const WILD_SEED  = 1;

/* --------------------------------------------------------------- water ---
   THE ONE BRIDGE IN THIS GAME BETWEEN PIXELS OF LIQUID AND KILOGRAMS is the
   bucket: lane F's water_bucket weighs its own empty plus its contents, and
   says how many pixels those contents are. Everything else that moves water
   moves pixels. So the conversion is read off that pair rather than invented
   here, and it follows lane F automatically - they doubled the pail from 60
   to 120 px this morning (DECISIONS, "tiring, not brutal") and nothing in
   this file had to notice. */
const FULL_PAIL  = "water_bucket";
const EMPTY_PAIL = "bucket";

export function waterKgPerPixel(){
  const full = ITEM_DATA[FULL_PAIL], empty = ITEM_DATA[EMPTY_PAIL];
  if(!full || !empty || !(full.liquidAmount > 0)) return 10 / 120;   /* the shipped pail */
  return (full.mass - empty.mass) / full.liquidAmount;
}

/* How much MASS one plot makes out of water, in kg: everything it hands back
   minus the seed that was put in. The seed is not consumed - it comes back
   among the yield - so it cancels, and what is left is water become food. */
export function massFromWater(){
  return YIELD_GRAIN * GRAIN_DEF.mass + (YIELD_SEED - 1) * SEED_DEF.mass;
}

/* DERIVED, NOT CHOSEN: pixels of water one plot must drink to make that.
   2.00 kg at the shipped pail's 0.0833 kg/px is 24 px, so one bucket of
   water is five plants - a real trip for a real row, and the reason a
   channel dug from a pond to a field is the first piece of automation the
   surface has ever had a use for. */
export function waterNeed(){
  return Math.max(1, Math.round(massFromWater() / waterKgPerPixel()));
}

/* --------------------------------------------------------------- time ----
   LANE F FALLBACK - one sip of water every this many ticks, and a plot is
   ripe when it has drunk its fill. Growth is therefore counted in WATER, not
   in seconds: a plot that runs dry stops where it is and carries on when it
   is watered again, which is the behaviour a field has to have or leaving it
   alone would be a punishment.

   24 sips at 135 ticks is ninety seconds of tended growth - about the length
   of a short trip underground, so a field is something you set going and
   come back to rather than something you stand and watch. */
export const SIP_TICKS = 135;

/* How much a plot will hold. A watering fills it to its need and no further;
   the rest of the bucket goes to its neighbours and then on the ground, so
   nothing is ever swallowed. */
export function plotCapacity(){ return waterNeed(); }

/* ------------------------------------------------------------ geometry ---
   Spacing between plants: close enough that a field is a field, far enough
   that one bucket is not the whole farm. */
export const PLOT_SPACING = 9;
/* How near the cursor has to be to a plant to mean that plant. */
export const PICK_R = 7;
/* How far the player can reach to plant, water or pull. Mirrors lane C's
   build reach (src/build/placement.js REACH = 70) rather than importing it:
   their constant is internal to their folder, and a farm hand and a builder
   have the same arms. */
export const REACH = 70;
/* How far along a row one watering reaches. */
export const WATER_R = 34;

/* -------------------------------------------------------------- upkeep ---
   Two slow beats, both staggered by plot so a hundred plants never all think
   on the same tick.

   CHECK_EVERY: is there still soil under this, and sky over it. Costs a
   short column of matAt calls, which may page a chunk in when the plot is
   far from the camera - the same bargain lane D took for the derrick, and
   for the same reason: once a second is a price worth paying for a machine
   that keeps working when nobody is watching.

   ONE SECOND IS MEASURED, NOT ASSUMED, and it very nearly got slowed down
   for no reason. A coarse whole-frame reading taken while three other test
   runs were loading the machine put the farm at 2-3 ms and I had the beat at
   five seconds before checking the precise number. Sixty plots, 800 px from
   the camera, in the full suite ordering where the ground has been churned
   and chunks are being evicted, cost 0.007 ms a tick. There was nothing to
   fix, and a slower beat would have made a crop take five seconds rather
   than one to notice its soil had gone in exchange for nothing at all.
   Worth leaving here as the reason this number is not larger.

   SOAK_EVERY: a thirsty plot looks for water within reach and drinks. This
   is irrigation, and it is the only part of farming that runs with nobody
   present at all. */
export const CHECK_EVERY = 36;
export const SOAK_EVERY  = 108;
/* How far a root reaches for standing water. Deliberately short: a channel
   has to be dug TO the field, not near it. */
export const SOAK_R = 9;
/* How much a root lifts in one go. A plot fills over a handful of soaks, so
   a ditch beside a row is slower than a bucket over it and costs no trips. */
export const SOAK_PER = 4;

/* How far above a plot the sky has to be clear. A crop needs daylight; a
   roofed plot is not a farm, it is a cellar. Bounded, so the test is a short
   column read rather than a walk to the top of the map. */
export const SKY_SCAN = 40;

/* ------------------------------------------------------------ the wild ---
   LANE F FALLBACK - where the FIRST seed comes from, which is the one thing
   this whole lane cannot be reached without. Lane C's scatter exists for
   exactly this reason on the tool ladder: loose rock on the surface is what
   breaks the stone-pickaxe-needs-rock-needs-a-stone-pickaxe deadlock. Grain
   has the same shape - a field needs seed and seed comes from a field - and
   wild wheat is what breaks it.

   Thin on purpose. A wild plant is one meal and one seed; a field is the
   only thing that feeds anybody. */
export const WILD_STEP   = 320;    /* try a spot every this many px */
export const WILD_CHANCE = 0.34;   /* and take about a third of them */
export const WILD_CLUMP  = 3;      /* up to this many in a patch */
/* Regrowth, so a valley picked clean is not a dead end - the same guarantee
   lane C's gatherables make, for the same reason. One at a time, out of
   sight, and never above the count the world was seeded with. */
export const REGROW_EVERY = 900;
export const REGROW_NEAR  = 400;

export const TEND_KEY = "t";
