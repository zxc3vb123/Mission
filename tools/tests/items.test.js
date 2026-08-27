/* LANE C owns this file: dug material becoming items, inventory. */

import { boot, suite, findMaterial } from "../testkit.js";
import { MATS, M_COAL, M_IRON } from "../../src/world/materials.js";
import { bus } from "../../src/core/bus.js";
import { CARRY_START, CARRY_BEST, ITEM_DATA } from "../../src/content/items.js";

export function run(){
  const t = suite("items");
  const g = boot(31415);
  const W = g.world;

  /* digging a coal seam has to yield coal */
  const coal = findMaterial(W, M_COAL, 10);
  if(coal){
    const before = g.items.dropCount();
    for(let k=0;k<12;k++) W.digFreeCircle(coal.x+k, coal.y, 6, true);
    t.check("digging coal drops coal chunks", g.items.dropCount() > before,
            before+" -> "+g.items.dropCount());
  } else t.check("found a coal seam", false);

  /* a chunk lying next to the clonk is picked up */
  {
    const p = g.state.player;
    g.items.spawnDrop(p.x, p.y-6, "iron_ore");
    const had = g.items.inventory.count("iron_ore");
    g.tick(40);
    t.check("chunks are picked up when walked over",
            g.items.inventory.count("iron_ore") > had,
            "iron_ore "+had+" -> "+g.items.inventory.count("iron_ore"));
  }

  /* inventory bookkeeping */
  g.items.inventory.add("copper_ore", 3);
  t.check("inventory adds", g.items.inventory.count("copper_ore")===3);
  t.check("inventory refuses to overdraw", g.items.inventory.take("copper_ore", 9)===false);
  t.check("inventory takes what is there", g.items.inventory.take("copper_ore", 3)===true &&
          g.items.inventory.count("copper_ore")===0);
  t.check("carried mass is tracked", g.items.inventory.carriedMass() >= 0);

  /* every material that yields something must name a registered item */
  {
    const bad = [];
    for(const M of MATS){
      if(!M.dig2) continue;
      if(!g.items.items[M.dig2]) bad.push(M.name+" -> "+M.dig2);
    }
    t.check("every ore maps to a registered item", bad.length===0, bad.join(", ") || "all resolve");
  }

  /* ------------------------------------------------------------------ *
     The backpack is mass-limited (docs/DECISIONS.md, "Carrying is
     mass-limited, human scale"). These checks exist because relaxing the
     limit would quietly delete the reason lane D exists.
   * ------------------------------------------------------------------ */
  const inv = g.items.inventory;
  inv.clear();

  /* masses are kilograms now, not the old unscaled numbers */
  t.check("item masses are lane F's kilograms",
          g.items.itemDef("rock").mass === ITEM_DATA.rock.mass &&
          g.items.itemDef("rock").mass === 5,
          "rock = " + g.items.itemDef("rock").mass + " kg");

  t.check("a fresh pack is the starting capacity", inv.capacity() === CARRY_START,
          inv.capacity() + " kg");

  /* the ratio the whole hauling game is tuned against */
  {
    inv.clear();
    const rocks = inv.add("rock", 99);
    const massAfter = inv.carriedMass();
    t.check("a 35 kg pack holds seven rocks and no more", rocks === 7,
            rocks + " rocks = " + massAfter + " kg");
    t.check("add reports what it actually took, not what was asked",
            rocks < 99 && inv.count("rock") === rocks, "asked 99, took " + rocks);
    t.check("carried mass never exceeds capacity",
            massAfter <= inv.capacity() + 1e-9, massAfter + " <= " + inv.capacity());
    t.check("a full pack refuses the next chunk", inv.add("rock", 1) === 0);
    t.check("a full pack knows it is full", inv.isFull() === true);
  }

  /* deep ore is meant to be worse: four chunks, not seven */
  {
    inv.clear();
    const n = inv.add("uranium_ore", 99);
    t.check("deep ore fills the pack in four chunks", n === 4,
            n + " x " + ITEM_DATA.uranium_ore.mass + " kg");
  }

  /* free space, partial fills and the burden ramp */
  {
    inv.clear();
    inv.add("rock", 5);                       /* 25 kg of 35 */
    t.check("free mass is what is left", Math.abs(inv.freeMass() - 10) < 1e-9,
            inv.freeMass() + " kg spare");
    t.check("fits() answers how many would go in", inv.fits("rock", 5) === 2,
            "room for 2 more");
    t.check("canAccept refuses a stack that will not fit",
            inv.canAccept("rock", 2) === true && inv.canAccept("rock", 3) === false);
    const took = inv.add("rock", 5);
    t.check("a stack too big is taken in part", took === 2 && inv.count("rock") === 7,
            "took " + took + " of 5");
  }
  {
    inv.clear();
    t.check("an empty pack does not slow you", inv.encumbrance() === 0);
    inv.add("rock", 4);                       /* 20 kg of 35, under the ramp */
    t.check("a light load does not slow you", inv.encumbrance() === 0,
            "load " + inv.load().toFixed(2));
    inv.add("rock", 3);                       /* full */
    t.check("a full load is maximum burden", inv.encumbrance() === 1,
            "load " + inv.load().toFixed(2));
    t.check("burden ramps rather than switching on",
            inv.encumbrance() > 0 && inv.encumbrance() <= 1);
  }

  /* a better pack carries more */
  {
    inv.clear();
    inv.setCapacity(CARRY_BEST);
    const n = inv.add("rock", 99);
    t.check("the best pack carries meaningfully more", n === 12 && n > 7,
            CARRY_BEST + " kg = " + n + " rocks");
    inv.clear();
    t.check("emptying a pack does not shrink it", inv.capacity() === CARRY_BEST &&
            inv.carriedMass() === 0, "still " + inv.capacity() + " kg");
    inv.reset();
    t.check("reset() puts the starting pack back", inv.capacity() === CARRY_START);
  }

  /* a save is a fact, not a pickup: restoring never sheds a load */
  {
    inv.clear();
    inv.restoreCounts({ rock: 20 });          /* 100 kg, far over the limit */
    t.check("restoring a save keeps everything it saved",
            inv.count("rock") === 20 && inv.carriedMass() === 100,
            inv.carriedMass() + " kg in a " + inv.capacity() + " kg pack");
    t.check("an overloaded pack reports load above 1", inv.load() > 1,
            inv.load().toFixed(2));
    t.check("an overloaded pack still refuses more", inv.add("rock", 1) === 0);
    inv.clear();
  }

  /* --- a full pack leaves the chunk on the ground --- */
  {
    inv.clear();
    g.items.clearDrops();
    inv.add("rock", 99);                      /* full */
    const p = g.state.player;
    let refusals = 0;
    const off = bus.on("pickup:refused", () => refusals++);
    g.items.spawnDrop(p.x, p.y-6, "iron_ore");
    g.tick(60);
    t.check("a full pack leaves the chunk where it lies",
            g.items.dropCount() === 1 && inv.count("iron_ore") === 0,
            g.items.dropCount() + " chunk still there");
    t.check("refusal is announced once, not every tick", refusals === 1,
            refusals + " refusals over 60 ticks");

    /* make room and the same chunk is taken */
    inv.take("rock", 7);
    g.tick(30);
    t.check("making room lets the chunk be picked up after all",
            inv.count("iron_ore") === 1 && g.items.dropCount() === 0,
            "iron_ore " + inv.count("iron_ore"));
    off();
    inv.clear();
    g.items.clearDrops();
  }

  /* --- what a save file has to remember (docs/REQUESTS.md, core -> items) --- */
  {
    const sys = g.systems.find(s => s.name === "items");
    inv.clear();
    inv.setCapacity(CARRY_BEST);
    g.items.clearDrops();
    g.items.spawnDrop(120, 60, "coal");
    g.items.spawnDrop(140, 60, "clay");
    const saved = JSON.parse(JSON.stringify(sys.serialise()));

    inv.clear();
    g.items.clearDrops();
    sys.restore(saved);
    t.check("a save puts the upgraded pack back", inv.capacity() === CARRY_BEST,
            inv.capacity() + " kg");
    t.check("a save puts the chunks on the ground back", g.items.dropCount() === 2,
            g.items.dropCount() + " chunks");
    /* leave the pack as we found it, so the next suite starts clean */
    inv.reset();
    g.items.clearDrops();
  }

  /* ------------------------------------------------------------------ *
     The hotbar and the equipped item. The bar is a view onto the pack,
     not storage: lane B reads equipped() to know what it is digging with.
   * ------------------------------------------------------------------ */
  {
    const hb = g.items.hotbar;
    inv.reset(); hb.reset();

    t.check("an empty pack means empty hands", g.items.equipped() === null);

    inv.add("rock", 2);
    inv.add("coal", 2);
    t.check("what you pick up lands on the bar in order",
            hb.slots()[0] === "rock" && hb.slots()[1] === "coal",
            hb.slots().slice(0,3).join(","));
    t.check("the first slot is in your hands to start",
            g.items.equipped().id === "rock" && hb.selected() === 0);
    t.check("the equipped item carries its definition and count",
            g.items.equipped().def.name === "Rock" && g.items.equipped().count === 2,
            g.items.equipped().count + " x " + g.items.equipped().def.name);

    /* number keys pick a slot */
    bus.emit("input:key", { key:"2", down:true });
    t.check("a number key puts that slot in your hands",
            hb.selected() === 1 && g.items.equipped().id === "coal");
    bus.emit("input:key", { key:"7", down:true });
    t.check("selecting an empty slot empties your hands",
            hb.selected() === 6 && g.items.equipped() === null);
    bus.emit("input:key", { key:"9", down:true });
    t.check("a key with no slot behind it changes nothing", hb.selected() === 6);

    /* equipping is announced, and only when it actually changes */
    {
      const seen = [];
      const off = bus.on("item:equipped", e => seen.push(e.id));
      hb.select(0);
      hb.select(0);
      hb.select(1);
      off();
      t.check("equipping is announced once per real change",
              seen.length === 2 && seen[0] === "rock" && seen[1] === "coal",
              seen.join(" -> ") || "nothing announced");
    }

    /* using the last of something takes it off the bar and out of your hands */
    hb.select(1);
    inv.take("coal", 2);
    t.check("running out empties the slot and the hands",
            hb.slots()[1] === null && g.items.equipped() === null,
            hb.slots().slice(0,3).join(",") || "empty");

    /* rearranging swaps rather than losing anything */
    inv.add("stick", 1);
    hb.reset(); resyncBar(inv);
    t.check("a swap keeps both items on the bar",
            hb.assign(0, "stick") === true &&
            hb.slots()[0] === "stick" && hb.slots().includes("rock"),
            hb.slots().slice(0,3).join(","));
    t.check("you cannot put something you are not carrying on the bar",
            hb.assign(2, "gold_ore") === false);

    /* the bar never holds what the pack does not */
    {
      const ghosts = hb.slots().filter(id => id !== null && inv.count(id) <= 0);
      t.check("nothing sits on the bar that is not in the pack",
              ghosts.length === 0, ghosts.join(",") || "clean");
    }

    /* a full bar of eight does not shed the ninth item */
    {
      inv.reset(); hb.reset();
      const nine = ["rock","coal","clay","sand","gravel","stick","plant_fibre",
                    "quartz","limestone"];
      for(const id of nine) inv.add(id, 1);
      const on = hb.slots().filter(Boolean).length;
      t.check("a full bar holds eight and the pack still holds the rest",
              on === 8 && inv.count("limestone") === 1,
              on + " on the bar, " + nine.length + " carried");
    }

    /* the bar and the hands survive a save */
    {
      const sys = g.systems.find(s => s.name === "items");
      inv.reset(); hb.reset();
      inv.add("rock", 2); inv.add("coal", 2);
      hb.select(1);
      const saved = JSON.parse(JSON.stringify(sys.serialise()));
      const carried = inv.all();

      inv.reset(); hb.reset();
      sys.restore(saved);
      inv.restoreCounts(carried);        /* core puts the items back after us */
      t.check("the bar comes back with the same arrangement",
              hb.slots()[0] === "rock" && hb.slots()[1] === "coal",
              hb.slots().slice(0,3).join(","));
      t.check("you are still holding what you were holding",
              hb.selected() === 1 && g.items.equipped().id === "coal");
    }

    inv.reset(); hb.reset();
    g.items.clearDrops();
  }

  return t;
}

/* The bar rebuilds itself from the pack on any inventory change; this pokes
   it after a reset() so a test can arrange the bar without a fresh pickup. */
function resyncBar(inv){ inv.add("rock", 0); bus.emit("inv:changed", { id:null }); }
