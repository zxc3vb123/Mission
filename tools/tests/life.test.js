/* LANE I owns this file: creatures, and hitting things with whatever is in
   your hands.

   WHAT THIS SUITE EXISTS TO PROVE, in the order the lane brief sets it:

     1. A swing is a real action with a cost and a reach, and it works
        against nothing at all.
     2. Hitting a creature and hitting rock are NOT the same click. This one
        is checked as an invariant - the terrain is counted before and after
        a swing at a rock face - because it is the mistake that would make
        players destroy their own tunnels by reflex.
     3. Every defence the player already owns is a real answer: light, walls,
        and standing still.
     4. Distance changes how a creature is computed and never what it comes
        to. The check is that moving the CAMERA a thousand pixels away
        changes nothing, while moving the PLAYER changes everything.
     5. Nothing appears out of nothing. A kill drops no items and moves no
        pixels (docs/WORKFLOW.md 5c).

   A note on the ground, per docs/WORKFLOW.md: the landscape is a module
   singleton shared by every suite, so everything here cuts its own chamber
   deep underground, asserts it is really there, and re-cuts before each
   measurement. */

import { boot, suite } from "../testkit.js";
import { bus } from "../../src/core/bus.js";
import { weaponFor, reachFor, cooldownFor, BANDS, LIGHT_EDGE,
         ATTACK_RANGE, AWAKE, MIN_DEPTH, FEEL } from "../../src/life/spec.js";

/* Cut a chamber of air with a stable floor, a long way below the surface.
   Same shape as lane D's bench and for the same reason: the natural terrain
   on any seed is not a laboratory, and a test that hunted for a suitable
   cavern would be measuring the generator. */
function cutChamber(g, x0, w, h, depth){
  const W = g.world;
  const top = W.surfaceAt(x0) + depth;

  /* air and a stable fill, both read out of the world rather than imported */
  let AIR = -1;
  for(let d = 20; d <= 120; d++){
    const y = W.surfaceAt(x0) - d;
    if(!W.isSolid(x0, y) && !W.isLiquid(x0, y)){ AIR = W.matAt(x0, y); break; }
  }
  let SOLID = -1;
  for(let d = 4; d <= 200; d++){
    const y = W.surfaceAt(x0) + d;
    if(!W.isSolid(x0, y)) continue;
    const info = W.matInfo(x0, y);
    if(info && !info.instable){ SOLID = W.matAt(x0, y); break; }
  }
  if(AIR < 0 || SOLID < 0) return null;

  for(let x = x0 - 10; x < x0 + w + 10; x++){
    for(let k = 0; k < 12; k++)     W.setMat(x, top + k, SOLID);      /* floor */
    for(let k = 1; k <= h; k++)     W.setMat(x, top - k, AIR);        /* room  */
    for(let k = h + 1; k <= h + 8; k++) W.setMat(x, top - k, SOLID);  /* roof  */
  }
  return { x: x0, y: top, floor: top, air: AIR, solid: SOLID };
}

function chamberSound(g, c, w){
  for(let x = c.x; x < c.x + w; x += 6){
    if(!g.world.isSolid(x, c.floor + 2)) return false;
    if(g.world.isSolid(x, c.floor - 4)) return false;
  }
  return true;
}

/* Put the player somewhere and let the pose publish, without letting them
   walk. state.player is lane B's branch; the clonk is how their own suite
   moves it and it is the only honest way in from here. */
function standAt(g, x, y, dir){
  /* Keys and the mouse are module singletons that outlive a boot(), and the
     actor derives the aim from them: a suite that ran earlier and left the
     button down, or the body facing left, silently turns the head lamp
     round. That passed alone and failed in the full run, which is exactly
     the trap docs/WORKFLOW.md warns about. */
  g.releaseAll();
  g.actor.clonk.x = x; g.actor.clonk.y = y;
  g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
  g.actor.clonk.dir = dir === undefined ? 1 : dir;
  g.tick(1);
}

/* Close enough to be FELT whatever the player is doing, so a test about the
   light is only about the light. Being heard is its own check. */
const CLOSE = 36;

function solidIn(g, x0, y0, w, h){
  let n = 0;
  for(let y = y0; y < y0 + h; y++)
    for(let x = x0; x < x0 + w; x++) if(g.world.isSolid(x, y)) n++;
  return n;
}

