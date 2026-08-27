/* Loose pixels, liquids and unstable material. LANE A (world).

   Three separate systems, the way the original engine splits them:

     PXS       loose single pixels flying around, not part of the landscape
     MassMover a free pixel next to a liquid pulls the topmost pixel of
               that body down into itself, so liquids level out
     Instable  solid but unstable material collapses and slides

   A move never lifts a pixel, so everything always settles.

   All three work on loaded chunks only. A pixel queued in ground that has
   since been unloaded reads as bedrock and is skipped, so the queues drain
   themselves and physics can never drag the rest of the map into memory.
   A chunk being paged in gets its own liquids and overhangs queued at that
   moment, which is what makes ground you walk back to carry on settling. */

import { MATS, M_WATER, M_LAVA, M_ROCK } from "./materials.js";
import { LW, LH, XSHIFT, XMASK, CHUNK, CSHIFT, CMASK, CPIX } from "./config.js";
import { insideMap, rMat, rSolid, rFree, rLiquid, isLoaded, idx,
         setMat, setI, matI, clearedMat,
         flagI, addFlagI, dropFlagI } from "./landscape.js";
import { resident, onChunkLoad } from "./chunks.js";
import { hash2 } from "../core/rng.js";
import { addSteam } from "../core/fx.js";

export const pxs = [];
export const mmQueue = [];
export const insQueue = [];
export const convCheck = [];

export const MAX_PXS = 6000;
export const MM_PER_FRAME = 9000;
export const INS_PER_FRAME = 2600;
export const MAX_QUEUE = 60000;

/* Where a loose pixel goes when it cannot be put down anywhere. Material
   blasted or collapsed is allowed to be lost - GAME_DESIGN section 2 makes
   blasting the one lossy operation on purpose - but material somebody
   POURED must not evaporate because the heap reached the ceiling. Poured
   pixels carry roll > 0, and those are handed back to spoil.js to be
   queued again rather than dropped. */
let lostSink = null;
export function setLostSink(fn){ lostSink = fn; }

export function pushMM(x, y){
  if(!insideMap(x, y) || mmQueue.length >= MAX_QUEUE) return;
  const i = idx(x, y);
  if(!isLoaded(x, y) || flagI(i, 1)) return;
  addFlagI(i, 1);
  mmQueue.push(i);
}
export function pushIns(x, y){
  if(!insideMap(x, y) || insQueue.length >= MAX_QUEUE) return;
  const i = idx(x, y);
  if(!isLoaded(x, y) || flagI(i, 2)) return;
  addFlagI(i, 2);
  insQueue.push(i);
}

/* wake the neighbourhood of a changed pixel */
export function wake(x, y){
  for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
    const nx = x + dx, ny = y + dy;
    if(!insideMap(nx, ny)) continue;
    const M = MATS[rMat(nx, ny)];
    if(M.density < 25) pushMM(nx, ny);
    else if(M.instable) pushIns(nx, ny);
  }
  for(let k = 1; k <= 3; k++)
    if(insideMap(x, y - k) && MATS[rMat(x, y - k)].instable) pushIns(x, y - k);
}
export function wakeArea(cx, cy, r){
  for(let y = cy - r; y <= cy + r; y++) for(let x = cx - r; x <= cx + r; x++){
    if(!insideMap(x, y)) continue;
    const M = MATS[rMat(x, y)];
    if(M.density < 25) pushMM(x, y);
    else if(M.instable) pushIns(x, y);
  }
}

/* `roll` is how many steps a pixel may tumble down a slope once it lands.
   Material sitting in the ground is compacted - earth has instable 0 and
   holds a vertical face - but a shovel-load of the same earth poured out
   is loose, and loose material finds its angle of repose. Without this a
   poured heap would be a one pixel wide spire. Collapses and blasts pass
   0 and keep their old behaviour exactly. */
export function addPXS(x, y, vx, vy, m, roll){
  if(pxs.length >= MAX_PXS) pxs.shift();
  pxs.push({ x, y, vx, vy, m, life: 0, roll: roll || 0 });
}
export function clearDynamics(){
  pxs.length = 0; mmQueue.length = 0; insQueue.length = 0; convCheck.length = 0;
}
/* Just the pixels in flight. Rebuilding terrain under a cloud of falling
   debris - which a test scenario does, and a load does - would otherwise
   have that debris land in the new ground a moment later. */
export function clearLoose(){ pxs.length = 0; }

/* ------------------------------------------------- a chunk arriving ------- */
/* Ground that has just been paged in has never been looked at, so anything
   in it that wants to move has to be queued now. Without this, water in a
   chunk you walk back to would sit frozen until something disturbed it. */
