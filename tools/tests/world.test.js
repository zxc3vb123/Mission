/* LANE A owns this file: terrain, digging, liquids, ores, streaming. */

import { boot, suite, countSolid } from "../testkit.js";
import { MATS, M_EARTH, M_SAND, M_GRANITE, M_ROCK, M_WATER, M_LAVA,
         M_TUNNEL, M_TITAN, M_URANIUM } from "../../src/world/materials.js";
import { TOOL_IDS, TOOLS, TOOL_KINDS, hardnessOf, UNCUTTABLE } from "../../src/content/tools.js";
import { trees } from "../../src/world/scenery.js";
import { bus } from "../../src/core/bus.js";
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

  /* ---------------------------------------------------- tool tiers ---
     Depth is gated by what you are holding (docs/DECISIONS.md 2026-08-28).
     These check the shape of the ladder, not the exact numbers, so lane F
     can retune the rates without rewriting the suite. */
  {
    const hands = id => W.digSpeedFor(id, "hands");
    const shovel = id => W.digSpeedFor(id, "stone_shovel");
    const pick = id => W.digSpeedFor(id, "stone_pickaxe");

    t.check("bare hands are slow in soil but not useless",
            hands(M_EARTH) > 0 && hands(M_EARTH) < shovel(M_EARTH),
            "hands " + hands(M_EARTH) + " px/s vs shovel " + shovel(M_EARTH));
    t.check("a shovel is several times faster than hands in soil",
            shovel(M_EARTH) >= hands(M_EARTH) * 3,
            (shovel(M_EARTH)/hands(M_EARTH)).toFixed(1) + "x");
    t.check("bare hands are useless against rock, not merely slow",
            hands(M_ROCK) === 0);
    t.check("a shovel does nothing at all to rock",
            shovel(M_ROCK) === 0);
    t.check("a pickaxe is the only thing that opens rock",
            pick(M_ROCK) > 0);
    t.check("a pickaxe is unremarkable in soil",
            pick(M_EARTH) > 0 && pick(M_EARTH) < shovel(M_EARTH),
            "pickaxe " + pick(M_EARTH) + " vs shovel " + shovel(M_EARTH));
    t.check("granite is uncuttable by every tool there is",
            [null, "hands", "stone_shovel", "stone_pickaxe"]
              .every(t2 => W.digSpeedFor(M_GRANITE, t2) === 0));
    t.check("an unknown or non-digging tool falls back to bare hands",
            W.digSpeedFor(M_EARTH, "stone_axe") === hands(M_EARTH) &&
            W.digSpeedFor(M_EARTH, "no_such_tool") === hands(M_EARTH));

    /* The tier table is lane F's (src/content/tools.js) and this lane only
       reads it, so what is worth checking here is that the two files still
       agree and that the ladder they describe actually holds. */
    {
      const unknown = MATS.filter(M => M.digFree && hardnessOf(M.name) === null)
                          .map(M => M.name);
      t.check("every diggable material is named in lane F's hardness table",
              unknown.length === 0,
              unknown.join(", ") || "all " + MATS.filter(M => M.digFree).length + " resolve");
    }
    {
      const bad = [];
      for(const M of MATS){
        const tier = hardnessOf(M.name);
        if(tier === null || tier === UNCUTTABLE) continue;
        for(const id of TOOL_IDS){
          const T = TOOLS[id], speed = W.digSpeedFor(M.index, id);
          const should = tier <= T.cuts && tier <= TOOL_KINDS[T.kind].maxTier;
          if(should && speed <= 0) bad.push(id + " cannot cut " + M.name + " but should");
          if(!should && speed > 0)  bad.push(id + " cuts " + M.name + " (tier " + tier + ") above its reach");
        }
      }
      t.check("no tool ever cuts above its tier, and always cuts up to it",
              bad.length === 0, bad.join(" | ") || "ladder holds across " + TOOL_IDS.length + " tools");
    }
    {
      /* the rule the whole ladder hangs off: metallurgy makes a shovel
         faster, never deeper */
      const bad = [];
      for(const id of TOOL_IDS){
        if(TOOLS[id].kind !== "shovel") continue;
        for(const M of MATS)
          if(hardnessOf(M.name) >= 1 && W.digSpeedFor(M.index, id) > 0)
            bad.push(id + " cuts " + M.name);
      }
      t.check("no shovel cuts stone, however good the shovel gets",
              bad.length === 0, bad.join(" | ") || "every shovel stays in loose ground");
    }
    {
      /* and the deep bands are actually defended */
      const withStone = MATS.filter(M => M.digFree &&
        W.digSpeedFor(M.index, "stone_pickaxe") > 0).map(M => M.name);
      t.check("a starting pickaxe reaches iron and no further",
              withStone.includes("Iron ore") && !withStone.includes("Copper ore") &&
              !withStone.includes("Uranium ore"),
              withStone.join(", "));
      t.check("uranium needs the last tool on the ladder",
              W.digSpeedFor(M_URANIUM, "steel_pickaxe") === 0 &&
              W.digSpeedFor(M_URANIUM, "titanium_pickaxe") > 0);
    }

    /* and the gate has to live inside digging, not in the caller */
    {
      let rx = -1, ry = -1;
      const near = findNear(g, W, M_ROCK, 3, true, 500);
      if(near){ rx = near.x; ry = near.y; }
      if(rx > 0){
        /* the circle covers soil as well as rock, and the shovel is
           entitled to the soil - what it must not touch is the rock */
        const rockIn = () => {
          let n = 0;
          for(let y = ry-3; y <= ry+3; y++) for(let x = rx-3; x <= rx+3; x++)
            if((x-rx)*(x-rx)+(y-ry)*(y-ry) <= 9 && W.matAt(x,y) === M_ROCK) n++;
          return n;
        };
        const rock0 = rockIn();
        const res = W.digFreeCircle(rx, ry, 3, false, "stone_shovel");
        t.check("a shovel leaves rock exactly where it is, and reports a wall",
                rockIn() === rock0 && rock0 > 0 && res.blocked === true,
                rock0 + " rock pixels, " + rockIn() + " after, blocked " + res.blocked);
        t.check("the same rock yields to a pickaxe",
                W.digFreeCircle(rx, ry, 3, false, "stone_pickaxe").freed > 0 &&
                rockIn() < rock0, rock0 + " -> " + rockIn() + " rock pixels");
      } else t.check("found rock to swing at", false);
    }
  }

  /* ------------------------------------------------- chopping trees ---
     Wood has exactly one source, and the whole of stage 1 hangs off it, so
     the axe gate has to hold against the obvious way round it. */
  {
    const woodAt = [];
    const off = bus.on("dig:yield", e => { if(e.item === "wood") woodAt.push(e); });
    const near = () => trees.filter(t => Math.abs(t.x - g.state.cam.x) < 380 && t.fall === 0);

    const t1 = near()[0];
    if(t1){
      const swing = (tool, n) => { for(let k=0;k<n;k++) W.chopAt(t1.x, t1.y-10, 6, tool); };

      swing("hands", 360);                       /* ten seconds of it */
      t.check("bare hands cannot fell a tree, however long you swing",
              t1.fall === 0 && woodAt.length === 0, "hp " + t1.hp + " of " + t1.hpMax);
      swing("stone_shovel", 360);
      t.check("nor can a shovel: only an axe fells", t1.fall === 0 && woodAt.length === 0);
      t.check("and the world says so rather than silently doing nothing",
              W.chopAt(t1.x, t1.y-10, 6, "hands").canChop === false &&
              W.chopAt(t1.x, t1.y-10, 6, "stone_axe").canChop === true);

      t.check("swinging at thin air hits nothing",
              W.chopAt(t1.x + 400, t1.y - 10, 6, "stone_axe").hit === false);

      let ticks = 0, r = null;
      do { r = W.chopAt(t1.x, t1.y-10, 6, "stone_axe"); g.tick(1); ticks++; }
      while(!r.felled && ticks < 600);
      t.check("an axe fells a tree in a few seconds", r.felled && ticks < 400,
              (ticks/36).toFixed(1) + "s for a " + t1.h + "px tree");
      g.tick(160);
      t.check("a felled tree becomes wood on the ground", woodAt.length >= 3,
              woodAt.length + " logs");
      t.check("and the tree is gone once it is logs", !trees.includes(t1));
    } else t.check("found a tree near the player", false);

    /* the way round the gate: undermine it instead of chopping it */
    const t2 = near()[0];
    if(t2){
      const before = woodAt.length;
      W.digFreeCircle(t2.x, t2.y + 8, 10, false);
      W.digFreeCircle(t2.x, t2.y + 16, 10, false);
      let ticks = 0;
      while(t2.fall < 1 && ticks < 600){ g.tick(1); ticks++; }
      t.check("digging the ground away still topples a tree", t2.fall === 1,
              "fall " + t2.fall.toFixed(2) + " after " + ticks + " ticks");
      g.tick(120);
      t.check("but an undermined tree yields no wood, so digging is not a way past the axe",
              woodAt.length === before, (woodAt.length - before) + " logs from undermining");
      const downed = W.treeAt(t2.x, t2.y, 40);
      t.check("it lies there as a downed trunk", downed !== null && downed.standing === false);
      let n = 0;
      while(woodAt.length === before && n < 600){ W.chopAt(t2.x, t2.y, 30, "stone_axe"); n++; }
      t.check("and an axe still cuts the fallen trunk into logs",
              woodAt.length > before, (woodAt.length - before) + " logs after bucking");
    } else t.check("found a second tree", false);
    off && off();
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

  /* ------------------------------------- conservation of matter -------
     GAME_DESIGN section 2: terrain is moved, never destroyed. Digging
     already hands over an item per so many pixels; this is the other half,
     and the pair has to balance to the pixel.

     Measured inside a sealed granite room, for a reason worth writing
     down: the open map is never still. Sand is always slumping somewhere
     and loose pixels are always in flight, so counting solid pixels over a
     patch of open ground measures the whole world settling and not the
     thing under test. Walls make the sum closed. */
  {
    const rx0 = Math.round(g.state.cam.x) - 80;
    const ry0 = W.surfaceAt(rx0) + 110;
    const RW = 160, RH = 90, EARTH_TOP = 40;

    for(let y = ry0 - 6; y <= ry0 + RH + 6; y++)
      for(let x = rx0 - 6; x <= rx0 + RW + 6; x++)
        W.setMat(x, y, M_GRANITE);
    for(let y = ry0; y < ry0 + RH; y++)
      for(let x = rx0; x < rx0 + RW; x++)
        W.setMat(x, y, y < ry0 + EARTH_TOP ? M_TUNNEL : M_EARTH);
    g.tick(20);

    const room = () => countSolid(W, rx0, ry0, RW, RH);
    const yields = {};
    const off = bus.on("dig:yield", e => { yields[e.item] = (yields[e.item]||0) + 1; });

    const before = room();
    let freed = 0;
    for(let y = ry0 + EARTH_TOP + 6; y < ry0 + RH - 8; y += 5)
      for(let x = rx0 + 10; x < rx0 + 50; x += 5)
        freed += W.digFreeCircle(x, y, 5, true).freed;
    g.tick(60);
    const afterDig = room();
    t.check("digging a chamber takes real material out of the map",
            afterDig <= before - freed + 60 && freed > 800,
            before + " -> " + afterDig + ", freed " + freed);

    /* Everything that came out goes back, spread over four spouts. One
       spout would build a heap into the ceiling and the rest of the load
       would sit queued behind it - correct behaviour, and tested below,
       but not what this check is about. */
    let put = 0;
    const spouts = [40, 70, 100, 130];
    for(const id in yields){
      if(W.materialForItem(id) < 0) continue;
      let left = yields[id];
      const each = Math.ceil(left / spouts.length);
      for(const sx of spouts){
        const n = Math.min(each, left);
        if(n <= 0) break;
        put += W.dumpItem(rx0 + sx, ry0 + 4, id, n).pixels;
        left -= n;
      }
    }
    for(let k = 0; k < 80 && W.pourStats().queued > 0; k++) g.tick(40);
    g.tick(600);
    const after = room();

    /* digging only hands over an item once a whole item's worth has come
       out; the part-item left over is carried, so the map is allowed to be
       short by up to that much and no more */
    const perItem = W.pixelsPerItem(M_EARTH);
    t.check("what was dug can all be put back",
            put > 0 && freed - put < perItem + 1,
            "freed " + freed + " px, returned " + put.toFixed(1) + " px, one item is " + perItem);
    t.check("the room ends up with the ground it started with",
            before - after < perItem && after <= before,
            before + " -> " + after + " (" + (after - before) +
            " px over " + freed + " dug and " + put.toFixed(0) + " poured back; " +
            "one item is " + perItem + ")");
    t.check("nothing is left stuck in the spout", W.pourStats().queued === 0,
            W.pourStats().queued + " px still queued");
    off && off();

    /* Pour more into a sealed pocket than it can hold. The load must be
       HELD, not destroyed: material that vanishes because the heap reached
       the ceiling is exactly the leak conservation is supposed to forbid. */
    {
      const px0 = rx0 + 20, py0 = ry0 - 60;
      for(let y = py0 - 6; y <= py0 + 30; y++)
        for(let x = px0 - 6; x <= px0 + 30; x++) W.setMat(x, y, M_GRANITE);
      for(let y = py0; y < py0 + 24; y++)
        for(let x = px0; x < px0 + 24; x++) W.setMat(x, y, M_TUNNEL);
      g.tick(20);
      const pocket = () => countSolid(W, px0, py0, 24, 24);
      const start = pocket();
      const r = W.dumpMaterial(px0 + 12, py0 + 2, M_EARTH, 2000);
      for(let k = 0; k < 40; k++) g.tick(40);
      const st = W.pourStats();
      t.check("a pour with nowhere left to go holds its load instead of eating it",
              st.queued > 0 && (pocket() - start) + st.queued >= 1900,
              (pocket() - start) + " px placed, " + st.queued + " px still held of " +
              r.accepted);
      t.check("and it stops trying rather than spinning for ever",
              st.stalled > 0, st.stalled + " px reported stalled");
    }
  }

  /* a poured load behaves like loose material, not like a placed block */
  {
    const g4 = boot(31337);
    const W4 = g4.world;
    const hx = Math.round(g4.state.cam.x) + 40, hy = W4.surfaceAt(hx) - 26;
    W4.dumpMaterial(hx, hy, M_EARTH, 700);
    for(let k = 0; k < 40 && W4.pourStats().queued > 0; k++) g4.tick(60);
    g4.tick(600);
    let widest = 0, tallest = 0;
    for(let x = hx - 40; x <= hx + 40; x++){
      let col = 0;
      for(let y = hy - 30; y <= hy + 40; y++) if(W4.isSolid(x, y)) col++;
      if(col > 0) widest++;
      if(col > tallest) tallest = col;
    }
    t.check("poured earth spreads into a heap rather than a spire",
            widest > 10 && tallest < widest,
            widest + "px wide, " + tallest + "px at the peak");

    /* and dumping where there is nowhere to put it refuses, so the player
       does not lose the load */
    let sx = -1, sy = -1;
    for(let y = W4.size().H - 12; y > W4.size().H - 60 && sx < 0; y--)
      for(let x = 200; x < W4.size().W - 200; x += 13)
        if(W4.matAt(x, y) === M_GRANITE && W4.matAt(x, y-20) === M_GRANITE){ sx = x; sy = y; break; }
    if(sx > 0){
      t.check("pouring into solid ground is refused rather than swallowed",
              W4.dumpItem(sx, sy, "soil", 4).accepted === 0);
    } else t.check("found solid bedrock to try to pour into", false);
    t.check("things that are not ground cannot be poured",
            W4.materialForItem("stone_axe") === -1 &&
            W4.dumpItem(hx, hy, "stone_axe", 1).accepted === 0);
  }

  /* ----------------------------------------------- tunnels fall in ----
     Owner: "I should have to build support for my tunnels with wood if
     it's a loose ground tunnel." A wide cut through loose ground gives
     way; the same cut through stone does not; a prop holds it. */
  {
    const g5 = boot(515151);
    const W5 = g5.world;
    t.check("cave-ins are live", W5.caveStats().enabled === true);
    const bx = Math.round(g5.state.cam.x) - 100;
    const by = W5.surfaceAt(bx) + 120;

    /* a slab of one material, then a tunnel cut through it by hand */
    const cut = (fill, width) => {
      for(let y = by - 10; y <= by + 70; y++)
        for(let x = bx - 10; x <= bx + 230; x++) W5.setMat(x, y, fill);
      g5.tick(5);
      for(let x = bx + 20; x < bx + 20 + width; x += 4)
        W5.digFreeCircle(x, by + 35, 5, false);
    };
    const watch = (ticks) => {
      let warn = -1, fell = -1, n = 0, amount = 0, t = 0;
      const o1 = bus.on("cave:warning", () => { if(warn < 0) warn = t; });
      const o2 = bus.on("cave:in", e => { n++; amount += e.amount; if(fell < 0) fell = t; });
      for(t = 0; t < ticks; t++) g5.tick(1);
      o1 && o1(); o2 && o2();
      return { warn, fell, n, amount };
    };

    cut(M_EARTH, 60);
    const wide = watch(400);
    t.check("a wide tunnel through loose ground caves in",
            wide.n > 0 && wide.amount > 50,
            wide.n + " falls, " + wide.amount + " px of roof came down");
    t.check("and it warns first, with time to get out or prop it",
            wide.warn >= 0 && wide.warn < wide.fell &&
            (wide.fell - wide.warn) > 40,
            ((wide.fell - wide.warn) / 36).toFixed(1) + "s of warning");

    cut(M_EARTH, 16);
    t.check("a narrow tunnel stands up on its own", watch(400).n === 0);

    cut(M_ROCK, 60);
    t.check("the same width through stone stands up", watch(400).n === 0);

    cut(M_GRANITE, 60);
    t.check("granite never comes down", watch(200).n === 0);

    /* a prop under the span holds it */
    cut(M_EARTH, 60);
    W5.addSupport("prop1", bx + 40, by + 28, 20, 14);
    const propped = watch(400);
    t.check("a support holds the roof that would otherwise fall",
            propped.n === 0, propped.n + " falls while propped");
    W5.removeSupport("prop1");
    t.check("and taking the prop out puts it back at risk", watch(500).n > 0);

    /* a cave-in MOVES material, it does not destroy it */
    {
      for(let y = by - 10; y <= by + 70; y++)
        for(let x = bx - 10; x <= bx + 230; x++) W5.setMat(x, y, M_GRANITE);
      for(let y = by + 6; y < by + 64; y++)
        for(let x = bx + 6; x < bx + 200; x++) W5.setMat(x, y, M_EARTH);
      g5.tick(10);
      const room = () => countSolid(W5, bx + 6, by + 6, 194, 58);
      for(let x = bx + 20; x < bx + 100; x += 4) W5.digFreeCircle(x, by + 35, 5, false);
      g5.tick(20);
      const before = room();
      const ci = watch(900);
      g5.tick(600);
      t.check("a cave-in moves material rather than destroying it",
              ci.n > 0 && Math.abs(room() - before) <= 4,
              ci.amount + " px fell, room " + before + " -> " + room());
    }
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
