/* Map generation. LANE A (world).

   A desolate forest surface over layered ground: soil, sand and clay near
   the top, rock strata taking over with depth, granite intrusions and
   bedrock at the bottom, winding caves, ore bodies placed by depth, a lake
   in the valleys, water and oil pockets underground and lava near the
   bottom.

   The map is 4096 x 2560 and is not generated in one go. Generation splits
   in two:

     planWorld(seed)   cheap, runs once. Works out the ground line, the
                       water level, and a list of every ore body, pool,
                       tree and blade of grass in the world. A few thousand
                       entries, bucketed by chunk.
     fillChunk(chunk)  runs whenever a chunk is paged in. Rasterises the
                       layers, caves and whichever plan entries overlap
                       that one chunk.

   The split is what makes streaming possible, and it is why nothing here
   may read the landscape: a chunk has to be reproducible on its own, from
   the seed, in any order, forever. Every helper below is a pure function
   of position.

   ORE_PLACEMENT is the tuning table: which material, how many bodies, in
   which depth band (fraction of map height), how big, how much they
   wander. */

import {
  M_SKY, M_TUNNEL, M_EARTH, M_SAND, M_GRANITE, M_ROCK, M_CLAY, M_LIMEST,
  M_GRAVEL, M_COAL, M_IRON, M_COPPER, M_TIN, M_ZINC, M_LEAD, M_NICKEL,
  M_BAUXITE, M_QUARTZ, M_TITAN, M_SILVER, M_GOLD, M_URANIUM, M_RAREEART,
  M_WATER, M_LAVA, M_OIL
} from "./materials.js";
import { LW, LH, CHUNK, CSHIFT, CW, CH } from "./config.js";
import { surface, dirtyList } from "./landscape.js";
import { clearChunks, setChunkFiller } from "./chunks.js";
import { clearDynamics } from "./dynamics.js";
import { clearPours } from "./spoil.js";
import { clearCaveins } from "./cavein.js";
import { resetDigMass } from "./dig.js";
import { trees, grass, clearScenery } from "./scenery.js";
import { setSeed, rnd, rint, fbm, clamp } from "../core/rng.js";
import { state } from "../core/state.js";

export const ORE_PLACEMENT = [
  /* material,   bodies, from,  to,    radius,   wander  */
  [ M_CLAY,     222, 0.24, 0.42, [5,14], 3 ],
  [ M_LIMEST,   196, 0.26, 0.60, [5,13], 3 ],
  [ M_GRAVEL,   170, 0.24, 0.70, [4,11], 3 ],
  [ M_SAND,     118, 0.22, 0.50, [5,12], 2 ],
  [ M_COAL,     262, 0.26, 0.78, [5,13], 3 ],
  [ M_IRON,     236, 0.28, 0.88, [5,12], 3 ],
  [ M_COPPER,   184, 0.38, 0.88, [4,11], 3 ],
  [ M_TIN,      131, 0.44, 0.88, [4,10], 3 ],
  [ M_ZINC,     131, 0.44, 0.92, [4,10], 3 ],
  [ M_LEAD,     118, 0.50, 0.92, [4, 9], 2 ],
  [ M_BAUXITE,  144, 0.34, 0.72, [4,11], 3 ],
  [ M_QUARTZ,   157, 0.34, 0.92, [4,10], 2 ],
  [ M_NICKEL,   105, 0.58, 0.95, [4, 9], 2 ],
  [ M_SILVER,    92, 0.55, 0.95, [3, 8], 2 ],
  [ M_GOLD,      79, 0.62, 0.97, [3, 7], 2 ],
  [ M_TITAN,     79, 0.70, 0.97, [3, 8], 2 ],
  [ M_URANIUM,   52, 0.80, 0.98, [3, 6], 1 ],
  [ M_RAREEART,  46, 0.82, 0.98, [3, 6], 1 ]
];

/* ------------------------------------------------------------ the plan --- */
let ns = 0;                       /* noise salt derived from the seed */
let waterLevel = 0;

/* every ore body and pool, in the order they must be applied, plus which
   chunks each one touches so a chunk only looks at its own */
const discs      = [];            /* { m, x, y, r } ore bodies  */
const pools      = [];            /* { m, x, y, r } liquid pockets */
const discBucket = new Array(CW * CH);
const poolBucket = new Array(CW * CH);

