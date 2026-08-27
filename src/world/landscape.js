/* The landscape buffers. LANE A (world).

   land[]  material index per pixel
   bg[]    what is behind that pixel: 0 sky, 1 tunnel. Removing a solid
           pixel underground leaves the dark tunnel, which is what makes a
           dug shaft read as a shaft instead of a hole in the sky.
   flags[] queue membership bits used by dynamics.js
   light[] per pixel light level, written by lighting.js

   Nothing here knows about the player, items or buildings. */

import { MATS, M_SKY, M_TUNNEL, M_GRANITE } from "./materials.js";
import { state } from "../core/state.js";

export const LW = 1600;
export const LH = 1000;

export const land    = new Uint8Array(LW*LH);
export const bg      = new Uint8Array(LW*LH);
export const flags   = new Uint8Array(LW*LH);
export const surface = new Int16Array(LW);

state.world.W = LW;
state.world.H = LH;

export function idx(x,y){ return y*LW+x; }

export function matAt(x,y){
  if(x<0 || x>=LW || y>=LH) return M_GRANITE;   /* map border is bedrock */
  if(y<0) return M_SKY;
  return land[y*LW+x];
}
export function isSolid(x,y){ return MATS[matAt(x,y)].density>=50; }
export function isLiquid(x,y){ const d = MATS[matAt(x,y)].density; return d>=25 && d<50; }
export function isFree(x,y){ return MATS[matAt(x,y)].density<25; }
export function insideMap(x,y){ return x>=0 && y>=0 && x<LW && y<LH; }

/* ---------------------------- dirty tiles ----------------------------- */
export const TS = 32;
export const TX = Math.ceil(LW/TS);
export const TY = Math.ceil(LH/TS);
export const tileDirty = new Uint8Array(TX*TY);
export const dirtyList = [];

export function markTile(tx,ty){
  if(tx<0||ty<0||tx>=TX||ty>=TY) return;
  const t = ty*TX+tx;
  if(!tileDirty[t]){ tileDirty[t] = 1; dirtyList.push(t); }
}
export function markPixel(x,y){
  const tx = (x/TS)|0, ty = (y/TS)|0;
  markTile(tx,ty);
  /* surface shading looks up to 3px up and 1px down */
  const lx = x - tx*TS, ly = y - ty*TS;
  if(ly<3) markTile(tx,ty-1);
  if(ly>TS-2) markTile(tx,ty+1);
  if(lx<1) markTile(tx-1,ty);
  if(lx>TS-2) markTile(tx+1,ty);
}

export function setMat(x,y,m){
  if(!insideMap(x,y)) return;
  const i = y*LW+x;
  if(land[i]===m) return;
  land[i] = m;
  markPixel(x,y);
}
/* remove a pixel: sky above ground, tunnel below it */
export function clearPix(x,y){
  if(!insideMap(x,y)) return;
  setMat(x,y, bg[y*LW+x] ? M_TUNNEL : M_SKY);
}
export function clearedMat(i){ return bg[i] ? M_TUNNEL : M_SKY; }
