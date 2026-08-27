/* Map generation. LANE A (world).

   A desolate forest surface over layered ground: soil, sand and clay near
   the top, rock strata taking over with depth, granite intrusions and
   bedrock at the bottom, winding caves, ore bodies placed by depth, a lake
   in the valleys, water and oil pockets underground and lava near the
   bottom.

   ORE_PLACEMENT is the tuning table: which material, how many bodies, in
   which depth band (fraction of map height), how big, how much they wander. */

import {
  MATS, M_SKY, M_TUNNEL, M_EARTH, M_SAND, M_GRANITE, M_ROCK, M_CLAY, M_LIMEST,
  M_GRAVEL, M_COAL, M_IRON, M_COPPER, M_TIN, M_ZINC, M_LEAD, M_NICKEL,
  M_BAUXITE, M_QUARTZ, M_TITAN, M_SILVER, M_GOLD, M_URANIUM, M_RAREEART,
  M_WATER, M_LAVA, M_OIL
} from "./materials.js";
import { LW, LH, land, bg, flags, surface, tileDirty, dirtyList, isLiquid } from "./landscape.js";
import { clearDynamics, pushMM } from "./dynamics.js";
import { resetDigMass } from "./dig.js";
import { trees, grass, clearScenery } from "./scenery.js";
import { setSeed, rnd, rint, fbm, clamp } from "../core/rng.js";
import { state } from "../core/state.js";

export const ORE_PLACEMENT = [
  /* material,   bodies, from,  to,    radius,   wander  */
  [ M_CLAY,      34, 0.24, 0.42, [5,14], 3 ],
  [ M_LIMEST,    30, 0.26, 0.60, [5,13], 3 ],
  [ M_GRAVEL,    26, 0.24, 0.70, [4,11], 3 ],
  [ M_SAND,      18, 0.22, 0.50, [5,12], 2 ],
  [ M_COAL,      40, 0.26, 0.78, [5,13], 3 ],
  [ M_IRON,      36, 0.28, 0.88, [5,12], 3 ],
  [ M_COPPER,    28, 0.38, 0.88, [4,11], 3 ],
  [ M_TIN,       20, 0.44, 0.88, [4,10], 3 ],
  [ M_ZINC,      20, 0.44, 0.92, [4,10], 3 ],
  [ M_LEAD,      18, 0.50, 0.92, [4, 9], 2 ],
  [ M_BAUXITE,   22, 0.34, 0.72, [4,11], 3 ],
  [ M_QUARTZ,    24, 0.34, 0.92, [4,10], 2 ],
  [ M_NICKEL,    16, 0.58, 0.95, [4, 9], 2 ],
  [ M_SILVER,    14, 0.55, 0.95, [3, 8], 2 ],
  [ M_GOLD,      12, 0.62, 0.97, [3, 7], 2 ],
  [ M_TITAN,     12, 0.70, 0.97, [3, 8], 2 ],
  [ M_URANIUM,    8, 0.80, 0.98, [3, 6], 1 ],
  [ M_RAREEART,   7, 0.82, 0.98, [3, 6], 1 ]
];

