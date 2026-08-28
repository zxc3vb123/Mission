/* Numbers for everything alive that is not the player. LANE I (creatures).

   Two kinds of number live here and they are not the same kind of thing:

   1. WHAT A SWING IS - its reach, its arc, its cadence in ticks. That is
      mechanism, it is this lane's, and it stays here for good.

   2. WHAT A BLOW IS WORTH, and what a crawler is made of. Those are BALANCE,
      and balance is lane F's (docs/lanes/LANE_I_CREATURES.md: "Damage numbers
      are lane F's to write"). Lane F has already written the tool half in
      `src/content/tools.js` as KIND_COMBAT and weaponOf(); this file READS
      that when it is there and falls back to a copy of it when it is not,
      which is the arrangement lane D uses in `src/industry/spec.js`. Every
      fallback below is marked LANE F FALLBACK and has an entry in
      docs/REQUESTS.md.

   The import is a NAMESPACE import on purpose. A named import of something a
   module does not export is a link error rather than a missing value, so
   `import { weaponOf }` would fail to LOAD against any commit of lane F's
   table older than the one that adds it - which is exactly the state
   `node tools/verify.js HEAD` puts this commit in. */

import * as TOOLDATA from "../content/tools.js";

/* ------------------------------------------------------------ the swing --- */

/* Reach in pixels from the middle of the body, by tool kind. Mine rather than
   lane F's: a haft length is geometry, not balance. A knife is close work; a
   shovel and a pickaxe are long-handled and clumsy with it. */
export const REACH = {
  hands:   11,
  knife:   13,
  axe:     15,
  shovel:  16,
  pickaxe: 16
};
export const DEFAULT_REACH = 12;

/* How wide the swing is: a cone forward of the aim, plus a small circle
   around the body so that something already on top of you can always be
   hit. Being unable to connect with a thing that is biting your leg is the
   worst possible moment to be told about arcs. */
export const ARC_HALF = 1.05;          /* radians - about 60 degrees each side */
export const GRAPPLE  = 7;             /* inside this, the angle stops mattering */

/* A swing is not a free action. The cadence is lane F's `swing` (hits per
   second) turned into ticks at the fixed 36 Hz; the floor stops a
   hypothetical very fast tool becoming one hit per tick. */
export const TICKS = 36;
export const MIN_COOLDOWN = 7;

/* What a landed blow does besides damage. */
export const KNOCKBACK  = 1.7;
export const KNOCK_LIFT = 0.9;

/* LANE F FALLBACK - a copy of KIND_COMBAT from src/content/tools.js, used
   only while the committed table does not carry it. Same numbers and same
   reasoning: damage = kind damage x the tool's own `speed`, so an iron axe
   hits harder than a stone one for exactly the reason it fells a tree
   faster, and there is no second ladder to forget to update. */
const FALLBACK_KIND_COMBAT = {
  hands:   { damage: 3,  swing: 1.3  },
  knife:   { damage: 7,  swing: 1.7  },
  axe:     { damage: 13, swing: 1.0  },
  shovel:  { damage: 5,  swing: 0.9  },
  pickaxe: { damage: 16, swing: 0.55 }
};
const FALLBACK_HANDS_SPEED = 0.6;

export function kindOf(toolId){
  const t = TOOLDATA.TOOLS ? TOOLDATA.TOOLS[toolId || "hands"] : null;
  return t ? t.kind : "hands";
}

/* What is this tool worth as a weapon? Everything in the hands swings -
   there is no weapon slot and no weapon class (the owner: "i should be able
   to hit using everything. axes. shovels etc. they do different dmg, but
   still") - so this has to answer for EVERY id a player can be holding,
   including ids this lane has never heard of and including nothing at all. */
export function weaponFor(toolId){
  const id = toolId || "hands";

  if(typeof TOOLDATA.weaponOf === "function"){
    const w = TOOLDATA.weaponOf(id);
    if(w) return { id, kind: kindOf(id), damage: w.damage, swing: w.swing };
  }

  const t = TOOLDATA.TOOLS ? TOOLDATA.TOOLS[id] : null;
  const kind = t ? t.kind : "hands";
  const k = FALLBACK_KIND_COMBAT[kind] || FALLBACK_KIND_COMBAT.hands;
  const speed = t ? t.speed : FALLBACK_HANDS_SPEED;
  return { id, kind, damage: Math.round(k.damage * speed * 10) / 10, swing: k.swing };
}

export function reachFor(toolId){
  const r = REACH[kindOf(toolId)];
  return r === undefined ? DEFAULT_REACH : r;
}

export function cooldownFor(toolId){
  const w = weaponFor(toolId);
  const t = Math.round(TICKS / (w.swing > 0 ? w.swing : 1));
  return t < MIN_COOLDOWN ? MIN_COOLDOWN : t;
}

/* ---------------------------------------------------------- the crawler --- */

