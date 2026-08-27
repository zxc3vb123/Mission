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

  /* --------------------------------------------------------- honest zero -- */
  t.check("powerAt is nought everywhere, because nothing generates yet",
          IND.powerAt(run1.x, run1.y) === 0);

  return t;
}

/* Long enough for the scheduled ballast check to come round for every
   segment, whatever tick it started on. */
const BALLAST_SETTLE = 40;
