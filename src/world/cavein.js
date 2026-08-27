/* Tunnels that fall in. LANE A (world).

   Owner: "I should have to build support for my tunnels with wood if it's a
   loose ground tunnel." So a tunnel is not free: cut a wide one through
   loose ground and the roof comes down on you.

   THE RULE is a span rule, the same idea lane C uses for built pieces. A
   stretch of roof over a void is held by whatever reaches the floor at
   either end of it. Past a span that depends on what the roof is made of,
   nothing is holding the middle and it fails:

     loose ground   earth, sand, clay, gravel - a short span, and the
                    reason a mine is timbered
     stone          rock, coal, limestone, ore - stands far longer
     granite        never falls, like everything else about granite

   IT WARNS FIRST. Dust trickles from the roof and `cave:warning` goes out a
   few seconds before anything moves, so a player who is paying attention
   can get out or put a prop in. A collapse with no tell is a random death.

   ONLY GROUND YOU DISTURBED. A cave that has been there since the map was
   generated has already found its shape; freshly cut ground has not. So the
   check runs on sites seeded by digging, which is also what keeps it cheap -
   the work follows the player instead of sweeping the map.

   NOTHING IS DESTROYED. A collapse turns roof into falling pixels that land
   and pile up, so the material is all still there, now as rubble on the
   floor blocking the tunnel it fell into. Conservation of matter holds
   through a cave-in exactly as it does through a shovel. */

import { MATS } from "./materials.js";
import { rMat, rSolid, rFree, isLoaded, insideMap, clearPix } from "./landscape.js";
import { addPXS } from "./dynamics.js";
import { digTierFor } from "./dig.js";
import { addDust } from "../core/fx.js";
import { bus } from "../core/bus.js";
import { hash2 } from "../core/rng.js";
import { state } from "../core/state.js";
import { building as BUILDINGS } from "../content/buildings.js";

export const caveConfig = {
  /* Live, and safe to be live: lane F's timber_prop is stage 0 and one
     log, and the world registers it as a support by itself (see below), so
     from the first tunnel the player can both be buried and prevent it.
     Collapse with a prop that does not work would be worse than collapse
     with no prop at all - the player builds the answer, gets buried anyway,
     and concludes the game is broken. */
  enabled: true,
  /* How much unsupported roof each kind of ground holds. The loose figure
     is about five clonk widths: enough that a corridor is worth digging
     before it wants a prop, short enough that real mining means timbering
     at intervals, which is the rhythm the owner asked for. Much below this
     and horizontal digging stops being possible at all - worth remembering
     that the counter to a cave-in is a wooden prop, so this number and the
     stage a prop becomes craftable have to move together. */
  looseSpan: 48,        /* px of unsupported roof loose ground will hold */
  stoneSpan: 96,        /*                        ... stone will hold     */
  deepSpan: 150,        /*                        ... the hard ores will  */
  /* Stress is counted in TICKS OF OVERLOAD, not in visits. Sites share a
     per-tick budget, so counting visits would make a roof fail fast when
     you have dug in one place and never when you have dug in twenty - the
     opposite of what a player would expect. Elapsed time is the honest
     measure and it makes the warning window the same every time. */
  warnStress: 40,       /* about a second of being over the span         */
  failStress: 190,      /* and roughly three more before it lets go      */
  checkPerTick: 3,      /* sites examined per tick                        */
  maxSites: 160,
  fallRows: 3,          /* how thick a slice of roof comes down at once   */
  fallWidth: 22
};

/* somewhere the player has cut, and which therefore has not settled */
const sites = [];
/* rectangles lane C says are propped: { id, x, y, w, h } */
const supports = [];
let cursor = 0;

export function clearCaveins(){ sites.length = 0; supports.length = 0; cursor = 0; }

/* --------------------------------------------------------- supports ----- */
export function addSupport(id, x, y, w, h){
  removeSupport(id);
  supports.push({ id, x: Math.round(x), y: Math.round(y),
                  w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) });
  /* propping wakes the roof above it, so it stops threatening at once */
  for(const s of sites)
    if(Math.abs(s.x - x) < 120 && Math.abs(s.y - y) < 120){ s.stress = 0; s.warned = false; }
  return true;
}
export function removeSupport(id){
  const i = supports.findIndex(s => s.id === id);
  if(i >= 0){ supports.splice(i, 1); return true; }
  return false;
}
export function supportCount(){ return supports.length; }

/* PROPS REGISTER THEMSELVES.

   Lane C emits structure:placed and structure:collapsed, and lane F marks
   the defs that hold a roof up with `props: true`. That is everything
   needed, so the world listens rather than waiting to be told: no other
   lane has to remember to call addSupport for the mechanic to work, and
   nothing here imports src/build - it reads a published event and a
   content table, which is what both are for.

   addSupport stays published for anything that is not a placed building -
   lane D's machinery, later - and calling it as well as this is harmless,
   because two rectangles over one span hold it exactly once. */
function propKey(e){ return e.defId + "@" + e.x + "," + e.y; }

bus.on("structure:placed", e => {
  const def = BUILDINGS(e.defId);
  if(!def || !def.props) return;
  const w = e.rot ? def.h : def.w, h = e.rot ? def.w : def.h;
  addSupport(propKey(e), e.x, e.y, w, h);
});
bus.on("structure:collapsed", e => removeSupport(propKey(e)));

function heldBetween(x0, x1, yTop, yBot){
  for(let i = 0; i < supports.length; i++){
    const s = supports[i];
    if(s.x + s.w < x0 || s.x > x1) continue;
    if(s.y + s.h < yTop || s.y > yBot) continue;
    return true;
  }
  return false;
}