export function seedChunkDynamics(c){
  const land = c.land, x0 = c.x0, y0 = c.y0;
  for(let li = 0; li < CPIX; li++){
    const M = MATS[land[li]];
    const x = x0 + (li & CMASK), y = y0 + (li >> CSHIFT);
    if(M.density < 25){
      if(rLiquid(x, y - 1) || rLiquid(x - 1, y) || rLiquid(x + 1, y)) pushMM(x, y);
    } else if(M.instable){
      if(!rSolid(x, y + 1)) pushIns(x, y);
    }
  }
}
onChunkLoad(seedChunkDynamics);

/* ----------------------------------------------------------------- PXS ---- */
function depositPXS(p){
  let x = Math.round(p.x), y = Math.round(p.y);
  if(!insideMap(x, y)) return;
  if(!rFree(x, y)){
    let placed = false;
    for(let k = 1; k <= 4 && !placed; k++){
      if(insideMap(x, y - k) && rFree(x, y - k)){ y -= k; placed = true; }
    }
    if(!placed){
      if(p.roll && lostSink) lostSink(p);   /* poured: give it back */
      return;                               /* blasted: genuinely lost */
    }
  }
  /* loose material tumbles down the heap it is landing on, so a poured
     load spreads into a slope instead of stacking into a spire */
  for(let s = p.roll | 0; s > 0; s--){
    if(rFree(x, y + 1)){ y++; continue; }
    const d = hash2(x, y, 91) < 0.5 ? -1 : 1;
    if(rFree(x + d, y) && rFree(x + d, y + 1)){ x += d; y++; continue; }
    if(rFree(x - d, y) && rFree(x - d, y + 1)){ x -= d; y++; continue; }
    break;
  }
  setMat(x, y, p.m);
  wake(x, y);
  if(MATS[p.m].instable) pushIns(x, y);
}

export function updatePXS(){
  for(let i = pxs.length - 1; i >= 0; i--){
    const p = pxs[i], M = MATS[p.m];
    const maxSpeed = (M.maxAirSpeed || 30) / 10;
    p.vy += 0.30;
    if(p.vy > maxSpeed) p.vy = maxSpeed;
    p.vx *= 0.985;
    p.life++;

    let steps = Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)));
    if(steps < 1) steps = 1;
    const sx = p.vx / steps, sy = p.vy / steps;
    let dead = false;
    for(let s = 0; s < steps; s++){
      const nx = p.x + sx, ny = p.y + sy;
      const rx = Math.round(nx), ry = Math.round(ny);
      if(ry >= LH || rx < 0 || rx >= LW){ pxs.splice(i, 1); dead = true; break; }
      const TM = MATS[rMat(rx, ry)];
      if(TM.density >= 50 || TM.isLiq){
        depositPXS(p);
        pxs.splice(i, 1);
        dead = true;
        break;
      }
      p.x = nx; p.y = ny;
    }
    if(!dead && p.life > 1200) pxs.splice(i, 1);
  }
}

/* ------------------------------------------------------ background scan ---- */
/* A queue driven purely by events can miss a pixel that would still move.
   A slow rolling scan re-seeds the queues so everything settles. It walks
   the loaded chunks, a few rows of each per tick, so its cost depends on
   how much world is loaded and not on how big the world is. */
let scanRow = 0;
export const SCAN_ROWS = 3;
export function backgroundScan(){
  if(mmQueue.length > 4000) return;
  for(let ci = 0; ci < resident.length; ci++){
    const c = resident[ci], land = c.land, x0 = c.x0, y0 = c.y0;
    for(let k = 0; k < SCAN_ROWS; k++){
      const ly = (scanRow + k) & CMASK;
      const y = y0 + ly, row = ly << CSHIFT;
      for(let lx = 0; lx < CHUNK; lx++){
        const M = MATS[land[row + lx]];
        const x = x0 + lx;
        if(M.density < 25){
          if(rLiquid(x, y - 1) || rLiquid(x - 1, y) || rLiquid(x + 1, y)) pushMM(x, y);
        } else if(M.instable){
          if(!rSolid(x, y + 1)) pushIns(x, y);
        }
      }
    }
  }
  scanRow = (scanRow + SCAN_ROWS) & CMASK;
}

/* ---------------------------------------------------------- mass mover ---- */
function liquidTop(x, y, lm){
  let t = y, guard = 0;
  while(t > 0 && rMat(x, t - 1) === lm && guard++ < 48) t--;
  return t;
}

