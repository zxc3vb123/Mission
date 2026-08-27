/* Loose pixels, liquids and unstable material. LANE A (world).

   Three separate systems, the way the original engine splits them:

     PXS       loose single pixels flying around, not part of the landscape
     MassMover a free pixel next to a liquid pulls the topmost pixel of
               that body down into itself, so liquids level out
     Instable  solid but unstable material collapses and slides

   A move never lifts a pixel, so everything always settles. */

import { MATS, M_TUNNEL, M_SKY, M_WATER, M_LAVA, M_ROCK } from "./materials.js";
import { LW, LH, land, bg, flags, insideMap, isFree, isSolid, isLiquid,
         markPixel, setMat, clearedMat } from "./landscape.js";
import { hash2, rnd } from "../core/rng.js";
import { addSteam } from "../core/fx.js";

export const pxs = [];
export const mmQueue = [];
export const insQueue = [];
export const convCheck = [];

export const MAX_PXS = 6000;
export const MM_PER_FRAME = 9000;
export const INS_PER_FRAME = 2600;

export function pushMM(x,y){
  if(!insideMap(x,y)) return;
  const i = y*LW+x;
  if(flags[i]&1) return;
  flags[i] |= 1;
  mmQueue.push(i);
}
export function pushIns(x,y){
  if(!insideMap(x,y)) return;
  const i = y*LW+x;
  if(flags[i]&2) return;
  flags[i] |= 2;
  insQueue.push(i);
}

/* wake the neighbourhood of a changed pixel */
export function wake(x,y){
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    const nx=x+dx, ny=y+dy;
    if(!insideMap(nx,ny)) continue;
    const m = land[ny*LW+nx];
    if(MATS[m].density<25) pushMM(nx,ny);
    else if(MATS[m].instable) pushIns(nx,ny);
  }
  for(let k=1;k<=3;k++)
    if(insideMap(x,y-k) && MATS[land[(y-k)*LW+x]].instable) pushIns(x,y-k);
}
export function wakeArea(cx,cy,r){
  for(let y=cy-r;y<=cy+r;y++) for(let x=cx-r;x<=cx+r;x++){
    if(!insideMap(x,y)) continue;
    const m = land[y*LW+x];
    if(MATS[m].density<25) pushMM(x,y);
    else if(MATS[m].instable) pushIns(x,y);
  }
}

export function addPXS(x,y,vx,vy,m){
  if(pxs.length>=MAX_PXS) pxs.shift();
  pxs.push({ x, y, vx, vy, m, life:0 });
}
export function clearDynamics(){
  pxs.length = 0; mmQueue.length = 0; insQueue.length = 0; convCheck.length = 0;
}

function depositPXS(p){
  let x = Math.round(p.x), y = Math.round(p.y);
  if(!insideMap(x,y)) return;
  if(!isFree(x,y)){
    let placed = false;
    for(let k=1;k<=4 && !placed;k++){
      if(insideMap(x,y-k) && isFree(x,y-k)){ y -= k; placed = true; }
    }
    if(!placed) return;               /* nowhere to go: the pixel is lost */
  }
  setMat(x,y,p.m);
  wake(x,y);
  if(MATS[p.m].instable) pushIns(x,y);
}

export function updatePXS(){
  for(let i=pxs.length-1;i>=0;i--){
    const p = pxs[i], M = MATS[p.m];
    const maxSpeed = (M.maxAirSpeed||30)/10;
    p.vy += 0.30;
    if(p.vy>maxSpeed) p.vy = maxSpeed;
    p.vx *= 0.985;
    p.life++;

    let steps = Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)));
    if(steps<1) steps = 1;
    const sx = p.vx/steps, sy = p.vy/steps;
    let dead = false;
    for(let s=0;s<steps;s++){
      const nx = p.x+sx, ny = p.y+sy;
      const rx = Math.round(nx), ry = Math.round(ny);
      if(ry>=LH || rx<0 || rx>=LW){ pxs.splice(i,1); dead = true; break; }
      const TM = MATS[land[ry*LW+rx]];
      if(TM.density>=50 || TM.isLiq){
        depositPXS(p);
        pxs.splice(i,1);
        dead = true;
        break;
      }
      p.x = nx; p.y = ny;
    }
    if(!dead && p.life>1200) pxs.splice(i,1);
  }
}

/* A queue driven purely by events can miss a pixel that would still move.
   A slow rolling scan re-seeds the queues so everything settles. */
let scanY = 0;
export const SCAN_ROWS = 12;
export function backgroundScan(){
  if(mmQueue.length > 4000) return;
  for(let r=0;r<SCAN_ROWS;r++){
    const y = scanY;
    scanY = (scanY+1) % LH;
    const row = y*LW;
    for(let x=0;x<LW;x++){
      const M = MATS[land[row+x]];
      if(M.density<25){
        if(isLiquid(x,y-1) || isLiquid(x-1,y) || isLiquid(x+1,y)) pushMM(x,y);
      } else if(M.instable){
        if(!isSolid(x,y+1)) pushIns(x,y);
      }
    }
  }
}