export function generate(seed){
  setSeed(seed);
  const ns = rint(1,90000);
  state.world.seed = seed>>>0;

  land.fill(M_SKY);
  bg.fill(0);
  flags.fill(0);
  clearDynamics();
  clearScenery();
  resetDigMass();

  /* ---- 1. ground line ---- */
  let avg = 0;
  for(let x=0;x<LW;x++){
    let h = 300
          + (fbm(x*0.0013, 3.7, ns,    4)-0.5)*230
          + (fbm(x*0.0060, 9.1, ns+7,  3)-0.5)*70
          + (fbm(x*0.0240, 1.3, ns+13, 2)-0.5)*16;
    h = clamp(Math.round(h), 90, 520);
    surface[x] = h;
    avg += h;
  }
  avg /= LW;
  const samp = [];
  for(let sxi=0; sxi<LW; sxi+=7) samp.push(surface[sxi]);
  samp.sort((a,b)=>a-b);
  const waterLevel = Math.max(Math.round(avg)+14, samp[Math.floor(samp.length*0.80)] + 10);
  state.world.waterLevel = waterLevel;

  /* ---- 2. layers ---- */
  for(let x=0;x<LW;x++){
    const hs = surface[x];
    const rockLine = 150 + (fbm(x*0.004, 0.5, ns+21, 3)-0.5)*120;
    const bedrock  = LH - 70 - Math.round(fbm(x*0.006, 2.5, ns+29, 2)*70);
    for(let y=hs; y<LH; y++){
      const i = y*LW+x;
      const depth = y-hs;
      let m;
      if(y >= bedrock){
        m = M_GRANITE;
      } else {
        const t1 = clamp((depth - rockLine*0.55) / 260, 0, 1);
        const rn = fbm(x*0.0055, y*0.030, ns+31, 3);
        m = (rn > 0.74 - t1*0.36) ? M_ROCK : M_EARTH;
        const sn = fbm(x*0.010, y*0.020, ns+37, 3);
        if(depth < 130 && sn > 0.745) m = M_SAND;
        if(y > waterLevel-10 && y < waterLevel+22 && depth < 18 && sn > 0.52) m = M_SAND;
        const t2 = clamp((depth-300)/320, 0, 1);
        const gn = fbm(x*0.008, y*0.018, ns+43, 3);
        if(depth > 260 && gn > 0.80 - t2*0.30) m = M_GRANITE;
      }
      land[i] = m;
      bg[i] = depth >= 3 ? 1 : 0;
    }
  }

  /* ---- 3. caves ---- */
  for(let x=0;x<LW;x++){
    const hs = surface[x];
    for(let y=hs+26; y<LH-40; y++){
      const i = y*LW+x;
      if(land[i]===M_GRANITE) continue;
      const d = y-hs;
      const cv = fbm(x*0.0060, y*0.0090, ns+51, 3);
      const ridge = Math.abs(cv-0.5);
      const width = 0.013 + 0.016*fbm(x*0.0025, y*0.0025, ns+59, 2)
                          + clamp((d-160)*0.00008, 0, 0.014);
      if(ridge < width){ land[i] = M_TUNNEL; bg[i] = 1; }
      else {
        const cav = fbm(x*0.005, y*0.008, ns+61, 3);
        if(d > 200 && cav > 0.780){ land[i] = M_TUNNEL; bg[i] = 1; }
      }
    }
  }

  /* ---- 4. ore bodies ---- */
  function blob(matIdx, cx, cy, r, wander){
    let px = cx, py = cy;
    const steps = 1 + Math.floor(wander*rnd());
    for(let s=0;s<=steps;s++){
      const rr = r*(0.65+rnd()*0.55);
      for(let y=Math.round(py-rr); y<=py+rr; y++){
        if(y<0||y>=LH) continue;
        for(let x=Math.round(px-rr); x<=px+rr; x++){
          if(x<0||x>=LW) continue;
          const dx=x-px, dy=y-py;
          if(dx*dx+dy*dy > rr*rr) continue;
          if(((x*7919+y*104729+matIdx*31)%97)/97 > 0.90) continue;   /* ragged edge */
          const i = y*LW+x, cur = land[i];
          if(cur===M_EARTH || cur===M_ROCK || cur===M_SAND) land[i] = matIdx;
        }
      }
      px += (rnd()-0.5)*r*2.2;
      py += (rnd()-0.5)*r*1.6;
    }
  }
  for(const [matIdx, count, fromF, toF, rr, wander] of ORE_PLACEMENT){
    const yMin = Math.round(LH*fromF), yMax = Math.round(LH*toF);
    for(let k=0;k<count;k++){
      const cx = rint(30, LW-30);
      const cy = rint(Math.max(surface[cx]+26, yMin), Math.max(yMin+1, yMax));
      if(cy>=LH-14) continue;
      blob(matIdx, cx, cy, rint(rr[0], rr[1]), wander);
    }
  }

  /* ---- 5. liquids ---- */
  for(let x=0;x<LW;x++){
    const hs = surface[x];
    if(hs > waterLevel){
      for(let y=waterLevel; y<hs; y++){
        const i = y*LW+x;
        land[i] = M_WATER; bg[i] = 0;
      }
    }
  }
  function pool(matIdx, count, yMin, yMax, rMin, rMax){
    let placed = 0, tries = 0;
    while(placed<count && tries<4000){
      tries++;
      const cx = rint(60,LW-60), cy = rint(yMin,yMax), r = rint(rMin,rMax);
      if(land[cy*LW+cx]!==M_TUNNEL) continue;
      placed++;
      for(let y=cy-r;y<=cy+r;y++){
        if(y<0||y>=LH) continue;
        for(let x=cx-r;x<=cx+r;x++){
          if(x<0||x>=LW) continue;
          const dx=x-cx, dy=y-cy;
          if(dx*dx+dy*dy>r*r) continue;
          const i = y*LW+x;
          if(land[i]===M_TUNNEL) land[i] = matIdx;
        }
      }
    }
  }
  pool(M_WATER, 26, 380, LH-140, 8, 20);
  pool(M_OIL,   10, Math.round(LH*0.60), LH-120, 7, 16);
  pool(M_LAVA,  22, LH-260, LH-70, 7, 18);

  /* ---- 6. forest ---- */
  let tx = 40;
  while(tx < LW-40){
    tx += rint(22, 90);
    if(tx>=LW-40) break;
    const hy = surface[tx];
    if(hy >= waterLevel-3) continue;
    if(Math.abs(surface[tx-8]-surface[tx+8]) > 11) continue;
    if(land[(hy+2)*LW+tx] !== M_EARTH) continue;
    trees.push({ x:tx, y:hy, h:rint(34,74), sway:rnd()*6.28, seed:rint(1,9999),
                 kind: rnd()<0.24 ? 1 : 0, fall:0, fdir:1 });
  }
  for(let gx=2; gx<LW-2; gx++){
    const gy = surface[gx];
    if(gy >= waterLevel-1) continue;
    if(land[(gy+1)*LW+gx] !== M_EARTH) continue;
    if(rnd() > 0.30) continue;
    grass.push({ x:gx, y:gy, h:2+rnd()*5, s:rnd()*6.28, k:rnd()<0.12?1:0 });
  }

  /* ---- 7. spawn ---- */
  let spawnX = LW>>1;
  for(let t=0;t<600;t++){
    const cx = rint(80, LW-80);
    if(surface[cx] < waterLevel-20 && Math.abs(surface[cx-10]-surface[cx+10])<6){ spawnX = cx; break; }
  }
  state.world.spawn.x = spawnX;
  state.world.spawn.y = surface[spawnX]-14;

  /* let the liquids settle from the first tick */
  for(let x=0;x<LW;x++){
    for(let y=0;y<LH;y++){
      if(MATS[land[y*LW+x]].density<25){
        if(isLiquid(x,y-1)||isLiquid(x-1,y)||isLiquid(x+1,y)) pushMM(x,y);
      }
    }
  }
}