/* ONE creature, and depth is what makes it worse - not a bestiary
   (docs/DECISIONS.md, 2026-08-28: "something underground that gets worse
   with depth"). A band is chosen by how far below the surface the thing
   spawned and never changes afterwards: what came out of the deep is a deep
   one wherever it follows you to.

   LANE F FALLBACK, all of it. hp is in the units the tool table already
   deals in, so a stone axe (13.0 a blow) puts a shallow crawler down in two
   and an abyssal one in four, while bare hands (1.8) take ten and
   twenty-six. That spread is the whole argument for carrying a tool you were
   not going to dig with. */
const FALLBACK_BANDS = [
  { name: "shallow", below: 140, hp: 18, damage: 4,  speed: 0.52, attackEvery: 44, size: 3.2 },
  { name: "deep",    below: 420, hp: 30, damage: 7,  speed: 0.64, attackEvery: 40, size: 3.8 },
  { name: "abyssal", below: 900, hp: 46, damage: 11, speed: 0.76, attackEvery: 34, size: 4.5 }
];

/* The moment lane F exports `CREATURE_BANDS` from `src/content/tools.js` -
   beside `KIND_COMBAT`, where the other half of a fight already lives - it
   wins, and the fallback above stops being read. No file has to be created
   and nothing here has to change, which is the same arrangement that made
   `weaponOf` work the day it appeared.

   It is checked rather than trusted: a table that is missing a field would
   otherwise fail as a crawler with `undefined` hit points, hundreds of ticks
   later and nowhere near the cause. */
function usable(rows){
  if(!Array.isArray(rows) || !rows.length) return false;
  return rows.every(r => r && typeof r.name === "string" &&
    ["below", "hp", "damage", "speed", "attackEvery", "size"]
      .every(k => typeof r[k] === "number" && isFinite(r[k])));
}

export const BANDS = usable(TOOLDATA.CREATURE_BANDS)
  ? TOOLDATA.CREATURE_BANDS
  : FALLBACK_BANDS;

/* Whose numbers are actually in play, for the status board and for anyone
   wondering why a crawler changed weight overnight. */
export const BANDS_FROM = BANDS === FALLBACK_BANDS ? "lane I fallback" : "content";

export function bandAt(depth){
  let i = 0;
  for(let b = 0; b < BANDS.length; b++) if(depth >= BANDS[b].below) i = b;
  return i;
}

/* ------------------------------------------------------------- senses ----- */

/* Light is a defence, which is what stops the lamp being a convenience. Two
   thresholds rather than one: a crawler will not walk into ground brighter
   than EDGE, and ground brighter than FLEE actively drives it back. The gap
   between them is what makes a line of torches read as a fence rather than
   as a wall. */
export const LIGHT_EDGE = 0.30;
export const LIGHT_FLEE = 0.55;

/* Noise, so that not being there is a defence too. A player who stops
   digging and stands still is heard from a fraction of the distance. */
export const HEAR_STILL   = 36;
export const HEAR_MOVING  = 130;
export const HEAR_DIGGING = 240;
export const FEEL         = 44;        /* this close it knows regardless */
export const ALERT_TICKS  = 260;       /* how long it hunts after the noise stops */

export const ATTACK_RANGE = 9;

/* Beyond this from every player, a crawler has nothing to hunt and holds
   still. That is a RULE and not an optimisation: it is keyed on the distance
   to a PLAYER, which every client agrees about, and never on the distance to
   a CAMERA, which they do not. Two clients therefore compute the same
   behaviour for every creature on the map, which is what the lane brief
   means by "distance must not change the RESULT, only how it is computed". */
export const AWAKE = 340;

/* ------------------------------------------------------------- spawning --- */

export const MIN_DEPTH   = 140;        /* below the surface, in pixels */
export const SPAWN_MIN   = 150;        /* never in the player's lap */
export const SPAWN_MAX   = 300;        /* nor far enough to cost a chunk */
export const SPAWN_EVERY = 30;         /* ticks between spawn attempts */
export const MAX_ALIVE   = 18;
export const NEAR_CAP    = 4;          /* at most this many awake near one player */

/* Candidate sites tried per attempt, and it had to be MEASURED rather than
   guessed. A crawler needs open ground with a floor under it, and underground
   that is rare: over four thousand candidate points around a player standing
   in a natural cavern 662 px down, 4.4% were air at all and 3.2% had a floor
   within reach. One candidate every 30 ticks came to one crawler every two
   and a half minutes - a player could descend, mine and climb out having met
   nothing, which is not what "descending is a risk" means.

   So the attempt tries several sites and takes the first that holds one. The
   cost is trivial because the 96% that fail do so on their first `isSolid`.
   This is also why they read as CAVE-DWELLERS: the ground decides where they
   can be, so they are found where the world is already open, and a shaft the
   player cut themselves is only a way in. */
export const SPAWN_TRIES = 8;

/* The chance a candidate site in each band actually produces something.
   Depth is the ladder: the same shaft is emptier at the top than at the
   bottom. */
export const BAND_CHANCE = [0.10, 0.18, 0.28];
