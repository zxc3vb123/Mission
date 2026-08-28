/* The landscape. LANE A (world).

   Per pixel the map stores:

     land   material index into the material table
     bg     what is behind that pixel: 0 sky, 1 tunnel. Removing a solid
            pixel underground leaves the dark tunnel, which is what makes a
            dug shaft read as a shaft instead of a hole in the sky.
     flags  queue membership bits used by dynamics.js

   Those three live inside 128 x 128 chunks (see chunks.js), only a few
   dozen of which exist at any moment. This file is the only thing that
   knows that: everywhere else still says matAt(x, y).

   Two kinds of read live here, and the difference matters:

     matAt / isSolid / ...   the published API. Truthful anywhere on the
                             map, and will page a chunk in to answer.
     rMat / rSolid / ...     resident-only. Ground that is not loaded reads
                             as bedrock. The simulation uses these so that
                             settling sand at the edge of the loaded area
                             cannot drag the rest of the map into memory.

   Nothing here knows about the player, items or buildings. */

import { MATS, M_SKY, M_TUNNEL, M_GRANITE } from "./materials.js";
import { LW, LH, XSHIFT, XMASK, CSHIFT, CMASK, CW, TS, TSHIFT, TPC } from "./config.js";
import { grid, chunkAt, loadChunk, markChanged } from "./chunks.js";
import { state } from "../core/state.js";

export { LW, LH, TS };

/* ground height per column: 8 kB for the whole map, so it always stays */
export const surface = new Int16Array(LW);

state.world.W = LW;
state.world.H = LH;

export function idx(x, y){ return (y << XSHIFT) | x; }
export function insideMap(x, y){ return x >= 0 && y >= 0 && x < LW && y < LH; }

/* the chunk holding a pixel, paging it in if need be */
function own(x, y){
  const cx = x >> CSHIFT, cy = y >> CSHIFT;
  return grid[cy * CW + cx] || loadChunk(cx, cy);
}
/* the chunk holding a pixel, only if it is already loaded */
function ownR(x, y){
  return grid[(y >> CSHIFT) * CW + (x >> CSHIFT)] || null;
}
const local = (x, y) => ((y & CMASK) << CSHIFT) | (x & CMASK);

/* ------------------------------------------------------ published reads --- */
export function matAt(x, y){
  if(x < 0 || x >= LW || y >= LH) return M_GRANITE;   /* map border is bedrock */
  if(y < 0) return M_SKY;
  return own(x, y).land[local(x, y)];
}
export function bgAt(x, y){
  if(!insideMap(x, y)) return 0;
  return own(x, y).bg[local(x, y)];
}
export function isSolid(x, y){ return MATS[matAt(x, y)].density >= 50; }
export function isLiquid(x, y){ const d = MATS[matAt(x, y)].density; return d >= 25 && d < 50; }
export function isFree(x, y){ return MATS[matAt(x, y)].density < 25; }

/* ------------------------------------------------------- resident reads --- */
export function rMat(x, y){
  if(x < 0 || x >= LW || y >= LH) return M_GRANITE;
  if(y < 0) return M_SKY;
  const c = ownR(x, y);
  return c ? c.land[local(x, y)] : M_GRANITE;
}
export function rSolid(x, y){ return MATS[rMat(x, y)].density >= 50; }
export function rLiquid(x, y){ const d = MATS[rMat(x, y)].density; return d >= 25 && d < 50; }
export function rFree(x, y){ return MATS[rMat(x, y)].density < 25; }
export function rBg(x, y){
  if(!insideMap(x, y)) return 0;
  const c = ownR(x, y);
  return c ? c.bg[local(x, y)] : 0;
}
export function isLoaded(x, y){
  return insideMap(x, y) && !!ownR(x, y);
}

/* ---------------------------------------------------------- dirty tiles --- */
/* Tiles are 32 px and a chunk is four of them across. The list is packed as
   (chunk index << 4) | tile inside that chunk, so a repaint knows both. */
export const dirtyList = [];

export function markWorldTile(twx, twy){
  const c = chunkAt(twx >> 2, twy >> 2);
  if(!c) return;                        /* not loaded: it repaints on load */
  const t = ((twy & 3) << 2) | (twx & 3);
  if(c.tileDirty[t]) return;
  c.tileDirty[t] = 1;
  dirtyList.push((c.ci << 4) | t);
}

