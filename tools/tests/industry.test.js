/* LANE D owns this file: track, wagons, and material that arrives where it
   was sent.

   THE MILESTONE THIS SUITE EXISTS TO PROVE: one loaded cart travels a rail
   and unloads into a station's input, with the ore arriving as real material
   and not teleporting. "Not teleporting" is the hard part and it is checked
   as an invariant rather than as an outcome - the total count of ore across
   the pack, the wagon, the chest, the ground and the world is measured every
   tick of the journey, and it may never move.

   A note on the ground, per docs/WORKFLOW.md: suites share one landscape, so
   everything here finds its own flat run, asserts that it found one, and
   re-checks the ground immediately before each measurement. */

import { boot, suite } from "../testkit.js";
import { makeRig, tickRig, boreIntake, pipeLengthFor,
         wellReading, pumpState } from "../../src/industry/oil.js";
import { renderWagons, renderMachines, renderRails } from "../../src/industry/render_ind.js";
import { rails } from "../../src/industry/rails.js";
import { wagons, makeWagon, clearWagons } from "../../src/industry/wagon.js";
import { STROKE_TICKS, WAGON_W, WAGON_H } from "../../src/industry/spec.js";
import { BUILDINGS } from "../../src/content/buildings.js";
import { HAULAGE } from "../../src/content/haulage.js";
import { drops } from "../../src/items/drops.js";
import { bus } from "../../src/core/bus.js";

/* THIS SUITE CUTS ITS OWN BENCH, and docs/WORKFLOW.md is why: the landscape
   is a module singleton shared by every suite, and this one measures a cart
   travelling three hundred pixels. The longest naturally level stretch on
   this seed is ninety-six, so a test that hunted for one would be measuring
   the terrain generator rather than the wagon, and would go red the day
   somebody tuned a hill.

   So: clear a box of air and lay a slab of rock under it, using only the
   published setMat, with the two material indices READ OUT OF THE WORLD
   rather than imported from lane A's tables. Then assert the bench is really
   there before anything is measured, so an obstruction fails as itself.

   Industry runs last in tools/run-tests.js, so nothing downstream inherits
   this. It is still cut well away from where the other suites work. */
function cutBench(g, x0, w, depth = 24, headroom = 48){
  const W = g.world;
  const y = W.surfaceAt(x0);
  const AIR = W.matAt(x0, y - headroom - 20);
  if(W.isSolid(x0, y - headroom - 20)) return null;

  /* THE FILL HAS TO BE STABLE GROUND, and finding that out cost a debugging
     round worth recording: the obvious sample - "something solid a long way
     down" - hit a sand bed on this seed, and a bench of sand slumps out from
     under everything standing on it a few hundred ticks later. It read as a
     workbench that never finished building, which is nothing like the cause.
     So the fill is chosen by asking the world whether it is instable. */
  let SOLID = -1;
  for(let d = 4; d <= 80; d++){
    if(!W.isSolid(x0, y + d)) continue;
    const info = W.matInfo(x0, y + d);
    if(info && !info.instable){ SOLID = W.matAt(x0, y + d); break; }
  }
  if(SOLID < 0) return null;
  for(let x = x0 - 8; x < x0 + w + 8; x++){
    for(let k = 1; k <= headroom; k++) W.setMat(x, y - k, AIR);
    for(let k = 0; k < depth; k++)     W.setMat(x, y + k, SOLID);
  }
  return { x: x0, y };
}

function benchIsSound(g, x0, w){
  for(let x = x0; x < x0 + w; x += 4){
    const y = g.world.surfaceAt(x0);
    if(!g.world.isSolid(x, y + 1)) return false;
    if(g.world.isSolid(x, y - 6)) return false;
  }
  return true;
}

function standAt(g, x, y){
  g.actor.clonk.x = x; g.actor.clonk.y = y - 10;
  g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
  g.state.player.x = x; g.state.player.y = y - 10;
}

function give(g, cost, times = 1){
  g.items.inventory.setCapacity(999999);
  for(const id in cost) g.items.inventory.add(id, cost[id] * times);
}

/* How many of `id` exist anywhere the player could get at: the pack, the
   ground, every container, and every wagon. This is the conservation meter. */
function totalOf(g, id, IND, B){
  let n = g.items.inventory.count(id);
  for(const d of drops) if(d.id === id) n += (d.n || 1);
  for(const s of B.all()) if(s.store) n += (s.store.items[id] || 0);
  for(const w of IND.wagons()) n += (w.store.items[id] || 0);
  return n;
}

/* ---------------------------------------------------------------- oil ----- */

/* CONSERVATION IS MEASURED IN A SEALED RESERVOIR, and the reason is a
   debugging round worth keeping.

   The first version of this sank wells into the oil the generator laid down.
   Those pools have never run: the moment a chunk loads they obey the law
   that liquids find their level, and they drain, spread and creep into the
   cave system around them. A pool measured 304 px in a box and 7 px in the
   same box two thousand ticks later WITH NO PUMP ANYWHERE NEAR IT. Widening
   the box did not fix it - it caught oil flowing IN as well as out, and the
   count went further wrong in the other direction.

   That is lane A's warning about loose pixels ("clear them or you measure
   sand slumping and call it throughput") one level up and about liquids. A
   box drawn round a pool that is connected to a cave system can never be an
   exact ledger, however big it is.

   So the conservation law is measured the way a law should be: in a
   controlled vessel. Carve a cavity in solid stable rock, pour a known
   quantity of crude in through lane A's own pourLiquid, let it settle, and
   sink the bore to just short of the roof - the pipe reaches 12 px, so it
   draws without ever opening the pocket. Nothing can enter and nothing can
   leave except through the pump, and the ledger closes to the pixel.

   The natural pools are still used, for the two questions a sealed vessel
   cannot answer: does the world actually contain oil a bore can reach, and
   does a rig behave the same far from the player as beside them. */

