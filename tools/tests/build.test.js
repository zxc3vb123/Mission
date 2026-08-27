/* LANE C owns this file: placing structures, holding them up, and storage. */

import { boot, suite } from "../testkit.js";
import { BUILDINGS, building } from "../../src/content/buildings.js";
import { ITEM_DATA } from "../../src/content/items.js";
import { drops } from "../../src/items/drops.js";
import { bus } from "../../src/core/bus.js";

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

  return t;
}
