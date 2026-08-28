/* What a rail and a wagon cost and how fast they go. LANE D (industry).

   NUMBERS ARE LANE F'S, AND THESE ARE NOT LANE F'S YET.

   Everything in this file that lane F owns is a clearly marked fallback with
   a request filed against it (docs/REQUESTS.md, industry -> content). It is
   the same shape lane C used for `processing` and `storage` before those
   fields existed: implement the mechanic, read the real table the day it
   lands, and never quietly keep a second copy of a number that has a home.

   What is NOT a fallback, and must not be re-invented here: the haulage
   ladder. `src/content/haulage.js` prices every rung from a backpack to a
   conveyor, and the wagon's capacity and speed are read straight off it.
   docs/DECISIONS.md (2026-08-28, the conveyor) is settled data. */

import { HAULAGE } from "../content/haulage.js";


/* ---------------------------------------------------------------- track --- */

/* One laid segment. 24 px matches lane C's piece width, so a rail run and a
   plank deck line up with each other and with the player's sense of scale. */
export const RAIL_LEN = 24;
/* Low: the running surface is nearly on the ground, so a rail laid across a
   dip does not read as a bridge. */
export const RAIL_H = 3;

/* LANE F FALLBACK - what one segment costs to lay.
   HAULAGE.mine_wagon: "Rails, points and a wagon, all steel from the forge.
   The track is the real cost; the wagon is almost an afterthought." So the
   rail is deliberately the dear one: steel rail on a timber sleeper. */
export const RAIL_COST = { steel_bar: 1, plank: 1 };

/* LANE F FALLBACK - seconds of work to lay one segment. Short, because the
   cost of a rail run is the number of segments, not the wait for each. */
export const RAIL_TIME = 3;

/* --------------------------------------------------------------- wagon ---- */

export const WAGON_W = 22, WAGON_H = 14;

/* LANE F FALLBACK - what a wagon costs, and what it weighs empty.
   The tare matters mechanically rather than decoratively: a shove is a force
   and `dv = force / mass`, so an empty wagon starts easily and a full one
   does not. That is the whole reason a gradient is worth digging. */
export const WAGON_COST = { steel_bar: 6, plank: 4, wood: 4 };
export const WAGON_TARE = 300;
export const WAGON_TIME = 20;

/* Payload is NOT a fallback: it is lane F's rung. */
export function wagonCapacity(){ return HAULAGE.mine_wagon.capacity; }

/* ------------------------------------------------------------- physics ---- */

/* Downward acceleration in px/tick^2. Anchored to lane B rather than guessed:
   the clonk jumps at -4.9 px/tick and comes back down in a bit under half a
   second, which is this. Lane B's constants are internal to their folder so
   the number is copied here with its source named rather than imported. */
export const GRAVITY = 0.20;

/* A LOADED WALK, in px/tick. lane F quotes every rung's `speed` against this
   unit ("pace of a loaded trip, relative to a loaded walk"), so it has to
   exist somewhere. Lane B's WALK_SPEED is 2.15 unencumbered; a pack heavy
   enough to be worth carting slows that to about seven tenths. */
export const LOADED_WALK = 1.5;

/* Top speed of a rung, in px/tick, from lane F's `speed` column. */
export function topSpeed(rungId){
  const h = HAULAGE[rungId];
  return LOADED_WALK * ((h && h.speed) || 1);
}

/* Rolling resistance, px/tick^2. STEEL ON STEEL IS THE POINT OF RAIL, so
   this is small on purpose: a wagon at speed coasts a couple of hundred
   pixels after you stop pushing, which is the difference a player feels
   between a rail and a barrow. */
export const ROLL = 0.005;

/* The brake. Firm enough to stop a wagon inside its own length or two. */
export const BRAKE_A = 0.14;

/* One tick of a person leaning on a wagon, in kg*px/tick^2. Divided by the
   loaded mass, so a full wagon takes several seconds to get going and an
   empty one takes a moment. */
export const SHOVE = 25;

/* How close the player must be to get a hand on a wagon. Matches lane C's
   build reach, because it is the same question: can you touch it. */
export const PUSH_REACH = 70;

/* ------------------------------------------------------------- laying ----- */

/* How much of a segment's length needs solid ground under it. Rail is laid
   on ballast; a sleeper bridging a small hollow is fine, half a segment in
   mid air is not. */
export const MIN_BALLAST = 0.6;
/* How far under the sleeper we look for that ground. */
export const BALLAST_DEPTH = 3;

/* How near two segments have to be to count as joined, and how much height
   a joint may take. MAX_STEP over RAIL_LEN is the ruling gradient: five in
   twenty-four is steep for rail and gentle for this game's terrain, which is
   the right side to err on - a grade a wagon can run away down has to be
   something the player chose to dig. */
export const JOIN_GAP = 5;
export const MAX_STEP = 5;

/* How often a laid rail re-checks that the ground is still under it, in
   ticks. Machines tick on a schedule (docs/lanes/industry.md): hundreds of
   segments must not each sweep their ballast every frame. */