function oilIndex(g){
  const W = g.world, { W: LW, H: LH } = W.size();
  for(let x = 400; x < LW - 400; x += 64)
    for(let y = Math.round(LH * 0.60); y < LH - 300; y += 6)
      if(W.matInfo(x, y).name === "Oil") return W.matAt(x, y);
  return -1;
}

/* Somewhere deep, solid, stable, and with nothing else in it. */
function sealedSite(g, fromX, toX, fromY, toY){
  const W = g.world;
  for(let x = fromX; x < toX; x += 97){
    for(let y = fromY || 1200; y < (toY || 1500); y += 37){
      let ok = true;
      for(let dy = -70; dy <= 100 && ok; dy += 5){
        for(let dx = -60; dx <= 60; dx += 5){
          const m = W.matInfo(x + dx, y + dy);
          if(!W.isSolid(x + dx, y + dy) || m.instable || m.isLiq || m.liquid){ ok = false; break; }
        }
      }
      if(ok) return { x, y };
    }
  }
  return null;
}

/* Carve the vessel, fill it, seal it, and sink a bore to just above it. */
function sealedWell(g, site, OIL, amount, rigH, halfW){
  const W = g.world;
  const AIR = W.matAt(site.x, 4);
  /* A SHALLOW, WIDE VESSEL, so a nearly full charge stands close under the
     roof. Lane A's intake reaches a fixed 12 px and never walks the body -
     that is what makes a pump cost the same in an ocean as in a puddle - so
     a deep narrow pocket would leave the oil surface out of the pipe's reach
     and the rig would report a dry well while standing on a full one. Which
     is correct behaviour and a useless fixture. */
  const hw = halfW === undefined ? 20 : halfW;
  for(let x = site.x - hw; x <= site.x + hw; x++)
    for(let y = site.y; y <= site.y + 13; y++) W.setMat(x, y, AIR);
  W.pourLiquid(site.x, site.y + 2, OIL, amount);
  /* the shaft stops 3 px short of the roof: the pipe reaches, the pocket
     stays shut. Deep, so a hand pump's short string genuinely cannot. */
  const bottom = site.y - 3, top = bottom - 80;
  for(let x = site.x - 3; x <= site.x + 3; x++)
    for(let y = top; y <= bottom; y++) W.setMat(x, y, AIR);
  return { rig: makeRig(site.x - 9, top - rigH, 18, rigH, {}), site, OIL };
}

function oilIn(g, well, r){
  let n = 0;
  for(let y = well.site.y - 60; y <= well.site.y + 60; y++)
    for(let x = well.site.x - (r||60); x <= well.site.x + (r||60); x++)
      if(g.world.matAt(x, y) === well.OIL) n++;
  return n;
}

function park(g, x, y){
  g.state.player.x = x; g.state.player.y = y;
  g.actor.clonk.x = x; g.actor.clonk.y = y;
}

function freshPump(){
  return { stroke:0, pixels:0, lifted:0, owed:0, intake:null, dry:false, jammed:false };
}

/* --------------------------------------------------------------- art ----- */

/* A canvas that records instead of drawing.

   LANE C'S CHECK, MADE MECHANICAL. They found two pieces of art sitting
   outside their own footprint by drawing the collision rectangle over the
   drawing in red and looking at it, and passed the technique on. Looking is
   what finds a defect the first time; this is so it cannot come back.

   It matters more here than anywhere else in the game, because the actor now
   STANDS on structures: art that is proud of the box puts the player on air,
   and art that falls short blocks them on nothing. The owner has already
   reported falling through planks three times. And this lane has the one
   machine that MOVES, so the beam is checked right through its stroke rather
   than at rest. */
function recorder(){
  const rects = [];
  const ctx = {
    fillStyle: "#000", globalAlpha: 1,
    save(){}, restore(){}, translate(){},
    beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, closePath(){}, fill(){}, arc(){},
    fillRect(x, y, w, h){
      w = Math.round(w); h = Math.round(h);
      if(w <= 0 || h <= 0) return;
      rects.push({ x: Math.round(x), y: Math.round(y), w, h });
    }
  };
  return { ctx, rects };
}

/* How far outside a box the drawing strayed, on each side. */
function overflow(rects, box){
  const o = { left:0, right:0, top:0, bottom:0, n:0 };
  for(const r of rects){
    const l = box.x - r.x, t = box.y - r.y;
    const ri = (r.x + r.w) - (box.x + box.w), b = (r.y + r.h) - (box.y + box.h);
    if(l > o.left) o.left = l;
    if(t > o.top) o.top = t;
    if(ri > o.right) o.right = ri;
    if(b > o.bottom) o.bottom = b;
    if(l > 0 || t > 0 || ri > 0 || b > 0) o.n++;
  }
  return o;
}
/* `worst` is taken by a local in run(), and a module function shadowed by
   a let inside the only function that calls it is a confusing half hour. */
function worstSide(o){ return Math.max(o.left, o.right, o.top, o.bottom); }

