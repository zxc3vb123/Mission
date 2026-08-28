/* LANE C owns this file: placing structures, holding them up, and storage. */

import { boot, suite } from "../testkit.js";
import { BUILDINGS, building } from "../../src/content/buildings.js";
import { ITEM_DATA } from "../../src/content/items.js";
import { drops } from "../../src/items/drops.js";
import { bus } from "../../src/core/bus.js";
import { mouse } from "../../src/core/input.js";
import { ROTATE_KEY, REMOVE_KEY } from "../../src/build/index.js";
import { probeCost } from "../../src/build/solid.js";

/* Put the clonk somewhere flat with the ground under its feet, and hand it
   the materials for `defId`. Returns the world x to build at. */
function siteBesidePlayer(g, defId, from = 400){
  const W = g.world;
  const { W: LW } = W.size();
  const def = building(defId);
  for(let x = from; x < LW-400; x += 7){
    const y = W.surfaceAt(x);
    /* flat enough across the whole footprint, and not under water */
    let flat = true;
    for(let k = -def.w; k <= def.w; k++){
      if(Math.abs(W.surfaceAt(x+k) - y) > 2){ flat = false; break; }
    }
    if(!flat) continue;
    if(y >= g.state.world.waterLevel) continue;
    g.actor.clonk.x = x; g.actor.clonk.y = y - 10;
    g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
    g.state.player.x = x; g.state.player.y = y - 10;
    return x;
  }
  return null;
}

function give(g, defId){
  const def = building(defId);
  g.items.inventory.setCapacity(9999);        /* hauling is tested elsewhere */
  for(const id in def.materials) g.items.inventory.add(id, def.materials[id]);
}

