/* LANE C owns this file: dug material becoming items, inventory. */

import { boot, suite, findMaterial } from "../testkit.js";
import { MATS, M_COAL, M_IRON, M_ROCK, M_COPPER } from "../../src/world/materials.js";
import { BUILDINGS, MAX_SPAN } from "../../src/content/buildings.js";

/* Build times in ticks, at the fixed 36 Hz. */
const BUILD_TICKS = {};
for(const id in BUILDINGS) BUILD_TICKS[id] = BUILDINGS[id].time * 36 + 8;
import { bus } from "../../src/core/bus.js";
import { CARRY_START, CARRY_BEST, ITEM_DATA, ITEM_IDS } from "../../src/content/items.js";
import { STEP as SCATTER_STEP } from "../../src/content/scatter.js";
import { RECIPES, RECIPE_IDS, HAND } from "../../src/content/recipes.js";
import { canRunFromStore, isTimed as isTimedRecipe } from "../../src/build/production.js";
import { drops } from "../../src/items/drops.js";
import { keys } from "../../src/core/input.js";

/* The surface is scattered with gatherables now, so a bare dropCount() is
   no longer a statement about the chunk a test just spawned. */
const countOf = id => drops.filter(d => d.id === id).length;

/* Bucket drops that landed at the same spot. The step is lane F's, so read
   it rather than guessing - a guess here would silently stop bucketing
   correctly the day they retune the scatter. */
const STEP_GUESS = SCATTER_STEP;

/* A place where EVERY pixel within r is `mat`. findMaterial only promises a
   horizontal run, and a dig circle straddling softer ground at its edges
   says nothing about whether the gate held on the hard part. */
