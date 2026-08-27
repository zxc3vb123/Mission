/* LANE C owns this file: dug material becoming items, inventory. */

import { boot, suite, findMaterial } from "../testkit.js";
import { MATS, M_COAL, M_IRON } from "../../src/world/materials.js";
import { bus } from "../../src/core/bus.js";
import { CARRY_START, CARRY_BEST, ITEM_DATA } from "../../src/content/items.js";
import { drops } from "../../src/items/drops.js";
import { keys } from "../../src/core/input.js";

/* The surface is scattered with gatherables now, so a bare dropCount() is
   no longer a statement about the chunk a test just spawned. */
const countOf = id => drops.filter(d => d.id === id).length;

/* The scatter step lives in gatherables.js; this only has to bucket drops
   that landed together, so being roughly right is enough. */
const STEP_GUESS = 40;

export function run(){
  const t = suite("items");
  const g = boot(31415);
  const W = g.world;

  /* Digging a coal seam has to yield coal. Coal is a tier 1 material, so
     this needs the pickaxe in hand: hands and shovels bounce off rock, and
     that gate is the reason a starting shovel no longer reaches uranium. */
  g.items.inventory.add("stone_pickaxe", 1);
  g.items.hotbar.select(g.items.hotbar.slots().indexOf("stone_pickaxe"));
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
            countOf("iron_ore") === 1 && inv.count("iron_ore") === 0,
            countOf("iron_ore") + " chunk still there");
    t.check("refusal is announced once, not every tick", refusals === 1,
            refusals + " refusals over 60 ticks");

    /* make room and the same chunk is taken */
    inv.take("rock", 7);
    g.tick(30);
    t.check("making room lets the chunk be picked up after all",
            inv.count("iron_ore") === 1 && countOf("iron_ore") === 0,
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

  /* ------------------------------------------------------------------ *
     Surface gatherables. Stage 0 tells the player to gather sticks, fibre
     and a loose rock; nothing else in the world yields any of the three,
     so without these the first instruction the game gives is impossible.
   * ------------------------------------------------------------------ */
  {
    const gs = g.systems.find(s => s.name === "gatherables");
    inv.reset();
    /* Earlier blocks emptied the surface, and a world is only scattered once
       when it is generated, so lay it again rather than testing a swept floor. */
    g.items.clearDrops();
    gs.api.seedSurface();

    t.check("a new world has loose things lying on it", gs.api.wildCount() > 0,
            gs.api.wildCount() + " gatherables");

    /* the three the stage 0 chain is made of, and nothing else */
    {
      const kinds = {};
      for(const d of drops) if(d.wild) kinds[d.id] = (kinds[d.id]||0)+1;
      const ids = Object.keys(kinds).sort();
      t.check("only the three stage 0 gatherables are scattered",
              ids.length === 3 && ids.join(",") === "plant_fibre,rock,stick",
              ids.join(",") || "nothing");
      t.check("wood is never lying about - the axe is what fells trees",
              !kinds.wood, "wood on the ground: " + (kinds.wood||0));

      /* LOAD-BEARING FOR THE WHOLE GAME. A stone pickaxe is made of rock,
         and rock needs a stone pickaxe to dig. Loose rock on the surface is
         the only thing that breaks that deadlock, so if this ever stops
         yielding rock the game becomes uncompletable in its first minute
         and nothing else in the codebase would notice. Reduce the amount if
         balance needs it; never the existence. */
      t.check("rock is always gatherable by hand, or the game cannot be started",
              (kinds.rock||0) > 0, (kinds.rock||0) + " loose rocks in the world");
      t.check("every gatherable is a real item lane F has named",
              ids.every(id => !!ITEM_DATA[id]), ids.join(","));
    }

    /* the whole stage 0 chain has to be reachable, not merely present:
       knife (1 rock 1 stick 2 fibre), rope (4 fibre), axe (2 rock 1 stick
       1 rope), torch (1 stick 2 fibre) = 3 rock, 3 stick, 8 fibre */
    {
      const p = g.state.player;
      const near = {};
      for(const d of drops){
        if(d.wild && Math.abs(d.x - p.x) < 1200) near[d.id] = (near[d.id]||0)+1;
      }
      t.check("the stage 0 chain is gatherable within a walk of the spawn",
              (near.rock||0) >= 3 && (near.stick||0) >= 3 && (near.plant_fibre||0) >= 8,
              "within 1200px: " + (near.rock||0) + " rock, " + (near.stick||0) +
              " stick, " + (near.plant_fibre||0) + " fibre");
    }

    /* No single step may cost a big slice of the pack. Rock in clumps of two
       was 10 kg a step, 29% of a starting pack, and that one number was what
       made the pack fill while merely walking across the surface. */
    {
      const worst = {};
      for(const d of drops){
        if(!d.wild) continue;
        const bucket = Math.round(d.x / STEP_GUESS);
        worst[bucket] = (worst[bucket]||0) + ITEM_DATA[d.id].mass;
      }
      const heaviest = Math.max(...Object.values(worst));
      t.check("no single spot on the ground is a big slice of the pack",
              heaviest <= CARRY_START * 0.20,
              heaviest.toFixed(1) + " kg = " +
              Math.round(100*heaviest/CARRY_START) + "% of a starting pack");
    }

    /* and light enough to actually carry home */
    {
      const chain = 3*ITEM_DATA.rock.mass + 3*ITEM_DATA.stick.mass +
                    8*ITEM_DATA.plant_fibre.mass;
      t.check("the whole stage 0 chain fits in a starting backpack",
              chain < CARRY_START, chain.toFixed(1) + " kg of " + CARRY_START);
    }

    /* they lie on the surface, above water, not buried in the ground */
    {
      const bad = [];
      for(const d of drops){
        if(!d.wild) continue;
        if(Math.abs(d.y - W.surfaceAt(d.x)) > 40) bad.push(Math.round(d.x));
      }
      t.check("gatherables lie on the surface, not buried in it",
              bad.length === 0, bad.length ? bad.length + " adrift" : "all on the ground");
    }

    /* picking one up is just walking over it */
    {
      const p = g.state.player;
      inv.reset();
      g.items.spawnDrop(p.x, p.y-6, "stick", { wild:true });
      g.tick(40);
      t.check("a gatherable is picked up by walking over it",
              inv.count("stick") >= 1, "stick " + inv.count("stick"));
    }

    /* a cleared valley fills back in, slowly and out of sight */
    {
      const p = g.state.player;
      g.items.clearDrops();
      t.check("clearing really empties the surface", gs.api.wildCount() === 0);
      g.tick(600);                          /* past one regrowth interval */
      t.check("a cleared surface grows something back", gs.api.wildCount() > 0,
              gs.api.wildCount() + " regrown");
      const tooClose = drops.filter(d => d.wild && Math.abs(d.x - p.x) < 300);
      t.check("nothing regrows at the player's feet", tooClose.length === 0,
              tooClose.length + " within 300px");
    }

    /* the same seed lays the same scatter, whatever else has drawn randoms */
    {
      g.items.clearDrops();
      const a = gs.api.seedSurface();
      const first = drops.filter(d => d.wild).map(d => d.id + "@" + Math.round(d.x)).join(",");
      g.items.clearDrops();
      const b = gs.api.seedSurface();
      const second = drops.filter(d => d.wild).map(d => d.id + "@" + Math.round(d.x)).join(",");
      t.check("the same world seed lays the same scatter",
              a === b && first === second, a + " items, identical");
    }

    inv.reset();
    g.items.clearDrops();
  }

  /* ------------------------------------------------------------------ *
     Putting things down, and not being loaded up against your will.
     Both come from owner playtest feedback: there was no way to empty the
     pack, and walking across the scattered surface filled it passively.
   * ------------------------------------------------------------------ */
  {
    inv.reset();
    g.items.clearDrops();
    const p = g.state.player;

    /* throwing something out of the pack */
    inv.add("rock", 3);
    const n = g.items.drop("rock", 2);
    t.check("dropping takes them out of the pack",
            n === 2 && inv.count("rock") === 1, "dropped " + n);
    t.check("dropped things become real chunks in the world",
            countOf("rock") === 2, countOf("rock") + " on the ground");
    t.check("dropping what you do not have drops nothing",
            g.items.drop("gold_ore", 1) === 0);
    t.check("dropping more than you carry drops what you have",
            g.items.drop("rock", 99) === 1 && inv.count("rock") === 0);

    /* thrown clear of the hands, and not snatched straight back */
    {
      inv.reset();
      g.items.clearDrops();
      inv.add("coal", 1);
      g.items.drop("coal", 1);
      g.tick(20);
      const thrown = drops.find(d => d.id === "coal");
      t.check("a thrown item lands clear of the player, not at their feet",
              thrown && Math.abs(thrown.x - g.actor.clonk.x) > 12,
              thrown ? Math.round(Math.abs(thrown.x - g.actor.clonk.x)) + "px away" : "gone");

      /* stand right on it: still held, because it was only just thrown */
      g.actor.clonk.x = thrown.x; g.actor.clonk.y = thrown.y;
      g.tick(10);
      t.check("a thrown item is not snatched straight back up",
              inv.count("coal") === 0 && countOf("coal") === 1,
              "still on the ground standing over it");

      /* once the hold lapses it is an ordinary chunk again */
      g.tick(60);
      g.actor.clonk.x = drops.length ? drops[0].x : g.actor.clonk.x;
      g.actor.clonk.y = drops.length ? drops[0].y : g.actor.clonk.y;
      g.tick(10);
      t.check("a thrown item can be picked up again once the hold lapses",
              inv.count("coal") === 1, "coal " + inv.count("coal"));
    }

    /* the throw key */
    {
      inv.reset();
      g.items.clearDrops();
      inv.add("stick", 2);
      g.items.hotbar.select(g.items.hotbar.slots().indexOf("stick"));
      bus.emit("input:key", { key: g.items.dropKey, down:true });
      t.check("the throw key throws what is in your hands",
              inv.count("stick") === 1 && countOf("stick") === 1,
              "stick " + inv.count("stick") + " carried");
    }

    /* walking over things stops loading you up once you are burdened */
    {
      inv.reset();
      g.items.clearDrops();
      keys[g.items.grabKey] = false;
      inv.add("rock", 5);                 /* 25 kg of 35: past the burden line */
      t.check("five rocks is enough to be burdened", inv.encumbrance() > 0,
              "load " + inv.load().toFixed(2));

      let reason = null;
      const off = bus.on("pickup:refused", e => { reason = e.reason; });
      g.items.spawnDrop(p.x, p.y-6, "coal");
      g.tick(60);
      t.check("a burdened player does not hoover up what they walk over",
              inv.count("coal") === 0 && countOf("coal") === 1,
              "coal left lying");
      t.check("and is told why, so it does not look broken",
              reason === "burdened", String(reason));

      /* holding the grab key takes it deliberately */
      keys[g.items.grabKey] = true;
      g.tick(20);
      t.check("holding the grab key picks it up anyway",
              inv.count("coal") === 1, "coal " + inv.count("coal"));
      keys[g.items.grabKey] = false;
      off();
    }

    /* below the burden line nothing changed: no clicking, no key, it is taken */
    {
      inv.reset();
      g.items.clearDrops();
      g.items.spawnDrop(p.x, p.y-6, "plant_fibre");
      g.tick(40);
      t.check("an unburdened player still picks things up just by walking",
              inv.count("plant_fibre") === 1, "fibre " + inv.count("plant_fibre"));
    }

    /* the whole point: a full pack is now recoverable */
    {
      inv.reset();
      g.items.clearDrops();
      inv.add("rock", 99);
      t.check("a pack can be filled", inv.isFull());
      g.items.drop("rock", 7);
      t.check("and emptied again, which is what makes filling it survivable",
              inv.carriedMass() === 0 && countOf("rock") === 7,
              countOf("rock") + " rocks put down");
    }

    inv.reset();
    g.items.clearDrops();
  }

  /* ------------------------------------------------------------------ *
     Crafting. Recipes are lane F's data; this is the mechanics reading it.
   * ------------------------------------------------------------------ */
  {
    inv.reset();
    g.items.clearDrops();

    t.check("an unknown recipe is refused, not crashed into",
            g.items.canCraft("not_a_recipe").ok === false);

    /* a hand recipe needs nothing built */
    inv.add("stick", 1); inv.add("plant_fibre", 2);
    t.check("hand recipes can be made anywhere",
            g.items.canCraft("torch").ok === true, g.items.canCraft("torch").reason || "");

    let done = null;
    const off = bus.on("craft:done", e => { done = e; });
    const made = g.items.craft("torch");
    off();
    t.check("crafting consumes the inputs and gives the output",
            made.ok === true && inv.count("torch") === 1 &&
            inv.count("stick") === 0 && inv.count("plant_fibre") === 0,
            "torch " + inv.count("torch") + ", fibre " + inv.count("plant_fibre"));
    t.check("and says so on the bus",
            done && done.recipeId === "torch" && done.outputs.torch === 1,
            JSON.stringify(done));

    /* what is missing comes back structured, not as a sentence */
    {
      inv.reset();
      const v = g.items.canCraft("torch");
      t.check("a refusal lists what is missing, with need and have",
              v.ok === false && v.reason === "missing materials" &&
              v.missing.length === 2 &&
              v.missing.every(m => ITEM_DATA[m.id] && m.need > 0 && m.have === 0),
              JSON.stringify(v.missing));
    }

    /* a tool is a capability, not an ingredient */
    {
      inv.reset();
      inv.add("plant_fibre", 4);
      const v = g.items.canCraft("rope");
      t.check("a recipe with a tool is refused without it",
              v.ok === false && v.needsTool === "stone_knife", v.reason);

      inv.add("stone_knife", 1);
      t.check("and allowed with it", g.items.canCraft("rope").ok === true);
      g.items.craft("rope");
      t.check("the tool is NOT consumed - it is a capability",
              inv.count("stone_knife") === 1 && inv.count("rope") === 1,
              "knife " + inv.count("stone_knife") + ", rope " + inv.count("rope"));
    }

    /* a station recipe needs a finished station standing nearby */
    {
      const B = g.systems.find(s => s.name === "build").api;
      inv.reset();
      inv.add("wood", 4);
      const v = g.items.canCraft("charcoal");
      t.check("a station recipe is refused with no station",
              v.ok === false && v.needsStation === "kiln", v.reason);
      t.check("the reason names the station a player would look for",
              /kiln/i.test(v.reason), v.reason);
      t.check("your hands are always a station you have",
              g.items.nearbyStations().has("hand"),
              [...g.items.nearbyStations()].join(","));
      t.check("and a station you have not built is not",
              !g.items.nearbyStations().has("kiln"));
      t.check("nothing is standing nearby to make that true",
              B.structuresNear(g.state.player.x, g.state.player.y, 40).length === 0);
    }

    /* passing the wrong station is a mistake worth reporting */
    {
      inv.reset();
      inv.add("stick", 1); inv.add("plant_fibre", 2);
      const r = g.items.craft("torch", "kiln");
      t.check("being told the wrong station is refused, not obeyed",
              r.ok === false && inv.count("torch") === 0, r.reason);
    }

    /* The pack is mass-limited and a craft obeys it. Rope is the case that
       exists: 4 fibre weigh 0.6 kg and the rope they become weighs 0.9, so
       twisting them costs you carrying capacity. Most crafts go the other
       way, which is why this needs the one that does not. */
    {
      inv.reset();
      inv.add("stone_knife", 1); inv.add("plant_fibre", 4);
      const before = inv.carriedMass();
      inv.setCapacity(before + 0.2);         /* room to stand, not to twist */
      const v = g.items.canCraft("rope");
      t.check("a craft you could not carry the result of is refused",
              v.ok === false && v.reason === "no room in your pack",
              v.reason + " (" + before.toFixed(2) + " kg in a " +
              inv.capacity().toFixed(2) + " kg pack)");

      inv.setCapacity(CARRY_START);
      t.check("and allowed again once there is room",
              g.items.canCraft("rope").ok === true);
      inv.reset();
    }

    /* --- the one that matters: stage 0 is completable, start to finish --- *
       Gather 3 rock, 3 stick and 8 fibre - exactly what the surface yields -
       and the whole opening chain has to fall out of it: a knife, then rope
       from the knife, then the axe that is the only source of wood. */
    {
      inv.reset();
      inv.add("rock", 3); inv.add("stick", 3); inv.add("plant_fibre", 8);
      const carried = inv.carriedMass();

      const knife = g.items.craft("stone_knife");
      t.check("stage 0: a stone knife from gathered things alone",
              knife.ok === true, knife.reason || "");
      const rope = g.items.craft("rope");
      t.check("stage 0: rope, which the knife made possible",
              rope.ok === true, rope.reason || "");
      const axe = g.items.craft("stone_axe");
      t.check("stage 0: the stone axe, the only source of wood",
              axe.ok === true, axe.reason || "");
      const torch = g.items.craft("torch");
      t.check("stage 0: a torch before the light goes",
              torch.ok === true, torch.reason || "");

      t.check("the whole opening chain fits in one starting backpack",
              carried <= CARRY_START,
              carried.toFixed(1) + " kg gathered, of " + CARRY_START);
      t.check("and it leaves you holding the axe, the knife and a torch",
              inv.count("stone_axe") === 1 && inv.count("stone_knife") === 1 &&
              inv.count("torch") === 1,
              "axe " + inv.count("stone_axe") + " knife " + inv.count("stone_knife") +
              " torch " + inv.count("torch"));
    }

    /* craftable() offers only what is actually possible */
    {
      inv.reset();
      t.check("an empty pack can make nothing", g.items.craftable().length === 0,
              g.items.craftable().join(","));
      inv.add("stick", 1); inv.add("plant_fibre", 2);
      const list = g.items.craftable();
      t.check("and with a stick and fibre, exactly the torch",
              list.length === 1 && list[0] === "torch", list.join(","));
    }

    inv.reset();
    g.items.clearDrops();
  }

  return t;
}

/* The bar rebuilds itself from the pack on any inventory change; this pokes
   it after a reset() so a test can arrange the bar without a fresh pickup. */
function resyncBar(inv){ inv.add("rock", 0); bus.emit("inv:changed", { id:null }); }
