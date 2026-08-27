/* Digging and blasting. LANE A (world).

   Published API (other lanes may call these):
     digSpeedFor(matIndex, toolId) -> pixels per second, 0 = cannot cut
     digTierFor(matIndex) -> 0..4, or null if nothing ever cuts it
     digFreeCircle(x, y, r, collect, toolId) -> { freed, blocked }
     anyDiggable(x, y, r, toolId) -> bool
     blast(x, y, r)

   TOOL TIERS. Depth is gated by what you are holding, not by how long you
   are willing to hold it (docs/DECISIONS.md 2026-08-28). Every material
   has a tier (materials.js); every tool cuts up to a tier and never above
   it. Ground above the tool's tier is not slow, it is immovable - it
   behaves exactly like granite, so a wall of it reads as a wall.

   The gate lives in here rather than in the caller, so nothing can dig
   round it by calling the wrong function.

   digSpeedFor returns PIXELS PER SECOND: how much material this tool takes
   out of that material in a second. 0 means this tool cannot cut it at
   all, which is lane B's cue to stop the swing rather than grind.

   When enough material of one kind has been dug, this emits
     bus "dig:yield"  { item, x, y }
   and lane C turns that into a physical chunk. Nothing here knows what an
   item is beyond its id string. */

import { MATS } from "./materials.js";
import { TOOLS, digSpeed, hardnessOf, UNCUTTABLE } from "../content/tools.js";
import { LW, LH, matAt, clearPix } from "./landscape.js";
import { wake, wakeArea, addPXS } from "./dynamics.js";
import { hash2, rnd } from "../core/rng.js";
import { addDust, addShock } from "../core/fx.js";
import { noteDig } from "./cavein.js";
import { bus } from "../core/bus.js";

/* THE TIER TABLE IS LANE F'S. src/content/tools.js owns which tier every
   material sits in, which tools exist, what kind each one is, and how deep
   its kind may ever reach. This lane reads it and never second-guesses it,
   so there is exactly one place where progression is decided.

   What is left for this file is the unit. Lane F's `speed` is relative -
   1.00 means "a stone tool of this kind doing its own job" - and lane B
   needs pixels per second. KIND_RATE is that conversion, indexed by
   material tier, and it is also where a pickaxe is made unremarkable in
   soil and heavier going the deeper it cuts.

   Hands are listed by lane F at speed 0.30, so their base is set so that
   0.30 lands on a deliberately miserable 90 px/s. An axe scrapes soil no
   better than bare hands: it is a tree tool, whatever its speed says about
   felling. */
export const HANDS = "hands";

const KIND_RATE = {
  /*        tier: 0    1    2    3    4   px/s at lane F speed 1.00 */
  hands:   [ 300 ],
  shovel:  [ 360 ],
  axe:     [  90 ],
  pickaxe: [ 110, 200, 170, 140, 120 ]
};

/* pixels of material per second; 0 means this tool cannot cut it at all */
export function digSpeedFor(matIndex, toolId){
  const M = MATS[matIndex];
  if(!M || !M.digFree) return 0;
  const id = TOOLS[toolId] ? toolId : HANDS;
  const rel = digSpeed(id, M.name);           /* lane F: 0 if it cannot cut */
  if(rel <= 0) return 0;
  const rate = KIND_RATE[TOOLS[id].kind];
  if(!rate) return 0;
  const tier = hardnessOf(M.name) || 0;
  return rate[Math.min(tier, rate.length - 1)] * rel / (M.hardness || 1);
}

/* the tier of tool this material needs, straight from lane F, or null if
   nothing ever gets through it */
export function digTierFor(matIndex){
  const M = MATS[matIndex];
  if(!M || !M.digFree) return null;
  const h = hardnessOf(M.name);
  return (h === null || h === UNCUTTABLE) ? null : h;
}

/* Can this tool move this pixel at all? `toolId` undefined means "no tool
   gate" - the caller is not a character swinging something, but a test or
   a machine that carries its own rules. */
function canCutHere(m, toolId, gated){
  if(!MATS[m].digFree) return false;
  if(!gated) return true;
  return digSpeedFor(m, toolId) > 0;
}

export let digMass = {};
export function resetDigMass(){ digMass = {}; }

function matDust(M){ return "rgb("+M.col[0]+","+M.col[1]+","+M.col[2]+")"; }

export function digFreeCircle(cx, cy, r, collect, toolId){
  const gated = toolId !== undefined;
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
      const m = matAt(x,y), M = MATS[m];
      if(M.density<25) continue;
      if(M.isLiq) continue;
      if(!canCutHere(m, toolId, gated)){ blocked = true; continue; }
      clearPix(x,y);
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
  if(freed>0){
    wakeArea(cx,cy,r+2);
    noteDig(cx, cy, r);      /* ground you cut has not settled: watch it */
  }
  return { freed, blocked };
}

export function anyDiggable(cx,cy,r,toolId){
  cx = Math.round(cx); cy = Math.round(cy);
  const gated = toolId !== undefined;
  const r2 = r*r;
  for(let y=cy-r;y<=cy+r;y++){
    if(y<0||y>=LH) continue;
    for(let x=cx-r;x<=cx+r;x++){
      if(x<0||x>=LW) continue;
      const dx=x-cx, dy=y-cy;
      if(dx*dx+dy*dy>r2) continue;
      const m = matAt(x,y);
      if(MATS[m].solid && canCutHere(m, toolId, gated)) return true;
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
      const m = matAt(x,y), M = MATS[m];
      if(M.density<25) continue;
      if(!M.blastFree) continue;
      clearPix(x,y);
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