function pureSpot(world, mat, r){
  const { W: LW, H: LH } = world.size();
  for(let x = 260; x < LW-260; x += 11){
    for(let y = world.surfaceAt(x)+40; y < LH-80; y += 4){
      let pure = true;
      for(let dy=-r; dy<=r && pure; dy++){
        for(let dx=-r; dx<=r; dx++){
          if(dx*dx+dy*dy > r*r) continue;
          if(world.matAt(x+dx, y+dy) !== mat){ pure = false; break; }
        }
      }
      if(pure) return { x, y };
    }
  }
  return null;
}

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

    /* THE PACK IS MASS-LIMITED AND A CRAFT OBEYS IT - but as of lane F's
       conservation pass there is no craft left that can break it, and that
       is the right outcome rather than a regression.

       This fixture used to stand on rope: 4 fibre weighed 0.6 kg and the rope
       they became weighed 0.9, so twisting them created three hundred grams.
       That was a conservation bug, and it was the ONLY craft in the game that
       gained mass - which is exactly why it was the only case this test could
       find. Lane F corrected the rope's mass rather than its recipe, so no
       craft drawing from the pack can now increase what the player carries.

       The code path is kept, not deleted, because it is reachable the moment
       a recipe draws its inputs from a STATION'S STORE and hands the output
       to the pack - a forge holds 100 kg and a derrick 400. So this arms
       itself the same way the output-room guard does: it finds such a craft
       if one exists and tests the refusal against it, and says plainly when
       there is none. */
    {
      const gainers = RECIPE_IDS.map(id => RECIPES[id]).filter(r => {
        if(isTimedRecipe(r.id)) return false;      /* output waits in the station */
        let inM = 0, outM = 0;
        for(const id in r.inputs)  inM  += r.inputs[id]  * (ITEM_DATA[id] ? ITEM_DATA[id].mass : 0);
        for(const id in r.outputs) outM += r.outputs[id] * (ITEM_DATA[id] ? ITEM_DATA[id].mass : 0);
        return outM > inM;
      });

      if(!gainers.length){
        t.check("no craft can now make the player heavier than its inputs",
                true, "conservation holds across every craft, so the pack " +
                      "refusal has no case to fire on yet");
      } else {
        const r = gainers[0];
        inv.reset();
        for(const id in r.inputs) inv.add(id, r.inputs[id]);
        if(r.tool) inv.add(r.tool, 1);
        const before = inv.carriedMass();
        inv.setCapacity(before + 0.01);
        const v = g.items.canCraft(r.id);
        t.check("a craft you could not carry the result of is refused: " + r.id,
                v.ok === false && v.reason === "no room in your pack", v.reason);
        t.check("and it says by how much, in kg, rather than only in words",
                v.overBy > 0, v.overBy + " kg too heavy");
        inv.setCapacity(CARRY_START);
        inv.reset();
      }
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

  /* ================================================================== *
     THE CHAIN ABOVE STAGE 0.

     Lane F proved the DATA has no circular tier. The stage 0 test above
     proves the opening. This proves the MIDDLE: that in the running game
     the tool a station makes actually opens the ore the next station
     needs, all the way from bare hands to an iron pickaxe.

     Every link here is exercised for real - felling, the tier gate,
     placement, and each craft at its own station. What is NOT simulated is
     hauling VOLUME: bulk clay and limestone are granted rather than dug,
     because how heavy a load is and how many trips it takes is proven by
     the backpack checks above, and re-proving it here would only make this
     slow. If a link is broken, this goes red and names it.
   * ================================================================== */
  {
    const B = g.systems.find(s => s.name === "build").api;
    const buildSys = g.systems.find(s => s.name === "build");
    const { W: LW } = W.size();

    inv.reset();
    g.items.clearDrops();
    /* Hauling is tested above; this test is about whether the links exist. */
    inv.setCapacity(99999);
    const stock = (id, n) => { if(inv.count(id) < n) inv.add(id, n - inv.count(id)); };

    /* Construction takes real time, and build.test.js proves that under the
       real loop. Re-proving it here would cost nine seconds of CI for
       nothing, so raise the standing buildings by ticking the build system
       alone. */
    const raise = ticks => {
      for(let i=0;i<ticks;i++){ g.state.tick++; buildSys.tick(); }
    };

    const stand = x => {
      const y = W.surfaceAt(x) - 10;
      g.actor.clonk.x = x; g.actor.clonk.y = y;
      g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
      g.state.player.x = x; g.state.player.y = y;
    };

    /* --- somewhere long and flat enough to stand a whole settlement on --- */
    let sx = null;
    for(let x = 300; x < LW-300; x += 5){
      const y = W.surfaceAt(x);
      if(y >= g.state.world.waterLevel) continue;
      let ok = true;
      for(let k = 0; k < 135; k++) if(Math.abs(W.surfaceAt(x+k) - y) > 3){ ok = false; break; }
      if(ok){ sx = x; break; }
    }
    t.check("there is somewhere flat enough to build a settlement", sx !== null,
            "x = " + sx);

    /* ---------------------------------------------------- wood, by axe --- */
    {
      let tree = null;
      for(let x = 200; x < LW-200 && !tree; x += 6){
        tree = W.treeAt(x, W.surfaceAt(x) - 8, 10);
      }
      t.check("there are trees in the world to fell", !!tree,
              tree ? "one at " + Math.round(tree.x) : "none found");

      if(tree){
        stand(tree.x);
        const py = W.surfaceAt(tree.x) - 8;

        /* bare hands must not fell a tree - the axe is the only source */
        const barehanded = W.chopAt(tree.x, py, 10, null);
        t.check("bare hands cannot fell a tree",
                barehanded.canChop === false, JSON.stringify(barehanded));

        stock("stone_axe", 1);
        const woodBefore = inv.count("wood") + countOf("wood");

        let felled = false;
        for(let i=0;i<4000 && !felled;i++) felled = W.chopAt(tree.x, py, 10, "stone_axe").felled;
        t.check("an axe fells it", felled === true);

        g.tick(120);                             /* let it come down */
        for(let i=0;i<400;i++) W.chopAt(tree.x, py, 14, "stone_axe");
        g.tick(60);
        const woodAfter = inv.count("wood") + countOf("wood");
        t.check("and an axe turns a standing tree into wood you can pick up",
                woodAfter > woodBefore, woodBefore + " -> " + woodAfter + " wood");
      }
    }

    /* ---------------------------------------- workbench, and a pickaxe --- */
    stand(sx + 20);
    stock("wood", 20); stock("rock", 20); stock("plant_fibre", 20);
    stock("stone_knife", 1);
    const wb = B.place("workbench", sx + 12, W.surfaceAt(sx + 12) - 4);
    t.check("a workbench can be raised on that ground", wb.ok === true, wb.reason || "");
    raise(BUILD_TICKS.workbench);
    t.check("and it finishes", B.has("workbench") === true);

    stand(sx + 12);
    g.items.craft("rope");
    const pick = g.items.craft("stone_pickaxe");
    t.check("the workbench makes a stone pickaxe", pick.ok === true, pick.reason || "");
    t.check("which you are now carrying", inv.count("stone_pickaxe") === 1);

    /* ------------------------------------------------------ the tier gate --- */
    {
      /* The gate is a property of the material, so state it that way first:
         a disc of any size straddles softer ground at its edges, and hands
         are quite entitled to dig THAT. */
      t.check("hands cannot cut rock at any speed, which is the whole gate",
              W.digSpeedFor(M_ROCK, null) === 0 &&
              W.digSpeedFor(M_ROCK, "stone_pickaxe") > 0,
              "hands " + W.digSpeedFor(M_ROCK, null) + " px/s, pickaxe " +
              Math.round(W.digSpeedFor(M_ROCK, "stone_pickaxe")) + " px/s");

      const rock = pureSpot(W, M_ROCK, 4);
      t.check("there is solid rock under the ground", !!rock);
      if(rock){
        const byHand = W.digFreeCircle(rock.x, rock.y, 4, false, null);
        t.check("and bare hands take not one pixel of it",
                byHand.freed === 0 && byHand.blocked === true,
                JSON.stringify(byHand));
        const byPick = W.digFreeCircle(rock.x, rock.y, 4, true, "stone_pickaxe");
        t.check("the stone pickaxe opens it", byPick.freed > 0,
                byPick.freed + " pixels freed");
      }

      /* the ore the next station needs, dug with the tool this one made */
      const iron = findMaterial(W, M_IRON, 6);
      t.check("there is iron in the shallow band", !!iron);
      if(iron){
        const before = inv.count("iron_ore") + countOf("iron_ore");
        for(let k=0;k<14;k++) W.digFreeCircle(iron.x+k, iron.y, 5, true, "stone_pickaxe");
        g.tick(40);
        t.check("and the stone pickaxe reaches the iron the forge needs",
                (inv.count("iron_ore") + countOf("iron_ore")) > before,
                "iron_ore " + before + " -> " + (inv.count("iron_ore")+countOf("iron_ore")));
      }

      const coal = findMaterial(W, M_COAL, 6);
      if(coal){
        const r = W.digFreeCircle(coal.x, coal.y, 5, true, "stone_pickaxe");
        t.check("and the coal", r.freed > 0, r.freed + " pixels freed");
      } else t.check("and the coal", false, "no coal seam found");

      /* but NOT the band above it - that is what the next pickaxe is for */
      t.check("but stone stops at the middle band, or the ladder collapses",
              W.digSpeedFor(M_COPPER, "stone_pickaxe") === 0,
              "copper at " + W.digSpeedFor(M_COPPER, "stone_pickaxe") + " px/s");
      const copperSeam = pureSpot(W, M_COPPER, 3);
      if(copperSeam){
        const r = W.digFreeCircle(copperSeam.x, copperSeam.y, 3, false, "stone_pickaxe");
        t.check("and a stone pickaxe leaves a copper seam untouched",
                r.freed === 0 && r.blocked === true, JSON.stringify(r));
      } else t.check("and a stone pickaxe leaves a copper seam untouched", false,
                     "no solid copper seam found");
    }

    /* --------------------------------------------------- kiln and sawmill --- */
    stand(sx + 45);
    stock("clay", 40); stock("rock", 40);
    const kiln = B.place("kiln", sx + 45, W.surfaceAt(sx + 45) - 4);
    t.check("a kiln can be raised beside the workbench", kiln.ok === true, kiln.reason || "");

    stand(sx + 45);
    stock("wood", 60); stock("rope", 8);
    const mill = B.place("sawmill", sx + 82, W.surfaceAt(sx + 82) - 4);
    t.check("and a sawmill", mill.ok === true, mill.reason || "");
    raise(BUILD_TICKS.sawmill);
    t.check("both finish", B.has("kiln") === true && B.has("sawmill") === true);

    /* ------------------------------------------------ what they produce ---
       The kiln is a PROCESSING station, so these are jobs: hand it the
       inputs, let it burn, walk in and take what it made. `run` is the
       whole loop a player performs. */
    stand(sx + 45);
    stock("wood", 60); stock("limestone", 40);

    const run = id => {
      const started = g.items.craft(id);
      if(!started.ok) return started;
      raise(started.ticks + 2);            /* the fire does its work */
      g.tick(3);                           /* walk in and collect */
      return started;
    };

    const char = run("charcoal");
    t.check("the kiln makes charcoal, the fuel a smelt needs",
            char.ok === true && inv.count("charcoal") > 0,
            char.reason || (inv.count("charcoal") + " charcoal"));
    for(let i=0;i<8 && inv.count("brick") < 18;i++) run("brick");
    t.check("and bricks", inv.count("brick") >= 18, inv.count("brick") + " bricks");
    for(let i=0;i<8 && inv.count("quicklime") < 8;i++) run("quicklime");
    t.check("and the quicklime a smelt uses as flux", inv.count("quicklime") >= 8,
            inv.count("quicklime") + " quicklime");

    /* The sawmill is a processing station too, by lane F's data - a saw does
       work over time the same way a fire does - so planks are a job. */
    stand(sx + 82);
    for(let i=0;i<10 && inv.count("plank") < 8;i++) run("plank");
    t.check("the sawmill turns logs into planks", inv.count("plank") >= 8,
            inv.count("plank") + " planks");

    /* ---------------------------------------------------------- the forge --- */
    stand(sx + 50);
    const forge = B.place("forge", sx + 115, W.surfaceAt(sx + 115) - 4);
    t.check("the forge can be raised out of what the kiln and sawmill made",
            forge.ok === true, forge.reason || "");
    raise(BUILD_TICKS.forge);
    t.check("and it finishes", B.has("forge") === true);

    /* ---------------------------------------------- ore in, pickaxe out --- */
    stand(sx + 115);
    stock("iron_ore", 6); stock("charcoal", 6); stock("quicklime", 4);
    const bar1 = run("iron_bar");
    t.check("the forge smelts ore, fuel and flux into a bar",
            bar1.ok === true && inv.count("iron_bar") > 0,
            bar1.reason || (inv.count("iron_bar") + " bars"));
    run("iron_bar");
    stock("wood", 4);
    /* Forging a tool is the forge's work too, so it is a job like the smelt */
    const ipick = run("iron_pickaxe");
    t.check("and the bars become an iron pickaxe",
            ipick.ok === true && inv.count("iron_pickaxe") === 1,
            ipick.reason || (inv.count("iron_pickaxe") + " pickaxes"));

    /* THE PAYOFF: the world is deeper because of something you made. */
    {
      const seam = pureSpot(W, M_COPPER, 3);
      if(seam){
        const r = W.digFreeCircle(seam.x, seam.y, 3, true, "iron_pickaxe");
        t.check("and it opens the very seam that stopped the stone one",
                r.freed > 0, r.freed + " pixels of copper freed");
      } else t.check("and it opens the very seam that stopped the stone one",
                     false, "no solid copper seam found");
    }

    inv.reset();
    g.items.clearDrops();
  }

  /* ------------------------------------------------------------------ *
     PROCESSING STATIONS. Making is instant; processing takes time, and a
     station keeps working while the player is somewhere else entirely
     (docs/DECISIONS.md). That last part is what makes a station a machine
     rather than a menu, and it is the shape every machine after it takes.
   * ------------------------------------------------------------------ */
  {
    const B = g.systems.find(s => s.name === "build").api;
    const buildSys = g.systems.find(s => s.name === "build");
    const inv = g.items.inventory;
    const raise = ticks => { for(let i=0;i<ticks;i++){ g.state.tick++; buildSys.tick(); } };
    const stand = x => {
      const y = g.world.surfaceAt(x) - 10;
      g.actor.clonk.x = x; g.actor.clonk.y = y;
      g.state.player.x = x; g.state.player.y = y;
    };

    inv.reset(); inv.setCapacity(9999);
    g.items.clearDrops();
    buildSys.restore({ structures: [] });     /* a clear site to work on */

    /* somewhere flat, a workbench, then a kiln beside it */
    let sx = null;
    for(let x = 300; x < g.world.size().W - 300; x += 5){
      const y = g.world.surfaceAt(x);
      if(y >= g.state.world.waterLevel) continue;
      let ok = true;
      for(let k = 0; k < 70; k++) if(Math.abs(g.world.surfaceAt(x+k) - y) > 3){ ok = false; break; }
      if(ok){ sx = x; break; }
    }

    stand(sx + 20);
    for(const id in BUILDINGS.workbench.materials) inv.add(id, BUILDINGS.workbench.materials[id]);
    B.place("workbench", sx + 12, g.world.surfaceAt(sx + 12) - 4);
    raise(BUILD_TICKS.workbench);
    for(const id in BUILDINGS.kiln.materials) inv.add(id, BUILDINGS.kiln.materials[id]);
    const kiln = B.place("kiln", sx + 45, g.world.surfaceAt(sx + 45) - 4);
    t.check("a kiln stands, for the processing checks", kiln.ok === true, kiln.reason || "");
    raise(BUILD_TICKS.kiln);

    /* --- making is instant, processing is not --- */
    stand(sx + 45);
    inv.reset(); inv.setCapacity(9999);
    inv.add("stick", 1); inv.add("plant_fibre", 2);
    const torch = g.items.craft("torch");
    t.check("making stays instant - a torch is in your hands at once",
            torch.ok === true && torch.timed === false && inv.count("torch") === 1,
            "torch " + inv.count("torch"));

    inv.add("wood", 8);
    const job = g.items.craft("charcoal");
    t.check("processing starts a job rather than handing it over",
            job.ok === true && job.started === true && job.timed === true,
            "ticks " + job.ticks);
    t.check("the inputs leave your pack when the job starts",
            inv.count("wood") === 4, inv.count("wood") + " wood left");
    t.check("but no charcoal has appeared yet", inv.count("charcoal") === 0);
    t.check("and the kiln reports what it is working on",
            g.items.craftProgress().length === 1 &&
            g.items.craftProgress()[0].recipeId === "charcoal",
            JSON.stringify(g.items.craftProgress()));

    /* --- and it keeps working with the player nowhere near it --- */
    stand(sx + 900);
    raise(Math.floor(job.ticks / 2));
    const half = B.all().find(s => s.defId === "kiln");
    t.check("a station keeps working while you are somewhere else",
            B.jobAt(half) > 0.4 && B.jobAt(half) < 0.6,
            "progress " + B.jobAt(half).toFixed(2) + " with the player 900px away");

    raise(job.ticks);
    t.check("the job finishes without you", half.job === null);
    t.check("and the output waits inside the station",
            (half.store.items.charcoal || 0) > 0,
            JSON.stringify(half.store.items));
    t.check("your pack is still empty of it until you go and get it",
            inv.count("charcoal") === 0);

    /* the same call a chest answers to */
    {
      const box = B.storageAt(half.x + 2, half.y + 2);
      t.check("a finished bar is reachable by the same call as a chest's contents",
              !!box && box.count("charcoal") > 0,
              box ? box.count("charcoal") + " charcoal in the kiln" : "no store");
    }

    /* --- walk back in and it hands it over --- */
    stand(sx + 45);
    g.tick(3);
    t.check("walking into the station collects what it made",
            inv.count("charcoal") > 0, "charcoal " + inv.count("charcoal"));

    /* --- one job at a time, and it says so --- */
    {
      inv.add("wood", 8);
      g.items.craft("charcoal");
      const v = g.items.canCraft("charcoal");
      t.check("a busy station is refused as busy, not as missing",
              v.ok === false && v.busy === true && v.needsStation === null,
              v.reason);
      t.check("and the reason tells the player to wait, not to build another",
              /still working/.test(v.reason), v.reason);
    }

    /* --- destroyed mid-job: the inputs come back --- */
    {
      const k = B.all().find(s => s.defId === "kiln");
      t.check("the kiln is mid-job for the collapse check", !!k.job);
      const woodBefore = countOf("wood");
      let fell = null;
      const off = bus.on("structure:collapsed", e => { fell = e; });
      for(let cx = k.x - 2; cx < k.x + k.w + 2; cx++){
        g.world.digFreeCircle(cx, k.y + k.h + 3, 4, false, "iron_pickaxe");
      }
      raise(20);
      off();
      t.check("digging out a working station brings it down",
              fell && fell.why === "unsupported", fell ? fell.why : "still standing");
      t.check("the interrupted job's inputs come back as real chunks",
              countOf("wood") > woodBefore,
              woodBefore + " -> " + countOf("wood") + " wood on the ground");
      t.check("and the collapse says what it was holding and what it lost",
              fell && fell.interrupted === "charcoal" && fell.held &&
              fell.held.wood > 0,
              JSON.stringify(fell && fell.held) + " interrupted " +
              (fell && fell.interrupted));
    }

    inv.reset();
    g.items.clearDrops();
    buildSys.restore({ structures: [] });
  }

  /* ------------------------------------------------------------------ *
     DECONSTRUCTION. A misplaced building being permanent is a trap, so a
     player can take one down on purpose and get most of it back.

     "Most" is per-material and lane F's to price. The lever means something:
     a fired brick prised out of a wall is still a brick, while quicklime
     slaked into mortar is chemically part of that wall. That is the
     difference between conservation of matter and an arbitrary penalty.
   * ------------------------------------------------------------------ */
  {
    const B = g.systems.find(s => s.name === "build").api;
    const buildSys = g.systems.find(s => s.name === "build");
    const raise = ticks => { for(let i=0;i<ticks;i++){ g.state.tick++; buildSys.tick(); } };
    const stand = x => {
      const y = g.world.surfaceAt(x) - 10;
      g.actor.clonk.x = x; g.actor.clonk.y = y;
      g.state.player.x = x; g.state.player.y = y;
    };

    inv.reset(); inv.setCapacity(9999);
    g.items.clearDrops();
    buildSys.restore({ structures: [] });

    let sx = null;
    for(let x = 300; x < g.world.size().W - 300; x += 5){
      const y = g.world.surfaceAt(x);
      if(y >= g.state.world.waterLevel) continue;
      let ok = true;
      for(let k = 0; k < 40; k++) if(Math.abs(g.world.surfaceAt(x+k) - y) > 3){ ok = false; break; }
      if(ok){ sx = x; break; }
    }
    stand(sx + 12);
    for(const id in BUILDINGS.workbench.materials) inv.add(id, BUILDINGS.workbench.materials[id]);
    const wb = B.place("workbench", sx + 12, g.world.surfaceAt(sx + 12) - 4);
    t.check("a workbench stands, for the deconstruction checks", wb.ok === true,
            wb.reason || "");
    raise(BUILD_TICKS.workbench);

    const at = { x: wb.structure.x + 2, y: wb.structure.y + 2 };

    t.check("deconstructing nothing is refused, not crashed into",
            B.deconstruct(sx + 900, 10).ok === false);

    /* what you would get back, before committing to it */
    {
      const would = B.wouldReturn(at.x, at.y);
      const want = BUILDINGS.workbench.materials;
      t.check("you can ask what taking it apart would give back, before you do",
              !!would && Object.keys(want).every(id => id in would),
              JSON.stringify(would));
      /* Pinned against lane F's recover numbers rather than against a moment
         in time: whatever they price, the arithmetic has to hold. */
      t.check("and it is the priced share of each material, not a flat fraction",
              Object.keys(want).every(id =>
                would[id] === Math.floor(want[id] * B.recoverFraction(id))),
              Object.keys(want).map(id =>
                id + " " + would[id] + "/" + want[id] +
                " at " + B.recoverFraction(id)).join(", "));
    }

    /* --- it takes time, and less than building did --- */
    const d = B.deconstruct(at.x, at.y);
    t.check("taking it apart starts", d.ok === true, d.reason || "");
    t.check("and takes time, but less than putting it up did",
            d.ticks > 0 && d.ticks < BUILD_TICKS.workbench,
            d.ticks + " ticks vs " + BUILD_TICKS.workbench + " to build");
    t.check("asking twice does not start it twice",
            B.deconstruct(at.x, at.y).ok === false);

    raise(Math.floor(d.ticks / 2));
    t.check("it is still standing halfway through", B.all().length === 1,
            "progress " + B.deconstructProgress(at.x, at.y).toFixed(2));

    /* --- and you can change your mind --- */
    t.check("you can call it off", B.cancelDeconstruct(at.x, at.y) === true);
    raise(d.ticks * 2);
    t.check("and it is still there afterwards", B.all().length === 1);
    t.check("with the takedown forgotten, not merely paused",
            B.deconstructProgress(at.x, at.y) === 0);

    /* --- see it through --- */
    {
      const woodBefore = countOf("wood"), rockBefore = countOf("rock");
      let removed = null;
      const off = bus.on("structure:removed", e => { removed = e; });
      const again = B.deconstruct(at.x, at.y);
      raise(again.ticks + 2);
      off();

      t.check("seeing it through takes the building away",
              B.all().length === 0 && !!removed, removed ? removed.why : "still there");
      t.check("and says it was deliberate, not a collapse",
              removed && removed.why === "deconstructed", removed && removed.why);
      t.check("the materials come back as real chunks on the ground",
              countOf("wood") > woodBefore && countOf("rock") > rockBefore,
              "wood " + woodBefore + "->" + countOf("wood") +
              ", rock " + rockBefore + "->" + countOf("rock"));
      const wantBack = BUILDINGS.workbench.materials;
      t.check("exactly the priced share of each, on the ground",
              countOf("wood") - woodBefore ===
                Math.floor(wantBack.wood * B.recoverFraction("wood")) &&
              countOf("rock") - rockBefore ===
                Math.floor(wantBack.rock * B.recoverFraction("rock")),
              JSON.stringify(removed && removed.returned));
      t.check("and they land on the ground rather than in the pack, because a "
              + "workbench is heavier than a back",
              inv.count("wood") === 0, "carried " + inv.count("wood"));
    }

    /* --- the lever lane F is being handed --- */
    {
      /* The lever is per-material and lane F sets it. What this pins is the
         SHAPE - that it is a fraction per material rather than one number for
         the whole game - and that silence means "you get it back", because
         destroying a player's property needs a designed reason. */
      const priced = ITEM_IDS.filter(id => B.recoverFraction(id) < 1);
      t.check("recovery is a fraction per material, and lane F prices it",
              ITEM_IDS.every(id => {
                const f = B.recoverFraction(id);
                return f >= 0 && f <= 1;
              }),
              priced.length ? priced.length + " priced below 1: " +
                priced.map(id => id + " " + B.recoverFraction(id)).join(", ")
                : "none priced yet");
      t.check("an unpriced material comes back whole rather than vanishing",
              B.recoverFraction("not_a_real_item") === 1);
    }

    /* --- an unfinished building gives back everything: nothing is worked in --- */
    {
      g.items.clearDrops();
      inv.reset(); inv.setCapacity(9999);
      stand(sx + 12);
      for(const id in BUILDINGS.workbench.materials) inv.add(id, BUILDINGS.workbench.materials[id]);
      const half = B.place("workbench", sx + 12, g.world.surfaceAt(sx + 12) - 4);
      raise(Math.floor(BUILD_TICKS.workbench / 3));       /* barely started */
      const would = B.wouldReturn(half.structure.x + 2, half.structure.y + 2);
      /* Barely started, so most of the pile is still loose on the site and
         comes back whole whatever the recover price on it is. */
      const full = B.wouldReturn(at.x, at.y);
      t.check("a half-built thing gives back more than a finished one would",
              would.wood >= Math.floor(BUILDINGS.workbench.materials.wood *
                                       B.recoverFraction("wood")),
              JSON.stringify(would));
      buildSys.restore({ structures: [] });
    }

    inv.reset();
    g.items.clearDrops();
    buildSys.restore({ structures: [] });
  }

  /* ------------------------------------------------------------------ *
     LADDERS. The owner asked for climbing infrastructure by name, and the
     problem it answers arrives in the first ten minutes: you dig straight
     down and cannot get out. Climbing a wall is a skill; climbing a shaft
     you dug yourself should be something you built.

     A ladder is a building in every way that matters - it costs materials,
     it is placed, it needs support, it comes back when taken down. What is
     new is WHAT HOLDS IT UP: it is fixed to the wall of the shaft, not
     stood on the floor, so demanding a foundation would make it useless
     exactly where it is wanted.
   * ------------------------------------------------------------------ */
  {
    const B = g.systems.find(s => s.name === "build").api;
    const buildSys = g.systems.find(s => s.name === "build");
    const raise = ticks => { for(let i=0;i<ticks;i++){ g.state.tick++; buildSys.tick(); } };

    inv.reset(); inv.setCapacity(9999);
    g.items.clearDrops();
    buildSys.restore({ structures: [] });

    const LADDER = BUILDINGS.ladder;
    t.check("lane F has named a ladder", !!LADDER && LADDER.climb === true,
            LADDER ? JSON.stringify(LADDER.materials) : "none");

    /* Dig a shaft straight down, exactly the hole a player gets stuck in. */
    let shaftX = null;
    for(let x = 600; x < g.world.size().W - 600; x += 9){
      const y = g.world.surfaceAt(x);
      if(y >= g.state.world.waterLevel) continue;
      if(g.world.isSolid(x, y + 60)){ shaftX = x; break; }
    }
    t.check("there is solid ground to sink a shaft into", shaftX !== null);

    /* A shaft just wide enough to stand in. Radius matters: dig it wider
       than the ladder and there is no wall left beside the ladder to fix it
       to, which is the rule working rather than failing. */
    const top = g.world.surfaceAt(shaftX);
    for(let d = 0; d < 110; d++) g.world.digFreeCircle(shaftX, top + d, 3, false, "iron_pickaxe");

    const midY = top + 30;
    g.state.player.x = shaftX; g.state.player.y = midY;
    g.actor.clonk.x = shaftX; g.actor.clonk.y = midY;

    /* --- it goes where you point, not on the floor below you --- */
    {
      for(const id in LADDER.materials) inv.add(id, LADDER.materials[id]);
      const v = B.canPlace("ladder", shaftX, midY);
      t.check("a ladder can be fixed to the wall of a shaft", v.ok === true,
              v.reason || "");
      t.check("and it goes where you pointed, not on the floor far below",
              v.site && Math.abs((v.site.y + v.site.h/2) - midY) < 4,
              v.site ? "placed at y " + Math.round(v.site.y + v.site.h/2) +
                       " pointing at " + midY : "no site");
    }

    /* --- but not in open air, where there is no wall to fix it to --- */
    {
      const sky = g.world.surfaceAt(shaftX) - 40;
      g.state.player.y = sky; g.actor.clonk.y = sky;
      const v = B.canPlace("ladder", shaftX, sky);
      t.check("a ladder cannot be hung in mid-air",
              v.ok === false && /wall/.test(v.reason), v.reason);
      g.state.player.y = midY; g.actor.clonk.y = midY;
    }

    /* --- place it, and it is climbable once finished --- */
    const lad = B.place("ladder", shaftX, midY);
    t.check("the ladder is placed", lad.ok === true, lad.reason || "");
    t.check("an unfinished ladder is not yet something to climb",
            B.climbableAt(shaftX, midY) === null);
    raise(LADDER.time * 36 + 8);
    t.check("a finished ladder is climbable, which is what lane B reads",
            !!B.climbableAt(shaftX, midY),
            B.climbableAt(shaftX, midY) ? "climbable" : "not climbable");
    t.check("and only where it actually is",
            B.climbableAt(shaftX + 200, midY) === null);

    /* --- a workbench is not a ladder, however solid it looks --- */
    t.check("nothing else in the world is climbable by accident",
            B.all().filter(s => {
              const d = BUILDINGS[s.defId];
              return d && d.climb;
            }).length === B.all().length,
            "only ladders are marked climb");

    /* --- stack them: that is how you get out of a deep hole --- */
    {
      for(let k = 1; k <= 2; k++){
        for(const id in LADDER.materials) inv.add(id, LADDER.materials[id]);
        const y = midY + k*LADDER.h;
        g.state.player.y = y; g.actor.clonk.y = y;
        const r = B.place("ladder", shaftX, y);
        t.check("ladders stack down the shaft, section " + k, r.ok === true,
                r.reason || "");
      }
      raise(LADDER.time * 36 + 8);
      t.check("a stacked run is climbable the whole way down",
              !!B.climbableAt(shaftX, midY) &&
              !!B.climbableAt(shaftX, midY + LADDER.h) &&
              !!B.climbableAt(shaftX, midY + 2*LADDER.h),
              "three sections");
    }

    /* --- dig out the wall behind it and it falls, like anything else --- */
    {
      const before = B.all().length;
      let fell = null;
      const off = bus.on("structure:collapsed", e => { fell = e; });
      const s = B.climbableAt(shaftX, midY);
      t.check("there is a ladder standing to dig out from behind", !!s);
      if(s) for(let cy = s.y - 2; cy < s.y + s.h + 2; cy++){
        g.world.digFreeCircle(s.x - 5, cy, 6, false, "iron_pickaxe");
        g.world.digFreeCircle(s.x + s.w + 5, cy, 6, false, "iron_pickaxe");
      }
      raise(20);
      off();
      t.check("digging the wall out from behind a ladder brings it down",
              B.all().length < before && !!fell,
              fell ? fell.why : before + " -> " + B.all().length);
      t.check("and its wood comes back, because nothing is ever deleted",
              fell && fell.dropped > 0, fell ? fell.dropped + " chunks" : "none");
    }

    inv.reset();
    g.items.clearDrops();
    buildSys.restore({ structures: [] });
  }

  /* ------------------------------------------------------------------ *
     BUILDING OUT OF PIECES. The owner: "build planks, solid straight
     objects, place them on a brick foundation, to make a house."

     A prefab is a whole thing - pick a sawmill, place a sawmill - which is
     right for a machine with a defined shape and job. A piece is a plank,
     and the shape is the player's.

     THE ONE REAL DESIGN QUESTION is what counts as supported when pieces
     hold each other up, because the naive answer is an infinite floating
     scaffold: rest a plank on a plank, repeat outward forever. The answer
     here is a SPAN. Something directly beneath you - ground or structure -
     makes you span 0. Held only from the side, you are your neighbour's
     span plus one. Past MAX_SPAN nothing is holding you.

     So a column is free, because each piece has one under it. A floor
     reaching out from a post climbs a span per plank and can only run so
     far before it needs another post. "Put a post there" is a thing a
     player works out by building, which is the point.
   * ------------------------------------------------------------------ */
  {
    const B = g.systems.find(s => s.name === "build").api;
    const buildSys = g.systems.find(s => s.name === "build");
    const raise = n => { for(let i=0;i<n;i++){ g.state.tick++; buildSys.tick(); } };

    inv.reset(); inv.setCapacity(99999);
    g.items.clearDrops();
    buildSys.restore({ structures: [] });

    const BEAM = BUILDINGS.plank_beam;
    const FOUND = BUILDINGS.brick_foundation;
    t.check("lane F has named the pieces a house is made of",
            !!BEAM && BEAM.piece === true && !!FOUND && FOUND.foundation === true,
            BEAM ? BEAM.w + "x" + BEAM.h + " beam" : "none");
    t.check("and how far a run of them may reach",
            MAX_SPAN >= 1 && MAX_SPAN < 50, "MAX_SPAN " + MAX_SPAN);

    /* flat ground with room for a house */
    let sx = null;
    for(let x = 300; x < g.world.size().W - 300; x += 5){
      const y = g.world.surfaceAt(x);
      if(y >= g.state.world.waterLevel) continue;
      let ok = true;
      for(let k = 0; k < 130; k++) if(Math.abs(g.world.surfaceAt(x+k) - y) > 3){ ok = false; break; }
      if(ok){ sx = x; break; }
    }
    t.check("there is a level plot to build a house on", sx !== null, "x = " + sx);
    if(sx === null) sx = 1000;                 /* keep the block readable */
    const ground = g.world.surfaceAt(sx);
    const stand = x => {
      g.actor.clonk.x = x; g.state.player.x = x;
      g.actor.clonk.y = g.world.surfaceAt(x) - 10;
      g.state.player.y = g.actor.clonk.y;
    };
    const stock = (id, n) => { if(inv.count(id) < n) inv.add(id, n - inv.count(id)); };

    /* --- a plank does not float --- */
    {
      stand(sx + 30);
      stock("plank", 40); stock("brick", 40);
      const air = B.canPlace("plank_beam", sx + 30, ground - 60);
      t.check("a plank cannot be left hanging in the air",
              air.ok === false, air.reason);
      t.check("and the refusal says what is wrong rather than just no",
              /hold|ground|support/i.test(air.reason || ""), air.reason);
    }

    /* --- on the ground it is fine, and a column on top of it is free --- */
    {
      stand(sx + 30);
      const base = B.place("plank_beam", sx + 30, ground - 2);
      t.check("a plank laid on the ground stands", base.ok === true, base.reason || "");
      raise(BEAM.time * 36 + 8);

      /* a tower: each piece has one directly beneath, so a column is honest */
      let built = 1;
      for(let k = 1; k <= 6; k++){
        const y = base.structure.y - k*BEAM.h;
        stand(sx + 30);
        const r = B.place("plank_beam", sx + 30, y + BEAM.h/2, { rot:false });
        if(r.ok) built++;
      }
      raise(BEAM.time * 36 + 8);
      t.check("a column can be any height, because each piece has one under it",
              built === 7, built + " of 7 sections");
    }

    /* --- a cantilever runs out --- *
       A real one: a post standing on the ground, a plank on TOP of it, and
       then planks reaching sideways at that height, where there is nothing
       underneath. On flat ground a deck laid at ground level is span 0 all
       the way along and proves nothing. */
    {
      buildSys.restore({ structures: [] });
      inv.reset(); inv.setCapacity(99999);
      stock("plank", 60);

      const x0 = sx + 30;
      stand(x0);
      const post = B.place("plank_beam", x0, ground - BEAM.w/2, { rot:true });
      t.check("a post to reach out from", post.ok === true, post.reason || "");
      raise(BEAM.time * 36 + 8);

      /* sits exactly on the post's top, so its underside meets the post */
      const deckY = post.structure.y - BEAM.h/2;
      stand(x0);
      const first = B.place("plank_beam", x0, deckY);
      t.check("a plank laid on top of the post is held by it",
              first.ok === true, first.reason || "");
      raise(BEAM.time * 36 + 8);

      let reached = 0;
      for(let k = 1; k <= MAX_SPAN + 2; k++){
        const x = x0 + k*BEAM.w;
        stand(x);
        const r = B.place("plank_beam", x, deckY);
        if(!r.ok) break;
        raise(BEAM.time * 36 + 8);
        reached = k;
      }
      t.check("a floor reaching out from a post runs out at MAX_SPAN",
              reached === MAX_SPAN,
              reached + " planks out, MAX_SPAN " + MAX_SPAN);
      t.check("so an overhang is a ledge, not a floating platform",
              reached < MAX_SPAN + 2);

      /* stand a post under the far end and the run continues */
      const farX = x0 + (MAX_SPAN + 1)*BEAM.w;
      stand(farX);
      const prop = B.place("plank_beam", farX, ground - BEAM.w/2, { rot:true });
      t.check("a post can be stood under the far end", prop.ok === true,
              prop.reason || "");
      raise(BEAM.time * 36 + 8);
      stand(farX);
      const carry = B.place("plank_beam", farX, deckY);
      t.check("and the floor carries on over it - the answer is 'put a post there'",
              carry.ok === true, carry.reason || "");
    }

    /* --- a rough aim lands flush --- *
       Lane F costed a house at 148 kg of materials, and was right that the
       figure says nothing about forty careful aims. Snapping is what makes
       the material cost the whole cost. */
    {
      buildSys.restore({ structures: [] });
      inv.reset(); inv.setCapacity(99999);
      stock("plank", 40);

      const x0 = sx + 30;
      stand(x0);
      const first = B.place("plank_beam", x0, ground - 2);
      t.check("a first plank to line up against", first.ok === true,
              first.reason || "");
      raise(BEAM.time * 36 + 8);
      const A = first.structure;

      /* aim past its end, deliberately off by a few pixels */
      const sloppy = A.x + A.w + BEAM.w/2 + 5;
      stand(sloppy);
      const v = B.canPlace("plank_beam", sloppy, ground - 2 + 3);
      t.check("a rough aim beside a plank lands flush against it",
              v.ok && v.site.x === A.x + A.w,
              v.site ? "x " + v.site.x + " vs flush " + (A.x + A.w) : v.reason);
      t.check("and level with it, not three pixels low",
              v.ok && v.site.y === A.y,
              v.site ? "y " + v.site.y + " vs level " + A.y : v.reason);

      /* far from anything, the aim is obeyed exactly */
      const far = x0 + 300;
      stand(far);
      const g2 = B.canPlace("plank_beam", far, ground - 2);
      const wanted = Math.round(far - BEAM.w/2);
      t.check("away from everything the cursor is obeyed, not corrected",
              !!g2.site && g2.site.x === wanted,
              g2.site ? "x " + g2.site.x + " vs " + wanted : "no site");

      /* snapping never pushes a piece into its neighbour */
      {
        const inside = A.x + 2;
        stand(inside);
        const bad = B.canPlace("plank_beam", inside, ground - 2);
        const clashes = bad.site && B.all().some(o =>
          o !== A ? false :
          bad.site.x < o.x + o.w && bad.site.x + bad.site.w > o.x &&
          bad.site.y < o.y + o.h && bad.site.y + bad.site.h > o.y);
        t.check("snapping never moves a piece into something already there",
                bad.ok === false || !clashes, bad.reason || "no overlap");
      }
    }

    /* --- pieces rotate: one def is both a beam and a post --- */
    {
      buildSys.restore({ structures: [] });
      inv.reset(); inv.setCapacity(99999);
      stock("plank", 20);
      stand(sx + 30);
      const flat = B.place("plank_beam", sx + 30, ground - 2, { rot:false });
      t.check("laid flat it is as wide as the def says",
              flat.ok && flat.structure.w === BEAM.w && flat.structure.h === BEAM.h,
              flat.structure ? flat.structure.w + "x" + flat.structure.h : flat.reason);
      raise(BEAM.time * 36 + 8);

      stand(sx + 90);
      /* Stood on end it is BEAM.w tall, so the cursor goes at its middle:
         aim at the ground and half the post is buried, which placement
         rightly refuses. */
      const up = B.place("plank_beam", sx + 90, ground - BEAM.w/2, { rot:true });
      t.check("stood on end it is the same object turned ninety degrees",
              up.ok && up.structure.w === BEAM.h && up.structure.h === BEAM.w,
              up.structure ? up.structure.w + "x" + up.structure.h : up.reason);
      t.check("and a turned piece remembers which way up it is through a save",
              (() => {
                const saved = JSON.parse(JSON.stringify(buildSys.serialise()));
                buildSys.restore({ structures: [] });
                buildSys.restore(saved);
                const back = B.all().find(s => s.rot);
                return !!back && back.w === BEAM.h && back.h === BEAM.w;
              })());
    }

    /* --- pull the post out and everything it held comes down --- */
    {
      buildSys.restore({ structures: [] });
      inv.reset(); inv.setCapacity(99999);
      stock("plank", 40);
      g.items.clearDrops();

      const x0 = sx + 30;
      stand(x0);
      const post = B.place("plank_beam", x0, ground - BEAM.w/2, { rot:true });
      raise(BEAM.time * 36 + 8);
      const deckY = post.structure.y - BEAM.h/2;
      let deck = 0;
      for(let k = 0; k <= MAX_SPAN; k++){
        const x = x0 + k*BEAM.w;
        stand(x);
        const r = B.place("plank_beam", x, deckY);
        if(r.ok){ deck++; raise(BEAM.time * 36 + 8); }
      }
      t.check("a deck stands on its post",
              B.all().length === 1 + deck && deck > 1,
              B.all().length + " pieces, " + deck + " of deck");

      const before = countOf("plank");
      const P = post.structure;
      for(let cy = P.y; cy < ground + 8; cy++){
        for(let cx = P.x - 6; cx < P.x + P.w + 6; cx++){
          g.world.digFreeCircle(cx, cy, 3, false, "iron_pickaxe");
        }
      }
      raise(40);
      t.check("digging out the post drops everything it was holding",
              B.all().length === 0, B.all().length + " left standing");
      t.check("and every plank comes back on the ground, none of it deleted",
              countOf("plank") - before === 1 + deck,
              (countOf("plank") - before) + " planks back of " + (1 + deck));
    }

    inv.reset();
    g.items.clearDrops();
    buildSys.restore({ structures: [] });
  }

  /* ------------------------------------------------------------------ *
     PUTTING GROUND BACK. The owner asked to "place dirt, build a small
     hill with that, same with sand". Lane A built the world half; this is
     the call that makes it happen, and it is the mirror of picking a chunk
     up rather than a new idea.

     WHICH ITEMS POUR answers itself from the tier table: anything you could
     dig back out BY HAND. Ore and rock throw as chunks instead - not out of
     squeamishness about conservation, but because turning a backpack of
     iron ore into ore-bearing rock that now needs a pickaxe would be a trap.
     The player drops ore to lighten their load, not to bury it.
   * ------------------------------------------------------------------ */
  {
    inv.reset(); inv.setCapacity(999);
    g.items.clearDrops();

    t.check("loose ground is pourable, because hands can dig it back",
            g.items.isPourable("soil") && g.items.isPourable("sand") &&
            g.items.isPourable("clay") && g.items.isPourable("gravel"),
            "soil/sand/clay/gravel");
    t.check("ore and rock are not, or dropping them would bury them",
            !g.items.isPourable("iron_ore") && !g.items.isPourable("rock") &&
            !g.items.isPourable("coal"),
            "iron_ore/rock/coal throw as chunks");
    t.check("and a tool is not ground at all",
            !g.items.isPourable("stone_pickaxe") && !g.items.isPourable("torch"));

    /* --- a hill you can actually build --- */
    {
      let px = null;
      for(let x = 400; x < W.size().W - 400; x += 5){
        const y = W.surfaceAt(x);
        if(y >= g.state.world.waterLevel) continue;
        let ok = true;
        for(let k = 0; k < 40; k++) if(Math.abs(W.surfaceAt(x+k) - y) > 2){ ok = false; break; }
        if(ok){ px = x; break; }
      }
      t.check("there is level ground to pour onto", px !== null, "x = " + px);
      const ground = W.surfaceAt(px);
      g.actor.clonk.x = px; g.state.player.x = px;
      g.actor.clonk.y = ground - 10; g.state.player.y = ground - 10;
      g.state.player.dir = 1;

      const solidNear = () => {
        let n = 0;
        for(let y = ground - 40; y < ground + 6; y++)
          for(let x = px - 10; x < px + 50; x++) if(W.isSolid(x, y)) n++;
        return n;
      };
      const before = solidNear();

      inv.reset(); inv.setCapacity(999);
      inv.add("soil", 20);
      let poured = null;
      const off = bus.on("ground:poured", e => { poured = e; });
      const took = g.items.drop("soil", 20);
      off();

      t.check("dropping soil pours it into the world rather than throwing it",
              took === 20 && countOf("soil") === 0,
              took + " poured, " + countOf("soil") + " chunks on the ground");
      t.check("and it costs the pack, or the backpack is an infinite quarry",
              inv.count("soil") === 0, inv.count("soil") + " left carried");
      t.check("the world is told, so a UI can react", !!poured && poured.n === 20,
              JSON.stringify(poured));

      for(let k = 0; k < 40; k++) g.tick(30);
      t.check("there is more ground than there was - a hill you poured",
              solidNear() > before,
              before + " -> " + solidNear() + " solid pixels");
    }

    /* --- ore takes the other path, and stays recoverable --- */
    {
      inv.reset(); inv.setCapacity(999);
      g.items.clearDrops();
      inv.add("iron_ore", 3);
      const took = g.items.drop("iron_ore", 3);
      t.check("ore is thrown as chunks, not poured into the ground",
              took === 3 && countOf("iron_ore") === 3,
              countOf("iron_ore") + " chunks lying about");
      t.check("so it can be picked straight back up, which is the point",
              inv.count("iron_ore") === 0 && countOf("iron_ore") > 0);
    }

    /* --- nothing is taken for a pour that does not happen --- */
    {
      inv.reset(); inv.setCapacity(999);
      t.check("pouring what you are not carrying takes nothing",
              g.items.pour("soil", 5, 100, 100) === 0 &&
              inv.count("soil") === 0);
      inv.add("iron_ore", 2);
      t.check("and pour() refuses a material that is not pourable",
              g.items.pour("iron_ore", 2, 100, 100) === 0 &&
              inv.count("iron_ore") === 2,
              "still carrying " + inv.count("iron_ore"));
    }

    /* --- pouring at a chosen spot, for a UI that offers one --- */
    {
      inv.reset(); inv.setCapacity(999);
      inv.add("sand", 6);
      const p = g.state.player;
      /* Aim at open air above the ground, which is where a player points -
         the block above just poured a hill where the clonk is standing, so
         its own feet are inside it now. */
      const n = g.items.pour("sand", 6, p.x + 20, p.y - 24);
      t.check("sand can be poured at a spot the player picked",
              n === 6 && inv.count("sand") === 0, n + " poured");
    }

    inv.reset();
    g.items.clearDrops();
  }

  /* ------------------------------------------------------------------ *
     A STATION EATS ITS OWN PILE. Lane D can deliver ore into a forge by
     rail; until now the forge could not use it, because crafting took from
     the player's back. A delivered heap was scenery, which is the
     difference between automation and a shorter walk.

     THE STORE IS PREFERRED, and deliberately so: the other way round is
     backwards. A player standing at a forge with two iron in hand would
     burn their own while forty sat in the hopper, so automation would only
     ever engage when nobody was there to benefit from it.
   * ------------------------------------------------------------------ */
  {
    const B = g.systems.find(s => s.name === "build").api;
    const buildSys = g.systems.find(s => s.name === "build");
    const raise = n => { for(let i=0;i<n;i++){ g.state.tick++; buildSys.tick(); } };
    const stand = x => {
      g.actor.clonk.x = x; g.state.player.x = x;
      g.actor.clonk.y = g.world.surfaceAt(x) - 10;
      g.state.player.y = g.actor.clonk.y;
    };

    inv.reset(); inv.setCapacity(99999);
    g.items.clearDrops();
    buildSys.restore({ structures: [] });

    /* Earlier blocks have dug, poured and built across this world, so a flat
       LOOKING stretch is not proof of a buildable one. Ask placement itself
       rather than guessing from the surface map. */
    let sx = null;
    for(let x = 300; x < g.world.size().W - 300 && sx === null; x += 7){
      if(g.world.surfaceAt(x) >= g.state.world.waterLevel) continue;
      stand(x);
      const a = B.canPlace("workbench", x, g.world.surfaceAt(x) - 4);
      stand(x + 20);
      const b = B.canPlace("kiln", x + 45, g.world.surfaceAt(x + 45) - 4);
      /* Both must be refused only for want of MATERIALS or of the workbench
         that is not up yet - never for want of ground. A kiln always names
         the workbench first, so "needs a Workbench" is a pass here. */
      const groundIsFine = v =>
        v.reason === "missing materials" || v.reason === "needs a Workbench";
      if(groundIsFine(a) && groundIsFine(b)) sx = x;
    }
    t.check("somewhere to stand a workbench and a kiln", sx !== null, "x = " + sx);
    if(sx === null) sx = 1000;

    stand(sx);
    for(const id in BUILDINGS.workbench.materials) inv.add(id, BUILDINGS.workbench.materials[id]);
    B.place("workbench", sx, g.world.surfaceAt(sx) - 4);
    raise(BUILD_TICKS.workbench);
    stand(sx + 20);
    for(const id in BUILDINGS.kiln.materials) inv.add(id, BUILDINGS.kiln.materials[id]);
    const kiln = B.place("kiln", sx + 45, g.world.surfaceAt(sx + 45) - 4);
    t.check("a kiln to feed", kiln.ok === true, kiln.reason || "");
    raise(BUILD_TICKS.kiln);

    const box = kiln.ok
      ? B.storageAt(kiln.structure.x + 2, kiln.structure.y + 2) : null;
    t.check("the kiln has a store a cart could unload into", !!box);

    /* --- delivered materials, empty-handed player --- */
    {
      box.add("wood", 8);
      inv.reset(); inv.setCapacity(99999);
      stand(sx + 45);

      t.check("the player is carrying nothing at all", inv.count("wood") === 0);
      const v = g.items.canCraft("charcoal");
      t.check("and can still burn charcoal, from what was delivered",
              v.ok === true && v.fromStore.wood > 0,
              v.reason || JSON.stringify(v.fromStore));

      const r = g.items.craft("charcoal");
      t.check("the craft starts and takes the kiln's own wood",
              r.ok === true && r.usedStore === true && box.count("wood") === 4,
              "kiln wood left " + box.count("wood"));
      raise(r.ticks + 4);
      g.tick(3);
      t.check("and the charcoal comes out of it",
              inv.count("charcoal") > 0 || box.count("charcoal") > 0,
              "carried " + inv.count("charcoal") + ", in kiln " + box.count("charcoal"));
    }

    /* --- the pile is spent before the pack --- */
    {
      inv.reset(); inv.setCapacity(99999);
      stand(sx + 45);
      while(box.count("wood") > 0) box.take("wood", box.count("wood"));
      while(box.count("charcoal") > 0) box.take("charcoal", box.count("charcoal"));

      box.add("wood", 4);
      inv.add("wood", 4);
      const r = g.items.craft("charcoal");
      t.check("with wood in both, the station's is spent first",
              r.ok && box.count("wood") === 0 && inv.count("wood") === 4,
              "kiln " + box.count("wood") + ", pack " + inv.count("wood"));
      raise(r.ticks + 4);
      g.tick(3);
    }

    /* --- and it makes up the difference off your back --- */
    {
      inv.reset(); inv.setCapacity(99999);
      stand(sx + 45);
      while(box.count("wood") > 0) box.take("wood", box.count("wood"));
      while(box.count("charcoal") > 0) box.take("charcoal", box.count("charcoal"));

      box.add("wood", 1);
      inv.add("wood", 3);
      const v = g.items.canCraft("charcoal");
      t.check("a part-filled hopper is topped up from the pack",
              v.ok === true && v.fromStore.wood === 1 && v.fromPack.wood === 3,
              JSON.stringify({ store: v.fromStore, pack: v.fromPack }));
      const r = g.items.craft("charcoal");
      t.check("and both are drawn down",
              r.ok && box.count("wood") === 0 && inv.count("wood") === 0,
              "kiln " + box.count("wood") + ", pack " + inv.count("wood"));
      raise(r.ticks + 4);
      g.tick(3);
    }

    /* --- what is missing counts BOTH, so the reason is honest --- */
    {
      inv.reset(); inv.setCapacity(99999);
      stand(sx + 45);
      while(box.count("wood") > 0) box.take("wood", box.count("wood"));
      while(box.count("charcoal") > 0) box.take("charcoal", box.count("charcoal"));

      box.add("wood", 1);
      const v = g.items.canCraft("charcoal");
      /* Every input, not only the short ones: a screen cannot otherwise say
         where a SATISFIED input is sitting. Asked for by the UI lane. */
      t.check("the verdict breaks down every input, satisfied or not",
              Array.isArray(v.inputs) && v.inputs.length === 1 &&
              v.inputs[0].id === "wood" && v.inputs[0].inStore === 1 &&
              v.inputs[0].short === 3,
              JSON.stringify(v.inputs));
      t.check("a shortfall is counted across the hopper and the pack together",
              v.ok === false && v.missing.length === 1 &&
              v.missing[0].have === 1 && v.missing[0].inStore === 1 &&
              v.missing[0].inPack === 0,
              JSON.stringify(v.missing));
      t.check("and nothing was taken for a craft that did not happen",
              box.count("wood") === 1);
    }

    /* --- A STATION RUNS UNATTENDED --- *
       The owner overruled the earlier behaviour: "all automation systems
       should run when im not present." A machine you have to stand next to
       is a slower pair of hands, not a factory. */
    {
      inv.reset(); inv.setCapacity(99999);
      while(box.count("wood") > 0) box.take("wood", box.count("wood"));
      while(box.count("charcoal") > 0) box.take("charcoal", box.count("charcoal"));

      /* it knows what it was last asked for */
      const kilnS = B.all().find(s => s.defId === "kiln");
      t.check("the station remembers the task it was set",
              kilnS && kilnS.recipe === "charcoal", kilnS && kilnS.recipe);

      box.add("wood", 8);
      stand(sx + 900);                       /* nobody anywhere near it */
      raise(30);
      t.check("a delivery to an idle station starts it, with nobody there",
              !!kilnS.job && box.count("wood") === 4,
              (kilnS.job ? "burning" : "idle") + ", wood " + box.count("wood"));

      raise(kilnS.job.need + 4);
      t.check("and it finishes, and takes the next load on by itself",
              box.count("charcoal") > 0 && !!kilnS.job,
              "charcoal " + box.count("charcoal") + ", " +
              (kilnS.job ? "burning again" : "stopped"));

      /* --- but unattended is not infinite --- */
      raise(kilnS.job.need + 4);
      t.check("it stops when the delivered material runs out",
              box.count("wood") === 0 && !kilnS.job,
              "wood " + box.count("wood") + ", " +
              (kilnS.job ? "still burning" : "stopped"));
    }

    /* --- an unattended run never spends the player's pack --- */
    {
      const kilnS = B.all().find(s => s.defId === "kiln");
      while(box.count("wood") > 0) box.take("wood", box.count("wood"));
      while(box.count("charcoal") > 0) box.take("charcoal", box.count("charcoal"));
      inv.reset(); inv.setCapacity(99999);
      inv.add("wood", 20);                   /* carried, not delivered */
      stand(sx + 45);                        /* standing right at it */
      raise(200);
      t.check("a station beside you does not quietly eat your backpack",
              inv.count("wood") === 20 && !kilnS.job,
              "carried " + inv.count("wood") + ", " +
              (kilnS.job ? "burning" : "idle"));
    }

    /* --- it stops rather than overflowing --- *
       Worth being honest about what this can and cannot show. Every recipe
       in the game today LOSES mass - four logs at 7 kg become three charcoal
       at rather less - so a run always fits back into the store it came out
       of, and the output-room guard cannot fire from ordinary play. What CAN
       put a store over its cap is finished work nobody collected, because a
       completed job is paid for and is never destroyed for want of room.
       That is the state tested here, and the guard is what stops the station
       digging the hole deeper. */
    {
      const kilnS = B.all().find(s => s.defId === "kiln");
      inv.reset(); inv.setCapacity(99999);
      while(box.count("wood") > 0) box.take("wood", box.count("wood"));
      while(box.count("charcoal") > 0) box.take("charcoal", box.count("charcoal"));
      box.add("wood", 4);

      /* uncollected output, past the brim - exactly what a finished job can
         leave behind, since finishing never refuses for want of room */
      kilnS.store.items.rock = Math.ceil(box.capacity() / ITEM_DATA.rock.mass) + 4;
      t.check("a station can end up holding more than its capacity",
              box.mass() > box.capacity(),
              box.mass().toFixed(0) + " kg in a " + box.capacity() + " kg store");

      stand(sx + 900);
      let idle = null;
      const off = bus.on("station:idle", e => { idle = e; });
      raise(60);
      off();
      t.check("and it will not start another run while it is over-full",
              !kilnS.job && box.count("wood") === 4,
              (kilnS.job ? "running anyway" : "stopped") +
              ", wood " + box.count("wood"));

      delete kilnS.store.items.rock;
      raise(30);
      t.check("emptying it starts the work again, with nobody present",
              !!kilnS.job, kilnS.job ? "running" : "still stopped");
      while(box.count("wood") > 0) box.take("wood", box.count("wood"));
    }

    /* --- handed more than you can carry --- *
       Where the "too heavy" refusal is genuinely reachable, as lane F pointed
       out: a forge holds 100 kg and a derrick 400, against a 35 kg back. A
       station hands over what it can and keeps the rest, rather than
       overfilling the player or destroying the remainder. */
    {
      const kilnS = B.all().find(s => s.defId === "kiln");
      inv.reset();
      while(box.count("wood") > 0) box.take("wood", box.count("wood"));
      while(box.count("charcoal") > 0) box.take("charcoal", box.count("charcoal"));
      kilnS.recipe = null;                       /* stop it starting work */

      box.add("rock", 12);                       /* 60 kg in the store */
      inv.setCapacity(20);                       /* room for four */
      stand(sx + 45);
      g.tick(4);

      const carried = inv.count("rock"), left = box.count("rock");
      t.check("a station hands over only what you can carry",
              carried > 0 && carried + left === 12 &&
              inv.carriedMass() <= inv.capacity() + 1e-9,
              carried + " taken, " + left + " left, " +
              inv.carriedMass().toFixed(1) + "/" + inv.capacity() + " kg");
      t.check("and keeps the rest rather than destroying it", left > 0,
              left + " still in the station");

      inv.setCapacity(99999);
      g.tick(4);
      t.check("come back with room and it hands over the rest",
              inv.count("rock") === 12 && box.count("rock") === 0,
              "carried " + inv.count("rock"));

      inv.reset(); inv.setCapacity(99999);
      kilnS.recipe = "charcoal";
    }

    /* --- the guard's first real customer, whenever it turns up --- *
       Raised by lane E: the output-room guard is currently a promise nobody
       exercises, because every recipe loses mass. This finds the first one
       that does not and tests the guard against it automatically, so whoever
       adds that recipe meets the guard rather than rediscovering the problem.
       While none exists it says so rather than passing silently. */
    {
      const heavier = RECIPE_IDS.map(id => RECIPES[id]).filter(r => {
        if(!r.station || r.station === HAND) return false;
        let inM = 0, outM = 0;
        for(const id in r.inputs)  inM  += r.inputs[id]  * (ITEM_DATA[id] ? ITEM_DATA[id].mass : 0);
        for(const id in r.outputs) outM += r.outputs[id] * (ITEM_DATA[id] ? ITEM_DATA[id].mass : 0);
        return outM >= inM;
      });

      if(!heavier.length){
        t.check("no recipe yet makes something heavier than it consumes",
                true, "the output-room guard has no customer; this check " +
                      "starts testing it the day one appears");
      } else {
        /* Two-sided on purpose. Refusing is only interesting if the same
           station accepts once there IS room - otherwise a guard that always
           said no would pass. */
        const r = heavier[0];
        const mass = o => {
          let m = 0;
          for(const id in o) m += o[id] * (ITEM_DATA[id] ? ITEM_DATA[id].mass : 0);
          return m;
        };
        const inM = mass(r.inputs), outM = mass(r.outputs);
        const store = cap => ({ built:true, x:0, y:0, w:1, h:1,
                                store:{ cap, items: Object.assign({}, r.inputs) } });

        t.check("a station will not start a run it has nowhere to put: " + r.id,
                canRunFromStore(store(inM + outM - 0.01), r) === false,
                r.id + " makes " + outM.toFixed(1) + " kg from " +
                inM.toFixed(1) + " kg");
        t.check("and will once there is room for it: " + r.id,
                canRunFromStore(store(inM + outM), r) === true,
                "room for " + outM.toFixed(1) + " kg");
      }
    }

    inv.reset();
    g.items.clearDrops();
    buildSys.restore({ structures: [] });
  }

  return t;
}








/* The bar rebuilds itself from the pack on any inventory change; this pokes
   it after a reset() so a test can arrange the bar without a fresh pickup. */
function resyncBar(inv){ inv.add("rock", 0); bus.emit("inv:changed", { id:null }); }
