/* Taking liquid out of the world and putting it back. LANE A (world).

   The other lanes carry liquid; this lane owns it while it is in the
   ground. Two consumers asked for the same three calls and they are built
   to that shape (docs/REQUESTS.md):

     liquidAt(x, y)                     -> { matIndex, depth, reachable } | null
     drawLiquid(x, y, amount)           -> { matIndex, taken }
     pourLiquid(x, y, matIndex, amount) -> { matIndex, accepted }

   A BUCKET fills once and empties once. A PUMP runs every tick forever, so
   drawing must cost the same whether it is dipping into a puddle or into
   an ocean: the intake reaches a fixed distance and never walks the body.
   That is also what makes a well run dry honestly - `taken` comes back
   short because there was nothing within reach, not because a counter said
   so, and the pool that is left is the pool you can see.

   POURING MATTERS AS MUCH AS DRAWING. Water carried uphill and tipped out
   has to flow, or a bucket is a prop. Poured liquid goes in as falling
   pixels and then finds its own level through the mass mover, exactly like
   rain into a hollow - nothing here decides where it ends up.

   Nothing is created or destroyed at this boundary. What `drawLiquid`
   removes is exactly what it reports, and the caller owns it from then on;
   what `pourLiquid` accepts is what goes back. */

import { MATS } from "./materials.js";
import { matAt, rMat, rFree, isLoaded, insideMap, clearPix } from "./landscape.js";
import { wake, addPXS, setLostSink, KEEP_LIQUID } from "./dynamics.js";

/* How far an intake reaches. Bounded on purpose: this is what stops a pump
   costing more in a lake than in a puddle. */
export const DRAW_RADIUS = 12;
/* How deep `depth` will bother counting - a derrick wants "plenty" or
   "nearly gone", not an exact survey of the reservoir. */
export const DEPTH_CAP = 64;
/* Poured liquid arrives over a moment rather than all at once. */
const POUR_PER_TICK = 8;
const MAX_POURS = 32;
const HEADROOM = 24;

export const liquidPours = [];
export function clearLiquidPours(){ liquidPours.length = 0; }

function isLiq(m){ return MATS[m] && MATS[m].isLiq; }

/* ------------------------------------------------------------ reading --- */
/* What is here, how deep it goes, and how much of it this spot can reach.
   `reachable` is the number an intake could actually draw without moving,
   which is what tells a derrick its well is finished.

   IT REACHES, AND IT SAYS SO. An intake a few pixels above the surface of
   a pool should still find it, so this looks around before giving up - but
   that makes a truthy answer mean "there is water within reach", NOT "you
   are standing in water", and the two are easy to confuse. `dist` is how
   far it had to reach: 0 means the point itself is liquid. Ask for dist 0
   if what you mean is "am I in it". Lane C hit this using liquidAt to pick
   somewhere to wade in and getting a sand pixel next to a puddle. */
export function liquidAt(x, y){
  x = Math.round(x); y = Math.round(y);
  if(!insideMap(x, y)) return null;
  let m = matAt(x, y), dist = 0;
  if(!isLiq(m)){
    const found = nearestLiquid(x, y);
    if(!found) return null;
    dist = Math.max(Math.abs(found.x - x), Math.abs(found.y - y));
    x = found.x; y = found.y; m = found.m;
  }
  let depth = 0;
  while(depth < DEPTH_CAP && matAt(x, y + depth) === m) depth++;

  let reachable = 0;
  for(let dy = -DRAW_RADIUS; dy <= DRAW_RADIUS; dy++)
    for(let dx = -DRAW_RADIUS; dx <= DRAW_RADIUS; dx++)
      if(dx*dx + dy*dy <= DRAW_RADIUS*DRAW_RADIUS && matAt(x + dx, y + dy) === m) reachable++;

  return { matIndex: m, depth, reachable, dist, x, y };
}

