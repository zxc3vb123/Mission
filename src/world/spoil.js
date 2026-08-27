/* Putting material back. LANE A (world).

   Conservation of matter, from the other end. Digging already hands the
   player an item for every so many pixels it takes out (dig2ratio in
   materials.js); this is what turns that item back into ground.

     dumpMaterial(x, y, matIndex, pixels)   the primitive, in pixels
     dumpItem(x, y, itemId, count)          what lane C actually holds

   ONE ITEM IS EXACTLY WHAT ONE ITEM COST. A soil item is produced by
   digging 62.5 pixels of earth, so dumping it puts 62.5 pixels back - the
   fraction is carried, not rounded away, so a hundred items dug and dumped
   leave the map with the same amount of ground it started with.

   Material is not teleported into place. It is poured: a few pixels a tick
   as loose particles that fall, land and tumble down whatever they land
   on. So the same physics that already exists decides the result - sand
   slumps flat, earth holds a steeper heap - and a hill somebody pours is a
   hill the world agrees with rather than a special case. It fills as
   readily as it raises: backfill a shaft, ramp a slope, bury a lava pool.

   Pouring into somewhere impossible fails rather than eating the item: if
   nothing is accepted the caller still has it. */

import { MATS } from "./materials.js";
import { rFree, insideMap } from "./landscape.js";
import { addPXS, setLostSink } from "./dynamics.js";
import { hash2 } from "../core/rng.js";

/* how far a poured pixel may tumble down the heap it lands on */
const POUR_ROLL = 14;
/* pixels released per pour per tick: a shovel-load lands over a moment
   rather than appearing at once, and a wagon-load takes correspondingly
   longer, which is what a wagon-load should feel like */
const POUR_PER_TICK = 6;
const MAX_POURS = 64;
/* how far above a blocked target to look for somewhere to pour from */
const HEADROOM = 24;
/* ticks of no progress before a pour is called stalled and stops trying
   every tick; it keeps its material and retries occasionally, because the
   space may open up again - somebody digging the heap out, for instance */
const STALL_AFTER = 30;
const RETRY_EVERY = 45;

export const pours = [];
/* the fraction of a pixel left over from each dump, kept per material so
   that repeated small dumps do not quietly lose ground to rounding */
const carry = new Float64Array(MATS.length);

export function clearPours(){
  pours.length = 0;
  carry.fill(0);
}

/* ------------------------------------------------------------- lookups --- */
export function pixelsPerItem(matIndex){
  const M = MATS[matIndex];
  return (M && M.dig2) ? M.dig2ratio / 8 : 0;
}

const BY_ITEM = Object.create(null);
for(const M of MATS) if(M.dig2 && M.solid) BY_ITEM[M.dig2] = M.index;

/* the material an item turns back into, or -1 if it is not ground */
export function materialForItem(itemId){
  const m = BY_ITEM[itemId];
  return m === undefined ? -1 : m;
}
export function canDump(matIndex){
  const M = MATS[matIndex];
  return !!(M && M.solid && M.dig2);
}

/* --------------------------------------------------------------- pours --- */
/* Pour from just above the target if the target itself is inside ground:
   you are tipping a load onto the spot, not injecting it into rock. */
function pourPoint(x, y){
  if(rFree(x, y)) return y;
  for(let k = 1; k <= HEADROOM; k++){
    if(!insideMap(x, y - k)) break;
    if(rFree(x, y - k)) return y - k;
  }
  return -1;
}

export function dumpMaterial(x, y, matIndex, pixels){
  x = Math.round(x); y = Math.round(y);
  if(!canDump(matIndex) || !(pixels > 0)) return { accepted: 0 };
  if(!insideMap(x, y) || pours.length >= MAX_POURS) return { accepted: 0 };
  const py = pourPoint(x, y);
  if(py < 0) return { accepted: 0 };          /* solid all the way up */

  const total = pixels + carry[matIndex];
  const whole = Math.floor(total);
  if(whole < 1){ carry[matIndex] = total; return { accepted: pixels }; }
  carry[matIndex] = total - whole;

  pours.push({ x, y: py, m: matIndex, left: whole, n: 0, stall: 0, lastLeft: Infinity });
  return { accepted: pixels };
}

/* what lane C calls: it holds items, not pixels */
export function dumpItem(x, y, itemId, count){
  const m = materialForItem(itemId);
  if(m < 0) return { accepted: 0, pixels: 0 };
  const per = pixelsPerItem(m);
  const n = Math.max(1, Math.floor(count || 1));
  const r = dumpMaterial(x, y, m, per * n);
  return { accepted: r.accepted > 0 ? n : 0, pixels: r.accepted };
}

/* A pixel that landed with nowhere to go comes back here rather than
   vanishing, so a heap that grows into the ceiling stalls instead of
   quietly eating the rest of the load. */
setLostSink(p => {
  const x = Math.round(p.x);
  for(const q of pours) if(q.m === p.m && Math.abs(q.x - x) <= 32){ q.left++; return; }
  if(pours.length < MAX_POURS)
    pours.push({ x, y: Math.round(p.y), m: p.m, left: 1, n: 0, stall: 0, lastLeft: Infinity });
});

export function updatePours(){
  for(let i = pours.length - 1; i >= 0; i--){
    const p = pours[i];
    /* the heap grows towards the spout, so find the top of it again each
       tick; when there is no room left at all the pour stalls, holding its
       material, rather than pouring into rock */
    /* No progress since last tick means the heap has grown into the spout.
       Back off rather than spinning: a stalled pour that keeps spawning
       pixels into rock only to have them handed straight back burns a tick
       forever and never converges. */
    if(p.left >= p.lastLeft) p.stall++; else p.stall = 0;
    p.lastLeft = p.left;
    if(p.stall > STALL_AFTER && (p.stall % RETRY_EVERY) !== 0) continue;

    const py = pourPoint(p.x, p.y);
    if(py < 0) continue;                    /* solid to the ceiling */
    p.y = py;

    let n = p.left < POUR_PER_TICK ? p.left : POUR_PER_TICK;
    while(n-- > 0){
      /* Spread the load a little so it lands as a load and not a column,
         but only ever into a cell that is actually empty. Spawning into
         rock is what made a full pour churn instead of stopping. */
      const j = hash2(p.x, p.n, 401);
      const sx = Math.round(p.x + (j - 0.5) * 3);
      const x = rFree(sx, p.y) ? sx : p.x;
      if(!rFree(x, p.y)) break;
      addPXS(x, p.y, (j - 0.5) * 0.5, 0.2, p.m, POUR_ROLL);
      p.left--; p.n++;
    }
    if(p.left <= 0) pours.splice(i, 1);
  }
}

export function pourStats(){
  let queued = 0, stalled = 0;
  for(const p of pours){ queued += p.left; if(p.stall > STALL_AFTER) stalled += p.left; }
  return { pours: pours.length, queued, stalled };
}
