/* Digging and blasting. LANE A (world).

   Published API (other lanes may call these):
     digFreeCircle(x, y, r, collect) -> { freed, blocked }
     anyDiggable(x, y, r) -> bool
     blast(x, y, r)

   When enough material of one kind has been dug, this emits
     bus "dig:yield"  { item, x, y }
   and lane C turns that into a physical chunk. Nothing here knows what an
   item is beyond its id string. */

import { MATS } from "./materials.js";
import { LW, LH, land, markPixel, clearedMat, insideMap } from "./landscape.js";
import { wake, wakeArea, addPXS } from "./dynamics.js";
import { hash2, rnd } from "../core/rng.js";
import { addDust, addShock } from "../core/fx.js";
import { bus } from "../core/bus.js";

export let digMass = {};
export function resetDigMass(){ digMass = {}; }

function matDust(M){ return "rgb("+M.col[0]+","+M.col[1]+","+M.col[2]+")"; }

export function digFreeCircle(cx, cy, r, collect){
  cx = Math.round(cx); cy = Math.round(cy);
  let freed = 0, blocked = false;
  const r2 = r*r;
  for(let y=cy-r; y<=cy+r; y++){
    if(y<0||y>=LH) continue;
    const dy = y-cy;
    for(let x=cx-r; x<=cx+r; x++){
      if(x<0||x>=LW) continue;
      const dx = x-cx;
      if(dx*dx+dy*dy > r2) continue;
      const i = y*LW+x;
      const m = land[i], M = MATS[m];
      if(M.density<25) continue;
      if(M.isLiq) continue;
      if(!M.digFree){ blocked = true; continue; }
      land[i] = clearedMat(i);
      markPixel(x,y);
      freed++;
      if(collect && M.dig2){
        digMass[m] = (digMass[m]||0) + 1;
        const need = M.dig2ratio/8;
        if(digMass[m] >= need){
          digMass[m] -= need;
          bus.emit("dig:yield", { item: M.dig2, x, y });
        }
      }
      if(freed<40) wake(x,y);
      if(hash2(x,y,55)<0.05) addDust(x,y,matDust(M));
    }
  }
  if(freed>0) wakeArea(cx,cy,r+2);
  return { freed, blocked };
}

export function anyDiggable(cx,cy,r){
  cx = Math.round(cx); cy = Math.round(cy);
  const r2 = r*r;
  for(let y=cy-r;y<=cy+r;y++){
    if(y<0||y>=LH) continue;
    for(let x=cx-r;x<=cx+r;x++){
      if(x<0||x>=LW) continue;
      const dx=x-cx, dy=y-cy;
      if(dx*dx+dy*dy>r2) continue;
      const M = MATS[land[y*LW+x]];
      if(M.solid && M.digFree) return true;
    }
  }
  return false;
}

export function blast(cx,cy,r){
  cx = Math.round(cx); cy = Math.round(cy);
  const r2 = r*r;
  for(let y=cy-r;y<=cy+r;y++){
    if(y<0||y>=LH) continue;
    for(let x=cx-r;x<=cx+r;x++){
      if(x<0||x>=LW) continue;
      const dx=x-cx, dy=y-cy, d2=dx*dx+dy*dy;
      if(d2>r2) continue;
      const i = y*LW+x;
      const m = land[i], M = MATS[m];
      if(M.density<25) continue;
      if(!M.blastFree) continue;
      land[i] = clearedMat(i);
      markPixel(x,y);
      /* part of the material is thrown out as loose pixels */
      if(hash2(x,y,71) < 0.12){
        const d = Math.sqrt(d2)||1;
        addPXS(x, y, dx/d*(2+rnd()*3), dy/d*(2+rnd()*3)-1.5, m);
      }
    }
  }
  wakeArea(cx,cy,r+3);
  addShock(cx,cy,r);
}