export function updateMassMover(){
  let processed = 0, budget = MM_PER_FRAME, pass = 0;
  while(budget > 0 && mmQueue.length && pass < 8){
    pass++;
    const take = Math.min(mmQueue.length, budget);
    budget -= take;
    processed += massMoverPass(take);
  }
  return processed;
}

function massMoverPass(n){
  let processed = 0;
  for(let q = 0; q < n; q++){
    const i = mmQueue[q];
    dropFlagI(i, 1);
    const x = i & XMASK, y = i >>> XSHIFT;
    if(!rFree(x, y)) continue;

    let sx = -1, sy = -1;
    if(rLiquid(x, y - 1)){ sx = x; sy = y - 1; }
    else if(rLiquid(x - 1, y)){ sx = x - 1; sy = y; }
    else if(rLiquid(x + 1, y)){ sx = x + 1; sy = y; }
    if(sx < 0) continue;

    const lm = rMat(sx, sy);
    let ty = liquidTop(sx, sy, lm);

    if(ty > y) continue;              /* never lift a pixel */
    if(ty === y){
      /* the neighbouring column is no higher than this spot: follow the
         body sideways and look for one that is, otherwise a surface
         stepped one pixel per column would lock up and never level out */
      const dir = sx - x;
      let found = -1;
      if(dir !== 0){
        for(let k = 2; k <= 40; k++){
          const xx = x + dir * k;
          if(xx < 0 || xx >= LW) break;
          if(rMat(xx, y) !== lm) break;
          if(y > 0 && rMat(xx, y - 1) === lm){
            found = xx; sx = xx; ty = liquidTop(xx, y - 1, lm);
            break;
          }
        }
      }
      if(found < 0) continue;
    }

    /* both ends of the move have to be loaded, or the liquid would be
       written into one and never taken out of the other */
    if(!isLoaded(sx, ty)) continue;
    const ti = idx(sx, ty);
    setI(i, lm);
    setI(ti, clearedMat(ti));
    processed++;

    if(lm === M_LAVA) convCheck.push(i);
    wake(sx, ty);
    wake(x, y);
    pushMM(x, y + 1);
  }
  if(n === mmQueue.length) mmQueue.length = 0; else mmQueue.splice(0, n);
  return processed;
}

/* ------------------------------------------------------ unstable ground ---- */
export function updateInstable(){
  const n = Math.min(insQueue.length, INS_PER_FRAME);
  for(let q = 0; q < n; q++){
    const i = insQueue[q];
    dropFlagI(i, 2);
    const x = i & XMASK, y = i >>> XSHIFT;
    const m = matI(i), M = MATS[m];
    if(!M.instable) continue;

    if(!rSolid(x, y + 1) && insideMap(x, y + 1)){
      setI(i, clearedMat(i));
      addPXS(x, y + 0.5, (hash2(x, y, 3) - 0.5) * 0.3, 0.4, m);
      wake(x, y);
      continue;
    }
    const ms = M.maxSlide | 0;
    if(ms > 0){
      const dir = hash2(x, y, 17) < 0.5 ? -1 : 1;
      let done = false;
      for(let pass = 0; pass < 2 && !done; pass++){
        const d = pass === 0 ? dir : -dir;
        for(let k = 1; k <= ms; k++){
          if(!rFree(x + d * k, y)) break;
          if(rFree(x + d * k, y + 1)){
            setI(i, clearedMat(i));
            addPXS(x + d * k * 0.5, y, d * 0.25, 0.2, m);
            wake(x, y);
            done = true;
            break;
          }
        }
      }
    }
  }
  if(n === insQueue.length) insQueue.length = 0; else insQueue.splice(0, n);
}

/* lava meeting water turns to rock and steams (InMatConvert) */
export function updateConversions(){
  const n = Math.min(convCheck.length, 400);
  for(let q = 0; q < n; q++){
    const i = convCheck[q];
    const x = i & XMASK, y = i >>> XSHIFT;
    if(matI(i) !== M_LAVA) continue;
    let hit = false;
    for(let dy = -1; dy <= 1 && !hit; dy++) for(let dx = -1; dx <= 1 && !hit; dx++){
      const nx = x + dx, ny = y + dy;
      if(!insideMap(nx, ny)) continue;
      if(rMat(nx, ny) === M_WATER){
        setMat(x, y, M_ROCK);
        const ni = idx(nx, ny);
        setI(ni, clearedMat(ni));
        for(let k = 0; k < 4; k++) addSteam(x, y);
        wake(x, y); wake(nx, ny);
        hit = true;
      }
    }
  }
  if(n === convCheck.length) convCheck.length = 0; else convCheck.splice(0, n);
}
