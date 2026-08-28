/* LANE J - farming, animals and food.

   What this suite is really for is the first law: a farm makes food, and
   food is matter, so every check here that says "the harvest appeared" is
   worthless on its own (WORKFLOW 5c). The ones that count are the ones that
   name where it came from and measure that the source went down by exactly
   what the destination went up by.

   The other thing it exists to pin is that a field grows with nobody there.
   The owner's decision on unattended automation is the reason this lane
   exists at all, so the growth checks put the player 600 px away and leave
   them there. */

import { boot, suite } from "../testkit.js";
import { bus } from "../../src/core/bus.js";
import {
  waterNeed, waterKgPerPixel, massFromWater, SIP_TICKS,
  YIELD_GRAIN, YIELD_SEED, SEED_ID, GRAIN_ID, SEED_DEF, GRAIN_DEF, SKY_SCAN,
  PLOT_SPACING, CHECK_EVERY
} from "../../src/farm/spec.js";

/* ---------------------------------------------------------------- helpers */

/* A patch of ground this suite OWNS: soil below, open air and open sky
   above. WORKFLOW is explicit that a test which shapes terrain must
   guarantee its own ground rather than assume a quiet world - the landscape
   is a module singleton and carries whatever earlier suites did to it. */
function makeField(g, x0, y, w){
  const M_EARTH = 2, M_SKY = 0;
  for(let x = x0 - 4; x < x0 + w + 4; x++){
    for(let k = 1; k <= 6; k++) g.world.setMat(x, y + k, M_EARTH);
    for(let k = 0; k <= SKY_SCAN + 8; k++) g.world.setMat(x, y - k, M_SKY);
  }
}

/* Stand the player next to a spot, or a long way from it. The pose is lane
   B's branch to write, but a test is allowed to place the body it is
   testing around - which is what every other lane's suite does. */
function standAt(g, x, y){ g.state.player.x = x; g.state.player.y = y; }

function totalWaterPixels(g, x0, y0, x1, y1){
  let n = 0;
  for(let y = y0; y <= y1; y++)
    for(let x = x0; x <= x1; x++)
      if(g.world.isLiquid(x, y)) n++;
  return n;
}

function packMass(g){ return g.items.inventory.carriedMass(); }

/* Fill a plot the short way, so a growth test is about growth and not about
   waiting for a bucket. Every pixel is still accounted: it comes from the
   pack as a real bucket of water wherever the test is about matter. */
function forceWater(g, plot, px){ plot.water += px; }