/* ------------------------------------------------------------ sites ----- */
/* digging here disturbed the ground; come back and see whether it holds */
export function noteDig(x, y, r){
  if(!caveConfig.enabled) return;
  x = Math.round(x); y = Math.round(y);
  for(let i = 0; i < sites.length; i++){
    const s = sites[i];
    if(Math.abs(s.x - x) < 16 && Math.abs(s.y - y) < 16){
      s.y = y; s.age = 0;                 /* same working face, still fresh */
      return;
    }
  }
  if(sites.length >= caveConfig.maxSites) sites.shift();
  sites.push({ x, y, r, age: 0, stress: 0, warned: false, last: state.tick });
}

function spanLimit(mat){
  const tier = digTierFor(mat);
  if(tier === null) return Infinity;      /* granite, and anything like it */
  if(tier === 0) return caveConfig.looseSpan;
  if(tier === 1) return caveConfig.stoneSpan;
  return caveConfig.deepSpan;
}

/* the first solid pixel above a void, or -1 if the sky is up there */
function roofAbove(x, y){
  for(let k = 0; k <= 48; k++){
    const yy = y - k;
    if(!insideMap(x, yy)) return -1;
    if(rSolid(x, yy)) return yy;
  }
  return -1;
}

/* How wide the hole is at the height you are standing in it.

   The obvious version of this - follow the roof sideways until the pixel
   under it turns solid - does not survive contact with a real tunnel,
   because a dug roof is scalloped rather than flat and the walk stops on
   the first bump. Measuring the VOID instead is both simpler and what the
   rule actually means: the roof is held at the two places where the tunnel
   ends and the ground still reaches all the way up. */
function voidSpan(x, y, cap){
  let left = 0, right = 0;
  for(let k = 1; k <= cap; k++){ if(!rFree(x - k, y)) break; left = k; }
  for(let k = 1; k <= cap; k++){ if(!rFree(x + k, y)) break; right = k; }
  return { left, right, span: left + right + 1 };
}

/* ------------------------------------------------------------- tick ----- */
export function updateCaveins(){
  if(!caveConfig.enabled || !sites.length) return;
  const n = Math.min(caveConfig.checkPerTick, sites.length);
  for(let k = 0; k < n; k++){
    cursor = (cursor + 1) % sites.length;
    const s = sites[cursor];
    s.age++;
    /* how long since this site was last looked at, so the count runs on
       elapsed time however many sites are sharing the budget */
    const dt = Math.min(90, Math.max(1, state.tick - s.last));
    s.last = state.tick;
    if(!isLoaded(s.x, s.y)) continue;

    const cy = roofAbove(s.x, s.y);
    if(cy < 0){ retire(cursor); continue; }        /* open to the sky */

    const mat = rMat(s.x, cy);
    const limit = spanLimit(mat);
    if(limit === Infinity){ retire(cursor); continue; }

    const cap = Math.min(240, Math.round(limit * 2 + 8));
    const { left, right, span } = voidSpan(s.x, s.y, cap);

    if(span <= limit || heldBetween(s.x - left, s.x + right, cy, cy + 24)){
      s.stress = 0;
      if(s.warned){ s.warned = false; bus.emit("cave:safe", { x: s.x, y: cy }); }
      continue;
    }

    /* over the limit: the wider the span, the faster it gives */
    const overload = 1 + Math.min(2, (span - limit) / limit / 2);
    s.stress += dt * overload;

    if(!s.warned && s.stress > caveConfig.warnStress){
      s.warned = true;
      bus.emit("cave:warning", { x: s.x, y: cy, span });
    }
    if(s.warned && hash2(s.x, s.age, 17) < 0.4)
      addDust(s.x + (hash2(s.age, s.x, 5) - 0.5) * span * 0.6, cy + 2, "rgb(120,96,70)");

    if(s.stress >= caveConfig.failStress){
      collapse(s.x, s.y, left, right, mat);
      s.stress = 0;
      s.warned = false;
    }
  }
}

function retire(i){ sites.splice(i, 1); if(cursor >= sites.length) cursor = 0; }

/* The roof comes down as falling pixels, which land and pile up. Nothing is
   removed from the world - it is moved, and it now blocks the tunnel.
   The roof is found again per column, so a scalloped ceiling drops the
   shape it actually has. */
function collapse(x, y, left, right, mat){
  const halfW = Math.min(caveConfig.fallWidth, left + right + 1) >> 1;
  const x0 = Math.max(x - halfW, x - left), x1 = Math.min(x + halfW, x + right);
  let fell = 0;
  for(let xx = x0; xx <= x1; xx++){
    const top = roofAbove(xx, y);
    if(top < 0) continue;
    for(let row = 0; row < caveConfig.fallRows; row++){
      const yy = top - row;
      if(!insideMap(xx, yy)) continue;
      const m = rMat(xx, yy);
      if(!MATS[m].solid || digTierFor(m) === null) break;   /* hit bedrock */
      setFalling(xx, yy, m);
      fell++;
    }
  }
  if(fell) bus.emit("cave:in", { x, y, amount: fell, mat });
}

/* One pixel of roof leaves the landscape and becomes a falling one. It
   carries a roll allowance like poured material does, so what comes down
   settles into a rubble slope rather than a column. */
function setFalling(x, y, m){
  clearPix(x, y);
  addPXS(x, y + 0.5, (hash2(x, y, 31) - 0.5) * 0.6, 0.3, m, 10);
}

export function caveStats(){
  let warned = 0;
  for(const s of sites) if(s.warned) warned++;
  return { enabled: caveConfig.enabled, sites: sites.length,
           warned, supports: supports.length };
}