function liquidTop(x,y,lm){
  let t = y, guard = 0;
  while(t>0 && land[(t-1)*LW+x]===lm && guard++<48) t--;
  return t;
}

export function updateMassMover(){
  let processed = 0, budget = MM_PER_FRAME, pass = 0;
  while(budget>0 && mmQueue.length && pass<8){
    pass++;
    const take = Math.min(mmQueue.length, budget);
    budget -= take;
    processed += massMoverPass(take);
  }
  return processed;
}

function massMoverPass(n){
  let processed = 0;
  for(let q=0;q<n;q++){
    const i = mmQueue[q];
    flags[i] &= ~1;
    const x = i%LW, y = (i/LW)|0;
    if(!isFree(x,y)) continue;

    let sx=-1, sy=-1;
    if(isLiquid(x,y-1)){ sx=x; sy=y-1; }
    else if(isLiquid(x-1,y)){ sx=x-1; sy=y; }
    else if(isLiquid(x+1,y)){ sx=x+1; sy=y; }
    if(sx<0) continue;

    const lm = land[sy*LW+sx];
    let ty = liquidTop(sx, sy, lm);

    if(ty > y) continue;              /* never lift a pixel */
    if(ty === y){
      /* the neighbouring column is no higher than this spot: follow the
         body sideways and look for one that is, otherwise a surface
         stepped one pixel per column would lock up and never level out */
      const dir = sx - x;
      let found = -1;
      if(dir!==0){
        for(let k=2;k<=40;k++){
          const xx = x + dir*k;
          if(xx<0 || xx>=LW) break;
          if(land[y*LW+xx] !== lm) break;
          if(y>0 && land[(y-1)*LW+xx] === lm){
            found = xx; sx = xx; ty = liquidTop(xx, y-1, lm);
            break;
          }
        }
      }
      if(found<0) continue;
    }

    land[i] = lm; markPixel(x,y);
    const ti = ty*LW+sx;
    land[ti] = clearedMat(ti); markPixel(sx,ty);
    processed++;

    if(lm===M_LAVA) convCheck.push(i);
    wake(sx,ty);
    wake(x,y);
    pushMM(x,y+1);
  }
  if(n===mmQueue.length) mmQueue.length = 0; else mmQueue.splice(0,n);
  return processed;
}

export function updateInstable(){
  const n = Math.min(insQueue.length, INS_PER_FRAME);
  for(let q=0;q<n;q++){
    const i = insQueue[q];
    flags[i] &= ~2;
    const x = i%LW, y = (i/LW)|0;
    const m = land[i], M = MATS[m];
    if(!M.instable) continue;

    if(!isSolid(x,y+1) && insideMap(x,y+1)){
      land[i] = clearedMat(i); markPixel(x,y);
      addPXS(x, y+0.5, (hash2(x,y,3)-0.5)*0.3, 0.4, m);
      wake(x,y);
      continue;
    }
    const ms = M.maxSlide|0;
    if(ms>0){
      const dir = hash2(x,y,17)<0.5 ? -1 : 1;
      let done = false;
      for(let pass=0; pass<2 && !done; pass++){
        const d = pass===0 ? dir : -dir;
        for(let k=1;k<=ms;k++){
          if(!isFree(x+d*k, y)) break;
          if(isFree(x+d*k, y+1)){
            land[i] = clearedMat(i); markPixel(x,y);
            addPXS(x+d*k*0.5, y, d*0.25, 0.2, m);
            wake(x,y);
            done = true;
            break;
          }
        }
      }
    }
  }
  if(n===insQueue.length) insQueue.length = 0; else insQueue.splice(0,n);
}

/* lava meeting water turns to rock and steams (InMatConvert) */
export function updateConversions(){
  const n = Math.min(convCheck.length, 400);
  for(let q=0;q<n;q++){
    const i = convCheck[q];
    const x = i%LW, y = (i/LW)|0;
    if(land[i]!==M_LAVA) continue;
    let hit = false;
    for(let dy=-1;dy<=1 && !hit;dy++) for(let dx=-1;dx<=1 && !hit;dx++){
      const nx=x+dx, ny=y+dy;
      if(!insideMap(nx,ny)) continue;
      if(land[ny*LW+nx]===M_WATER){
        setMat(x,y,M_ROCK);
        setMat(nx,ny, bg[ny*LW+nx] ? M_TUNNEL : M_SKY);
        for(let k=0;k<4;k++) addSteam(x,y);
        wake(x,y); wake(nx,ny);
        hit = true;
      }
    }
  }
  if(n===convCheck.length) convCheck.length = 0; else convCheck.splice(0,n);
}