export const BALLAST_CHECK = 12;

/* ---------------------------------------------------------- transfers ----- */

/* Unloading is rated rather than instant, in kg per tick. THE POINT IS NOT
   THE WAIT - it is that a load crosses from wagon to container as material,
   a few kilos at a time, so there is never a tick where it is in both places
   or in neither. Roughly a wagon-load a minute. */
export const UNLOAD_KG = 0.7;

/* Tipping spoil out onto the ground goes through lane A's pour, which has
   its own rate, so this only meters how many ITEMS we hand it per tick. */
export const TIP_PER_TICK = 1;

/* How far from a wagon a container counts as "the cart is standing at it".
   A little over half a wagon width: you are alongside, not on top. */
export const DOCK_REACH = 18;

/* ------------------------------------------------------------------ oil --- */

/* A WALKING BEAM IS SLOW, and that is the load-bearing number here.

   A real beam engine nods about twenty times a minute. One stroke every
   three seconds is that, and it is also what makes a derrick affordable to
   run at any distance: each stroke asks lane A's world for real, which pages
   a chunk in when the rig is far from the camera, and at one ask every three
   seconds that cost is nothing. A pump that drew every tick would have had
   to choose between being wrong far away and being expensive far away.
   See the long note at the top of oil.js. */
export const STROKE_TICKS = 108;

/* LANE F FALLBACK - how much a stroke lifts, and how many pixels of oil make
   one measure. Together these set the rate: four pixels every three seconds
   is a measure every three quarters of a minute, which sits beside lane E's
   fuel anchor (one coal per thirty seconds is one forge's load) rather than
   dwarfing it. */
export const OIL_PER_STROKE = 4;
export const PIXELS_PER_BARREL = 60;

/* LANE F FALLBACK - the item a rig produces. Named `crude_oil` rather than
   `oil_barrel` ON PURPOSE, and it is a conservation-of-matter judgement
   rather than a naming one: a barrel is staves and hoops somebody has to
   have made, and a machine that emitted barrels would be conjuring the wood
   as well as raising the oil. So a rig raises oil, and the cooper's recipe
   that puts it in a barrel is lane F's to add if they want it. */
export const OIL_ITEM = "crude_oil";

/* HOW FAR THE PIPE STRING REACHES, and this is where the derrick earns its
   place rather than decorating the hole. A hand-rigged pump lifts from a
   shallow shaft; the timber tower is what lets you hang a long string of
   pipe and pump a deep one. That is what a derrick was actually for, and it
   makes it an upgrade a player can feel rather than a required ornament. */
export const PIPE_HAND = 48;
export const PIPE_DERRICK = 220;

/* HOW DEEP A HOLE HAS TO BE BEFORE IT IS A WELL, measured as how much
   further the open column goes than the ground beside it.

   Half a derrick's height. Ground is never flat to the pixel, so a footprint
   on an ordinary hillside always has one column lower than another; at eight
   this let a derrick standing on undug ground claim a bore out of a hollow
   nobody had sunk, which a test caught before a player could. A well is
   something you dug. */
export const MIN_BORE = 24;

/* ------------------------------------------------------------- items ------ */

/* `registerItem` is published for this lane to add refined goods with. It
   currently adds NONE, and the reason is worth keeping because it nearly
   went the other way.

   This file had a `crude_oil` fallback with a mass of 12 kg, written while
   lane F was asked for the real entry. Their commit landed with crude_oil at
   12.0 - two lanes reaching the same number from opposite directions, which
   is the best evidence either of us had that it was right. The fallback was
   then deleted rather than left dormant, because the rule at the top of this
   file is never to keep a second copy of a number that has a home, and a
   dormant copy is exactly how two tables start disagreeing a month later.

/* WHAT THIS LANE DELIBERATELY DOES NOT REGISTER, which is everything else.

   A rail and a wagon could each have been an item you craft and carry to the
   site. They are not, because BUILDINGS ARE PLACED, NEVER CRAFTED
   (docs/DECISIONS.md, 2026-08-27) and a wagon is far closer to a building
   than to a shovel: it is assembled where it will run, out of materials
   hauled there. Making it an item would also have needed a recipe, and
   recipes are lane F's - so the whole rail system would have sat inert
   behind a table entry nobody had written, which is precisely the failure
   docs/WORKFLOW.md section 4c exists to stop.

   Laying track and building a wagon therefore spend RAIL_COST and WAGON_COST
   straight out of the pack, exactly as lane C's place() spends a building's
   materials. Both are steel and plank, both of which the forge and the
   sawmill already make, so the chain is real and reachable today.

   The one thing lane F still owns here is the numbers, which is what the
   request in docs/REQUESTS.md asks for. */

/* How near a walking beam has to stand to work a derrick's rod. Lane F split
   the tower from the engine so that "the bore is sunk and I cannot work it
   yet" is a real state; this is the distance that makes the two one machine.
   Generous enough that the player is not fighting the cursor, tight enough
   that a beam plainly belongs to one derrick. */
export const BEAM_REACH = 60;