export function run(){
  const t = suite("industry");
  const g = boot(20260828);
  /* testkit.js is lane E's and hands out world/items/actor only, so the two
     other lanes' apis come off the system list rather than by editing it. */
  const IND = g.systems.find(s => s.name === "industry").api;
  const B   = g.systems.find(s => s.name === "build").api;

  t.check("the industry api is published",
          !!IND && typeof IND.layRail === "function");
  t.check("nothing is laid in a fresh world",
          IND.rails().length === 0 && IND.wagons().length === 0);

  /* --------------------------------------------------- lane F owns the rung */
  t.check("the wagon's capacity comes from lane F's ladder, not from here",
          IND.wagonStore(IND.wagons()[0]) === null &&
          HAULAGE.mine_wagon.capacity === 1500, HAULAGE.mine_wagon.capacity);
  t.check("a wagon is worth building: it is a real multiple of a backpack",
          HAULAGE.mine_wagon.capacity / HAULAGE.backpack.capacity > 10,
          Math.round(HAULAGE.mine_wagon.capacity / HAULAGE.backpack.capacity) + "x");

  /* ------------------------------------------------------------ laying ---- */
  const BENCH_X = 1600, BENCH_W = 420;
  const run1 = cutBench(g, BENCH_X, BENCH_W);
  t.check("cut a bench to lay track on", run1 !== null,
          run1 ? "x = " + run1.x + ", y = " + run1.y : "no clean sample column");
  if(!run1) return t;
  g.tick(4);
  t.check("the bench is solid under and clear above, before anything is measured",
          benchIsSound(g, BENCH_X, BENCH_W));
  standAt(g, run1.x, run1.y);

  {
    g.items.inventory.reset();
    const v = IND.canLayRail(run1.x + 10, run1.y - 8);
    t.check("you cannot lay track you have no steel for",
            v.ok === false && v.reason === "missing materials", v.reason);
    t.check("and it says exactly what is missing",
            Array.isArray(v.missing) && v.missing.length > 0 &&
            v.missing.every(m => m.id && m.need > 0), JSON.stringify(v.missing));
  }

  give(g, { steel_bar: 40, plank: 40, wood: 40 });

  {
    const v = IND.canLayRail(run1.x + 600, run1.y - 8);
    t.check("you cannot lay track from across the map",
            v.ok === false && v.reason === "too far away", v.reason);
  }

  {
    const before = g.items.inventory.count("steel_bar");
    const r = IND.layRail(run1.x + 12, run1.y - 8);
    t.check("a rail lays on the ground under the cursor", r.ok === true, r.reason);
    t.check("and it costs the steel out of the pack",
            g.items.inventory.count("steel_bar") === before - 1);
    t.check("it rests on the ground rather than floating",
            r.ok && g.world.isSolid(r.rail.x + 12, r.rail.y + 5), r.ok ? r.rail.y : "");
    const again = IND.canLayRail(r.rail.x + 12, run1.y - 8);
    t.check("and you cannot lay a second one on top of it",
            again.ok === false && again.reason === "there is track there already",
            again.reason);
  }

  /* The rest of the line, laid the way a player lays it: walk a step, put a
     length down, walk another. Every one of these goes through the same
     reach-checked verdict as the single lay above. */
  let walked = 0;
  for(let x = run1.x + 24; x < run1.x + 360; x += 24){
    standAt(g, x, run1.y);
    if(IND.layRail(x + 12, run1.y - 8).ok) walked++;
  }
  t.check("a whole line lays a length at a time as the player walks it",
          walked >= 12, walked + " lengths");

  /* and layRun does the same in one call, for a testbed or a drag */
  standAt(g, run1.x, run1.y);
  const laid = IND.layRun(run1.x + 360, run1.x + 384,
                          { anywhere: true, y: run1.y - 8 });
  t.check("layRun extends a line in one call", laid.laid.length >= 2,
          laid.laid.length + " lengths, stopped by " + laid.stoppedBy);
  t.check("the run is continuous: every column between the ends has track",
          (() => {
            const xs = IND.rails().map(r => r.x).sort((a,b) => a-b);
            for(let i = 1; i < xs.length; i++) if(xs[i] - xs[i-1] > 26) return false;
            return xs.length > 10;
          })());

  const railL = Math.min(...IND.rails().map(r => r.x));
  const railR = Math.max(...IND.rails().map(r => r.x + r.w));

  /* ----------------------------------------------------------- the wagon -- */
  standAt(g, railL + 30, run1.y);
  {
    g.items.inventory.take("steel_bar", g.items.inventory.count("steel_bar"));
    const v = IND.canBuildWagon(railL + 30, run1.y - 8);
    t.check("a wagon needs materials too",
            v.ok === false && v.reason === "missing materials", v.reason);
  }
  give(g, { steel_bar: 20 });

  const built = IND.buildWagon(railL + 30, run1.y - 8);
  t.check("a wagon is built on the track", built.ok === true, built.reason);
  const W1 = built.wagon;
  t.check("it sits ON the rail, not in the ground",
          !!W1 && IND.railTopAt(Math.round(W1.x), W1.y + W1.h) === W1.y + W1.h,
          W1 ? W1.y : "");
  {
    const off = IND.canBuildWagon(railL + 30 + 4000, run1.y - 8);
    t.check("a wagon cannot be built where there is no track",
            off.ok === false && off.reason === "needs track to stand on", off.reason);
  }

  /* --------------------------------------------------------- the load ----- */
  if(!W1) return t;
  const store = IND.wagonStore(W1);
  t.check("a wagon speaks the same vocabulary as a chest and a backpack",
          store && ["add","take","fits","mass","free","count","all","capacity"]
            .every(k => typeof store[k] === "function"));
  t.check("and it holds lane F's rung, not a number invented here",
          store.capacity() === HAULAGE.mine_wagon.capacity);

  /* A chest holds 200 kg and a wagon fifteen hundred, so a wagon-load is
     seven chests - which is a real fact about this ladder and not something
     to hide. The cart is given a chest's worth for the journey. */
  g.items.inventory.clear();
  give(g, { iron_ore: 20 });
  const loaded = IND.loadFromPack(W1);
  t.check("loading moves ore out of the pack and into the wagon",
          loaded === 20 && store.count("iron_ore") === 20 &&
          g.items.inventory.count("iron_ore") === 0,
          loaded + " ore, " + Math.round(store.mass()) + " kg");
  t.check("a wagon will not take more than its capacity",
          store.mass() <= store.capacity() + 1e-6,
          Math.round(store.mass()) + " / " + store.capacity());

  /* pushing has no key: you lean on the cart by walking into it */
  {
    const before = W1.v;
    for(let i = 0; i < 8; i++){
      g.state.player.x = g.actor.clonk.x = W1.x - 30 + i * 2.2;
      g.state.player.y = g.actor.clonk.y = W1.y + W1.h/2;
      g.tick(1);
    }
    t.check("walking into a cart pushes it, with no key to press",
            W1.v > before && W1.v > 0, "v = " + W1.v.toFixed(3));
    W1.v = 0;
    W1.x = railL + 30;
  }

  /* ------------------------------------------- the station at the far end -- */
  /* A chest is built at a workbench, so both go up - and using the real
     place() path is the point: the cart must deliver into a container lane C
     made, through lane C's own storageAt(), or nothing is proved. */
  const dockX = railR - 30;
  standAt(g, dockX, run1.y);
  give(g, BUILDINGS.workbench.materials);
  const wb = B.place("workbench", dockX - 26, run1.y - 6);
  t.check("a workbench goes up beside the far end of the line", wb.ok === true, wb.reason);
  g.tick(BUILDINGS.workbench.time * 36 + 4);
  t.check("the workbench finished, so a chest may be built at it",
          wb.ok && wb.structure.built === true);

  standAt(g, dockX, run1.y);
  give(g, BUILDINGS.chest.materials);
  const chest = B.place("chest", dockX, run1.y - 6);
  t.check("and a chest at the railhead", chest.ok === true, chest.reason);
  if(!chest.ok) return t;
  g.tick(BUILDINGS.chest.time * 36 + 4);
  t.check("the chest is finished and is a container",
          chest.ok && chest.structure.built === true &&
          !!B.storageAt(chest.structure.x + 2, chest.structure.y + 2));

  /* ------------------------------------------------ THE MILESTONE JOURNEY -- */
  /* Ore in the wagon, at the near end. The player walks alongside pushing it,
     which is what pushing a cart is; nothing here reaches into the wagon. */
  const startX = W1.x;
  const carried = store.count("iron_ore");
  t.check("the cart starts loaded at the near end of the line",
          carried > 0 && Math.abs(startX - (railL + 30)) < 40,
          carried + " ore at x=" + Math.round(startX));

  const total0 = totalOf(g, "iron_ore", IND, B);
  let conserved = true, worst = null, sawMoving = false;
  let unloadedEvent = 0;
  const offUnload = bus.on("wagon:unloaded", e => { unloadedEvent += e.moved; });

  for(let i = 0; i < 4000; i++){
    /* the player walks with the cart while there is cart to walk with */
    if(W1.x < dockX - 40){
      g.state.player.x = W1.x - 12;
      g.state.player.y = W1.y + W1.h/2;
      g.actor.clonk.x = g.state.player.x;
      g.actor.clonk.y = g.state.player.y;
      IND.shove(W1, 1);
    }
    g.tick(1);
    if(Math.abs(W1.v) > 0.2) sawMoving = true;
    const now = totalOf(g, "iron_ore", IND, B);
    if(now !== total0){ conserved = false; worst = worst === null ? now : worst; }
    if(store.count("iron_ore") === 0) break;
  }
  offUnload();

  const chestStore = B.storageAt(chest.structure.x + 2, chest.structure.y + 2);
  t.check("the cart actually travelled", W1.x > startX + 150,
          Math.round(startX) + " -> " + Math.round(W1.x));
  t.check("it was rolling on the way, not stepping", sawMoving === true);
  t.check("it did not come off the rails", W1.derailed === false);
  t.check("THE MILESTONE: the ore arrived in the chest at the far end",
          chestStore && chestStore.count("iron_ore") === carried,
          (chestStore ? chestStore.count("iron_ore") : "no chest") + " of " + carried);
  t.check("and the wagon is empty afterwards", store.count("iron_ore") === 0);
  t.check("NOT TELEPORTED: every ore existed in exactly one place, every tick",
          conserved === true,
          conserved ? total0 + " throughout" : "went " + total0 + " -> " + worst);
  t.check("unloading was announced as it happened, a few kilos at a time",
          unloadedEvent === carried, unloadedEvent + " announced");

  /* --------------------------------------------------------- derailment --- */
  /* The ground going from under the track is a feature. It should read as a
     derailment: the wagon stops where it stands and keeps its load. */
  {
    standAt(g, railL + 30, run1.y);
    give(g, { steel_bar: 20, plank: 20, wood: 20 });
    const w2 = IND.buildWagon(railL + 40, run1.y - 8);
    t.check("a second wagon for the derailment check", w2.ok === true, w2.reason);
    const W2 = w2.wagon;
    if(!W2) return t;
    const s2 = IND.wagonStore(W2);
    give(g, { iron_ore: 10 });
    IND.loadFromPack(W2);
    const held = s2.count("iron_ore");
    t.check("it is carrying something to lose", held > 0, held);

    /* dig the ballast out from under a length ahead of it */
    const victim = IND.rails()
      .filter(r => r.x > W2.x + 30 && r.x < W2.x + 120)
      .sort((a,b) => a.x - b.x)[0];
    t.check("found a length of track ahead of the wagon", !!victim);
    if(victim){
      const railsBefore = IND.rails().length;
      for(let k = 0; k < victim.w; k += 3)
        g.world.digFreeCircle(victim.x + k, victim.y + 8, 7, false);
      g.tick(BALLAST_SETTLE);
      t.check("track with no ground under it falls in",
              IND.rails().length < railsBefore,
              railsBefore + " -> " + IND.rails().length);
      t.check("and the steel comes back rather than vanishing",
              drops.some(d => d.id === "steel_bar"));

      /* now roll the wagon at the gap */
      IND.shove(W2, 1);
      for(let i = 0; i < 900 && !W2.derailed; i++){
        g.state.player.x = W2.x - 12; g.state.player.y = W2.y + W2.h/2;
        IND.shove(W2, 1);
        g.tick(1);
      }
      t.check("a wagon that runs out of track comes off it", W2.derailed === true,
              "at x=" + Math.round(W2.x));
      t.check("a derailment is not a crash: the load is still in the wagon",
              s2.count("iron_ore") === held, s2.count("iron_ore") + " of " + held);
      t.check("and a derailed wagon does not keep moving",
              (() => { const x = W2.x; g.tick(20); return Math.abs(W2.x - x) < 0.001; })());
      t.check("it cannot be re-railed where there is no track",
              IND.rerail(W2) === false);
    }
  }

  /* ------------------------------------------------------------ tipping --- */
  /* Conservation the other way: a wagon of spoil tipped out has to become
     landscape again, through lane A's pour. */
  {
    const w3 = IND.wagons().find(w => !w.derailed && w.x < railR - 100) ||
               IND.wagons()[0];
    if(w3 && !w3.derailed){
      const s3 = IND.wagonStore(w3);
      standAt(g, w3.x, run1.y);
      give(g, { soil: 12 });
      IND.loadFromPack(w3);
      const soil = s3.count("soil");
      t.check("a wagon can be filled with spoil", soil > 0, soil);
      w3.brake = true;
      g.tick(30);
      IND.tip(w3);
      g.tick(600);
      t.check("tipping empties the wagon", s3.count("soil") < soil,
              s3.count("soil") + " left of " + soil);
      t.check("and the soil went into the world, not into nothing",
              g.items.inventory.count("soil") === 0 &&
              !drops.some(d => d.id === "soil"),
              "pack " + g.items.inventory.count("soil"));
      w3.brake = false;
    }
  }

  /* ---------------------------------------------------- taking track up --- */
  {
    const before = IND.rails().length;
    const r = IND.rails().find(x => !IND.wagonAt(x.x + 12, x.y, 24));
    if(r){
      const got = IND.takeUpRail(r.x + 12, r.y);
      t.check("track can be taken up again", IND.rails().length === before - 1);
      t.check("and it gives back what it was made of",
              !!got && got.steel_bar === 1 && got.plank === 1, JSON.stringify(got));
    }
  }

  /* ------------------------------------------------------------- saving --- */
  {
    const sys = g.systems.find(s => s.name === "industry");
    const snap = JSON.parse(JSON.stringify(sys.serialise()));
    const railCount = IND.rails().length, wagonCount = IND.wagons().length;
    const loadNow = IND.wagons().map(w => Object.assign({}, w.store.items));
    sys.restore(snap);
    t.check("track and wagons survive a save and a load",
            IND.rails().length === railCount && IND.wagons().length === wagonCount,
            railCount + " rails, " + wagonCount + " wagons");
    t.check("and so does what the wagons were carrying",
            JSON.stringify(IND.wagons().map(w => w.store.items)) ===
            JSON.stringify(loadNow));
  }


  /* ============================================================== OIL ===== */
  /* The owner's ask: a timber derrick, a walking beam, a pump and barrels.
     Lane A's liquids landed on main and lane F named both structures, so all
     this lane provides is what makes the pair work - a bore, a stroke, and
     oil arriving in the derrick's own tank.

     EXTRACTION IS NOT A RECIPE, and that is what these checks are really
     about. Lane F and I found a live matter printer between our two lanes: a
     no-input recipe at an unattended station produced four measures a minute
     out of a dry hillside, because crafting has no way to ask whether there
     is anything underneath. Nothing below can pass without oil leaving the
     ground. */

  {
    g.world.clearLoose();
    const OIL = oilIndex(g);
    t.check("the world contains crude oil to pump", OIL >= 0, "matIndex " + OIL);

    const siteA = sealedSite(g, 900, 1600);
    const siteB = sealedSite(g, 3000, 3700);
    t.check("cut two sealed reservoirs, far apart, to measure in",
            !!siteA && !!siteB && Math.abs(siteA.x - siteB.x) > 1500,
            siteA && siteB ? Math.round(Math.abs(siteA.x - siteB.x)) + " px apart" : "none");

    if(OIL >= 0 && siteA && siteB){
      const wellN = sealedWell(g, siteA, OIL, 450, 48);
      const wellF = sealedWell(g, siteB, OIL, 450, 48);
      /* let the pour arrive and find its level in both vessels */
      park(g, siteA.x, siteA.y - 80); g.tick(700);
      park(g, siteB.x, siteB.y - 80); g.tick(700);

      const heldN = oilIn(g, wellN), heldF = oilIn(g, wellF);
      t.check("both vessels hold their charge and are at rest",
              heldN > 250 && heldF > 250 &&
              heldN === oilIn(g, wellN) && heldF === oilIn(g, wellF),
              heldN + " and " + heldF + " px");

      const rigN = wellN.rig, rigF = wellF.rig;
      const stN = freshPump(), stF = freshPump();

      /* ------------------------------------------------------- the bore -- */
      const boreN = boreIntake(g.world, rigN, pipeLengthFor(rigN));
      t.check("a rig finds the bottom of the shaft under it",
              !!boreN && boreN.depth >= 24, boreN ? "depth " + boreN.depth : "no bore");

      const flatX = siteA.x + 700;
      const onFlat = makeRig(flatX, g.world.surfaceAt(flatX) - 48, 18, 48, {});
      t.check("A BORE IS A HOLE, NOT A DIP: undug ground is not a well",
              boreIntake(g.world, onFlat, pipeLengthFor(onFlat)) === null);

      /* the tower is what hangs a long pipe: that is what it is FOR */
      const handRig = makeRig(rigN.x, rigN.y, rigN.w, rigN.h,
                              { derrick:false, defId:"hand_pump" });
      const handBore = boreIntake(g.world, handRig, pipeLengthFor(handRig));
      t.check("a hand-rigged pump cannot reach the bottom of a deep shaft",
              pipeLengthFor(handRig) < pipeLengthFor(rigN) &&
              (!handBore || handBore.depth < boreN.depth),
              pipeLengthFor(handRig) + " px of pipe against " + pipeLengthFor(rigN));

      /* ------------------------------------------------------ the stroke -- */
      let raised = 0;
      const offRaise = bus.on("rig:raised", () => { raised++; });

      const RUN = 108 * 20;                      /* twenty strokes' worth */
      for(let i = 0; i < RUN; i++){
        /* the player stands at the near well; the far one is abandoned */
        park(g, rigN.x, rigN.y);
        tickRig(g.world, rigN, stN, g.items.itemDef);
        tickRig(g.world, rigF, stF, g.items.itemDef);
        g.tick(1);
      }
      offRaise();

      t.check("the well by the player produced oil",
              stN.lifted > 0 && (rigN.store.items.crude_oil || 0) > 0,
              stN.lifted + " px, " + (rigN.store.items.crude_oil||0) + " measures");

      /* THE CONSTRAINT LANE E NAMED: distance may change how a machine is
         computed, never what it produces. Both rigs run in the same ticks,
         one beside the player and one two thousand pixels away. */
      t.check("A WELL TWO THOUSAND PIXELS AWAY LIFTS EXACTLY AS MUCH",
              stF.lifted === stN.lifted,
              "near " + stN.lifted + " px, far " + stF.lifted + " px");
      t.check("and it filled its tank the same way",
              (rigF.store.items.crude_oil||0) === (rigN.store.items.crude_oil||0),
              (rigN.store.items.crude_oil||0) + " measures each");

      /* -------------------------------------------------- conservation --- */
      t.check("THE OIL A RIG RAISED CAME OUT OF THE GROUND, PIXEL FOR PIXEL",
              heldN - oilIn(g, wellN) === stN.lifted &&
              heldF - oilIn(g, wellF) === stF.lifted,
              "near " + (heldN - oilIn(g, wellN)) + "/" + stN.lifted +
              ", far " + (heldF - oilIn(g, wellF)) + "/" + stF.lifted);
      t.check("every measure raised was announced",
              raised === (rigN.store.items.crude_oil||0) +
                         (rigF.store.items.crude_oil||0), raised + " announced");
      t.check("part-measures stay as oil on the rig rather than rounding away",
              stN.lifted === (rigN.store.items.crude_oil||0) * 60 + stN.pixels,
              stN.lifted + " = " + (rigN.store.items.crude_oil||0) + " x 60 + " + stN.pixels);

      /* ---------------------------------------------------------- gates --- */
      {
        const st = freshPump();
        let why = null;
        const off = bus.on("rig:idle", e => { why = e.why; });
        const before = stN.lifted;
        for(let i = 0; i < 108 * 3; i++){
          tickRig(g.world, rigN, st, g.items.itemDef, false);   /* no beam */
          g.tick(1);
        }
        off();
        t.check("a derrick with no walking beam sinks the bore and cannot work it",
                st.lifted === 0 && why === "no walking beam", why);
      }
      {
        const rig = makeRig(flatX, g.world.surfaceAt(flatX) - 48, 18, 48, {});
        const st = freshPump();
        let why = null;
        const off = bus.on("rig:idle", e => { why = e.why; });
        for(let i = 0; i < 108 * 3; i++){ tickRig(g.world, rig, st, g.items.itemDef); g.tick(1); }
        off();
        t.check("A DERRICK WITH NO WELL UNDER IT PRODUCES NOTHING",
                st.lifted === 0 && (rig.store.items.crude_oil||0) === 0 &&
                why === "no shaft under it", why);
      }

      /* ----------------------------------------------------------- jams --- */
      {
        const rig = makeRig(rigN.x, rigN.y, rigN.w, rigN.h, {});
        rig.store.cap = g.items.itemDef("crude_oil").mass * 1.5;   /* one measure */
        const st = freshPump();
        let jam = null;
        const off = bus.on("rig:jammed", e => { jam = e.why; });
        park(g, rig.x, rig.y);
        for(let i = 0; i < 108 * 40; i++){ tickRig(g.world, rig, st, g.items.itemDef); g.tick(1); }
        off();
        t.check("a full rig jams rather than overflowing",
                jam === "full" && (rig.store.items.crude_oil||0) === 1,
                (rig.store.items.crude_oil||0) + " measures, jam " + jam);
        t.check("and a jammed rig stops taking oil out of the ground",
                st.lifted <= 60 + 4, st.lifted + " px lifted");
      }

      /* ------------------------------------------------------ a dry well -- */
      /* A small charge in its own vessel, so it runs out in a bounded time
         and "dry" means the pocket is genuinely empty. */
      {
        const siteC = sealedSite(g, 1200, 3900, 1550, 2000);
        t.check("a third vessel for the dry-well check", !!siteC);
        if(siteC){
          /* narrow, so a small charge still stands deep enough for the pipe to
             reach it - a wide puddle would report dry while genuinely full, which
             is correct behaviour and a useless fixture */
          const wellC = sealedWell(g, siteC, OIL, 90, 48, 4);
          park(g, siteC.x, siteC.y - 80); g.tick(500);
          const charge = oilIn(g, wellC);
          const rig = wellC.rig, st = freshPump();
          rig.store.cap = 999999;
          let dried = null;
          const off = bus.on("well:dry", e => { dried = e; });
          for(let i = 0; i < 108 * 60 && !dried; i++){
            park(g, rig.x, rig.y);
            tickRig(g.world, rig, st, g.items.itemDef);
            g.tick(1);
          }
          off();
          t.check("a well that has been pumped out says so",
                  !!dried && st.dry === true,
                  dried ? "after " + dried.lifted + " of " + charge + " px" : "never ran dry");
          const was = st.lifted;
          for(let i = 0; i < 108 * 4; i++){ tickRig(g.world, rig, st, g.items.itemDef); g.tick(1); }
          t.check("and it raises nothing after that", st.lifted === was,
                  was + " -> " + st.lifted);
          t.check("dry because the ground is empty, not because a counter said so",
                  wellReading(g.world, rig).reachable === 0,
                  wellReading(g.world, rig).reachable + " px still in reach");
          t.check("and everything the vessel held is accounted for",
                  charge - oilIn(g, wellC) === st.lifted,
                  (charge - oilIn(g, wellC)) + " gone, " + st.lifted + " raised");
        }
      }
    }
  }

  /* ================================ CAN A PLAYER ACTUALLY REACH THIS? ===== */
  /* The mechanism above is proved against a rig this file built. That is not
     the same question as whether the game contains a way to get one, and
     docs/WORKFLOW.md 4c is a list of three times this project shipped a
     finished capability nobody could touch. So: build the real chain out of
     lane F's entries through lane C's place(), sink a real bore, and see
     whether crude turns up in the derrick's own tank.

     THE ASYMMETRY IS DELIBERATE, and it is docs/WORKFLOW.md 5a's rule. If
     placement succeeds and the oil does not arrive, that is my bug and this
     goes red. If placement is REFUSED, that is a number in another lane's
     table and it reports rather than failing - reddening main over somebody
     else's pending edit is how lanes start ignoring each other's checks. */
  {
    const W = g.world;
    const { W: LW } = W.size();
    /* Its own bench, for the reason the rail section cuts one: the longest
       naturally level stretch on this seed is under a hundred pixels, and an
       oil field is a workbench, a forge, a derrick and a beam standing in a
       row. Cut well clear of the railway above. */
    const FIELD_X = 2600, FIELD_W = 240;
    const site = cutBench(g, FIELD_X, FIELD_W);
    t.check("cut ground to raise an oil field on", !!site, site ? "x = " + site.x : "none");
    t.check("and the bench is sound before anything is built on it",
            !!site && benchIsSound(g, FIELD_X, FIELD_W));

    if(site){
      const inv = g.items.inventory;
      inv.setCapacity(999999);
      const stand = x => {
        g.state.player.x = x; g.state.player.y = site.y - 10;
        g.actor.clonk.x = x; g.actor.clonk.y = site.y - 10;
      };
      const give = defId => {
        const m = BUILDINGS[defId].materials;
        for(const id in m) inv.add(id, m[id]);
      };

      /* The layout is not decoration: a derrick is built AT a workbench and
         a beam AT a forge, both within lane C's 40 px station radius, and the
         beam has to end up within BEAM_REACH of the derrick. Everything has
         to be in reach of everything, which is what an oil field looks like. */
      stand(site.x + 20);
      give("workbench");
      const wb = B.place("workbench", site.x + 20, site.y - 6);
      g.tick(BUILDINGS.workbench.time * 36 + 4);
      t.check("a workbench, to build a derrick at", wb.ok && wb.structure.built, wb.reason);

      /* the beam is forged, so the forge has to exist first */
      give("forge");
      stand(site.x + 58);
      const fg = B.place("forge", site.x + 125, site.y - 6);
      g.tick(BUILDINGS.forge.time * 36 + 4);
      t.check("a forge, to build a walking beam at", fg.ok && fg.structure.built, fg.reason);

      /* SINK THE BORE. This is the player digging, and it is what makes the
         spot a well rather than a patch of ground. */
      const AIR = W.matAt(site.x, 4);
      const boreX = site.x + 60;
      for(let x = boreX - 3; x <= boreX + 3; x++)
        for(let y = site.y; y < site.y + 100; y++) W.setMat(x, y, AIR);

      /* AND STRIKE OIL. The real pockets are a thousand pixels further down
         than a test wants to dig, so the crude is poured into the bottom of
         the bore through lane A's own pourLiquid - which is also what
         actually happens when a well is drilled into a pocket: the bore
         fills. Everything from here is the ordinary machine on ordinary
         liquid, with nothing standing in for anything. */
      const FIELD_OIL = oilIndex(g);
      W.pourLiquid(boreX, site.y + 90, FIELD_OIL, 300);
      g.tick(600);
      t.check("the bore struck oil",
              W.liquidAt(boreX, site.y + 96) !== null,
              JSON.stringify(W.liquidAt(boreX, site.y + 96)));

      stand(site.x + 44);
      give("derrick");
      const verdict = B.canPlace("derrick", boreX, site.y - 6);

      if(!verdict.ok){
        /* Reported, not failed - see the note above. The number is lane F's
           and the request is in docs/REQUESTS.md. */
        const need = (BUILDINGS.derrick.support || {}).ground;
        t.check("REPORT: a derrick cannot yet stand over its own bore, and it " +
                "is one number in lane F's table",
                verdict.reason === "needs solid ground under it",
                "support.ground is " + need + "; an 18 px footprint over a 7 px " +
                "bore is 0.61 solid, so it is refused: " + verdict.reason);
      } else {
        const dk = B.place("derrick", boreX, site.y - 6);
        t.check("a derrick goes up over the bore", dk.ok, dk.reason);

        give("walking_beam");
        stand(site.x + 100);
        const bm = B.place("walking_beam", site.x + 92, site.y - 6);
        t.check("and a walking beam beside it", bm.ok, bm.reason);
        g.tick(BUILDINGS.derrick.time * 36 + 4);

        if(dk.ok && bm.ok){
          t.check("both stand finished", dk.structure.built && bm.structure.built);
          const well = IND.wellAt(boreX, dk.structure.y + 4);
          t.check("the lane recognises it as a well with a beam to work it",
                  !!well && well.beam === true && !!well.bore,
                  well ? "bore depth " + (well.bore ? well.bore.depth : 0) : "no well");

          /* Walk away. The whole point of a machine is that it works anyway. */
          stand(site.x - 300);
          g.tick(108 * 30);
          const tank = B.storageAt(dk.structure.x + 2, dk.structure.y + dk.structure.h - 2);
          t.check("THE PLAYER CAN HAVE THIS: crude arrives in the derrick's own " +
                  "tank while they are elsewhere",
                  !!tank && tank.count("crude_oil") > 0,
                  tank ? tank.count("crude_oil") + " measures" : "no tank");
          t.check("and it is reachable through the same storageAt a chest answers to, " +
                  "so a wagon can take it away",
                  !!tank && typeof tank.take === "function" &&
                  tank.take("crude_oil", 1) === 1);
        }
      }
    }
  }

  /* ================================= ART STAYS INSIDE THE FOOTPRINT ====== */
  /* The owner: "the carriages etc look like shit. make them look good and
     nice." Making them look good is a judgement nothing here can check. What
     it CAN check is the thing that made lane E flag the brief in the first
     place: a drawing that disagrees with the solid box the simulation
     publishes. The actor stands on structures now, so art proud of the box
     puts the player on air and art short of it blocks them on nothing. */
  {
    const g2 = g;                     /* itemDef comes from the booted game */
    g2.state.view.w = 4000; g2.state.view.h = 4000;
    g2.state.cam.zoom = 1;

    const loads = [ {}, { iron_ore: 20 }, { iron_ore: 100 }, { coal: 400 },
                    { crude_oil: 30 } ];
    let bad = null;
    for(const derailed of [false, true]){
      for(const load of loads){
        clearWagons();
        g2.state.cam.x = 500; g2.state.cam.y = 500;
        const w = makeWagon(500, 500);
        Object.assign(w.store.items, load);
        w.derailed = derailed;
        wagons.push(w);
        const { ctx, rects } = recorder();
        renderWagons(ctx, g2.items.itemDef);
        const box = { x: Math.round(w.x - w.w/2), y: Math.round(w.y),
                      w: w.w, h: w.h };
        const o = overflow(rects, box);
        if(worstSide(o) > 0 && !bad)
          bad = (derailed ? "derailed " : "") + JSON.stringify(load) + " -> " + JSON.stringify(o);
      }
    }
    t.check("a wagon's drawing never leaves the box the simulation publishes",
            bad === null, bad || "empty, part and full loads, upright and derailed");

    /* THE BEAM MOVES, so it is checked right through its stroke rather than
       at rest - which is the case a still screenshot cannot show. */
    let badRig = null;
    for(let k = 0; k <= 12 && !badRig; k++){
      clearWagons();
      const derrick = { defId:"derrick", built:true, id: 5000,
                        x: 500, y: 452, w: 18, h: 48 };
      const beam = { defId:"walking_beam", built:true, id: 5001,
                     x: 522, y: 478, w: 34, h: 22 };
      pumpState(derrick).stroke = Math.round(STROKE_TICKS * k / 12);
      g2.state.cam.x = 520; g2.state.cam.y = 480;
      for(const s2 of [derrick, beam]){
        const { ctx, rects } = recorder();
        renderMachines(ctx, [derrick, beam], k);
        /* renderMachines draws both, so isolate by rendering one at a time */
        const one = recorder();
        renderMachines(one.ctx, [s2], k);
        const o = overflow(one.rects, s2);
        if(worstSide(o) > 0)
          badRig = s2.defId + " at stroke " + k + "/12 -> " + JSON.stringify(o);
      }
    }
    t.check("a derrick and a nodding beam stay inside their boxes, all the way " +
            "through the stroke", badRig === null,
            badRig || "13 points of the stroke checked");

    /* And the drawing has to actually put something in the box, or "inside
       the footprint" is satisfied by drawing nothing at all. */
    {
      clearWagons();
      const w = makeWagon(500, 500);
      w.store.items.iron_ore = 60;
      wagons.push(w);
      const { ctx, rects } = recorder();
      renderWagons(ctx, g2.items.itemDef);
      t.check("and there is actually a wagon drawn, not an empty check",
              rects.length > 20, rects.length + " spans");
    }

    /* The load is the state a player most wants to read across a mine, so a
       fuller cart must draw more of its cargo colour than an emptier one. */
    {
      const cargo = load => {
        clearWagons();
        const w = makeWagon(500, 500);
        Object.assign(w.store.items, load);
        wagons.push(w);
        const { ctx, rects } = recorder();
        const seen = [];
        const oreCol = g2.items.itemDef("iron_ore").col;
        const rec = { ...ctx, fillRect: ctx.fillRect };
        /* count spans painted in the ore's own colour */
        let n = 0;
        const probe = {
          fillStyle: "#000", globalAlpha: 1,
          save(){}, restore(){}, translate(){},
          beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, closePath(){}, fill(){}, arc(){},
          fillRect(x, y, ww, hh){ if(probe.fillStyle === oreCol) n += Math.max(0, Math.round(ww)) * Math.max(0, Math.round(hh)); }
        };
        renderWagons(probe, g2.items.itemDef);
        return n;
      };
      const little = cargo({ iron_ore: 20 }), lots = cargo({ iron_ore: 200 });
      t.check("a fuller cart visibly shows more of its load than an emptier one",
              little > 0 && lots > little,
              little + " px against " + lots + " px");
    }
    clearWagons();
  }

  /* --------------------------------------------------------- honest zero -- */
  t.check("powerAt is nought everywhere, because nothing generates yet",
          IND.powerAt(run1.x, run1.y) === 0);

  /* ---------------------------------------------- leave the world quiet --- */
  /* THIS SUITE MAKES MORE MESS THAN ANY OTHER and it has to clear up after
     itself. It cuts two benches, sinks four shafts and pours some seventeen
     hundred pixels of crude into sealed pockets, spread right across the
     map. All of that leaves loose pixels and liquid queued in lane A's
     dynamics, and the queues are module singletons that outlive a boot() -
     so the NEXT suite in the process inherits a world that is still moving.
     It gated a deploy: the farm lane's tick-budget check went from under two
     milliseconds to thirty, and the number was measuring my leftovers.

     Every other suite runs at about two milliseconds after this one now. */
  g.world.clearLoose();
  g.tick(30);
  g.world.clearLoose();

  return t;
}

/* Long enough for the scheduled ballast check to come round for every
   segment, whatever tick it started on. */
const BALLAST_SETTLE = 40;