export function run(){
  const t = suite("farm");
  const g = boot(4242);
  const farm = g.systems.find(s => s.name === "farm").api;
  g.tick(2);                                   /* the wild scatter seeds itself */

  const NEED = waterNeed();

  /* ------------------------------------------------ the numbers are honest */

  t.check("a plot's thirst is derived from its yield, not chosen",
    NEED === Math.round(massFromWater() / waterKgPerPixel()),
    NEED + " px for " + massFromWater().toFixed(2) + " kg");

  /* THE CONSERVATION IDENTITY, stated as arithmetic rather than as a claim.
     In: the water the plot drinks, plus the one seed that was planted.
     Out: the grain and the seed it hands back. They must balance. */
  const inKg  = NEED * waterKgPerPixel() + SEED_DEF.mass;
  const outKg = YIELD_GRAIN * GRAIN_DEF.mass + YIELD_SEED * SEED_DEF.mass;
  t.check("a harvest weighs exactly what the plot drank plus its seed",
    Math.abs(inKg - outKg) < 1e-9,
    "in " + inKg.toFixed(3) + " kg, out " + outKg.toFixed(3) + " kg");
  t.check("and it never weighs MORE than went in", outKg <= inKg + 1e-9);

  /* ------------------------------------------------------- the first seed */

  t.check("wild wheat grows somewhere, or the lane is unreachable",
    farm.wildCount() > 0, farm.wildCount() + " wild plants");

  /* Where the very first seed comes from is the whole reachability question,
     the same shape as loose rock breaking the stone-pickaxe deadlock. Take
     one wild plant and check it hands over seed. */
  const wild = farm.crops().find(p => p.wild);
  if(wild){
    g.items.inventory.clear();
    standAt(g, wild.x, wild.y);
    const got = farm.harvest(wild.x, wild.y);
    t.check("a wild plant can be picked and gives a seed to start with",
      got.ok && g.items.inventory.count(SEED_ID) >= 1,
      JSON.stringify(got.outputs || got.reason));
  } else {
    t.check("a wild plant can be picked and gives a seed to start with", false, "none seeded");
  }

  /* ------------------------------------------------- one crop, end to end */

  const FX = 700, FY = 400;
  makeField(g, FX, FY, 60);
  g.items.inventory.clear();
  standAt(g, FX + 10, FY - 8);

  const refused = farm.plant(FX + 10, FY);
  t.check("you cannot plant without a seed", !refused.ok, refused.reason);

  g.items.inventory.add(SEED_ID, 1);
  const before = g.items.inventory.count(SEED_ID);
  const planted = farm.plant(FX + 10, FY);
  t.check("a seed planted in real soil makes a plot", planted.ok, planted.reason);
  t.check("and the seed LEFT the pack - the checked destroy",
    g.items.inventory.count(SEED_ID) === before - 1,
    before + " -> " + g.items.inventory.count(SEED_ID));

  const plot = planted.plot;
  t.check("a new plot has drunk nothing", plot && plot.drunk === 0 && plot.water === 0);

  /* ---------------------------------------------- it grows with nobody there */

  standAt(g, FX + 700, FY);          /* 600 px away and then some */
  forceWater(g, plot, NEED);
  g.tick(SIP_TICKS * NEED + SIP_TICKS);

  t.check("a field ripens with the player 600 px away",
    farm.isRipe(plot),
    "drunk " + plot.drunk + "/" + NEED + ", player at " + Math.round(g.state.player.x));
  t.check("and it drank exactly its need, no more",
    plot.drunk === NEED && plot.water === 0,
    "drunk " + plot.drunk + " held " + plot.water);

  /* --------------------------------------------------------- the harvest */

  standAt(g, plot.x, plot.y - 8);
  g.items.inventory.clear();
  const massBefore = packMass(g);
  const reaped = farm.harvest(plot.x, plot.y);
  t.check("a ripe plot can be harvested", reaped.ok, reaped.reason);
  t.check("and it yields grain and seed to plant again",
    g.items.inventory.count(GRAIN_ID) === YIELD_GRAIN &&
    g.items.inventory.count(SEED_ID) === YIELD_SEED,
    g.items.inventory.count(GRAIN_ID) + " grain, " + g.items.inventory.count(SEED_ID) + " seed");

  const gained = packMass(g) - massBefore;
  t.check("the mass gained is the mass the plot drank plus its seed",
    Math.abs(gained - (NEED * waterKgPerPixel() + SEED_DEF.mass)) < 1e-6,
    gained.toFixed(3) + " kg");
  t.check("the plot is gone once picked",
    !farm.cropAt(plot.x, plot.y), farm.stats().plots + " plots left");

  /* ------------------------------------------------------------ eating it */

  let heard = null;
  const offEat = bus.on("food:eaten", e => { heard = e; });
  const grainBefore = g.items.inventory.count(GRAIN_ID);
  const ate = farm.eat(GRAIN_ID);
  offEat();
  t.check("wheat is food and can be eaten", ate.ok && ate.nutrition > 0, JSON.stringify(ate));
  t.check("eating takes it out of the pack",
    g.items.inventory.count(GRAIN_ID) === grainBefore - 1);
  t.check("and announces the meal for lane B to feel",
    heard && heard.id === GRAIN_ID && heard.nutrition === ate.nutrition,
    JSON.stringify(heard));
  t.check("eating what you do not have is refused, and costs nothing",
    !farm.eat("iron_ore").ok);

  /* ------------------------------------------- watering costs a real bucket */

  const WX = 900;
  makeField(g, WX, FY, 40);
  g.items.inventory.clear();
  standAt(g, WX + 6, FY - 8);
  g.items.inventory.add(SEED_ID, 1);
  const p2 = farm.plant(WX + 6, FY).plot;

  const dry = farm.water(WX + 6, FY);
  t.check("you cannot water with an empty pack", !dry.ok, dry.reason);

  g.items.inventory.add("water_bucket", 1);
  const pailMass = packMass(g);
  const poured = farm.water(WX + 6, FY);
  t.check("a bucket of water waters the row", poured.ok && poured.px > 0,
    JSON.stringify(poured));
  t.check("the full pail left the pack and the empty one came back",
    g.items.inventory.count("water_bucket") === 0 && g.items.inventory.count("bucket") === 1);
  t.check("the plot is holding the water the pack lost",
    p2.water === Math.min(NEED, poured.px + poured.spilled) || p2.water === NEED,
    "held " + p2.water + " given " + poured.px + " spilled " + poured.spilled);
  const lost = pailMass - packMass(g);
  t.check("and the pack got lighter by exactly the water that left it",
    Math.abs(lost - (poured.px + poured.spilled) * waterKgPerPixel()) < 1e-6,
    lost.toFixed(3) + " kg for " + (poured.px + poured.spilled) + " px");

  /* Nothing is ever swallowed: what the row could not take is queued to go
     back into the world rather than discarded. */
  t.check("what the row could not take is held to be poured back, not dropped",
    farm.stats().heldWater >= p2.water,
    JSON.stringify(farm.stats()));

  /* ---------------------------------------------- pulling one up gives it back */

  const beforeUproot = farm.stats().heldWater;
  g.items.inventory.clear();
  const pulled = farm.uproot(p2.x, p2.y);
  t.check("a plant pulled up returns its seed", pulled && pulled.ok &&
    (g.items.inventory.count(SEED_ID) >= 1 || g.items.dropCount() > 0),
    JSON.stringify(pulled && pulled.returns));
  t.check("and every pixel of water it held is still accounted for",
    farm.stats().heldWater === beforeUproot,
    beforeUproot + " -> " + farm.stats().heldWater);

  /* --------------------------------------- the water goes back into the world

     A queue that never drains would be a leak dressed up as bookkeeping, so
     this checks the other end: what the row could not take is poured back
     through lane A and turns into real liquid pixels again. */
  {
    const held = farm.stats().spill;
    const wetBefore = totalWaterPixels(g, WX - 60, FY - 30, WX + 80, FY + 30);
    standAt(g, WX + 700, FY);                 /* and it drains unattended */
    g.tick(400);
    const wetAfter = totalWaterPixels(g, WX - 60, FY - 30, WX + 80, FY + 30);
    t.check("water the row could not take is poured back into the world",
      held > 0 && farm.stats().spill < held && wetAfter > wetBefore,
      held + " px queued -> " + farm.stats().spill + " left, world " +
      wetBefore + " -> " + wetAfter + " px");
  }

  /* ------------------------------------------------------------ irrigation

     THE POINT OF THE LANE. A plot beside standing water drinks from it on
     its own, with nobody there - which is the owner's unattended-automation
     decision applied to a field, and the reason digging a channel from a
     pond is worth doing. The check that matters is not that the plot gained
     water; it is that THE WORLD LOST EXACTLY THAT MUCH. */
  {
    const IX = 1700, M_EARTH = 2, M_WATER = 23;
    makeField(g, IX, FY, 30);
    g.items.inventory.clear();
    standAt(g, IX + 6, FY - 8);
    g.items.inventory.add(SEED_ID, 1);
    const p = farm.plant(IX + 6, FY).plot;

    /* A pocket of water in the soil beside the plant, walled in by the earth
       around it so it stays where it is put. */
    for(let x = p.x + 3; x <= p.x + 7; x++)
      for(let y = p.y + 2; y <= p.y + 5; y++) g.world.setMat(x, y, M_WATER);

    const box = [IX - 20, FY - 10, IX + 40, FY + 12];
    const wetBefore = totalWaterPixels(g, box[0], box[1], box[2], box[3]);
    const heldBefore = p.water + p.drunk;

    standAt(g, IX + 700, FY);                 /* 600 px away and then some */
    g.tick(600);

    const wetAfter = totalWaterPixels(g, box[0], box[1], box[2], box[3]);
    const gained = (p.water + p.drunk) - heldBefore;
    t.check("a plot beside standing water drinks it with nobody there",
      gained > 0, gained + " px drunk, player at " + Math.round(g.state.player.x));
    t.check("and the world lost exactly the water the plot gained",
      wetBefore - wetAfter === gained,
      "world " + wetBefore + " -> " + wetAfter + " (-" + (wetBefore - wetAfter) +
      "), plot +" + gained);
    farm.uproot(p.x, p.y);
  }

  /* ------------------------------------------------- the ground is not a prop */

  const DX = 1100;
  makeField(g, DX, FY, 30);
  g.items.inventory.clear();
  standAt(g, DX + 6, FY - 8);
  g.items.inventory.add(SEED_ID, 1);
  const p3 = farm.plant(DX + 6, FY).plot;
  t.check("a plot stands on soil", !!p3);
  if(p3){
    const M_TUNNEL = 1;
    for(let k = 1; k <= 8; k++) g.world.setMat(p3.x, p3.y + k, M_TUNNEL);
    g.tick(CHECK_EVERY * 2 + 8);               /* two of the slow site beats */
    t.check("digging the soil out from under a crop kills it",
      !farm.cropAt(p3.x, p3.y), farm.stats().plots + " plots");
    t.check("and hands the seed back rather than eating it",
      g.items.inventory.count(SEED_ID) >= 1 || g.items.dropCount() > 0,
      g.items.inventory.count(SEED_ID) + " in pack, " + g.items.dropCount() + " on the ground");
  } else {
    t.check("digging the soil out from under a crop kills it", false, "no plot");
    t.check("and hands the seed back rather than eating it", false, "no plot");
  }

  /* A roofed plot is a cellar, not a farm - and the test for that must not
     be the light grid, which reads 0 wherever the camera is not. */
  const RX = 1300;
  makeField(g, RX, FY, 20);
  g.items.inventory.clear();
  standAt(g, RX + 6, FY - 8);
  g.items.inventory.add(SEED_ID, 2);
  const roofed = farm.plant(RX + 6, FY);
  t.check("open ground takes a seed", roofed.ok, roofed.reason);
  if(roofed.ok) farm.uproot(RX + 6, FY);
  const M_ROCK = 5;
  for(let x = RX; x < RX + 12; x++) g.world.setMat(x, FY - 10, M_ROCK);
  const under = farm.plant(RX + 6, FY);
  t.check("roofed ground does not, because a crop needs daylight",
    !under.ok, under.reason);

  /* ------------------------------------------------------------ save/load */

  const SX = 1500;
  makeField(g, SX, FY, 30);
  g.items.inventory.clear();
  standAt(g, SX + 6, FY - 8);
  g.items.inventory.add(SEED_ID, 1);
  const p4 = farm.plant(SX + 6, FY).plot;
  forceWater(g, p4, 6);
  g.tick(SIP_TICKS * 2 + 2);

  const sys = g.systems.find(s => s.name === "farm");
  const saved = JSON.parse(JSON.stringify(sys.serialise()));
  const drunkWas = p4.drunk, heldWas = farm.stats().heldWater;
  sys.restore(saved);
  const back = farm.cropAt(SX + 6, FY, 8);
  t.check("a field survives a save and a load",
    !!back && back.drunk === drunkWas,
    "was " + drunkWas + ", back " + (back ? back.drunk : "gone"));
  t.check("and so does every pixel of water it was holding",
    farm.stats().heldWater === heldWas,
    heldWas + " -> " + farm.stats().heldWater);

  /* --------------------------------------------------------------- cheap

     THIS CHECK WAS WRONG IN ITS FIRST FORM AND IT GATED THE WHOLE PROJECT.
     It timed `g.tick()`, which steps EVERY system, and then reported the
     number under the words "a farm costs". Run alone it read 1.3 ms; run
     after the other suites it read 31 ms and went red on main, and the 31 ms
     was almost entirely lane C's tick over a world that ten earlier suites
     had left full of things - the farm's own share did not reach 0.01 ms,
     because the only plots standing were the five WILD ones, which return on
     the first line. So the check never measured the thing it was named after,
     and when it finally failed it blamed the wrong lane and stopped four.

     Two things are fixed here, and neither is the threshold.

     1. IT MEASURES THIS SYSTEM. `farmSys.tick()` alone, over a field this
        block plants itself, with the player walked away so the slow beats
        are paying full price for being far from the camera. That is the
        number this lane can be held to.
     2. IT PLANTS A REAL FIELD. Wild plots cost nothing by construction, so
        a cost check made of them is a check of nothing.

     The whole-tick figure is still measured, because it was a true and
     useful measurement, but it is REPORTED rather than failed on - WORKFLOW
     5a, the rule that another lane shipping something must never redden main
     for you. A number nobody owns should nag, not gate. */

  const M_EARTH = 2, M_SKY = 0;
  const PX = 2200, PY = 400, ROW = 60, GAP = PLOT_SPACING + 1;
  for(let x = PX - 8; x < PX + ROW * GAP + 8; x++){
    for(let k = 1; k <= 6; k++) g.world.setMat(x, PY + k, M_EARTH);
    for(let k = 0; k <= SKY_SCAN + 8; k++) g.world.setMat(x, PY - k, M_SKY);
  }
  g.items.inventory.clear();
  g.items.inventory.setCapacity(9999);
  g.items.inventory.add(SEED_ID, ROW);
  let standing = 0;
  for(let i = 0; i < ROW; i++){
    standAt(g, PX + i * GAP, PY - 8);
    const r = farm.plant(PX + i * GAP, PY);
    if(r.ok){ standing++; r.plot.water = NEED; }    /* watered, so it is working */
  }
  t.check("a field of " + ROW + " actually goes in, or the cost check measures nothing",
    standing >= ROW - 2, standing + " planted");

  standAt(g, PX + 800, PY);            /* and nobody is there to watch it */
  const farmSys = g.systems.find(s => s.name === "farm");

  farmSys.tick();                                   /* warm, then measure */
  const RUNS = 300;
  const t0 = Date.now();
  for(let i = 0; i < RUNS; i++){ g.state.tick++; farmSys.tick(); }
  const own = (Date.now() - t0) / RUNS;

  t.check("a field of " + ROW + " costs a small fraction of the 27.8 ms tick budget",
    own < 3, own.toFixed(3) + " ms per tick, this system alone, player 800 px away");

  /* Reported, never failed on: what the WHOLE tick costs over whatever the
     rest of the suite has left in the world. If this is large the farm is
     almost certainly not why - the line names the worst system so that
     whoever reads it knows where to look. */
  const SAMPLES = 200;
  const per = {};
  for(let i = 0; i < SAMPLES; i++){
    g.state.tick++;
    for(const s of g.systems){
      if(!s.tick) continue;
      const a = performance.now(); s.tick();
      per[s.name] = (per[s.name] || 0) + (performance.now() - a);
    }
  }
  const rows = Object.entries(per).map(([k, v]) => [k, v / SAMPLES]).sort((a, b) => b[1] - a[1]);
  const whole = rows.reduce((n, r) => n + r[1], 0);
  /* `counts()` comes with it because the honest suspect for a slow tick in a
     farming scenario is not the plots: it is the water. A plot drinking out
     of a ditch takes pixels away, and lane A's mass mover then re-levels
     what is left, every tick, for as long as the pool is unsettled. If those
     queues are long, the cost is irrigation churn and belongs to whoever
     owns the liquid - which is worth knowing rather than measuring away,
     because a player meets it the first time they dig a ditch beside a row. */
  const c = g.world.counts();
  console.log("      farm (reported, not a gate; whole-frame figures move with " +
    "machine load - trust the check above for this lane's own cost): whole tick " +
    whole.toFixed(2) + " ms; worst " + rows[0][0] + " at " + rows[0][1].toFixed(2) +
    " ms; farm " + (per.farm / SAMPLES).toFixed(3) + " ms with " +
    farm.stats().plots + " plots. world.counts(): loose " + c.pxs +
    ", massmover " + c.mm + ", unstable " + c.ins);

  return t;
}