function clearPlan(){
  discs.length = 0; pools.length = 0;
  discBucket.fill(null); poolBucket.fill(null);
}
function bucketise(list, bucket, i, x, y, r){
  const cx0 = Math.max(0, (x - r) >> CSHIFT), cx1 = Math.min(CW - 1, (x + r) >> CSHIFT);
  const cy0 = Math.max(0, (y - r) >> CSHIFT), cy1 = Math.min(CH - 1, (y + r) >> CSHIFT);
  for(let cy = cy0; cy <= cy1; cy++)
    for(let cx = cx0; cx <= cx1; cx++){
      const ci = cy * CW + cx;
      (bucket[ci] || (bucket[ci] = [])).push(i);
    }
}

/* ------------------------------------------------- pure terrain queries --- */
/* The per-column values cost two fbm each, and every pixel in a column
   wants them, so the last column worked out is kept. */
let colX = -1, colHs = 0, colRock = 0, colBed = 0;
function column(x){
  if(x === colX) return;
  colX  = x;
  colHs = surface[x];
  colRock = 375 + (fbm(x * 0.004, 0.5, ns + 21, 3) - 0.5) * 300;
  colBed  = LH - 180 - Math.round(fbm(x * 0.006, 2.5, ns + 29, 2) * 180);
}

export function groundLine(x){
  let h = 420
        + (fbm(x * 0.0013, 3.7, ns,      4) - 0.5) * 340
        + (fbm(x * 0.0060, 9.1, ns + 7,  3) - 0.5) * 110
        + (fbm(x * 0.0240, 1.3, ns + 13, 2) - 0.5) * 26;
  return clamp(Math.round(h), 180, 760);
}

/* the layered ground, before caves, ore or liquids */
function baseMat(x, y){
  column(x);
  if(y < colHs) return M_SKY;
  if(y >= colBed) return M_GRANITE;
  const depth = y - colHs;
  const t1 = clamp((depth - colRock * 0.55) / 650, 0, 1);
  const rn = fbm(x * 0.0055, y * 0.030, ns + 31, 3);
  let m = (rn > 0.74 - t1 * 0.36) ? M_ROCK : M_EARTH;
  /* Sand belongs to the top of the ground and the lake shore, granite to
     the bottom, so neither noise is worth evaluating outside its band.
     Every chunk is 16384 pixels and is generated while the player walks,
     so an fbm that is thrown away is an fbm not worth computing. */
  if(depth < 330){
    const sn = fbm(x * 0.010, y * 0.020, ns + 37, 3);
    if(sn > 0.745) m = M_SAND;
    else if(y > waterLevel - 10 && y < waterLevel + 22 && depth < 18 && sn > 0.52) m = M_SAND;
  }
  if(depth > 660){
    const t2 = clamp((depth - 760) / 1800, 0, 1);
    if(fbm(x * 0.008, y * 0.018, ns + 43, 3) > 0.84 - t2 * 0.26) m = M_GRANITE;
  }
  return m;
}

/* the widest a cave ridge can ever be, so a pixel further than this from
   the ridge line needs no second noise lookup to be ruled out */
const CAVE_MAX_WIDTH = 0.013 + 0.016 + 0.014;

/* is this pixel hollowed out by the cave system? */
function caveAt(x, y, base){
  column(x);
  if(y < colHs + 26 || y >= LH - 40) return false;
  if(base === M_GRANITE) return false;
  const d = y - colHs;
  const ridge = Math.abs(fbm(x * 0.0060, y * 0.0090, ns + 51, 3) - 0.5);
  if(ridge < CAVE_MAX_WIDTH){
    const width = 0.013 + 0.016 * fbm(x * 0.0025, y * 0.0025, ns + 59, 2)
                        + clamp((d - 400) * 0.00003, 0, 0.014);
    if(ridge < width) return true;
  }
  if(d > 512 && fbm(x * 0.005, y * 0.008, ns + 61, 3) > 0.780) return true;
  return false;
}

/* the ragged edge of an ore body, from position alone */
function inDisc(d, x, y){
  const dx = x - d.x, dy = y - d.y;
  if(dx * dx + dy * dy > d.r * d.r) return false;
  return ((x * 7919 + y * 104729 + d.m * 31) % 97) / 97 <= 0.90;
}

/* what a pixel ends up as, used by the plan itself for trees and grass.
   fillChunk does the same thing in bulk. */
