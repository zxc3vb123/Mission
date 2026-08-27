/* LANE A owns this file: terrain, digging, liquids, ores, streaming. */

import { boot, suite, countSolid } from "../testkit.js";
import { MATS, M_EARTH, M_SAND, M_GRANITE, M_WATER, M_LAVA,
         M_TUNNEL, M_TITAN, M_URANIUM } from "../../src/world/materials.js";
import { fillChunk } from "../../src/world/generate.js";
import { CHUNK, CPIX, CW } from "../../src/world/config.js";

/* The map is streamed, so only ground near the camera is loaded and only
   loaded ground is simulated. Tests that want physics to run have to work
   where the player is, exactly as the game does. These two helpers are how
   this suite says "go and stand over there". */
function walkTo(g, W, targetX){
  let x = g.actor.clonk.x;
  while(Math.abs(x - targetX) > 1){
    const d = targetX - x;
    x += Math.sign(d) * Math.min(64, Math.abs(d));
    const c = g.actor.clonk;
    c.x = x; c.y = W.surfaceAt(x) - 12;
    c.vx = 0; c.vy = 0; c.energy = 100; c.breath = 100;
    g.tick(1);
    g.camera.snap();
    g.tick(5);
  }
}
/* find a run of one material within `span` px of the camera, so that what
   it finds is in ground the simulation is actually running on */
function findNear(g, W, mat, run, horizontal, span){
  const cx = Math.round(g.state.cam.x), H = W.size().H;
  for(let dx = 0; dx < span; dx += 7){
    for(const x of [cx - dx, cx + dx]){
      if(x < 4 || x > W.size().W - 4) continue;
      for(let y = W.surfaceAt(x) + 24; y < W.surfaceAt(x) + 300 && y < H - 60; y += 2){
        let ok = true;
        for(let k = 0; k < run; k++){
          const mx = horizontal ? x + k : x, my = horizontal ? y : y + k;
          if(W.matAt(mx, my) !== mat){ ok = false; break; }
        }
        if(ok) return { x, y };
      }
    }
  }
  return null;
}