export function run(){
  const t = suite("life");
  const g = boot(4242);
  const L = g.systems.find(s => s.name === "life").api;

  L.clear();
  g.state.player.lamp.on = false;          /* dark by default; lit is a case */

  /* ------------------------------------------------------------ the swing --
     Against nothing, first. It has to be a real action before there is
     anything to swing at. */

  const chamber = cutChamber(g, 1500, 260, 40, 300);
  t.check("a chamber can be cut deep underground", !!chamber,
          chamber ? "floor y=" + chamber.floor : "no stable fill found");
  if(!chamber) return t;
  t.check("the chamber is air over a solid floor", chamberSound(g, chamber, 240));

  const px = chamber.x + 40, py = chamber.floor - 9;
  standAt(g, px, py);

  L.clear();
  let started = 0;
  const offStart = bus.on("swing:started", () => started++);

  const s1 = L.swing();
  t.check("a swing at nothing still lands as a swing", s1.ok && s1.hit === null,
          JSON.stringify({ ok: s1.ok, hit: s1.hit }));
  t.check("and it is announced, so lane B can animate it", started === 1, started);

  /* A swing is not a free action: the second one is refused until the tool
     has recovered, and the cost is the tool's own cadence. */
  const s2 = L.swing();
  t.check("a second swing is refused while the first is recovering",
          !s2.ok && s2.reason === "recovering", s2.reason);
  t.check("and the cooldown is the tool's cadence, not a constant",
          s1.ticks === cooldownFor(null) && s1.ticks > 1, s1.ticks);

  g.tick(s1.ticks);
  t.check("once recovered it swings again", L.canSwing() && L.swing().ok);
  g.tick(cooldownFor(null));

  /* Tier and kind matter, exactly the way they do against rock. These read
     lane F's table through spec.js, so nothing here is a second copy of a
     number. */
  const hands = weaponFor(null), axe = weaponFor("stone_axe");
  const pick = weaponFor("stone_pickaxe"), shovel = weaponFor("stone_shovel");
  const steelAxe = weaponFor("iron_axe");
  /* "An axe should be the good one" (the lane brief) means over a fight, not
     per blow: a pickaxe lands the heaviest single hit in the game and is
     still the third-best weapon, which is what "heavy and slow" has to mean
     if it means anything at all. */
  const dps = w => w.damage * w.swing;
  t.check("an axe is the good one, over a fight rather than per blow",
          dps(axe) > dps(pick) && dps(axe) > dps(shovel),
          "axe " + dps(axe).toFixed(1) + " pick " + dps(pick).toFixed(1) +
          " shovel " + dps(shovel).toFixed(1) + " per second");
  t.check("a pickaxe is the heaviest single blow and the slowest swing",
          pick.damage > axe.damage && pick.swing < axe.swing,
          pick.damage + " @ " + pick.swing + "/s");
  t.check("a shovel will do in a pinch and no better",
          shovel.damage > hands.damage && shovel.damage < axe.damage,
          shovel.damage);
  t.check("bare hands are almost useless, which is the argument for carrying a tool",
          hands.damage * 6 < axe.damage, hands.damage + " vs " + axe.damage);
  t.check("tier matters: an iron axe beats a stone one",
          steelAxe.damage > axe.damage, steelAxe.damage + " vs " + axe.damage);
  t.check("a swing reaches further with a long handle than with a knife",
          reachFor("stone_shovel") > reachFor("stone_knife"));

  /* THE ONE THAT MATTERS: a swing is not a dig. */
  {
    const W = g.world;
    for(let x = px + 12; x < px + 30; x++)
      for(let k = 1; k <= 20; k++) W.setMat(x, chamber.floor - k, chamber.solid);
    const before = solidIn(g, px + 10, chamber.floor - 22, 24, 24);
    t.check("there is a rock face in reach to swing at", before > 200, before);
    g.state.player.aim.x = 1; g.state.player.aim.y = 0;
    for(let i = 0; i < 6; i++){ L.swing(); g.tick(cooldownFor(null)); }
    const after = solidIn(g, px + 10, chamber.floor - 22, 24, 24);
    t.check("six swings at a rock face move not one pixel of it", after === before,
            before + " -> " + after);
    for(let x = px + 12; x < px + 30; x++)
      for(let k = 1; k <= 20; k++) W.setMat(x, chamber.floor - k, chamber.air);
  }

  offStart();

  /* -------------------------------------------------------- one creature --
     What it is made of, and that it can be put down. */

  L.clear();
  const cx = px + 60;
  const c0 = L.spawnAt(cx, chamber.floor - 6, 0);
  t.check("a crawler can be put into the world", !!c0 && L.creatureCount() === 1);
  t.check("it is made of the numbers its band says",
          c0.hp === BANDS[0].hp && c0.hpMax === BANDS[0].hp, c0.hp);

  t.check("depth is what makes it worse - deeper is tougher, harder and faster",
          BANDS[2].hp > BANDS[1].hp && BANDS[1].hp > BANDS[0].hp &&
          BANDS[2].damage > BANDS[0].damage && BANDS[2].speed > BANDS[0].speed);

  /* Hitting it. The damage is the tool's, and the kill is announced. */
  {
    L.clear();
    standAt(g, px, py);
    const c = L.spawnAt(px + 10, py, 0);
    g.state.player.aim.x = 1; g.state.player.aim.y = 0;
    const hp0 = c.hp;
    const r = L.swing();
    t.check("a swing connects with a creature in reach", r.ok && r.hit && !r.hit.killed);
    t.check("and takes exactly what the tool is worth",
            Math.abs((hp0 - c.hp) - weaponFor(null).damage) < 0.001,
            hp0 + " -> " + c.hp);

    let killed = 0;
    const offKill = bus.on("creature:killed", () => killed++);
    for(let i = 0; i < 40 && L.creatureCount() > 0; i++){
      g.tick(cooldownFor(null));
      /* it is knocked back, so walk the blow to it rather than assuming */
      const near = L.nearestCreature(g.state.player.x, g.state.player.y, 200);
      if(near) standAt(g, near.x - 6, near.y);
      L.swing();
      g.tick(1);
    }
    t.check("enough blows kill it, and the kill is announced",
            killed === 1 && L.creatureCount() === 0, "killed=" + killed);
    offKill();
  }

  /* ------------------------------------------------------ nothing appears --
     Conservation of matter, WORKFLOW 5c. A kill is not a source of items and
     not a source of pixels. */
  {
    L.clear();
    standAt(g, px, py);
    const dropsBefore = g.items.dropCount();
    const solidBefore = solidIn(g, px - 20, chamber.floor - 40, 80, 44);
    const c = L.spawnAt(px + 8, py, 0);
    g.state.player.aim.x = 1; g.state.player.aim.y = 0;
    for(let i = 0; i < 30 && L.creatureCount() > 0; i++){
      L.swing();
      g.tick(cooldownFor(null) + 1);
      const near = L.nearestCreature(g.state.player.x, g.state.player.y, 200);
      if(near) standAt(g, near.x - 6, near.y);
    }
    t.check("killing a crawler drops nothing, because it is made of nothing yet",
            g.items.dropCount() === dropsBefore,
            dropsBefore + " -> " + g.items.dropCount());
    standAt(g, px, py);
    t.check("and it moves no ground either",
            solidIn(g, px - 20, chamber.floor - 40, 80, 44) === solidBefore);
  }

  /* --------------------------------------------------------------- light --
     The first defence. A crawler will not walk into the beam. */
  {
    /* Inside FEEL, so that the two runs differ only in the light. A player
       standing still is not heard from much further than this, which is the
       quiet defence and has its own check below. */
    L.clear();
    standAt(g, px, py);
    g.state.player.lamp.on = false;
    const c = L.spawnAt(px + CLOSE, py, 0);
    const d0 = c.x - g.state.player.x;
    g.tick(90);
    const dDark = c.x - g.state.player.x;
    t.check("in the dark it closes on you", dDark < d0 - 8,
            d0.toFixed(1) + " -> " + dDark.toFixed(1));

    L.clear();
    standAt(g, px, py);
    g.state.player.lamp.on = true;
    t.check("the lamp is pointing at it, which is the thing being tested",
            g.state.player.aim.x > 0.9,
            "aim " + g.state.player.aim.x.toFixed(2) + "," + g.state.player.aim.y.toFixed(2));
    const c2 = L.spawnAt(px + CLOSE, py, 0);
    const e0 = c2.x - g.state.player.x;
    g.tick(90);
    const eLit = c2.x - g.state.player.x;
    t.check("with the lamp on it, it will not come through the beam",
            eLit > e0 - 8, e0.toFixed(1) + " -> " + eLit.toFixed(1));
    t.check("because the ground between you is lit past the threshold it refuses",
            L.lightFor(g.state.player.x + 20, py) > LIGHT_EDGE,
            L.lightFor(g.state.player.x + 20, py).toFixed(2));
    t.check("and the dark behind you is not - the lamp is a beam, not a bubble",
            L.lightFor(g.state.player.x - 20, py) < LIGHT_EDGE,
            L.lightFor(g.state.player.x - 20, py).toFixed(2));
    g.state.player.lamp.on = false;
  }

  /* A fire is not a cone. This is the difference between the lamp you carry
     and the light you put down. */
  {
    L.clear();
    standAt(g, px, py);
    g.state.player.lamp.on = false;
    L.noteLight("test_fire", { x: px, y: py, r: 90, power: 1 });
    t.check("a placed light lights every direction, not a beam",
            L.lightFor(px + 20, py) > LIGHT_EDGE && L.lightFor(px - 20, py) > LIGHT_EDGE,
            L.lightFor(px - 20, py).toFixed(2));
    const c = L.spawnAt(px + CLOSE, py, 0);
    const f0 = c.x - px;
    g.tick(120);
    t.check("and a crawler will not walk into it", (c.x - px) > f0 - 8,
            f0.toFixed(1) + " -> " + (c.x - px).toFixed(1));
    L.forgetLight("test_fire");
    t.check("putting the fire out puts the dark back",
            L.lightFor(px + 20, py) < LIGHT_EDGE);
  }

  /* --------------------------------------------------------------- walls --
     The second defence, and the one the whole terrain model already
     guarantees: it cannot dig. Seal the shaft and you are sealed in. */
  {
    L.clear();
    standAt(g, px, py);
    const W = g.world;
    /* The wall goes between them and reaches the roof, and the crawler is
       put close enough to FEEL the player through it - otherwise this test
       would pass on a crawler that simply never noticed anybody, which is
       not the same fact at all. */
    const wallX = px + 18;
    for(let x = wallX; x < wallX + 8; x++)
      for(let k = 1; k <= 44; k++) W.setMat(x, chamber.floor - k, chamber.solid);
    t.check("a wall was built across the chamber, roof to floor",
            W.isSolid(wallX + 4, py) && W.isSolid(wallX + 4, chamber.floor - 40));

    const c = L.spawnAt(px + CLOSE, py, 0);
    t.check("and the crawler is close enough to know you are there",
            CLOSE < FEEL, CLOSE + " < " + FEEL);
    g.tick(300);
    t.check("a sealed shaft is sealed: it never gets past the wall",
            c.x > wallX + 4, c.x.toFixed(1) + " vs wall at " + wallX);
    t.check("and it did not dig its way through", W.isSolid(wallX + 4, py));

    for(let x = wallX; x < wallX + 8; x++)
      for(let k = 1; k <= 44; k++) W.setMat(x, chamber.floor - k, chamber.air);
  }

  /* --------------------------------------------------------------- quiet --
     The third defence. Digging carries four times as far as standing still. */
  {
    L.clear();
    standAt(g, px, py);
    const still = L.noiseRadius();
    g.state.player.digging = true;
    const loud = L.noiseRadius();
    g.state.player.digging = false;
    t.check("digging is heard from much further than standing still",
            loud > still * 3, still + " -> " + loud);

    /* Out of earshot and out of reach, it never notices. */
    const c = L.spawnAt(px + 300, py, 0);
    g.tick(120);
    t.check("a crawler outside earshot of a still player stays put",
            Math.abs(c.x - (px + 300)) < 6, (c.x - (px + 300)).toFixed(1));
  }

  /* ------------------------------------------------------------- distance --
     The camera may change how this is computed. It may not change what it
     comes to. */
  {
    L.clear();
    standAt(g, px, py);
    const c = L.spawnAt(px + CLOSE, py, 0);
    const camX = g.state.cam.x, camY = g.state.cam.y;
    g.state.cam.free = true;
    g.state.cam.x = px + 1400; g.state.cam.y = py;
    const d0 = c.x - px;
    g.tick(90);
    t.check("a crawler hunts the same with the camera a thousand pixels away",
            (c.x - px) < d0 - 8, d0.toFixed(1) + " -> " + (c.x - px).toFixed(1));
    g.state.cam.free = false;
    g.state.cam.x = camX; g.state.cam.y = camY;

    /* The PLAYER's distance is a different matter, and it is a rule. */
    L.clear();
    const far = L.spawnAt(px + AWAKE + 120, py, 0);
    const f0 = far.x;
    g.tick(120);
    t.check("with no player in range it has nothing to hunt and holds still",
            Math.abs(far.x - f0) < 4, (far.x - f0).toFixed(2));
  }

  /* --------------------------------------------------------------- biting --
     It reaches the player and lands a blow. The damage is announced and is
     not applied by this lane - state.player.energy is lane B's branch and
     the request for the one listener at their end is open in REQUESTS. */
  {
    L.clear();
    standAt(g, px, py);
    g.state.player.lamp.on = false;
    let bites = 0, worst = 0;
    const off = bus.on("creature:attack", e => { bites++; worst = Math.max(worst, e.damage); });
    L.spawnAt(px + 14, py, 0);
    g.tick(200);
    t.check("a crawler that reaches you bites", bites > 0, bites);
    t.check("and the blow carries its band's damage", worst === BANDS[0].damage, worst);
    off();
  }

  /* ---------------------------------------------------------- save / load --
     A creature that forgets it was wounded across a save is worse than no
     creature. */
  {
    L.clear();
    standAt(g, px, py);
    const c = L.spawnAt(px + 12, py, 1);
    g.state.player.aim.x = 1; g.state.player.aim.y = 0;
    L.swing();
    const life = g.systems.find(s => s.name === "life");
    const hurt = c.hp;
    t.check("it is wounded and not dead", hurt < c.hpMax && hurt > 0, hurt);

    const saved = JSON.parse(JSON.stringify(life.serialise()));
    L.clear();
    t.check("cleared away", L.creatureCount() === 0);
    life.restore(saved);
    const back = L.creatures()[0];
    t.check("a wounded crawler is still wounded after a save and a load",
            L.creatureCount() === 1 && Math.abs(back.hp - hurt) < 0.001,
            back ? back.hp : "gone");
    t.check("and it is still the same kind of crawler it was",
            back.band === BANDS[1].name && back.hpMax === BANDS[1].hp, back.band);
  }

  /* ------------------------------------------------- what lane J asked for --
     They own husbandry, this lane owns the animal. `creaturesNear` is the
     join, and `tame` and `fed` are on every row from the start so nothing has
     to change shape the day the first stock animal exists. */
  {
    L.clear();
    standAt(g, px, py);
    L.spawnAt(px + 20, py, 0);
    L.spawnAt(px + 200, py, 0);
    const near = L.creaturesNear(px, py, 60);
    t.check("creaturesNear finds what is in reach and not what is not",
            near.length === 1 && near[0].d < 60, near.length);
    t.check("and every row carries the husbandry fields, tame or not",
            near[0].tame === false && near[0].fed === 0);
    L.clear();
  }

  /* ------------------------------------------------------------- spawning --
     Only deep, only in the dark, and never in the player's lap. */
  {
    L.clear();
    standAt(g, px, py);
    let ok = 0;
    for(let i = 0; i < 400; i++) if(L.trySpawn()) ok++;
    t.check("candidate sites deep in a dark chamber do produce crawlers", ok > 0, ok);
    let tooClose = 0, tooShallow = 0, lit = 0;
    for(const c of L.creatures()){
      const d = Math.hypot(c.x - g.state.player.x, c.y - g.state.player.y);
      if(d < ATTACK_RANGE * 2) tooClose++;
      if(c.y - g.world.surfaceAt(c.x) < MIN_DEPTH) tooShallow++;
      if(L.lightFor(c.x, c.y) > LIGHT_EDGE) lit++;
    }
    t.check("none of them appeared in the player's lap", tooClose === 0, tooClose);
    t.check("none of them appeared near the surface", tooShallow === 0, tooShallow);
    t.check("none of them appeared in lit ground", lit === 0, lit);
    t.check("and the population is capped", L.creatureCount() <= L.config.MAX_ALIVE,
            L.creatureCount());
    L.clear();
  }

  L.clear();
  g.state.player.lamp.on = true;
  return t;
}