function finalMat(x, y){
  const base = baseMat(x, y);
  if(base === M_SKY) return y >= waterLevel ? M_WATER : M_SKY;
  if(caveAt(x, y, base)) return M_TUNNEL;
  if(base === M_EARTH || base === M_ROCK || base === M_SAND){
    const b = discBucket[((y >> CSHIFT) * CW) + (x >> CSHIFT)];
    if(b){
      let m = base;
      for(let k = 0; k < b.length; k++){
        const d = discs[b[k]];
        if((m === M_EARTH || m === M_ROCK || m === M_SAND) && inDisc(d, x, y)) m = d.m;
      }
      return m;
    }
  }
  return base;
}

/* ------------------------------------------------------------- planning --- */
export function planWorld(seed){
  setSeed(seed);
  ns = rint(1, 90000);
  state.world.seed = seed >>> 0;
  colX = -1;
  clearPlan();

  /* 1. the ground line and the level the lake settles at */
  let avg = 0;
  for(let x = 0; x < LW; x++){ const h = groundLine(x); surface[x] = h; avg += h; }
  avg /= LW;
  const samp = [];
  for(let x = 0; x < LW; x += 7) samp.push(surface[x]);
  samp.sort((a, b) => a - b);
  waterLevel = Math.max(Math.round(avg) + 14, samp[Math.floor(samp.length * 0.80)] + 10);
  state.world.waterLevel = waterLevel;

  /* 2. ore bodies. A body is a short wander of overlapping discs; the
        whole path is worked out now so a chunk can rasterise its share of
        it without knowing about the rest. */
  for(const [m, count, fromF, toF, rr, wander] of ORE_PLACEMENT){
    const yMin = Math.round(LH * fromF), yMax = Math.round(LH * toF);
    for(let k = 0; k < count; k++){
      const cx = rint(30, LW - 30);
      const cy = rint(Math.max(surface[cx] + 26, yMin), Math.max(yMin + 1, yMax));
      const r  = rint(rr[0], rr[1]);
      if(cy >= LH - 14) continue;
      let px = cx, py = cy;
      const steps = 1 + Math.floor(wander * rnd());
      for(let s = 0; s <= steps; s++){
        const rad = r * (0.65 + rnd() * 0.55);
        const d = { m, x: Math.round(px), y: Math.round(py), r: rad };
        if(d.x > -rad && d.x < LW + rad && d.y > -rad && d.y < LH + rad){
          bucketise(discs, discBucket, discs.length, d.x, d.y, Math.ceil(rad));
          discs.push(d);
        }
        px += (rnd() - 0.5) * r * 2.2;
        py += (rnd() - 0.5) * r * 1.6;
      }
    }
  }

  /* 3. pockets of water, oil and lava, in caves */
  function pool(m, count, yMin, yMax, rMin, rMax, tries){
    let placed = 0, t = 0;
    while(placed < count && t < tries){
      t++;
      const cx = rint(60, LW - 60), cy = rint(yMin, yMax), r = rint(rMin, rMax);
      if(!caveAt(cx, cy, baseMat(cx, cy))) continue;
      placed++;
      bucketise(pools, poolBucket, pools.length, cx, cy, r);
      pools.push({ m, x: cx, y: cy, r });
    }
  }
  pool(M_WATER, 170, 900, LH - 360, 8, 20, 26000);
  pool(M_OIL,    65, Math.round(LH * 0.60), LH - 300, 7, 16, 26000);
  pool(M_LAVA,  144, LH - 660, LH - 180, 7, 18, 26000);

  /* 4. the forest */
  clearScenery();
  let tx = 40;
  while(tx < LW - 40){
    tx += rint(22, 90);
    if(tx >= LW - 40) break;
    const hy = surface[tx];
    if(hy >= waterLevel - 3) continue;
    if(Math.abs(surface[tx - 8] - surface[tx + 8]) > 11) continue;
    if(finalMat(tx, hy + 2) !== M_EARTH) continue;
    const th = rint(34, 74);
    trees.push({ x: tx, y: hy, h: th, sway: rnd() * 6.28, seed: rint(1, 9999),
                 kind: rnd() < 0.24 ? 1 : 0, fall: 0, fdir: 1,
                 hp: th, hpMax: th, chopped: false });
  }
  for(let gx = 2; gx < LW - 2; gx++){
    const gy = surface[gx];
    if(gy >= waterLevel - 1) continue;
    if(rnd() > 0.30) continue;
    if(finalMat(gx, gy + 1) !== M_EARTH) continue;
    grass.push({ x: gx, y: gy, h: 2 + rnd() * 5, s: rnd() * 6.28, k: rnd() < 0.12 ? 1 : 0 });
  }

  /* 5. somewhere to start */
  let spawnX = LW >> 1;
  for(let t = 0; t < 600; t++){
    const cx = rint(80, LW - 80);
    if(surface[cx] < waterLevel - 20 && Math.abs(surface[cx - 10] - surface[cx + 10]) < 6){ spawnX = cx; break; }
  }
  state.world.spawn.x = spawnX;
  state.world.spawn.y = surface[spawnX] - 14;
}