export function run(){
  const t = suite("world");
  const g = boot(20260827);
  const W = g.world;
  const { W: LW, H: LH } = W.size();

  /* --- the map is the size the owner decided on --- */
  t.check("the map is big", LW >= 4000 && LH >= 2400, LW + "x" + LH);

  /* --- generation ---
     Sampled over a 1024 px slice rather than the whole map: materialising
     all 640 chunks to count them would defeat the point of streaming, and
     "every ore turns up inside any 1024 px of map" is the stronger claim
     about density anyway. */
  const X0 = 1024, X1 = 2048;
  const counts = {};
  let titanTop = LH, uranTop = LH;
  for(let x = X0; x < X1; x += 2) for(let y = 0; y < LH; y += 2){
    const m = W.matAt(x, y);
    counts[m] = (counts[m] || 0) + 1;
    if(m === M_TITAN && y < titanTop) titanTop = y;
    if(m === M_URANIUM && y < uranTop) uranTop = y;
  }
  t.check("earth is the bulk of the ground", (counts[M_EARTH]||0) > 20000, "earth "+(counts[M_EARTH]||0));
  t.check("caves were carved", (counts[M_TUNNEL]||0) > 1000);
  t.check("water exists", (counts[M_WATER]||0) > 300);
  t.check("lava exists", (counts[M_LAVA]||0) > 40);

  const oreNames = [];
  let missing = 0;
  for(const M of MATS){
    if(!M.dig2 || M.index === M_EARTH) continue;
    if((counts[M.index]||0) === 0){ missing++; oreNames.push(M.name+":0"); }
  }
  t.check("every ore type is present in the map", missing === 0, oreNames.join(" ") || "all present");
  t.check("titanium only occurs deep", titanTop > LH*0.55, "topmost y "+titanTop);
  t.check("uranium only occurs very deep", uranTop > LH*0.70, "topmost y "+uranTop);

  /* --- digging --- */
  const spot = findNear(g, W, M_EARTH, 30, true, 400);
  if(spot){
    const before = countSolid(W, spot.x-20, spot.y-20, 40, 40);
    W.digFreeCircle(spot.x, spot.y, 9, true);
    const after = countSolid(W, spot.x-20, spot.y-20, 40, 40);
    t.check("digging removes material", after < before-150, before+" -> "+after);
  } else t.check("found earth to dig", false);

  /* granite refuses */
  {
    let gx = -1, gy = -1;
    for(let y = LH-5; y > LH-60 && gx < 0; y--)
      for(let x = 100; x < LW-100; x += 7)
        if(W.matAt(x,y) === M_GRANITE){ gx = x; gy = y; break; }
    const res = W.digFreeCircle(gx, gy, 5, true);
    t.check("granite cannot be dug", W.matAt(gx,gy) === M_GRANITE && res.blocked === true);
  }

  /* --- unstable sand --- */
  {
    const sand = findNear(g, W, M_SAND, 8, false, 400);
    if(sand){
      W.digFreeCircle(sand.x, sand.y+14, 7, false);
      const p0 = W.counts().pxs;
      g.tick(40);
      t.check("undermined sand collapses",
              W.matAt(sand.x, sand.y) !== M_SAND || W.counts().pxs > p0);
    } else t.check("found a sand column", false);
  }

  /* --- liquids level out ---
     Carved next to the player, because that is the only ground the mass
     mover is running on. */
  {
    const cx = Math.round(g.state.cam.x);
    let ox = -1, oy = -1;
    for(let dx = 0; dx < 180 && ox < 0; dx += 10){
      for(const x of [cx - 150 - dx, cx - 150 + dx]){
        if(x < 8 || x + 110 > LW - 8) continue;
        for(let y = W.surfaceAt(x)+80; y < W.surfaceAt(x)+240; y += 11){
          if(countSolid(W, x, y, 110, 60) > 110*60*0.97){ ox = x; oy = y; break; }
        }
        if(ox >= 0) break;
      }
    }
    if(ox >= 0){
      for(let y = oy; y < oy+40; y++) for(let x = ox; x < ox+100; x++) W.setMat(x, y, M_TUNNEL);
      for(let y = oy+16; y < oy+40; y++) for(let x = ox+2; x < ox+26; x++) W.setMat(x, y, M_WATER);
      for(let y = oy; y < oy+40; y++) for(let x = ox; x < ox+100; x++)
        if(W.isFree(x,y)) W.digFreeCircle(x, y, 0, false);   /* no-op, just wakes */
      g.tick(1500);
      const tops = [];
      for(let x = ox+2; x < ox+98; x++){
        for(let y = oy; y < oy+40; y++){
          if(W.matAt(x,y) === M_WATER){ tops.push(y); break; }
        }
      }
      const lo = Math.min(...tops), hi = Math.max(...tops);
      t.check("water spreads across a cavern", tops.length > 80, tops.length+" of 96 columns");
      t.check("water surface ends up level", hi-lo <= 2, "top y "+lo+".."+hi);
    } else t.check("found a solid block for the water test", false);
  }

  /* ------------------------------------------------------- streaming --- */
  const g2 = boot(4242);
  const W2 = g2.world;

  t.check("only a slice of the map is loaded after generating",
          W2.chunkStats().resident < 80, W2.chunkStats().resident + " chunks");

  /* THE property streaming stands on: a chunk is a pure function of the
     seed and its position, so generating it is how an unchanged chunk is
     "stored" and a save can be nothing but the difference from it. If the
     order chunks happen to be generated in could change a single pixel,
     walking away and back would quietly rewrite the map.
     Generated twice in opposite orders, with an unrelated chunk in between
     each time to poison any per-column memo, and compared byte for byte. */
  {
    const blank = (cx, cy) => ({
      cx, cy, ci: cy*CW+cx, x0: cx*CHUNK, y0: cy*CHUNK,
      land: new Uint8Array(CPIX), bg: new Uint8Array(CPIX), flags: new Uint8Array(CPIX),
      tileDirty: new Uint8Array(16), lava: new Uint8Array(16),
      modified: false, can: null, ctx: null
    });
    const coords = [];
    for(let cy = 2; cy <= 9; cy++) for(let cx = 8; cx <= 15; cx++) coords.push([cx, cy]);

    const first = new Map();
    for(const [cx, cy] of coords){
      const c = blank(cx, cy); fillChunk(c);
      first.set(cx+","+cy, { land: c.land.slice(), bg: c.bg.slice() });
    }
    let differing = 0, bytes = 0;
    for(const [cx, cy] of coords.slice().reverse()){
      const junk = blank((cx*7+3) % CW, (cy*5+1) % 20); fillChunk(junk);
      const c = blank(cx, cy); fillChunk(c);
      const a = first.get(cx+","+cy);
      let bad = 0;
      for(let i = 0; i < CPIX; i++){
        if(a.land[i] !== c.land[i]) bad++;
        if(a.bg[i] !== c.bg[i]) bad++;
      }
      if(bad){ differing++; bytes += bad; }
    }
    t.check("a chunk generates identically whatever order it is generated in",
            differing === 0,
            bytes ? bytes + " bytes differ across " + differing + " chunks"
                  : (coords.length*CPIX*2) + " bytes identical over " + coords.length + " chunks");
  }

  /* The same ground has to come back identical after being thrown away,
     because regenerating it is how unchanged chunks are "stored".
     Only pixels physics cannot move are sampled: reading a pixel loads its
     chunk, a loaded chunk is a simulated chunk, and water that settles
     while the probe is resident has genuinely changed rather than come
     back wrong. A solid, stable pixel walled in by solid, stable
     neighbours is not something the mass mover or a collapse can touch. */
  {
    const stable = (x, y) => {
      for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
        const M = MATS[W2.matAt(x+dx, y+dy)];
        if(!M.solid || M.instable) return false;
      }
      return true;
    };
    const probeX = Math.min(LW-300, Math.round(g2.state.cam.x) + 1400);
    const probe = [];
    for(let k = 0; k < 900 && probe.length < 200; k++){
      const x = probeX + (k % 60) * 4;
      const y = W2.surfaceAt(x) + 60 + ((k/60)|0) * 29;
      if(stable(x, y)) probe.push({ x, y, m: W2.matAt(x, y) });
    }
    const ev0 = W2.chunkStats().evictions;
    g2.tick(220);                      /* past the eviction grace period */
    const evicted = W2.chunkStats().evictions > ev0;
    let same = 0;
    for(const p of probe) if(W2.matAt(p.x, p.y) === p.m) same++;
    t.check("ground that was unloaded is regenerated identically",
            evicted && probe.length > 100 && same === probe.length,
            same + " of " + probe.length + " pixels, " +
            (W2.chunkStats().evictions - ev0) + " chunks evicted");
  }

  /* walking 3000 px must not grow either the loaded set or the tick cost */
  {
    const startX = g2.actor.clonk.x;
    const targetX = Math.min(LW - 400, startX + 3000);
    walkTo(g2, W2, startX + 200);      /* warm up, then measure */

    const t0 = process.hrtime.bigint();
    g2.tick(60);
    const early = Number(process.hrtime.bigint() - t0) / 1e6;
    const peakEarly = W2.chunkStats().resident;

    let peak = 0;
    const stops = 8;
    for(let s = 1; s <= stops; s++){
      walkTo(g2, W2, startX + 200 + (targetX - startX - 200) * s / stops);
      peak = Math.max(peak, W2.chunkStats().resident);
    }

    const t1 = process.hrtime.bigint();
    g2.tick(60);
    const late = Number(process.hrtime.bigint() - t1) / 1e6;

    const st = W2.chunkStats();
    t.check("walking 3000 px keeps the loaded set bounded", peak < 120,
            "peak " + peak + " chunks, was " + peakEarly);
    t.check("walking 3000 px keeps memory bounded",
            st.residentBytes + st.archiveBytes < 12 * 1024 * 1024,
            ((st.residentBytes + st.archiveBytes)/1048576).toFixed(2) + " MB, " +
            st.archived + " chunks archived");
    t.check("the tick cost does not grow as the world is explored",
            late < early * 4 + 5,
            early.toFixed(2) + " ms/60t before, " + late.toFixed(2) + " after");
    t.check("chunks were evicted rather than piling up",
            st.evictions > 20 && st.resident < st.loads,
            st.loads + " loaded, " + st.evictions + " evicted");
  }

  /* a hole dug in ground that is then unloaded has to still be there */
  {
    const here = Math.round(g2.actor.clonk.x);
    const hy = W2.surfaceAt(here) + 30;
    W2.digFreeCircle(here, hy, 8, false);
    const dug = countSolid(W2, here-12, hy-12, 24, 24);
    walkTo(g2, W2, Math.max(400, here - 1200));
    walkTo(g2, W2, here);
    t.check("a dug hole survives being unloaded and reloaded",
            countSolid(W2, here-12, hy-12, 24, 24) === dug,
            dug + " solid pixels, now " + countSolid(W2, here-12, hy-12, 24, 24));
  }

  /* ------------------------------------------------ saving the terrain --- */
  {
    const g3 = boot(99887);
    const W3 = g3.world;
    const world = g3.systems.find(s => s.name === "world");
    const hx = Math.round(g3.state.cam.x), hy = W3.surfaceAt(hx) + 30;
    W3.digFreeCircle(hx, hy, 9, false);
    const dug = countSolid(W3, hx-14, hy-14, 28, 28);

    const saved = world.serialise();
    t.check("the landscape serialises the ground the player changed",
            !!saved && Array.isArray(saved.chunks) && saved.chunks.length > 0,
            saved ? saved.chunks.length + " chunks" : "nothing");
    t.check("the saved terrain is a difference, not a copy of the map",
            JSON.stringify(saved).length < 200000, JSON.stringify(saved).length + " bytes");

    W3.regenerate(99887);
    const refilled = countSolid(W3, hx-14, hy-14, 28, 28);
    t.check("regenerating from the seed fills the hole back in", refilled > dug,
            dug + " -> " + refilled);

    world.restore(saved);
    t.check("restoring puts the dug ground back",
            countSolid(W3, hx-14, hy-14, 28, 28) === dug,
            dug + " expected, got " + countSolid(W3, hx-14, hy-14, 28, 28));
  }

  return t;
}