export function run(){
  const t = suite("build");
  const g = boot(31415);
  /* testkit.js is lane E's and does not hand out build.api, so take it from
     the system list rather than editing their file. */
  const B = g.systems.find(s => s.name === "build").api;

  /* ------------------------------------------------------------- basics --- */
  t.check("the build api is published", !!B && typeof B.place === "function");
  t.check("nothing is standing in a fresh world", B.all().length === 0);

  const x = siteBesidePlayer(g, "campfire");
  t.check("found flat ground to build on", x !== null, "x = " + x);

  /* ----------------------------------------------- refusing, with reasons --- */
  {
    g.items.inventory.reset();
    const r = B.canPlace("campfire", x, g.world.surfaceAt(x) - 4);
    t.check("you cannot build what you have no materials for",
            r.ok === false && r.reason === "missing materials", r.reason);
    t.check("and it says exactly what is missing",
            Array.isArray(r.missing) && r.missing.length > 0 &&
            r.missing.every(m => m.id && m.need > 0), JSON.stringify(r.missing));
  }
  {
    give(g, "campfire");
    const far = B.canPlace("campfire", x + 400, g.world.surfaceAt(x + 400) - 4);
    t.check("you cannot build out of reach",
            far.ok === false && far.reason === "too far away", far.reason);
  }
  {
    const r = B.canPlace("not_a_building", x, 10);
    t.check("an unknown building is refused, not crashed into", r.ok === false);
  }
  {
    /* a chest needs a workbench standing nearby, and there is none */
    g.items.inventory.reset();
    give(g, "chest");
    const r = B.canPlace("chest", x, g.world.surfaceAt(x) - 4);
    t.check("a building that needs a station is refused without one",
            r.ok === false && r.reason.indexOf("Workbench") >= 0, r.reason);
    /* The number matters as much as the name: "needs a Workbench" while one
       stands just out of range reads as a bug until you know how near is
       near enough. */
    t.check("and the refusal says which station and how near it must be",
            r.needsStation === "workbench" && r.within === B.stationRadius,
            r.needsStation + " within " + r.within + "px");
  }

  /* ------------------------------------------------------------ placing --- */
  let fire = null;
  {
    g.items.inventory.reset();
    give(g, "campfire");
    const before = g.items.inventory.count("rock");
    const r = B.place("campfire", x, g.world.surfaceAt(x) - 4);
    t.check("a campfire can be placed on flat ground", r.ok === true, r.reason || "");
    fire = r.structure;
    t.check("placing consumes the materials",
            g.items.inventory.count("rock") === before - BUILDINGS.campfire.materials.rock,
            before + " -> " + g.items.inventory.count("rock"));
    t.check("it stands on the ground, not in it or above it",
            fire && Math.abs((fire.y + fire.h) - g.world.surfaceAt(x)) <= 1,
            fire ? "bottom " + (fire.y+fire.h) + " vs surface " + g.world.surfaceAt(x) : "none");
  }

  /* --------------------------------------------------------- build time --- */
  {
    t.check("a new building is not finished the instant it appears",
            fire && fire.built === false && fire.progress < fire.need,
            fire ? fire.progress + "/" + fire.need : "none");
    t.check("an unfinished station does not count as built",
            B.has("campfire") === false);

    let announced = null;
    const off = bus.on("structure:built", e => { announced = e.defId; });
    g.tick(BUILDINGS.campfire.time * 36 + 4);
    off();
    t.check("it finishes after its build time", fire.built === true,
            fire.progress + "/" + fire.need);
    t.check("and says so when it does", announced === "campfire", String(announced));
    t.check("a finished station counts as built", B.has("campfire") === true);
  }

  /* ----------------------------------------------------- nothing overlaps --- */
  {
    g.items.inventory.reset();
    give(g, "campfire");
    const r = B.canPlace("campfire", x, g.world.surfaceAt(x) - 4);
    t.check("two things cannot stand in the same place",
            r.ok === false && r.reason === "something is already there", r.reason);
  }

  /* -------------------------------------- stations answer for crafting --- */
  {
    const p = g.state.player;
    const near = B.stationsNear(p.x, p.y, 60);
    t.check("stationsNear reports what you are standing at",
            near instanceof Set && near.has("campfire"),
            [...near].join(",") || "none");
    t.check("structuresNear finds it too",
            B.structuresNear(p.x, p.y, 60).length === 1);
    t.check("and nothing is near somewhere else entirely",
            B.structuresNear(p.x + 900, p.y, 40).length === 0);
  }

  /* ------------------------------------------------ nothing floats, ever --- */
  {
    let fell = null;
    const off = bus.on("structure:collapsed", e => { fell = e; });
    const droppedBefore = drops.length;
    for(let cx = fire.x - 2; cx < fire.x + fire.w + 2; cx++){
      g.world.digFreeCircle(cx, fire.y + fire.h + 3, 4, false);
    }
    g.tick(20);
    t.check("digging away its footing brings a building down",
            B.all().length === 0 && fell && fell.why === "unsupported",
            fell ? fell.why : "still standing");
    t.check("a collapse returns its materials rather than deleting them",
            drops.length > droppedBefore,
            (drops.length - droppedBefore) + " chunks left behind");

    /* conservation of matter: everything it was made of, back on the ground */
    const want = BUILDINGS.campfire.materials;
    const got = {};
    for(let i = droppedBefore; i < drops.length; i++) got[drops[i].id] = (got[drops[i].id]||0)+1;
    const short = Object.keys(want).filter(id => (got[id]||0) < want[id]);
    t.check("all of it comes back, because matter is conserved",
            short.length === 0, short.join(",") || JSON.stringify(got));
    off();
  }

  /* ------------------------------------------------------------ storage --- */
  {
    g.items.clearDrops();
    g.items.inventory.reset();

    /* a workbench first, because a chest is built at one */
    /* well clear of the crater the collapse test just dug */
    const bx = siteBesidePlayer(g, "workbench", x + 400);
    t.check("found fresh ground for a workbench", bx !== null, "x = " + bx);
    give(g, "workbench");
    const wb = B.place("workbench", bx, g.world.surfaceAt(bx) - 4);
    t.check("a workbench can be placed", wb.ok === true, wb.reason || "");
    g.tick(BUILDINGS.workbench.time * 36 + 4);

    give(g, "chest");
    const cx = bx + 26;
    const ch = B.place("chest", cx, g.world.surfaceAt(cx) - 4);
    t.check("a chest can be placed once a workbench stands", ch.ok === true,
            ch.reason || "");
    g.tick(BUILDINGS.chest.time * 36 + 4);

    const box = ch.ok ? B.storageAt(ch.structure.x + 2, ch.structure.y + 2) : null;
    t.check("there is storage where the chest is", !!box);
    t.check("but not in empty air", B.storageAt(cx, 5) === null);

    if(box){
      t.check("a chest holds far more than a back does",
              box.capacity() > ITEM_DATA.rock.mass * 7,
              box.capacity() + " kg");
      const put = box.add("rock", 10);
      t.check("things can be put in it",
              put === 10 && box.count("rock") === 10 &&
              Math.abs(box.mass() - 10*ITEM_DATA.rock.mass) < 1e-9,
              box.mass() + " kg inside");
      t.check("and taken out again",
              box.take("rock", 4) === 4 && box.count("rock") === 6);
      const room = box.fits("rock", 99999);
      box.add("rock", 99999);
      t.check("a chest is mass-limited too, not a hole in the world",
              box.mass() <= box.capacity() + 1e-9 && room < 99999,
              box.mass().toFixed(0) + " / " + box.capacity() + " kg");
    }
  }

  /* ---------------------------------------------------- surviving a save --- */
  {
    const sys = g.systems.find(s => s.name === "build");
    const before = B.all().length;
    t.check("there is something to save", before > 0, before + " standing");
    const saved = JSON.parse(JSON.stringify(sys.serialise()));

    sys.restore({ structures: [] });
    t.check("the world can be emptied", B.all().length === 0);

    sys.restore(saved);
    t.check("everything standing comes back", B.all().length === before,
            B.all().length + " restored");
    t.check("and comes back finished, not under construction again",
            B.all().every(s => s.built), "all built");
    const box = B.all().find(s => s.store);
    t.check("a chest comes back with its contents",
            !!(box && box.store.items.rock > 0),
            box ? JSON.stringify(box.store.items) : "no chest");
  }

  /* ------------------------------------------------ work in flight --- *
     Three kinds of structure state arrived after the save hook was first
     written - a station's job, a deconstruction under way, and a ladder
     held up by a wall rather than the ground. A save that quietly forgot
     any of them would eat the player's materials, so each is pinned.
   * ------------------------------------------------------------------ */
  {
    const sys = g.systems.find(s => s.name === "build");
    const inv = g.items.inventory;
    const raise = n => { for(let i=0;i<n;i++){ g.state.tick++; sys.tick(); } };

    sys.restore({ structures: [] });
    inv.reset(); inv.setCapacity(9999);

    /* A stretch long enough for a workbench AND a kiln beside it.
       siteBesidePlayer only promises flat ground under one footprint. */
    let kx = null;
    for(let sx = x + 900; sx < g.world.size().W - 300; sx += 5){
      const y0 = g.world.surfaceAt(sx);
      if(y0 >= g.state.world.waterLevel) continue;
      let ok = true;
      for(let k = -20; k < 70; k++)
        if(Math.abs(g.world.surfaceAt(sx+k) - y0) > 3){ ok = false; break; }
      if(ok){ kx = sx; break; }
    }
    t.check("there is a stretch long enough for two buildings", kx !== null,
            "x = " + kx);
    g.state.player.x = kx; g.actor.clonk.x = kx;
    g.state.player.y = g.world.surfaceAt(kx) - 10;
    g.actor.clonk.y = g.state.player.y;
    give(g, "workbench");
    const bench = B.place("workbench", kx, g.world.surfaceAt(kx) - 4);
    t.check("a workbench for the in-flight save checks", bench.ok === true,
            bench.reason || "at x " + kx);
    raise(BUILDINGS.workbench.time * 36 + 8);

    /* A kiln, loaded and burning. Stand BETWEEN the two: the workbench has
       to be within the station radius to build at, and the kiln site within
       arm's reach. */
    g.state.player.x = kx + 20; g.actor.clonk.x = kx + 20;
    g.state.player.y = g.world.surfaceAt(kx + 20) - 10;
    g.actor.clonk.y = g.state.player.y;
    give(g, "kiln");
    const kiln = B.place("kiln", kx + 45, g.world.surfaceAt(kx + 45) - 4);
    t.check("a kiln for the in-flight save checks", kiln.ok === true, kiln.reason || "");
    raise(BUILDINGS.kiln.time * 36 + 8);

    /* now stand at the kiln to load it */
    g.state.player.x = kx + 45; g.actor.clonk.x = kx + 45;
    g.state.player.y = g.world.surfaceAt(kx + 45) - 10;
    g.actor.clonk.y = g.state.player.y;
    inv.add("wood", 8);
    g.items.craft("charcoal");
    raise(100);

    /* and the workbench being taken apart */
    const wb = B.all().find(s => s.defId === "workbench");
    if(wb) B.deconstruct(wb.x + 2, wb.y + 2);
    raise(30);

    const burning = B.all().find(s => s.defId === "kiln");
    const jobTicks = burning && burning.job && burning.job.ticks;
    const takeTicks = wb && wb.taking && wb.taking.ticks;
    t.check("there is work in flight to save", jobTicks > 0 && takeTicks > 0,
            "job " + jobTicks + ", takedown " + takeTicks);

    const saved = JSON.parse(JSON.stringify(sys.serialise()));
    sys.restore({ structures: [] });
    sys.restore(saved);

    const k2 = B.all().find(s => s.defId === "kiln");
    t.check("a kiln left burning is still burning after a save",
            !!(k2 && k2.job) && k2.job.ticks === jobTicks,
            k2 && k2.job ? k2.job.ticks + "/" + k2.job.need : "no job");
    t.check("and still holding the materials it was given, or they would be lost",
            !!(k2 && k2.job && k2.job.inputs.wood > 0),
            k2 && k2.job ? JSON.stringify(k2.job.inputs) : "none");

    const w2 = B.all().find(s => s.defId === "workbench");
    t.check("a takedown under way is still under way after a save",
            !!(w2 && w2.taking) && w2.taking.ticks === takeTicks,
            w2 && w2.taking ? w2.taking.ticks + "/" + w2.taking.need : "not being taken apart");

    /* it must still FINISH, not merely look right */
    if(k2 && k2.job) raise(k2.job.need);
    /* The player is standing at the kiln, so the charcoal is handed straight
       over rather than waiting in the store - which is the collection rule
       doing its job, not the store failing to fill. */
    t.check("and the restored job runs to completion",
            !!k2 && k2.job === null &&
            ((k2.store.items.charcoal || 0) + inv.count("charcoal")) > 0,
            k2 ? "in the kiln " + JSON.stringify(k2.store.items) +
                 ", carried " + inv.count("charcoal") : "no kiln");

    sys.restore({ structures: [] });
    inv.reset();
    g.items.clearDrops();
  }

  /* ------------------------------------------------------------------ *
     A CLICK IS EITHER THE BUILD MENU'S OR THE SHOVEL'S, NEVER BOTH.
     Lane B swings while the mouse is held and cannot see the ghost, so the
     same press used to place a building AND take a bite out of the ground
     under it - which matters because a building needs its footing and could
     lose it to the very click that placed it.
   * ------------------------------------------------------------------ */
  {
    const sys = g.systems.find(s => s.name === "build");
    const inv = g.items.inventory;
    sys.restore({ structures: [] });
    inv.reset(); inv.setCapacity(9999);

    const cx = siteBesidePlayer(g, "campfire", 400);
    give(g, "campfire");

    const seen = [];
    const off = bus.on("build:ghost", e => seen.push(e.active));

    t.check("an idle build system does not claim clicks",
            B.claimingClicks() === false);

    B.ghost("campfire");
    t.check("arming a ghost claims the click, and says so on the bus",
            B.claimingClicks() === true && seen[seen.length-1] === true,
            JSON.stringify(seen));

    mouse.wx = cx; mouse.wy = g.world.surfaceAt(cx) - 4;
    bus.emit("input:mouse", { button:0, down:true });
    t.check("the click places the building", B.all().length === 1);
    t.check("and the ghost is spent, one click one building",
            B.ghostDef() === null);

    /* THE POINT: the ghost is gone but the button is still down, so the
       claim has to outlive it or the next tick digs under what was just
       placed. */
    t.check("but the claim outlives the ghost while the button is still down",
            B.claimingClicks() === true);

    bus.emit("input:mouse", { button:0, down:false });
    t.check("releasing the button hands clicks back to the shovel",
            B.claimingClicks() === false && seen[seen.length-1] === false,
            JSON.stringify(seen));
    off();

    /* a refused click keeps the ghost, so the player can simply try again */
    inv.reset();
    B.ghost("campfire");
    bus.emit("input:mouse", { button:0, down:true });
    t.check("a refused placement keeps the ghost armed to try again",
            B.ghostDef() === "campfire" && B.claimingClicks() === true);
    bus.emit("input:mouse", { button:0, down:false });
    B.clearGhost();
    t.check("and clearing the ghost releases the claim",
            B.claimingClicks() === false);

    sys.restore({ structures: [] });
    inv.reset();
    g.items.clearDrops();
  }

  /* ------------------------------------------------------------------ *
     REACHABLE BY A PLAYER, not merely published.

     An audit of every api this lane publishes - the call-site rule in
     docs/WORKFLOW.md 4c - found three finished features nothing could
     invoke. Rotation and deconstruction are world actions on state this
     lane owns, so they are bound here rather than waiting for a screen: a
     misplaced building being permanent was the whole thing deconstruction
     was built to fix, and a beam that cannot stand on end is half the house.
   * ------------------------------------------------------------------ */
  {
    const sys = g.systems.find(s => s.name === "build");
    const inv = g.items.inventory;
    const raise = n => { for(let i=0;i<n;i++){ g.state.tick++; sys.tick(); } };
    sys.restore({ structures: [] });
    inv.reset(); inv.setCapacity(9999);

    /* --- the keys are published, not just bound --- */
    t.check("both world keys are published so the guidebook can print them",
            B.rotateKey === ROTATE_KEY && B.removeKey === REMOVE_KEY,
            B.rotateKey + " / " + B.removeKey);
    t.check("and neither collides with a key another lane already owns",
            ROTATE_KEY !== "t" && REMOVE_KEY !== "t",
            "t belongs to the sandbox's master mode");

    /* --- a key turns the armed piece --- */
    {
      B.ghost("plank_beam");
      const before = B.ghostRot();
      bus.emit("input:key", { key: ROTATE_KEY, down:true });
      t.check("a key turns the armed piece, so a beam can stand as a post",
              B.ghostRot() === !before, "rot " + before + " -> " + B.ghostRot());
      bus.emit("input:key", { key: ROTATE_KEY, down:true });
      t.check("and turns it back", B.ghostRot() === before);
      B.clearGhost();
      bus.emit("input:key", { key: ROTATE_KEY, down:true });
      t.check("with nothing armed it does nothing", B.ghostRot() === before);
    }

    /* --- a key takes down what the cursor is on --- */
    {
      const bx = siteBesidePlayer(g, "campfire", x + 1400);
      t.check("somewhere fresh to put a campfire", bx !== null, "x = " + bx);
      give(g, "campfire");
      const fire = B.place("campfire", bx, g.world.surfaceAt(bx) - 4);
      t.check("a campfire to take down again", fire.ok === true, fire.reason || "");
      raise(BUILDINGS.campfire.time * 36 + 8);

      mouse.wx = fire.structure.x + 2; mouse.wy = fire.structure.y + 2;
      bus.emit("input:key", { key: REMOVE_KEY, down:true });
      t.check("a key starts taking down what the cursor is on",
              !!fire.structure.taking,
              fire.structure.taking ? "under way" : "nothing happened");

      /* pressing it again calls the takedown off rather than doubling it */
      bus.emit("input:key", { key: REMOVE_KEY, down:true });
      t.check("pressing it again changes your mind rather than hurrying it",
              !fire.structure.taking);

      /* and it must actually finish, not just start */
      bus.emit("input:key", { key: REMOVE_KEY, down:true });
      raise(BUILDINGS.campfire.time * 36 + 8);
      t.check("seeing it through removes the building",
              B.all().length === 0, B.all().length + " left standing");
    }

    /* --- you have to be at a thing to take it apart --- */
    {
      sys.restore({ structures: [] });
      inv.reset(); inv.setCapacity(9999);
      const bx = siteBesidePlayer(g, "campfire", x + 1800);
      give(g, "campfire");
      const fire = B.place("campfire", bx, g.world.surfaceAt(bx) - 4);
      raise(BUILDINGS.campfire.time * 36 + 8);

      g.actor.clonk.x = bx + 600; g.state.player.x = bx + 600;
      const far = B.deconstruct(fire.structure.x + 2, fire.structure.y + 2);
      t.check("you cannot take a building apart from across the map",
              far.ok === false && far.reason === "too far away", far.reason);
      t.check("and it is left standing", B.all().length === 1);

      g.actor.clonk.x = bx; g.state.player.x = bx;
      g.actor.clonk.y = g.world.surfaceAt(bx) - 10;
      g.state.player.y = g.actor.clonk.y;
      const near = B.deconstruct(fire.structure.x + 2, fire.structure.y + 2);
      t.check("but you can when you are standing at it", near.ok === true,
              near.reason || "");
    }

    sys.restore({ structures: [] });
    inv.reset();
    g.items.clearDrops();
  }

  /* ------------------------------------------------------------------ *
     THE EVENTS ANOTHER LANE KEYS OFF.

     Lane A's cave-ins register a prop by listening to structure:placed and
     drop it on structure:collapsed, keying on defId and position. They never
     import this lane, which is right - but it means the SHAPE of these
     events is a contract, and a rename here would silently stop tunnels
     from being propped. Pinned from this side so it cannot drift.
   * ------------------------------------------------------------------ */
  {
    const sys = g.systems.find(s => s.name === "build");
    const inv = g.items.inventory;
    const raise = n => { for(let i=0;i<n;i++){ g.state.tick++; sys.tick(); } };
    sys.restore({ structures: [] });
    inv.reset(); inv.setCapacity(9999);

    const bx = siteBesidePlayer(g, "campfire", x + 2200);
    give(g, "campfire");

    let placed = null, removed = null, collapsed = null;
    const offP = bus.on("structure:placed", e => { placed = e; });
    const offR = bus.on("structure:removed", e => { removed = e; });
    const offC = bus.on("structure:collapsed", e => { collapsed = e; });

    const fire = B.place("campfire", bx, g.world.surfaceAt(bx) - 4);
    t.check("placing announces defId and position, which is the key lane A uses",
            !!placed && placed.defId === "campfire" &&
            placed.x === fire.structure.x && placed.y === fire.structure.y,
            JSON.stringify(placed));
    t.check("and whether it was turned, since that decides its footprint",
            placed && typeof placed.rot === "boolean", String(placed && placed.rot));

    raise(BUILDINGS.campfire.time * 36 + 8);
    B.deconstruct(fire.structure.x + 2, fire.structure.y + 2);
    raise(BUILDINGS.campfire.time * 36 + 8);

    t.check("taking one down announces the SAME defId and position",
            !!removed && removed.defId === placed.defId &&
            removed.x === placed.x && removed.y === placed.y,
            JSON.stringify(removed && { defId:removed.defId, x:removed.x, y:removed.y }));
    t.check("and says it was deliberate rather than a collapse",
            removed && removed.why === "deconstructed" && collapsed === null,
            removed && removed.why);
    offP(); offR(); offC();

    sys.restore({ structures: [] });
    inv.reset();
    g.items.clearDrops();
  }

  /* ------------------------------------------------------------------ *
     YOU CAN STAND ON WHAT YOU BUILT.

     The owner: "i cant stand on planks even when i put them to walls.
     theres a plank floor -> i go down on it -> go through it." It was not a
     plank bug - NO built structure had collision at all. The actor tests
     world.isSolid, the pixel material, and structures were never written
     into it, so every floor, beam, foundation and workbench in the game was
     a picture you walked through. A house you fall through is not a house.

     solidAt is a QUERY rather than a stored flag, on purpose: a player
     standing on a plank that is taken down should fall the instant it is
     gone, and a query cannot go stale the way a written flag can.
   * ------------------------------------------------------------------ */
  {
    const sys = g.systems.find(s => s.name === "build");
    const inv = g.items.inventory;
    const raise = n => { for(let i=0;i<n;i++){ g.state.tick++; sys.tick(); } };
    sys.restore({ structures: [] });
    inv.reset(); inv.setCapacity(99999);

    t.check("the build lane answers what a body collides with",
            typeof B.solidAt === "function");

    /* somewhere a plank floor will go */
    let sx = null;
    for(let x = 300; x < g.world.size().W - 300 && sx === null; x += 7){
      if(g.world.surfaceAt(x) >= g.state.world.waterLevel) continue;
      g.actor.clonk.x = x; g.state.player.x = x;
      g.actor.clonk.y = g.world.surfaceAt(x) - 10; g.state.player.y = g.actor.clonk.y;
      if(B.canPlace("plank_floor", x, g.world.surfaceAt(x) - 2).reason === "missing materials") sx = x;
    }
    t.check("somewhere to lay a floor", sx !== null, "x = " + sx);
    const ground = g.world.surfaceAt(sx);
    inv.add("plank", 20);

    const floor = B.place("plank_floor", sx, ground - 2);
    t.check("a plank floor goes down", floor.ok === true, floor.reason || "");
    const mid = { x: floor.structure.x + 2, y: floor.structure.y + 1 };

    /* --- a half-built floor is not something to stand on --- */
    t.check("an unfinished floor is not solid, or you seal yourself inside "
            + "your own scaffolding",
            B.solidAt(mid.x, mid.y) === null);

    raise(BUILDINGS.plank_floor.time * 36 + 8);
    t.check("a finished floor is solid - the thing the owner asked for",
            !!B.solidAt(mid.x, mid.y),
            B.solidAt(mid.x, mid.y) ? "solid" : "still a picture");
    t.check("and only where it actually is",
            B.solidAt(mid.x + 500, mid.y) === null);

    /* solid from every side, not a one-way platform */
    {
      const s = floor.structure;
      const above = B.solidAt(s.x + 1, s.y);
      const below = B.solidAt(s.x + 1, s.y + s.h - 1);
      t.check("solid from above and below alike, not a one-way platform",
              !!above && !!below, (above?"above ":"") + (below?"below":""));
    }

    /* --- a ladder is for climbing, not for colliding with --- */
    {
      const lx = sx + 200;
      for(let d = 0; d < 80; d++)
        g.world.digFreeCircle(lx, g.world.surfaceAt(lx) + d, 3, false, "iron_pickaxe");
      const ly = g.world.surfaceAt(lx) + 30;
      g.actor.clonk.x = lx; g.state.player.x = lx;
      g.actor.clonk.y = ly; g.state.player.y = ly;
      inv.add("wood", 4); inv.add("rope", 4);
      const lad = B.place("ladder", lx, ly);
      t.check("a ladder goes up in the shaft", lad.ok === true, lad.reason || "");
      if(lad.ok){
        raise(BUILDINGS.ladder.time * 36 + 8);
        t.check("a ladder is climbable but NOT solid - you go up it, you do "
                + "not stand against it",
                !!B.climbableAt(lx, ly) &&
                B.solidAt(lad.structure.x + 1, lad.structure.y + 1) === null,
                "climb yes, collide no");
      }
    }

    /* --- take the floor away and it stops holding anyone up --- */
    {
      g.actor.clonk.x = mid.x; g.state.player.x = mid.x;
      g.actor.clonk.y = floor.structure.y - 6; g.state.player.y = g.actor.clonk.y;
      t.check("the floor is there to stand on", !!B.solidAt(mid.x, mid.y));
      const d = B.deconstruct(mid.x, mid.y);
      raise((d.ticks || 0) + 4);
      t.check("taking it down stops it holding anyone up, at once",
              B.solidAt(mid.x, mid.y) === null,
              "a query cannot go stale the way a stored flag can");
    }

    /* --- and it must not get slower the more you build --- *
       Lane B tests solidity several times a tick per probe point, so walking
       the structure list would make the game slower the more the player
       builds - exactly backwards. Measured by how many structures a query
       actually examines rather than by a clock, which would be flaky. */
    {
      sys.restore({ structures: [] });
      inv.reset(); inv.setCapacity(999999);
      inv.add("plank", 400);

      const y = ground - 2;
      let laid = 0;
      for(let k = 0; k < 120; k++){
        const x = sx + k * 26;
        if(g.world.surfaceAt(x) >= g.state.world.waterLevel) continue;
        g.actor.clonk.x = x; g.state.player.x = x;
        g.actor.clonk.y = g.world.surfaceAt(x) - 10; g.state.player.y = g.actor.clonk.y;
        if(B.place("plank_floor", x, g.world.surfaceAt(x) - 2).ok) laid++;
      }
      raise(BUILDINGS.plank_floor.time * 36 + 8);
      t.check("a long row of floor to probe against", laid > 20,
              laid + " pieces laid");

      B.solidAt(sx + 2, y);
      const cost = probeCost();
      t.check("a solidity probe looks at a handful of structures, not all of "
              + "them", cost <= 8, "examined " + cost + " of " + laid);

      sys.restore({ structures: [] });
    }

    inv.reset();
    g.items.clearDrops();
    sys.restore({ structures: [] });
  }

  return t;
}