/* the nearest liquid pixel to an intake that is not sitting in it */
function nearestLiquid(x, y){
  for(let r = 1; r <= DRAW_RADIUS; r++){
    for(let dy = -r; dy <= r; dy++){
      for(let dx = -r; dx <= r; dx++){
        if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const m = matAt(x + dx, y + dy);
        if(isLiq(m)) return { x: x + dx, y: y + dy, m };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------ drawing --- */
/* Take up to `amount` pixels from within reach of the intake. Comes back
   short rather than reaching further, because reaching further is what a
   longer pipe is for. */
export function drawLiquid(x, y, amount){
  x = Math.round(x); y = Math.round(y);
  const want = Math.floor(amount);
  if(!(want > 0) || !insideMap(x, y)) return { matIndex: -1, taken: 0 };

  const at = liquidAt(x, y);
  if(!at) return { matIndex: -1, taken: 0 };
  const m = at.matIndex;
  let taken = 0;

  /* Work outward from the intake. Taking from nearest first means the hole
     is where the pipe is, and the body closes over it by itself. */
  for(let r = 0; r <= DRAW_RADIUS && taken < want; r++){
    for(let dy = -r; dy <= r && taken < want; dy++){
      for(let dx = -r; dx <= r && taken < want; dx++){
        if(r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = at.x + dx, py = at.y + dy;
        if(!insideMap(px, py) || !isLoaded(px, py)) continue;
        if(rMat(px, py) !== m) continue;
        clearPix(px, py);
        wake(px, py);
        taken++;
      }
    }
  }
  return { matIndex: taken > 0 ? m : -1, taken };
}

/* ------------------------------------------------------------ pouring --- */
function pourPoint(x, y){
  if(rFree(x, y)) return y;
  for(let k = 1; k <= HEADROOM; k++){
    if(!insideMap(x, y - k)) break;
    if(rFree(x, y - k)) return y - k;
  }
  return -1;
}

export function pourLiquid(x, y, matIndex, amount){
  x = Math.round(x); y = Math.round(y);
  const want = Math.floor(amount);
  if(!isLiq(matIndex) || !(want > 0)) return { matIndex, accepted: 0 };
  if(!insideMap(x, y) || liquidPours.length >= MAX_POURS) return { matIndex, accepted: 0 };
  const py = pourPoint(x, y);
  if(py < 0) return { matIndex, accepted: 0 };   /* nowhere for it to go */

  liquidPours.push({ x, y: py, m: matIndex, left: want, n: 0 });
  return { matIndex, accepted: want };
}

/* a poured pixel with nowhere to land is put back in the queue, so a
   bucket tipped into a full hollow spills rather than vanishing */
setLostSink(KEEP_LIQUID, p => {
  const x = Math.round(p.x);
  for(const q of liquidPours) if(q.m === p.m && Math.abs(q.x - x) <= 32){ q.left++; return; }
  if(liquidPours.length < MAX_POURS)
    liquidPours.push({ x, y: Math.round(p.y), m: p.m, left: 1, n: 0 });
});

export function updateLiquidPours(){
  for(let i = liquidPours.length - 1; i >= 0; i--){
    const p = liquidPours[i];
    const py = pourPoint(p.x, p.y);
    if(py < 0) continue;                          /* sealed in: hold it */
    p.y = py;
    let n = p.left < POUR_PER_TICK ? p.left : POUR_PER_TICK;
    while(n-- > 0){
      /* no roll: liquid does not heap, it finds its level. KEEP_LIQUID so
         a pixel that lands in an already-full cistern comes back to the
         queue instead of evaporating. */
      addPXS(p.x, p.y, 0, 0.2, p.m, 0, KEEP_LIQUID);
      p.left--; p.n++;
    }
    if(p.left <= 0) liquidPours.splice(i, 1);
  }
}

export function liquidStats(){
  let queued = 0;
  for(const p of liquidPours) queued += p.left;
  return { pours: liquidPours.length, queued };
}