/* ------------------------------------------------- rasterising one chunk --- */
export function fillChunk(c){
  const land = c.land, bgb = c.bg;
  const x0 = c.x0, y0 = c.y0;
  land.fill(M_SKY);
  bgb.fill(0);

  /* 1. layers, and 2. caves, one column at a time */
  for(let lx = 0; lx < CHUNK; lx++){
    const x = x0 + lx;
    column(x);
    const hs = colHs;
    for(let ly = 0; ly < CHUNK; ly++){
      const y = y0 + ly;
      if(y < hs) continue;
      const li = (ly << CSHIFT) | lx;
      const m = baseMat(x, y);
      if(caveAt(x, y, m)){ land[li] = M_TUNNEL; bgb[li] = 1; }
      else { land[li] = m; bgb[li] = (y - hs) >= 3 ? 1 : 0; }
    }
  }

  /* 3. the ore bodies that reach into this chunk, in plan order */
  const db = discBucket[c.ci];
  if(db){
    for(let k = 0; k < db.length; k++){
      const d = discs[db[k]];
      const r = d.r;
      const ay0 = Math.max(y0, Math.round(d.y - r)), ay1 = Math.min(y0 + CHUNK - 1, Math.round(d.y + r));
      const ax0 = Math.max(x0, Math.round(d.x - r)), ax1 = Math.min(x0 + CHUNK - 1, Math.round(d.x + r));
      for(let y = ay0; y <= ay1; y++){
        const ly = (y - y0) << CSHIFT;
        for(let x = ax0; x <= ax1; x++){
          const li = ly | (x - x0);
          const cur = land[li];
          if(cur !== M_EARTH && cur !== M_ROCK && cur !== M_SAND) continue;
          if(inDisc(d, x, y)) land[li] = d.m;
        }
      }
    }
  }

  /* 4. the lake: every column whose ground sits below the water level */
  if(y0 + CHUNK > waterLevel){
    for(let lx = 0; lx < CHUNK; lx++){
      const x = x0 + lx;
      const hs = surface[x];
      if(hs <= waterLevel) continue;
      const wy0 = Math.max(y0, waterLevel), wy1 = Math.min(y0 + CHUNK - 1, hs - 1);
      for(let y = wy0; y <= wy1; y++){
        const li = ((y - y0) << CSHIFT) | lx;
        land[li] = M_WATER; bgb[li] = 0;
      }
    }
  }

  /* 5. pockets of liquid, filling cave space only, in plan order */
  const pb = poolBucket[c.ci];
  if(pb){
    for(let k = 0; k < pb.length; k++){
      const p = pools[pb[k]], r = p.r, r2 = r * r;
      const ay0 = Math.max(y0, p.y - r), ay1 = Math.min(y0 + CHUNK - 1, p.y + r);
      const ax0 = Math.max(x0, p.x - r), ax1 = Math.min(x0 + CHUNK - 1, p.x + r);
      for(let y = ay0; y <= ay1; y++){
        const dy = y - p.y, ly = (y - y0) << CSHIFT;
        for(let x = ax0; x <= ax1; x++){
          const dx = x - p.x;
          if(dx * dx + dy * dy > r2) continue;
          const li = ly | (x - x0);
          if(land[li] === M_TUNNEL) land[li] = p.m;
        }
      }
    }
  }
}

/* ---------------------------------------------------------------- entry --- */
setChunkFiller(fillChunk);

export function generate(seed){
  clearChunks();
  dirtyList.length = 0;
  clearDynamics();
  clearPours();
  clearCaveins();
  resetDigMass();
  planWorld(seed);
}