export function markPixel(x, y){
  const twx = x >> TSHIFT, twy = y >> TSHIFT;
  markWorldTile(twx, twy);
  /* surface shading looks up to 3 px up and 1 px down, so a pixel near a
     tile edge changes how its neighbour is painted too */
  const lx = x - (twx << TSHIFT), ly = y - (twy << TSHIFT);
  if(ly < 3)      markWorldTile(twx, twy - 1);
  if(ly > TS - 2) markWorldTile(twx, twy + 1);
  if(lx < 1)      markWorldTile(twx - 1, twy);
  if(lx > TS - 2) markWorldTile(twx + 1, twy);
}

/* A chunk is shaded using the pixels just outside it, so the edge tiles of
   its neighbours were painted against ground that had not arrived yet.
   Re-queue them now that it has. */
export function markNeighbourEdges(c){
  const tx = c.cx * TPC, ty = c.cy * TPC;
  for(let k = 0; k < TPC; k++){
    markWorldTile(tx - 1,   ty + k);
    markWorldTile(tx + TPC, ty + k);
    markWorldTile(tx + k,   ty - 1);
    markWorldTile(tx + k,   ty + TPC);
  }
}

export function markChunkDirty(c){
  for(let t = 0; t < TPC * TPC; t++){
    if(c.tileDirty[t]) continue;
    c.tileDirty[t] = 1;
    dirtyList.push((c.ci << 4) | t);
  }
}

/* --------------------------------------------------------------- writes --- */
export function setMat(x, y, m){
  if(!insideMap(x, y)) return;
  const c = own(x, y);
  const li = local(x, y);
  if(c.land[li] === m) return;
  c.land[li] = m;
  c.modified = true;
  markChanged(c);
  markPixel(x, y);
}
export function setBg(x, y, v){
  if(!insideMap(x, y)) return;
  const c = own(x, y);
  c.bg[local(x, y)] = v;
  c.modified = true;
  markChanged(c);
}
/* remove a pixel: sky above ground, tunnel below it */
export function clearPix(x, y){
  if(!insideMap(x, y)) return;
  const c = own(x, y);
  const li = local(x, y);
  setMat(x, y, c.bg[li] ? M_TUNNEL : M_SKY);
}

/* ----------------------------------------------------- indexed accessors --- */
/* dynamics.js queues pixels by index, which stays a plain number so the
   queues are typed-array friendly. These unpack it again. */
export function matI(i){
  const c = ownR(i & XMASK, i >>> XSHIFT);
  return c ? c.land[((i >>> XSHIFT) & CMASK) << CSHIFT | (i & CMASK)] : M_GRANITE;
}
export function bgI(i){
  const c = ownR(i & XMASK, i >>> XSHIFT);
  return c ? c.bg[((i >>> XSHIFT) & CMASK) << CSHIFT | (i & CMASK)] : 0;
}
export function clearedMat(i){ return bgI(i) ? M_TUNNEL : M_SKY; }

/* write by index, wake the repaint, and never page a chunk in: if the
   ground has been unloaded there is nothing to write to */
export function setI(i, m){
  const x = i & XMASK, y = i >>> XSHIFT;
  const c = ownR(x, y);
  if(!c) return false;
  c.land[((y & CMASK) << CSHIFT) | (x & CMASK)] = m;
  c.modified = true;
  markChanged(c);
  markPixel(x, y);
  return true;
}

export function flagI(i, bit){
  const c = ownR(i & XMASK, i >>> XSHIFT);
  return c ? (c.flags[((i >>> XSHIFT) & CMASK) << CSHIFT | (i & CMASK)] & bit) : 0;
}
export function addFlagI(i, bit){
  const c = ownR(i & XMASK, i >>> XSHIFT);
  if(c) c.flags[((i >>> XSHIFT) & CMASK) << CSHIFT | (i & CMASK)] |= bit;
}
export function dropFlagI(i, bit){
  const c = ownR(i & XMASK, i >>> XSHIFT);
  if(c) c.flags[((i >>> XSHIFT) & CMASK) << CSHIFT | (i & CMASK)] &= ~bit;
}
