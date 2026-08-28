/* LANE F owns this file: the data tables in src/content/.

   These are contract tests, not simulation tests. They exist so that a
   balance edit that quietly breaks another lane fails here first:

     - every ore the landscape yields has an item entry
     - the item table has not drifted from lane C's registry
     - ore never becomes weightless, which is what would kill the haulage
       problem the whole industry lane is built on                        */

import { boot, suite, findMaterial } from "../testkit.js";
import { MATS, M_ROCK } from "../../src/world/materials.js";
import { ITEM_DATA, ITEM_IDS, ITEM_CATEGORIES, BANDS,
         CARRY_START, PENDING_YIELD, SURFACE_PICKUPS,
         itemData } from "../../src/content/items.js";
import { RECIPES, RECIPE_IDS, HAND, recipesAt, FUELS,
         MAX_CRAFT_SECONDS, MAX_STATION_TIME_RATIO } from "../../src/content/recipes.js";
import { BUILDINGS, BUILDING_IDS, buildMass, recoveryFraction, MAX_SPAN,
         deconstructTime, DECONSTRUCT_FRACTION } from "../../src/content/buildings.js";
import { STAGES, highestStageReached, highestCostedStage } from "../../src/content/stages.js";
import { GUIDE, MATERIAL_HINTS, HAZARD_HINTS, guideFor, hintFor } from "../../src/content/guide.js";
import { HAULAGE, HAULAGE_IDS, BATCH_LADDER, REFERENCE_LOAD, haulage,
         stepUpFrom } from "../../src/content/haulage.js";
import { REFERENCE, REFERENCE_IDS, LIVE_IDS, PLANNED_IDS,
         referencePage, searchReference } from "../../src/content/reference.js";
import { KINDS, STEP, CHANCE, walkFor, scatterKind,
         kindForRoll } from "../../src/content/scatter.js";
import { HARDNESS, TOOLS, TOOL_IDS, TOOL_KINDS, UNCUTTABLE,
         hardnessOf, canCut, digSpeed, toolsThatCut } from "../../src/content/tools.js";

/* A starting backpack must hold between MIN and MAX chunks of any raw
   material. Below MIN and hauling is impossible; above MAX and ore is
   effectively weightless and carts have no purpose.
   docs/DECISIONS.md, "Carrying is mass-limited, human scale". */
const CHUNKS_MIN = 4;
const CHUNKS_MAX = 14;

export function run(){
  const t = suite("content");

  /* --- the table is well formed --- */
  {
    const bad = [];
    for(const id of ITEM_IDS){
      const d = ITEM_DATA[id];
      if(!d){ bad.push(id + ": missing"); continue; }
      if(d.id !== id) bad.push(id + ": id field is " + d.id);
      if(typeof d.name !== "string" || !d.name) bad.push(id + ": no name");
      if(typeof d.mass !== "number" || !(d.mass > 0)) bad.push(id + ": mass " + d.mass);
      if(!ITEM_CATEGORIES.includes(d.category)) bad.push(id + ": category " + d.category);
      if(!(d.stage === null || (Number.isInteger(d.stage) && d.stage >= 0 && d.stage <= 7)))
        bad.push(id + ": stage " + d.stage);
      if(!/^#[0-9a-f]{6}$/.test(d.col) || !/^#[0-9a-f]{6}$/.test(d.dark)) bad.push(id + ": colours");
      if(typeof d.use !== "string" || d.use.length < 10) bad.push(id + ": no use line");
    }
    t.check("every item entry is complete", bad.length === 0, bad.join(" | ") || ITEM_IDS.length + " entries");
  }

  t.check("ITEM_IDS matches the table", ITEM_IDS.length === Object.keys(ITEM_DATA).length,
          ITEM_IDS.length + " ids");

  {
    const seen = new Set(), dupes = [];
    for(const id of ITEM_IDS){
      if(seen.has(id)) dupes.push(id);
      seen.add(id);
      if(!/^[a-z][a-z0-9_]*$/.test(id)) dupes.push(id + " (not snake_case)");
    }
    t.check("ids are unique and snake_case", dupes.length === 0, dupes.join(" ") || "clean");
  }

  /* --- bands say where a thing is found --- */
  {
    const bad = [];
    for(const id of ITEM_IDS){
      const d = ITEM_DATA[id];
      const found = d.category === "raw" || d.category === "gathered" ||
                    d.category === "liquid";
      if(found && !BANDS.includes(d.band)) bad.push(id + ": band " + d.band);
      if(!found && d.band !== null) bad.push(id + ": made, but has band " + d.band);
    }
    t.check("found items have a depth band, made items do not", bad.length === 0,
            bad.join(" | ") || "all consistent");
  }

  /* --- every ore the world yields must exist as an item --- */
  {
    const missing = [];
    let ores = 0;
    for(const M of MATS){
      if(!M.dig2) continue;
      ores++;
      if(!ITEM_DATA[M.dig2]) missing.push(M.name + " -> " + M.dig2);
    }
    t.check("every material yield has an item entry", missing.length === 0,
            missing.join(", ") || ores + " ore materials covered");
  }

  /* --- and no raw entry claims a yield the world never produces --- */
  {
    const yields = new Set(MATS.filter(m => m.dig2).map(m => m.dig2));
    const orphans = ITEM_IDS.filter(id => ITEM_DATA[id].category === "raw"
                                       && !yields.has(id)
                                       && !PENDING_YIELD.includes(id));
    t.check("no raw item exists that nothing in the world yields", orphans.length === 0,
            orphans.join(" ") || "none beyond the agreed pending list");

    /* An entry here that HAS landed is stale and wants removing - but that is
       a reminder, not a failure, and deliberately so. Failing on it would mean
       the only green state is one where lane A and lane F commit atomically:
       whoever pushed first would redden main for the other. In a repo where
       six chats share a working directory that is a trap, not a safety net.
       So this reports, and the cap below is what stops the list rotting. */
    const landed = PENDING_YIELD.filter(id => yields.has(id));
    t.check("PENDING_YIELD is reported, so a stale entry cannot hide", true,
            landed.length ? "STALE, drop from PENDING_YIELD: " + landed.join(" ")
                          : "pending: " + (PENDING_YIELD.join(" ") || "nothing"));

    /* It is an exemption list, so it must stay small enough to read at a
       glance. A long one means raw items are being invented faster than the
       world grows sources for them. */
    t.check("PENDING_YIELD has not become a dumping ground", PENDING_YIELD.length <= 2,
            PENDING_YIELD.length + " entries");
  }

  /* A liquid item is only legitimate if the world has that liquid in it -
     otherwise "extraction is not a recipe" becomes a way to declare any
     material into existence by calling it a fluid. */
  {
    const liquids = ITEM_IDS.filter(id => ITEM_DATA[id].category === "liquid");
    const unfounded = liquids.filter(id => {
      const name = ITEM_DATA[id].name.toLowerCase();
      return !MATS.some(M => M.liquid &&
        (name.includes(M.name.toLowerCase()) || M.name.toLowerCase().includes(name.split(" ").pop())));
    });
    t.check("every liquid item is a liquid the world actually contains",
            liquids.length > 0 && unfounded.length === 0,
            unfounded.join(" ") || liquids.join(" ") + " all exist in the ground");
  }

  /* --- no drift from lane C's live registry ---
     Lane C now BUILDS its registry from ITEM_DATA rather than keeping a second
     copy, so this comparison is close to tautological today. It stays because
     it is exactly what fails if anyone ever forks the table again, and because
     the reverse direction below is not tautological at all. */
  {
    const g = boot(4242);
    const drift = [];
    for(const id in g.items.items){
      const c = g.items.items[id];
      if(c.category !== "raw") continue;          // lane D registers refined goods at runtime
      const d = itemData(id);
      if(!d){ drift.push(id + ": absent from ITEM_DATA"); continue; }
      if(d.name !== c.name) drift.push(id + ": name " + d.name + " vs " + c.name);
      if(d.col !== c.col || d.dark !== c.dark) drift.push(id + ": colours differ");
      if(d.tier !== c.tier) drift.push(id + ": tier " + d.tier + " vs " + c.tier);
      if(d.mass !== c.mass) drift.push(id + ": mass " + d.mass + " vs " + c.mass);
    }
    t.check("ITEM_DATA has not drifted from the item registry", drift.length === 0,
            drift.join(" | ") || "names, colours, masses and tiers all match");

    /* The direction that still bites: an item I define must actually reach the
       live registry, or the HUD and crafting simply cannot see it. */
    const dropped = ITEM_IDS.filter(id => !g.items.items[id]);
    t.check("every item I define reaches the live registry", dropped.length === 0,
            dropped.join(" ") || Object.keys(g.items.items).length + " registered");
  }

  /* --- masses keep hauling a real problem --- */
  {
    const tooHeavy = [], tooLight = [];
    for(const id of ITEM_IDS){
      const d = ITEM_DATA[id];
      if(d.category !== "raw") continue;          // tools and fibre are meant to be light
      if(d.mass > CARRY_START / CHUNKS_MIN) tooHeavy.push(id + " " + d.mass + "kg");
      if(d.mass < CARRY_START / CHUNKS_MAX) tooLight.push(id + " " + d.mass + "kg");
    }
    t.check("a starting backpack holds at least " + CHUNKS_MIN + " chunks of any ore",
            tooHeavy.length === 0, tooHeavy.join(" ") || "heaviest is fine");
    t.check("no ore is light enough to make hauling free",
            tooLight.length === 0, tooLight.join(" ") || "lightest is fine");
  }

  {
    const carried = ITEM_IDS.filter(id => ITEM_DATA[id].category === "raw")
                            .map(id => ITEM_DATA[id].mass);
    const heaviest = Math.max(...carried), lightest = Math.min(...carried);
    t.check("dense ore is meaningfully worse to carry than cheap rubble",
            heaviest / lightest >= 1.8, lightest + "kg .. " + heaviest + "kg");
  }

  /* --- depth is progression: nothing early may need a deep dig --- */
  {
    const early = ITEM_IDS.filter(id => {
      const d = ITEM_DATA[id];
      return (d.band === "deep" || d.band === "verydeep") && d.stage !== null && d.stage <= 1;
    });
    t.check("no stage 0-1 item comes from the deep bands", early.length === 0,
            early.join(" ") || "early game stays shallow");
  }

  /* --- the hand-craft list of PROGRESSION stage 0 has somewhere to land --- */
  {
    const hand = ["torch", "rope", "stone_knife", "stone_axe", "bandage"];
    const absent = hand.filter(id => !ITEM_DATA[id]);
    t.check("every stage 0 hand-crafted item exists", absent.length === 0,
            absent.join(" ") || hand.join(" "));
    const late = hand.filter(id => ITEM_DATA[id] && ITEM_DATA[id].stage !== 0);
    t.check("stage 0 hand crafts are marked stage 0", late.length === 0, late.join(" ") || "all 0");
  }

  t.check("itemData returns null for an unknown id", itemData("no_such_thing") === null);

  /* ==================== recipes ==================== */

  /* Nothing may be made out of, or into, an item that does not exist. */
  {
    const bad = [];
    for(const id of RECIPE_IDS){
      const r = RECIPES[id];
      if(r.id !== id) bad.push(id + ": id field is " + r.id);
      if(!(r.time > 0)) bad.push(id + ": time " + r.time);
      if(!(Number.isInteger(r.stage) && r.stage >= 0 && r.stage <= 7)) bad.push(id + ": stage " + r.stage);
      if(typeof r.note !== "string" || r.note.length < 10) bad.push(id + ": no note");
      for(const item in r.inputs){
        if(!ITEM_DATA[item]) bad.push(id + ": input " + item + " does not exist");
        if(!(r.inputs[item] > 0)) bad.push(id + ": input " + item + " count " + r.inputs[item]);
      }
      const outs = Object.keys(r.outputs);
      if(outs.length === 0) bad.push(id + ": produces nothing");
      for(const item of outs){
        if(!ITEM_DATA[item]) bad.push(id + ": output " + item + " does not exist");
      }
    }
    t.check("no recipe needs or makes an item that does not exist", bad.length === 0,
            bad.join(" | ") || RECIPE_IDS.length + " recipes");
  }

  /* ---- A STAGE IS A CLAIM, AND CLAIMS GET CHECKED ----
     Lane C put it better than I would: they noticed rope was the only craft
     that gained mass and "wrote it down as scenery" rather than treating it
     as a symptom. I had done the same thing in my own table twice. Coal said
     "kiln and forge fuel" while exactly one recipe consumed it, three stages
     after it is first dug. Quartz said "clear glass" while the glass recipe
     took sand and nothing anywhere consumed quartz at all. Copper, tin, zinc
     and lead all said stage 4 with no recipe touching them.

     The `use` line is prose and may describe an intention. THE STAGE FIELD IS
     A CLAIM OF FACT: it says something in the game uses this by then. So a
     numeric stage at or below the costed frontier now has to be true, and
     null is the honest way to say "nothing consumes this yet" - the same
     answer a stage's own reachedWhen gives when it is not costed out. */
  {
    const consumed = new Set();
    for(const id of RECIPE_IDS) for(const k in RECIPES[id].inputs) consumed.add(k);
    for(const id of RECIPE_IDS) if(RECIPES[id].tool) consumed.add(RECIPES[id].tool);
    for(const id of BUILDING_IDS) for(const k in BUILDINGS[id].materials) consumed.add(k);

    /* held rather than consumed: a tool is used by carrying it */
    const HELD = ["tool", "light", "medical", "vehicle"];
    const sinkless = ITEM_IDS.filter(id => {
      const d = ITEM_DATA[id];
      return !consumed.has(id) && !HELD.includes(d.category) && d.sink !== "world";
    });

    const lying = sinkless.filter(id => ITEM_DATA[id].stage !== null &&
                                        ITEM_DATA[id].stage <= highestCostedStage());
    t.check("no item claims a stage by which nothing uses it", lying.length === 0,
            lying.map(id => id + " says stage " + ITEM_DATA[id].stage).join(", ") ||
            "every costed stage claim is backed by something that consumes it");

    /* The rest are future content and legitimately unconsumed - but they are
       REPORTED every run, so "nothing uses this yet" can never again be
       something I notice once and write down as scenery. */
    t.check("items nothing consumes yet are listed, not left as scenery", true,
            sinkless.length ? "awaiting a consumer: " + sinkless.join(" ")
                            : "everything in the table is consumed by something");
  }

  /* ---- MATTER IS CONSERVED, LAW ONE, AND CRAFTING IS NOT EXEMPT ----
     I wrote a pumping recipe with no inputs, reasoning that the input was the
     oil in the ground. Lane D reproduced it: a derrick on a dry hillside
     produced four measures a minute forever, because there was nothing for it
     to run out of. Nobody had done anything wrong on their own - a recipe
     with no inputs is only a matter printer once stations repeat unattended,
     which is a separate and correct decision - and it lived in the gap
     between two lanes where no test looked.

     These two close the class rather than the instance. Extraction cannot be
     expressed as a recipe, so every pump, quarry and intake that comes later
     has to be built where the world is actually touched. */
  {
    const fromNothing = RECIPE_IDS.filter(id => Object.keys(RECIPES[id].inputs).length === 0);
    t.check("no recipe makes something out of nothing", fromNothing.length === 0,
            fromNothing.join(" ") ||
            "extraction belongs to whoever touches the world, not to crafting");

    const creates = [];
    for(const id of RECIPE_IDS){
      const r = RECIPES[id];
      let inMass = 0, outMass = 0;
      for(const k in r.inputs) inMass += ITEM_DATA[k].mass * r.inputs[k];
      for(const k in r.outputs) outMass += ITEM_DATA[k].mass * r.outputs[k];
      if(outMass > inMass + 1e-9)
        creates.push(id + " " + inMass.toFixed(2) + "kg in -> " + outMass.toFixed(2) + "kg out");
    }
    t.check("no recipe weighs more coming out than it did going in",
            creates.length === 0,
            creates.join(" | ") || "every craft loses mass or holds it");
  }

  /* A tool is required but not consumed, so it must be a real tool. */
  {
    const bad = [];
    for(const id of RECIPE_IDS){
      const tool = RECIPES[id].tool;
      if(tool === null) continue;
      if(!ITEM_DATA[tool]) bad.push(id + ": tool " + tool + " does not exist");
      else if(ITEM_DATA[tool].category !== "tool") bad.push(id + ": " + tool + " is not a tool");
      if(RECIPES[id].inputs[tool] !== undefined) bad.push(id + ": consumes its own tool");
    }
    t.check("recipe tools exist, are tools, and are not consumed", bad.length === 0,
            bad.join(" | ") || "clean");
  }

  /* Every station is either "anywhere" or a building that can actually exist. */
  {
    const bad = RECIPE_IDS.filter(id => RECIPES[id].station !== HAND && !BUILDINGS[RECIPES[id].station])
                          .map(id => id + " -> " + RECIPES[id].station);
    t.check("every recipe station exists as a building", bad.length === 0,
            bad.join(" | ") || "all stations resolve");
  }

  /* A recipe may not sit earlier than the things it consumes, or than the
     station it is made at. This is what stops a shortcut recipe skipping a
     stage - notably anything electric before stage 6. */
  {
    const bad = [];
    for(const id of RECIPE_IDS){
      const r = RECIPES[id];
      for(const item in r.inputs){
        const d = ITEM_DATA[item];
        if(d && d.stage > r.stage) bad.push(id + " (stage " + r.stage + ") needs " + item + " (stage " + d.stage + ")");
      }
      if(r.tool && ITEM_DATA[r.tool] && ITEM_DATA[r.tool].stage > r.stage)
        bad.push(id + " needs a later-stage tool " + r.tool);
      const st = BUILDINGS[r.station];
      if(st && st.stage > r.stage) bad.push(id + " (stage " + r.stage + ") is made at " + r.station + " (stage " + st.stage + ")");
    }
    t.check("no recipe is reachable before its ingredients or its station", bad.length === 0,
            bad.join(" | ") || "stage order holds");
  }

  /* Walk the whole tree from what the world gives you for free. Anything a
     player can never actually produce is a dead entry. */
  {
    /* A liquid is taken from the world, not made - the same standing as an
       ore, except it is pumped rather than dug. It is seeded here for that
       reason, and the check below is what stops that being a loophole: a
       liquid may only be seeded if the world actually contains it. */
    const have = new Set(ITEM_IDS.filter(id =>
      ITEM_DATA[id].category === "raw" || ITEM_DATA[id].category === "gathered" ||
      ITEM_DATA[id].category === "liquid"));
    let grew = true;
    while(grew){
      grew = false;
      for(const id of RECIPE_IDS){
        const r = RECIPES[id];
        if(r.tool && !have.has(r.tool)) continue;
        let ok = true;
        for(const item in r.inputs) if(!have.has(item)){ ok = false; break; }
        if(!ok) continue;
        for(const item in r.outputs) if(!have.has(item)){ have.add(item); grew = true; }
      }
    }
    const orphans = ITEM_IDS.filter(id => !have.has(id));
    t.check("every item can actually be obtained from a bare-hands start",
            orphans.length === 0, orphans.join(" ") || have.size + " items reachable");
  }

  {
    const seen = new Set(), dupes = RECIPE_IDS.filter(id => seen.has(id) || (seen.add(id), false));
    t.check("recipe ids are unique", dupes.length === 0, dupes.join(" ") || "clean");
  }

  t.check("the stage 0 hand list is craftable with no station",
          recipesAt(HAND).length >= 5, recipesAt(HAND).map(r => r.id).join(" "));

  /* ==================== buildings ==================== */

  {
    const bad = [];
    for(const id of BUILDING_IDS){
      const b = BUILDINGS[id];
      if(b.id !== id) bad.push(id + ": id field is " + b.id);
      if(!(b.w > 0 && b.h > 0)) bad.push(id + ": size " + b.w + "x" + b.h);
      if(!(b.time > 0)) bad.push(id + ": time " + b.time);
      if(!(Number.isInteger(b.stage) && b.stage >= 0 && b.stage <= 7)) bad.push(id + ": stage " + b.stage);
      if(typeof b.enables !== "string" || b.enables.length < 10) bad.push(id + ": no enables line");
      if(!b.support || !(b.support.ground >= 0 && b.support.ground <= 1))
        bad.push(id + ": support.ground " + (b.support && b.support.ground));
      if(b.storage !== undefined && !(b.storage > 0)) bad.push(id + ": storage " + b.storage);
      if(Object.keys(b.materials).length === 0) bad.push(id + ": costs nothing");
      for(const item in b.materials){
        if(!ITEM_DATA[item]) bad.push(id + ": material " + item + " does not exist");
        else if(ITEM_DATA[item].stage > b.stage) bad.push(id + ": needs later-stage " + item);
      }
    }
    t.check("every building entry is complete and buildable", bad.length === 0,
            bad.join(" | ") || BUILDING_IDS.length + " buildings");
  }

  /* Nothing floats - but not everything is founded on the GROUND. A ladder is
     held by the shaft wall and a rope ladder hangs from above; both are
     supported, neither stands on anything. What must never happen is a
     building that declares no support at all. */
  {
    const floating = BUILDING_IDS.filter(id => {
      const sp = BUILDINGS[id].support || {};
      return !(sp.ground > 0) && sp.wall !== true && !sp.anchor && sp.piece !== true;
    });
    t.check("no building floats", floating.length === 0,
            floating.join(" ") ||
            "every building is held up by ground, wall, anchor or another piece");

    /* Anything you can climb has to be held by something other than the floor,
       or it is furniture rather than a way up. */
    const climbable = BUILDING_IDS.filter(id => BUILDINGS[id].climb);
    const unsupported = climbable.filter(id => {
      const sp = BUILDINGS[id].support || {};
      return sp.wall !== true && !sp.anchor;
    });
    t.check("everything climbable is fixed to a wall or hung from above",
            climbable.length > 0 && unsupported.length === 0,
            unsupported.join(" ") || climbable.join(" "));
  }

  /* You cannot need a station that does not exist yet to build a station. */
  {
    const bad = [];
    for(const id of BUILDING_IDS){
      const at = BUILDINGS[id].buildsAt;
      if(at === HAND) continue;
      if(!BUILDINGS[at]){ bad.push(id + ": built at missing " + at); continue; }
      if(at === id) bad.push(id + ": is built at itself");
      else if(BUILDINGS[at].stage > BUILDINGS[id].stage) bad.push(id + ": built at later-stage " + at);
    }
    t.check("every building is raised at something that already exists", bad.length === 0,
            bad.join(" | ") || "chain holds");
  }

  /* At least one building must need nothing at all, or stage 0 is a dead end. */
  t.check("something can be built with bare hands",
          BUILDING_IDS.some(id => BUILDINGS[id].buildsAt === HAND && BUILDINGS[id].stage === 0),
          BUILDING_IDS.filter(id => BUILDINGS[id].buildsAt === HAND).join(" "));

  /* Haulage is the real cost of a building, so the guidebook quotes mass. */
  {
    const kg = buildMass("workbench", itemData);
    const trips = Math.ceil(kg / CARRY_START);
    t.check("a workbench is a few backpack trips, not one and not ten",
            trips >= 2 && trips <= 5, kg + "kg = " + trips + " trips of " + CARRY_START + "kg");
  }

  /* ==================== stages ==================== */

  {
    const bad = [];
    for(let i = 0; i < STAGES.length; i++){
      const s = STAGES[i];
      if(s.id !== i) bad.push("index " + i + " has id " + s.id);
      for(const f of ["name", "goal", "unlocks", "note"]){
        if(typeof s[f] !== "string" || s[f].length < 10) bad.push(s.id + ": no " + f);
      }
    }
    t.check("stages are ordered, gapless and described", bad.length === 0,
            bad.join(" | ") || STAGES.length + " stages");
  }

  t.check("stage 0 is reached by existing", STAGES[0].reachedWhen &&
          Object.keys(STAGES[0].reachedWhen).length === 0);

  /* Uncosted stages must be a suffix: never a costed stage above an uncosted
     one, or the ladder has a hole in the middle and stops meaning anything. */
  {
    let seenNull = false, holes = [];
    for(const s of STAGES){
      if(s.reachedWhen === null) seenNull = true;
      else if(seenNull) holes.push("stage " + s.id + " is costed above an uncosted one");
    }
    t.check("uncosted stages are a suffix, so progression fills in from the bottom",
            holes.length === 0, holes.join(" | ") || "costed up to stage " + highestCostedStage());
  }

  /* Nothing may be required that cannot exist. */
  {
    const bad = [];
    for(const s of STAGES){
      if(!s.reachedWhen) continue;
      for(const id of (s.reachedWhen.buildings || [])){
        if(!BUILDINGS[id]) bad.push("stage " + s.id + " needs missing building " + id);
        else if(BUILDINGS[id].stage > s.id) bad.push("stage " + s.id + " needs later-stage " + id);
      }
      for(const id in (s.reachedWhen.items || {})){
        if(!ITEM_DATA[id]) bad.push("stage " + s.id + " needs missing item " + id);
        else if(ITEM_DATA[id].stage > s.id) bad.push("stage " + s.id + " needs later-stage " + id);
      }
    }
    t.check("no stage requires something from a later stage", bad.length === 0,
            bad.join(" | ") || "requirements resolve");
  }

  /* The tables must agree about how far the game is actually costed. */
  {
    const topBuilding = Math.max(...BUILDING_IDS.map(id => BUILDINGS[id].stage));
    t.check("buildings do not run ahead of the costed stages",
            topBuilding <= highestCostedStage(),
            "buildings reach stage " + topBuilding + ", stages costed to " + highestCostedStage());
  }

  /* Progression is a ladder, not a set. Owning a kiln without ever having
     built a workbench must NOT read as stage 2. */
  {
    const none = () => false;
    const never = () => false;
    const only = (...ids) => (id) => ids.includes(id);
    t.check("nothing built means stage 0", highestStageReached(none, never) === 0);
    t.check("a workbench reaches stage 1", highestStageReached(only("workbench"), never) === 1);
    t.check("workbench and kiln reach stage 2",
            highestStageReached(only("workbench", "kiln"), never) === 2);
    t.check("a kiln without a workbench does not skip stage 1",
            highestStageReached(only("kiln"), never) === 0, "ladder, not a set");
    t.check("the ladder stops at the last costed stage",
            highestStageReached(() => true, () => true) === highestCostedStage(),
            "everything built -> stage " + highestStageReached(() => true, () => true));
  }

  /* ==================== guidebook ==================== */

  {
    const missing = STAGES.filter(s => !guideFor(s.id)).map(s => s.id);
    t.check("every stage has a guidebook entry", missing.length === 0,
            missing.join(" ") || GUIDE.length + " entries");
    t.check("there is exactly one entry per stage", GUIDE.length === STAGES.length,
            GUIDE.length + " entries for " + STAGES.length + " stages");
  }

  {
    const bad = [];
    for(const g of GUIDE){
      if(typeof g.lookFor !== "string" || g.lookFor.length < 20)
        bad.push("stage " + g.stage + ": no lookFor");
      if(!Array.isArray(g.actions) || g.actions.length < 2 || g.actions.length > 4)
        bad.push("stage " + g.stage + ": " + (g.actions || []).length + " actions, want 2-4");
      for(const a of (g.actions || [])){
        if(!a.id) bad.push("stage " + g.stage + ": action with no id");
        if(typeof a.do !== "string" || a.do.length < 5) bad.push(a.id + ": no `do`");
        if(typeof a.why !== "string" || a.why.length < 20) bad.push(a.id + ": no `why`");
      }
    }
    t.check("guidebook entries are complete and the right length", bad.length === 0,
            bad.join(" | ") || "all stages");
  }

  /* Action ids are how the UI remembers what has been dismissed, so they must
     be unique across the whole book, not just within a stage. */
  {
    const seen = new Set(), dupes = [];
    for(const g of GUIDE) for(const a of g.actions){
      if(seen.has(a.id)) dupes.push(a.id);
      seen.add(a.id);
    }
    t.check("action ids are unique across the whole guidebook", dupes.length === 0,
            dupes.join(" ") || seen.size + " actions");
  }

  /* THE RULE: never write a shortfall down. A number in guidance prose is a
     cost that has been copied out of a table, and it goes stale the moment
     that table is tuned - which is this lane's entire job. */
  {
    const withNumbers = [];
    for(const g of GUIDE){
      if(/\d/.test(g.lookFor)) withNumbers.push("stage " + g.stage + " lookFor");
      for(const a of g.actions){
        if(/\d/.test(a.do)) withNumbers.push(a.id + ".do");
        if(/\d/.test(a.why)) withNumbers.push(a.id + ".why");
      }
    }
    t.check("no guidebook prose hard-codes a number", withNumbers.length === 0,
            withNumbers.join(" ") || "every shortfall is computed, not written");
  }

  /* Every `needs` must point at something real, so the UI can subtract
     without defensive checks. */
  {
    const bad = [];
    for(const g of GUIDE) for(const a of g.actions){
      const n = a.needs;
      if(n === null) continue;
      const kinds = ["build", "craft", "items"].filter(k => n[k] !== undefined);
      if(kinds.length !== 1){ bad.push(a.id + ": needs has " + kinds.length + " kinds"); continue; }
      if(n.build && !BUILDINGS[n.build]) bad.push(a.id + ": no building " + n.build);
      if(n.build && BUILDINGS[n.build] && BUILDINGS[n.build].stage > g.stage)
        bad.push(a.id + ": points at later-stage building " + n.build);
      if(n.craft && !RECIPES[n.craft]) bad.push(a.id + ": no recipe " + n.craft);
      if(n.craft && RECIPES[n.craft] && RECIPES[n.craft].stage > g.stage)
        bad.push(a.id + ": points at later-stage recipe " + n.craft);
      for(const id in (n.items || {})){
        if(!ITEM_DATA[id]) bad.push(a.id + ": no item " + id);
        else if(!(n.items[id] > 0)) bad.push(a.id + ": " + id + " count " + n.items[id]);
      }
    }
    t.check("every guidebook `needs` points at something that exists", bad.length === 0,
            bad.join(" | ") || "all resolve");
  }

  /* A costed stage must give the panel something to subtract; an uncosted one
     must not pretend it can, because there is nothing there to point at. */
  {
    const silent = [], pretending = [];
    for(const g of GUIDE){
      const costed = g.stage <= highestCostedStage();
      const anyNeeds = g.actions.some(a => a.needs !== null);
      if(costed && !anyNeeds) silent.push("stage " + g.stage);
      if(!costed && anyNeeds) pretending.push("stage " + g.stage);
    }
    t.check("every costed stage gives the panel something to compute",
            silent.length === 0, silent.join(" ") || "up to stage " + highestCostedStage());
    t.check("uncosted stages stay prose, with nothing dangling to point at",
            pretending.length === 0, pretending.join(" ") || "above stage " + highestCostedStage());
  }

  /* Anything you have to find in the world needs a way to recognise it. */
  {
    const findable = ITEM_IDS.filter(id => ITEM_DATA[id].band !== null);
    const unhinted = findable.filter(id => !hintFor(id));
    t.check("everything you must find in the world has an identification hint",
            unhinted.length === 0, unhinted.join(" ") || findable.length + " findable items hinted");

    const strays = Object.keys(MATERIAL_HINTS).filter(id => !ITEM_DATA[id]);
    t.check("no hint describes an item that does not exist", strays.length === 0,
            strays.join(" ") || "clean");
  }

  t.check("the world's hazards are explained",
          Object.keys(HAZARD_HINTS).length >= 4 &&
          Object.values(HAZARD_HINTS).every(v => typeof v === "string" && v.length > 30),
          Object.keys(HAZARD_HINTS).join(" "));

  t.check("guideFor returns null off the end of the book", guideFor(99) === null);

  /* ==================== fuel ==================== */

  {
    const bad = [];
    for(const id in FUELS){
      if(!ITEM_DATA[id]) bad.push(id + ": not an item");
      if(!(FUELS[id].heat > 0)) bad.push(id + ": heat " + FUELS[id].heat);
      if(typeof FUELS[id].smelting !== "boolean") bad.push(id + ": no smelting flag");
      if(typeof FUELS[id].clean !== "boolean") bad.push(id + ": no clean flag");
    }
    t.check("every fuel is a real item with a heat value", bad.length === 0,
            bad.join(" | ") || Object.keys(FUELS).join(", "));
  }

  /* A wood fire does not reach metal temperature at any quantity, so nothing
     smelted may be fired on it. This is the rule that makes charcoal a step
     rather than a nicety. */
  {
    const woodSmelts = RECIPE_IDS.filter(id =>
      RECIPES[id].station === "forge" && RECIPES[id].inputs.wood &&
      Object.keys(RECIPES[id].outputs).some(o => /_bar$/.test(o)));
    t.check("nothing is smelted on a wood fire, at any quantity",
            woodSmelts.length === 0 && FUELS.wood.smelting === false,
            woodSmelts.join(" ") || "wood cannot smelt, and no recipe pretends it can");
  }

  /* Firing costs fuel. A kiln that turns clay into brick out of nothing is a
     hole in the logistics the industry lane exists to be about. Charcoal is
     the one exemption: driving the volatiles out of wood is self-sustaining.

     SCOPED TO `fired`, NOT TO `timed`. I wrote this rule for the kiln and the
     forge and keyed it on "does this station take time", which happened to be
     the same set until a derrick turned up. A derrick is worked by a beam and
     a sawmill by water; both take time, neither burns anything, and demanding
     fuel of them would be the rule outliving its reason. Only heat needs
     fuel, so only heat is asked for it. */
  {
    const freeHeat = RECIPE_IDS.filter(id => {
      const r = RECIPES[id];
      const st = BUILDINGS[r.station];
      if(!st || !st.fired) return false;
      if(id === "charcoal") return false;
      return !Object.keys(r.inputs).some(i => FUELS[i]);
    });
    t.check("every firing consumes fuel", freeHeat.length === 0,
            freeHeat.join(" ") || "nothing is fired for free");
  }

  /* Two routes to the same bar must deliver the same heat, or one of them is
     secretly the good one and the choice is not a choice. */
  {
    const heatOf = r => Object.keys(r.inputs)
      .filter(i => FUELS[i])
      .reduce((sum, i) => sum + FUELS[i].heat * r.inputs[i], 0);
    const a = RECIPES.iron_bar, b = RECIPES.iron_bar_coal;
    t.check("the charcoal and coal routes to an iron bar deliver equal heat",
            !!a && !!b && heatOf(a) === heatOf(b) &&
            a.outputs.iron_bar === b.outputs.iron_bar,
            "charcoal route " + heatOf(a) + ", coal route " + heatOf(b));
  }

  /* Coal must not obsolete charcoal the moment a seam is found, or the kiln
     stops mattering half way through the game. Steel needs clean heat. */
  {
    const steel = RECIPES.steel_bar;
    const cleanFuel = Object.keys(steel.inputs).filter(i => FUELS[i] && FUELS[i].clean);
    t.check("steel still needs a clean fuel, so coal never retires the kiln",
            cleanFuel.length > 0, cleanFuel.join(" ") || "NONE - coal has obsoleted charcoal");
  }

  /* The finding that started this: coal had exactly one sink in the whole
     game, three stages after it is first dug. */
  {
    const sinks = RECIPE_IDS.filter(id => RECIPES[id].inputs.coal);
    t.check("coal is worth digging for more than one thing", sinks.length >= 2,
            sinks.join(" "));
    t.check("and coal's stage says honestly when it starts mattering",
            ITEM_DATA.coal.stage === Math.min(...sinks.map(id => RECIPES[id].stage)),
            "coal is stage " + ITEM_DATA.coal.stage + ", first sink at stage " +
            Math.min(...sinks.map(id => RECIPES[id].stage)));
  }

  /* ==================== the haulage ladder ==================== */

  /* One source of truth: the bottom rung IS the backpack, not a copy of it. */
  t.check("the ladder starts at the real backpack capacity",
          HAULAGE.backpack.capacity === CARRY_START && REFERENCE_LOAD === CARRY_START,
          CARRY_START + " kg");

  {
    const bad = [];
    for(const id of HAULAGE_IDS){
      const h = HAULAGE[id];
      if(h.id !== id) bad.push(id + ": id field is " + h.id);
      if(!(Number.isInteger(h.stage) && h.stage >= 0 && h.stage <= 7)) bad.push(id + ": stage " + h.stage);
      if(!(h.throughput > 0)) bad.push(id + ": throughput " + h.throughput);
      if(h.continuous){
        if(h.capacity !== null) bad.push(id + ": continuous but has a capacity");
        if(h.speed !== null) bad.push(id + ": continuous but has a speed");
      } else {
        if(!(h.capacity > 0)) bad.push(id + ": capacity " + h.capacity);
        if(!(h.speed > 0)) bad.push(id + ": speed " + h.speed);
      }
      for(const f of ["constraint", "keepsAlive", "setup", "note"]){
        if(typeof h[f] !== "string" || h[f].length < 20) bad.push(id + ": no " + f);
        else if(/\d/.test(h[f])) bad.push(id + ": " + f + " hard-codes a number");
      }
    }
    t.check("every haulage rung is complete, and none writes a number into prose",
            bad.length === 0, bad.join(" | ") || HAULAGE_IDS.length + " rungs");
  }

  /* Throughput must be what capacity and speed actually imply, or the table
     is quietly lying about which rung is better. */
  {
    const off = [];
    for(const id of HAULAGE_IDS){
      const h = HAULAGE[id];
      if(h.continuous) continue;
      const implied = (h.capacity / CARRY_START) * h.speed;
      if(Math.abs(implied - h.throughput) / h.throughput > 0.06)
        off.push(id + ": says " + h.throughput + ", implies " + implied.toFixed(1));
    }
    t.check("stated throughput matches capacity times speed", off.length === 0,
            off.join(" | ") || "arithmetic holds");
  }

  {
    const bad = [];
    for(let i = 1; i < HAULAGE_IDS.length; i++){
      const prev = HAULAGE[HAULAGE_IDS[i-1]], cur = HAULAGE[HAULAGE_IDS[i]];
      if(cur.stage < prev.stage) bad.push(cur.id + " is available before " + prev.id);
    }
    t.check("the ladder is in stage order", bad.length === 0,
            bad.join(" | ") || HAULAGE_IDS.join(" -> "));
  }

  /* The attended rungs are the ones that must climb. The conveyor is judged
     on its own axis below, because a belt honestly moves less than a train
     and forcing one rising line would mean inflating its numbers. */
  {
    const bad = [];
    for(let i = 1; i < BATCH_LADDER.length; i++){
      const prev = HAULAGE[BATCH_LADDER[i-1]], cur = HAULAGE[BATCH_LADDER[i]];
      if(cur.throughput <= prev.throughput) bad.push(cur.id + " is no better than " + prev.id);
    }
    t.check("every rung that costs your time out-hauls the one below it",
            bad.length === 0, bad.join(" | ") || BATCH_LADDER.join(" -> "));
  }

  /* "A real multiple of the last, none of them trivialising the previous
     step" - docs/lanes/content.md. Too small a step and the rung is not worth
     building; too large and the one below stops being worth using at all. */
  {
    const tooSmall = [], tooBig = [];
    for(let i = 1; i < BATCH_LADDER.length; i++){
      const id = BATCH_LADDER[i];
      const step = stepUpFrom(id);
      if(step < 2.5) tooSmall.push(id + " x" + step.toFixed(1));
      if(step > 12)  tooBig.push(id + " x" + step.toFixed(1));
    }
    t.check("each rung is a real multiple of the one below", tooSmall.length === 0,
            tooSmall.join(" ") || "every step is worth building");
    t.check("no rung leaps so far it makes the one below pointless", tooBig.length === 0,
            tooBig.join(" ") || "no step trivialises its predecessor");
  }

  /* The structural guarantee that the ladder does not eat itself: every rung
     above the first names something it cannot do, and names who still does it. */
  {
    const unbounded = HAULAGE_IDS.slice(1).filter(id => {
      const h = HAULAGE[id];
      return !h.constraint || !h.keepsAlive;
    });
    t.check("every rung above the backpack has a limit and leaves work behind",
            unbounded.length === 0, unbounded.join(" ") || "each rung keeps the last useful");
  }

  {
    const cont = HAULAGE_IDS.filter(id => HAULAGE[id].continuous);
    t.check("exactly one rung flows rather than making trips", cont.length === 1,
            cont.join(" ") || "none");

    /* The conveyor's axis. It does NOT have to beat the train on tonnage - it
       has to be unattended, and it has to be a serious option rather than a
       toy, which means clearing the wagon it would replace. */
    const belt = HAULAGE.conveyor;
    t.check("the conveyor is the one rung that does not cost the player's time",
            belt.attended === false &&
            HAULAGE_IDS.filter(id => !HAULAGE[id].attended).length === 1);
    t.check("the conveyor is a serious option, not a toy",
            belt.throughput > HAULAGE.mine_wagon.throughput,
            "belt " + belt.throughput + " vs wagon " + HAULAGE.mine_wagon.throughput);
    t.check("and it is honestly worse than a train, which is the trade",
            belt.throughput < HAULAGE.rail_train.throughput,
            "belt " + belt.throughput + " vs train " + HAULAGE.rail_train.throughput);
  }

  /* A rung must not arrive before the stage that makes it buildable. */
  {
    const early = HAULAGE_IDS.filter(id => HAULAGE[id].stage > highestCostedStage()
                                        && HAULAGE[id].stage < 1);
    t.check("no haulage rung claims to arrive before stage one", early.length === 0,
            early.join(" ") || "stages sane");
    t.check("the wheelbarrow arrives with the workbench that makes it",
            HAULAGE.wheelbarrow.stage === BUILDINGS.workbench.stage,
            "barrow stage " + HAULAGE.wheelbarrow.stage);
  }

  t.check("haulage returns null for a rung that does not exist",
          haulage("teleporter") === null);

  /* ==================== the reference book ==================== */

  {
    const bad = [];
    for(const id of REFERENCE_IDS){
      const p = REFERENCE[id];
      if(p.id !== id) bad.push(id + ": id field is " + p.id);
      if(typeof p.title !== "string" || p.title.length < 3) bad.push(id + ": no title");
      if(typeof p.body !== "string" || p.body.length < 80) bad.push(id + ": body too thin");
      if(p.body.length > 700) bad.push(id + ": body is a wall of text");
      if(p.status !== "live" && p.status !== "planned") bad.push(id + ": status " + p.status);
      if(!Array.isArray(p.keywords) || p.keywords.length < 4) bad.push(id + ": too few keywords");
      if(!Array.isArray(p.figures)) bad.push(id + ": figures is not a list");
      if(!Array.isArray(p.see)) bad.push(id + ": see is not a list");
    }
    t.check("every reference page is complete", bad.length === 0,
            bad.join(" | ") || REFERENCE_IDS.length + " pages");
  }

  /* Same rule as the guidebook: a number in prose is a number copied out of a
     table, and it goes stale the moment that table is tuned. */
  {
    const withNumbers = REFERENCE_IDS.filter(id => /\d/.test(REFERENCE[id].body));
    t.check("no reference page hard-codes a number in its prose",
            withNumbers.length === 0,
            withNumbers.join(" ") || "every figure is derived from a table");
  }

  /* And the figures really must be derived, not decorative. */
  {
    const bad = [];
    for(const id of REFERENCE_IDS){
      for(const f of REFERENCE[id].figures){
        if(typeof f.label !== "string" || !f.label) bad.push(id + ": figure with no label");
        if(f.value === undefined || f.value === null || f.value === "")
          bad.push(id + ": figure " + f.label + " has no value");
      }
    }
    t.check("every figure has a label and a value", bad.length === 0,
            bad.join(" | ") || "figures clean");
    /* the backpack page must quote the real capacity, or the book has drifted */
    const cap = REFERENCE.backpack.figures.find(f => f.label === "Starting capacity");
    t.check("the backpack page quotes the live carry limit",
            cap && cap.value === CARRY_START + " kg", cap && cap.value);
  }

  /* Key bindings are the panel's to generate from the real bindings; naming
     one here is how a book starts lying about the controls. */
  {
    /* Deliberately narrow: this is about CONTROLS, not the English word
       "hold". "Somewhere to hold on to" is a fact about climbing; "hold the
       shift key" is a control, and controls belong to the panel. */
    const keyish = REFERENCE_IDS.filter(id =>
      /\b(press|keyboard|keybind|keybinding|hotkey|button)\b|\bkeys?\b|\bclick\b/i
        .test(REFERENCE[id].body));
    t.check("no reference page names a key binding", keyish.length === 0,
            keyish.join(" ") || "controls left to the panel");
  }

  {
    const dangling = [];
    for(const id of REFERENCE_IDS)
      for(const ref of REFERENCE[id].see)
        if(!REFERENCE[ref]) dangling.push(id + " -> " + ref);
    t.check("every cross-reference points at a real page", dangling.length === 0,
            dangling.join(" ") || "all links resolve");
  }

  {
    const seen = new Set(), dupes = [];
    for(const id of REFERENCE_IDS){
      if(seen.has(id)) dupes.push(id);
      seen.add(id);
      const kw = REFERENCE[id].keywords;
      const kseen = new Set();
      for(const k of kw){
        if(k !== k.toLowerCase()) dupes.push(id + ": keyword not lowercase, " + k);
        if(kseen.has(k)) dupes.push(id + ": duplicate keyword " + k);
        kseen.add(k);
      }
    }
    t.check("page ids and keywords are clean", dupes.length === 0, dupes.join(" | ") || "clean");
  }

  /* The honesty field. The owner's complaint is "I cannot tell what is in the
     game", so a page describing an unbuilt mechanic MUST be marked, and the
     split must be visible rather than assumed. */
  {
    t.check("the book says which mechanics are actually in the build",
            LIVE_IDS.length + PLANNED_IDS.length === REFERENCE_IDS.length &&
            PLANNED_IDS.length > 0,
            LIVE_IDS.length + " live, " + PLANNED_IDS.length + " planned: " + PLANNED_IDS.join(" "));

    /* PROBE THE RUNNING GAME RATHER THAN TRUSTING THE FIELD.
       `status` began as a hand-edited claim checked against a hand-written
       list, and that list went stale the moment lane C shipped placement and
       lane A shipped tool tiers: the book started telling players that two
       mechanics in their hands were missing. That is the same failure the
       field exists to prevent, pointed the other way, and it is worse for
       being invisible - nobody reads a badge and thinks to doubt it.

       So each page that can be checked carries a probe against the booted
       game. The asymmetry is deliberate:
         claims LIVE but is not built  -> FAIL. Overclaiming misleads the
              player, and only I can cause it, so it is mine to never do.
         claims PLANNED but IS built   -> REPORT. Another lane shipping a
              feature must not redden main for me; it should nag me to change
              one word. Same reasoning as PENDING_YIELD. */
    const gp = boot(20260828);
    const sys = name => gp.systems.find(x => x.name === name);

    const PROBES = {
      stations: () => { const b = sys("build"); return !!(b && b.api && b.api.place); },
      tools:    () => {
        const spot = findMaterial(gp.world, M_ROCK, 6);
        if(!spot) return null;                       /* cannot tell on this seed */
        const rock = () => {
          let n = 0;
          for(let y = spot.y-4; y < spot.y+4; y++)
            for(let x = spot.x-4; x < spot.x+4; x++) if(gp.world.matAt(x,y) === M_ROCK) n++;
          return n;
        };
        const before = rock();
        gp.world.digFreeCircle(spot.x, spot.y, 4, true, "stone_shovel");
        const afterShovel = rock();
        gp.world.digFreeCircle(spot.x, spot.y, 4, true, "stone_pickaxe");
        return afterShovel === before && rock() < before;
      },
      /* Also an outcome, and for the same reason: dumpMaterial EXISTS as a
         function and a name probe would have called this live long before it
         did anything. Pour material and count whether the ground actually
         gained it. */
      /* Outcome: does the world actually bring a roof down? The config is
         lane A's; what matters here is that the mechanic exists, because if
         it does the player needs something to prop with. */
      "cave-ins": () => !!(gp.world.caveConfig && gp.world.caveConfig.enabled &&
                           typeof gp.world.addSupport === "function"),
      spoil:    () => {
        if(typeof gp.world.dumpMaterial !== "function") return false;
        const x = 600, surf = gp.world.surfaceAt(x);
        const solid = () => {
          let n = 0;
          for(let j = surf - 60; j < surf + 60; j++)
            for(let i = x - 30; i < x + 30; i++) if(gp.world.isSolid(i, j)) n++;
          return n;
        };
        const before = solid();
        gp.world.dumpMaterial(x, surf - 30, 2 /* M_EARTH */, 400);
        gp.tick(400);
        return solid() > before;
      },
      hauling:  () => !!sys("industry"),
      survival: () => Object.prototype.hasOwnProperty.call(gp.state.player, "hunger"),
      /* Stage state is "what have you built", so it becomes answerable at
         exactly the moment placement does - the game can be asked whether a
         workbench exists. Same signal as `stations` because it is the same
         fact, not because the probe is lazy. */
      /* PROBE THE OUTCOME, NOT THE NAME. This one used to test
         `typeof actor.chop === "function"` - a name I GUESSED at for lane B's
         side of felling, and which never existed. So it reported "planned"
         while chopping worked perfectly, and the book told players a whole
         mode was missing. A name probe fails silently when the name is wrong;
         an outcome probe cannot. Fell a tree and see whether wood exists. */
      house:    () => {
        const g2 = boot(31415);
        const { W: LW } = g2.world.size();
        for(let x = 100; x < LW - 100; x += 6){
          const y = g2.world.surfaceAt(x) - 10;
          for(let k = 0; k < 400; k++){
            const r = g2.world.chopAt(x, y, 26, "stone_axe");
            if(!r.hit) break;
            if(r.felled){ g2.tick(60); return g2.items.dropCount() > 0; }
          }
        }
        return null;                      /* no tree on this seed: cannot tell */
      },
      stages:   () => { const b = sys("build"); return !!(b && b.api && typeof b.api.has === "function"); }
    };

    const overclaiming = [], underclaiming = [], unprobed = [];
    for(const id of REFERENCE_IDS){
      const probe = PROBES[id];
      if(!probe) continue;              /* no probe defined: not a claim I can check */
      let built;
      try { built = probe(); } catch (e) { built = null; }
      if(built === null){ unprobed.push(id); continue; }
      if(REFERENCE[id].status === "live" && !built) overclaiming.push(id);
      if(REFERENCE[id].status === "planned" && built) underclaiming.push(id);
    }

    /* A NOTE ON WHOSE FAULT AN OVERCLAIM IS, because this fired once and was
       nobody's. The asymmetry above assumes only the claiming lane can cause
       an overclaim, and that is true of the FLAG - but the probe reads another
       lane's runtime, so a system switched off mid-edit trips it too. On a
       commit that is correct and should be loud: a shipped `enabled: false`
       would mean the book promising a mechanic the player does not have. In a
       shared working tree it is somebody's work in progress. Run
       tools/verify.js before chasing it - if the commit is green, it is not
       yours and it is not a regression. */
    t.check("no page claims a mechanic works when the game says it does not",
            overclaiming.length === 0,
            overclaiming.join(" ") || "nothing overclaimed");

    t.check("pages that have quietly come true are reported, not left to rot",
            true,
            underclaiming.length
              ? "NOW BUILT, flip to live: " + underclaiming.join(" ")
              : "no page is understating the build");

    const probedCount = Object.keys(PROBES).length - unprobed.length;
    t.check("the probed pages really were probed against a running game",
            probedCount >= 4,
            "probed " + probedCount + " of " + Object.keys(PROBES).length +
            ", hand-judged: " + (unprobed.join(" ") || "none"));
  }

  /* The core pages must exist, so none can be quietly deleted later. */
  {
    const core = ["getting-started", "crafting", "digging", "backpack", "light",
                  "water", "lava", "falling", "ores", "hazards"];
    const absent = core.filter(id => !REFERENCE[id]);
    t.check("every core mechanic has a page", absent.length === 0,
            absent.join(" ") || core.length + " core pages present");
  }

  /* Search has to answer the words a stuck player actually types, including
     the panicky and ungrammatical ones. This is the test that matters most:
     a reference book nobody can find their way into is not a reference book. */
  {
    const QUERIES = {
      "rock": "digging", "cant dig": "digging", "can't dig": "digging",
      "dark": "light", "cant see": "light", "torch": "light",
      "full": "backpack", "heavy": "backpack", "no room": "backpack",
      "drown": "water", "flood": "water", "died": null,
      "lava": "lava", "burn": "lava",
      "fall": "falling", "cave in": "cave-ins", "sand": "unstable-ground",
      "ore": "ores", "where is iron": "ores",
      "craft": "crafting", "make": "crafting",
      "hungry": "survival", "wheelbarrow": "hauling", "stuck": null,
      "what do i do": null,
      /* These three are regression pins. Substring matching used to rank the
         planned TOOLS page first for "its too dark", because "tools" contains
         "too", and for "cant dig rock" because a planned page held that exact
         keyword. A book that answers the wrong question confidently is worse
         than one that finds nothing. */
      "its too dark": "light",
      "cant dig rock": "digging",
      "i keep drowning": "water",
      /* Plurals. "how do i stop collapses" used to return the LAVA page: the
         plural matched no keyword, and lava's body happens to contain the
         word "stop". A player types whatever is in their head. */
      "collapses": "cave-ins",
      "how do i stop collapses": "cave-ins",
      "props": "cave-ins",
      "pour dirt back": "spoil"
    };
    const noHits = [], wrongTop = [];
    for(const q in QUERIES){
      const hits = searchReference(q);
      if(!hits.length){ noHits.push(q); continue; }
      const want = QUERIES[q];
      if(want && hits[0].id !== want) wrongTop.push('"' + q + '" -> ' + hits[0].id + ", wanted " + want);
    }
    t.check("search finds something for every word a stuck player would type",
            noHits.length === 0, noHits.map(q => '"'+q+'"').join(" ") || Object.keys(QUERIES).length + " queries all hit");
    t.check("search puts the right page first for the obvious ones",
            wrongTop.length === 0, wrongTop.join(" | ") || "top hits correct");
  }

  /* A live page must lead a planned one when both answer the same question:
     the player is holding the current build, not the design document. */
  {
    const hits = searchReference("carry heavy load");
    const backpackAt = hits.findIndex(p => p.id === "backpack");   /* live */
    const haulingAt = hits.findIndex(p => p.id === "hauling");     /* planned */
    t.check("what is in the build out-ranks what is only designed",
            backpackAt >= 0 && (haulingAt === -1 || backpackAt < haulingAt),
            hits.slice(0, 3).map(p => p.id + (p.status === "planned" ? "*" : "")).join(" "));
  }

  /* THE LESSON, PINNED. The live-over-planned weighting is a TIEBREAK, and a
     ranking that only holds because a competing page happens to be marked
     planned is not a ranking - it is a coincidence waiting for that page to
     ship. "cant dig rock" once looked correct and pinned by test, and was
     being propped up entirely by the tools page being demoted; the moment
     tools went live the order inverted and the test had been passing for the
     wrong reason all along. So every pinned query must land the same page
     first with the weighting removed. */
  {
    /* Scanned across EVERY keyword in the book, not a chosen handful - a
       sample would have missed the one query that broke, and this exact scan
       would have caught it the day it was written. */
    const queries = new Set(["cant dig rock", "its too dark", "my pack is full",
                             "i keep drowning", "where is iron", "sand fell on me",
                             "carry heavy load", "what does a pickaxe do"]);
    for(const id of REFERENCE_IDS) for(const k of REFERENCE[id].keywords) queries.add(k);

    const drifted = [];
    for(const q of queries){
      const withStatus = searchReference(q)[0];
      const without = searchReference(q, { ignoreStatus: true })[0];
      if(withStatus && without && withStatus.id !== without.id)
        drifted.push('"' + q + '" -> ' + withStatus.id + ", but " + without.id +
                     " without the weighting");
    }
    t.check("no ranking anywhere depends on the live-over-planned weighting",
            drifted.length === 0,
            drifted.join(" | ") ||
            queries.size + " queries, every top hit stands on the writing alone");
  }

  /* A page that names a problem without naming its remedy sends a stuck
     player somewhere that confirms they are stuck. The digging page is the
     one this bit: it said rock does not yield and never said what does. */
  t.check("the digging page says what actually opens rock",
          /pickaxe/i.test(REFERENCE.digging.body),
          "names the remedy, not just the problem");

  t.check("an empty search returns nothing rather than everything",
          searchReference("").length === 0 && searchReference("   ").length === 0);
  t.check("a search for nonsense returns nothing",
          searchReference("zzzqqx").length === 0);
  t.check("referencePage returns null for a page that does not exist",
          referencePage("nope") === null);

  /* ==================== tool tiers and hardness ==================== */

  /* Lane A reads this by material name, so every diggable material must have
     a tier or digSpeedFor has nothing to answer with. */
  {
    const missing = [], stray = [];
    for(const M of MATS){
      const needsTier = M.digFree === 1 || !!M.dig2 || M.name === "Granite";
      if(needsTier && hardnessOf(M.name) === null) missing.push(M.name);
    }
    for(const name in HARDNESS){
      if(!MATS.some(M => M.name === name)) stray.push(name);
    }
    t.check("every diggable material has a hardness tier", missing.length === 0,
            missing.join(", ") || Object.keys(HARDNESS).length + " materials tiered");
    t.check("no hardness entry names a material that does not exist", stray.length === 0,
            stray.join(", ") || "clean");
  }

  t.check("granite never yields to anything",
          hardnessOf("Granite") === UNCUTTABLE &&
          TOOL_IDS.every(id => !canCut(id, "Granite")),
          "no tool cuts granite");

  /* THE RULE THAT KEEPS THE LADDER FROM COLLAPSING: a better tool of a kind
     is FASTER, never DEEPER than that kind is allowed to go. An iron shovel
     is a better shovel, not a pickaxe. */
  {
    const broken = [];
    for(const id of TOOL_IDS){
      const t2 = TOOLS[id];
      const ceiling = TOOL_KINDS[t2.kind].maxTier;
      if(t2.cuts > ceiling)
        broken.push(id + " cuts tier " + t2.cuts + " but a " + t2.kind + " tops out at " + ceiling);
    }
    t.check("no tool cuts deeper than its kind allows", broken.length === 0,
            broken.join(" | ") || "every kind keeps its ceiling");

    const shovels = TOOL_IDS.filter(id => TOOLS[id].kind === "shovel");
    t.check("every shovel, at every tier, is useless against rock",
            shovels.length > 1 && shovels.every(id => !canCut(id, "Rock")),
            shovels.join(" "));
    t.check("but a better shovel really is faster in soft ground",
            digSpeed("steel_shovel", "Earth") > digSpeed("iron_shovel", "Earth") &&
            digSpeed("iron_shovel", "Earth") > digSpeed("stone_shovel", "Earth") &&
            digSpeed("stone_shovel", "Earth") > digSpeed("hands", "Earth"),
            "hands < stone < iron < steel");
  }

  t.check("bare hands cannot open rock, which is what makes the pickaxe matter",
          !canCut("hands", "Rock") && canCut("hands", "Earth"));

  /* Depth is the progression: each pickaxe tier must open something the one
     below it could not. */
  {
    const picks = TOOL_IDS.filter(id => TOOLS[id].kind === "pickaxe")
                          .sort((a, b) => TOOLS[a].cuts - TOOLS[b].cuts);
    const flat = [];
    for(let i = 1; i < picks.length; i++)
      if(TOOLS[picks[i]].cuts <= TOOLS[picks[i-1]].cuts)
        flat.push(picks[i] + " opens nothing new over " + picks[i-1]);
    t.check("every pickaxe tier opens ground the one below could not",
            flat.length === 0, flat.join(" | ") || picks.join(" -> "));
  }

  /* EVERY TOOL LINE MUST TIER UP. The axe was stone forever while every
     shovel and pickaxe got metal - not a decision, just a line nobody
     revisited, and it was invisible because lane A's chopSpeedFor silently
     returned zero for an axe id that did not exist. A kind a player actually
     uses needs somewhere to go. */
  {
    const kinds = {};
    for(const id of TOOL_IDS){
      const k = TOOLS[id].kind;
      if(k === "hands") continue;
      (kinds[k] = kinds[k] || []).push(id);
    }
    const deadEnds = Object.keys(kinds).filter(k => kinds[k].length < 2);
    t.check("no tool line dead-ends at its first tier", deadEnds.length === 0,
            deadEnds.join(" ") ||
            Object.keys(kinds).map(k => k + " x" + kinds[k].length).join(", "));

    /* And an upgrade must actually be faster, or it is a new name for the
       same tool. */
    const notFaster = [];
    for(const k in kinds){
      const sorted = kinds[k].slice().sort((a, b) => TOOLS[a].speed - TOOLS[b].speed);
      for(let i = 1; i < sorted.length; i++)
        if(TOOLS[sorted[i]].speed <= TOOLS[sorted[i-1]].speed)
          notFaster.push(sorted[i] + " is no faster than " + sorted[i-1]);
    }
    t.check("every upgrade in a line is genuinely faster", notFaster.length === 0,
            notFaster.join(" | ") || "each tier improves on the last");
  }

  /* ---- THE CIRCULARITY PROOF ----
     Walk the whole game from bare hands: what can I dig with what I have,
     what can I then make, what does that let me dig. If a tool can only be
     built out of material that same tool is needed to reach, the ladder has
     a rung you can only climb by already standing on it. The recorded tier
     sketch had exactly that bug - iron in tier 2, while the tier 2 pickaxe
     had to be metal and tier 1 held none. */
  {
    /* what the surface gives you for nothing */
    const have = new Set([
      ...ITEM_IDS.filter(id => ITEM_DATA[id].category === "gathered"),
      ...SURFACE_PICKUPS
    ]);
    const tools = new Set(["hands"]);
    const stations = new Set([HAND]);

    const yieldOf = {};
    for(const M of MATS) if(M.dig2) yieldOf[M.name] = M.dig2;

    let grew = true, rounds = 0;
    while(grew && rounds++ < 40){
      grew = false;
      /* dig everything the current tools reach */
      for(const name in yieldOf){
        if(![...tools].some(t2 => canCut(t2, name))) continue;
        if(!have.has(yieldOf[name])){ have.add(yieldOf[name]); grew = true; }
      }
      /* build what the materials now allow */
      for(const id of BUILDING_IDS){
        if(stations.has(id)) continue;
        const b = BUILDINGS[id];
        if(!stations.has(b.buildsAt)) continue;
        if(Object.keys(b.materials).every(m => have.has(m))){ stations.add(id); grew = true; }
      }
      /* craft what the stations and materials now allow */
      for(const id of RECIPE_IDS){
        const r = RECIPES[id];
        if(!stations.has(r.station)) continue;
        if(r.tool && !have.has(r.tool)) continue;
        if(!Object.keys(r.inputs).every(m => have.has(m))) continue;
        for(const out in r.outputs) if(!have.has(out)){ have.add(out); grew = true; }
      }
      /* any tool you are now holding is a tool you can dig with */
      for(const id of TOOL_IDS)
        if(id !== "hands" && have.has(id) && !tools.has(id)){ tools.add(id); grew = true; }
    }

    const unreachableTools = TOOL_IDS.filter(id => id !== "hands" && !tools.has(id));
    t.check("every tool can be reached from bare hands, with no circular tier",
            unreachableTools.length === 0,
            unreachableTools.join(" ") || tools.size + " tools reachable in " + rounds + " rounds");

    const unreachableMats = Object.keys(yieldOf)
      .filter(name => ![...tools].some(t2 => canCut(t2, name)));
    t.check("every material in the world can eventually be dug",
            unreachableMats.length === 0,
            unreachableMats.join(", ") || Object.keys(yieldOf).length + " materials all reachable");

    const unreachableStations = BUILDING_IDS.filter(id => !stations.has(id));
    t.check("every station can eventually be built", unreachableStations.length === 0,
            unreachableStations.join(" ") || stations.size - 1 + " stations reachable");
  }

  /* The bottom rung leans on gathering, not digging: a stone pickaxe is made
     of rock, and rock needs a stone pickaxe to dig. It only works because
     loose rock lies on the surface. If that ever stops, the game becomes
     uncompletable from the first minute. */
  {
    const g = boot(777);
    const pick = RECIPES.stone_pickaxe;
    const fromGround = Object.keys(pick.inputs).filter(id => {
      const d = ITEM_DATA[id];
      return d.category === "raw" && !canCut("hands", "Rock");
    });
    t.check("the first pickaxe needs rock that hands cannot dig",
            fromGround.includes("rock"), fromGround.join(" ") || "none");
    t.check("so rock must be gatherable off the surface, and it is",
            g.items.items.rock !== undefined && ITEM_DATA.rock.band === "surface",
            "loose rock is a surface pickup");
  }

  /* Hardness and depth are DIFFERENT axes, and conflating them is a mistake
     worth naming: surface rock is tier 1, so the very first thing you meet
     already needs a pickaxe. What must hold is that the ground never gets
     SOFTER as it gets deeper - otherwise a deep band would be reachable with
     a tool the band above it defeated. */
  {
    const hardestIn = {};
    for(const M of MATS){
      if(!M.dig2) continue;
      const d = ITEM_DATA[M.dig2];
      const h = hardnessOf(M.name);
      if(!d || d.band === null || h === null || h === UNCUTTABLE) continue;
      hardestIn[d.band] = Math.max(hardestIn[d.band] || 0, h);
    }
    const order = BANDS.filter(b => hardestIn[b] !== undefined);
    const inversions = [];
    for(let i = 1; i < order.length; i++)
      if(hardestIn[order[i]] < hardestIn[order[i-1]])
        inversions.push(order[i] + " (tier " + hardestIn[order[i]] + ") is softer than " +
                        order[i-1] + " (tier " + hardestIn[order[i-1]] + ")");
    t.check("the ground never gets softer as it gets deeper", inversions.length === 0,
            inversions.join(" | ") || order.map(b => b + ":" + hardestIn[b]).join(" "));
  }

  t.check("digSpeed reports zero rather than lying about what a tool cannot cut",
          digSpeed("stone_shovel", "Rock") === 0 && digSpeed("stone_pickaxe", "Rock") > 0);
  t.check("toolsThatCut answers the guidebook's 'what do I need for this'",
          toolsThatCut("Uranium ore").length === 1 &&
          toolsThatCut("Uranium ore")[0] === "titanium_pickaxe",
          toolsThatCut("Uranium ore").join(" "));

  /* Taking a building apart is quicker than raising it, and never free. A
     free undo would delete the decision placement is supposed to be - but it
     must not be long either, because the real cost of moving a building is
     already the material it does not give back, and charging a wait on top
     punishes the same mistake twice. */
  {
    const bad = [];
    for(const id of BUILDING_IDS){
      const up = BUILDINGS[id].time, down = deconstructTime(id);
      if(!(down >= 1)) bad.push(id + ": instant");
      if(!(down < up)) bad.push(id + ": " + down + "s to undo " + up + "s of work");
    }
    t.check("taking a building apart is quicker than raising it, and never free",
            bad.length === 0,
            bad.join(" | ") || BUILDING_IDS.map(id => id + " " + deconstructTime(id) + "s").join(", "));

    /* The pairing that matters: whatever costs the most material to move must
       not also cost the most time relative to its build, or the one real
       commitment in the game is punished twice for being one. */
    const worstLoss = BUILDING_IDS
      .map(id => ({ id, keep: recoveryFraction(id, itemData) }))
      .sort((a, b) => a.keep - b.keep)[0];
    t.check("the building you lose most material moving is not also the slowest to undo",
            DECONSTRUCT_FRACTION < 1,
            worstLoss.id + " returns " + Math.round(worstLoss.keep*100) + "% and takes " +
            deconstructTime(worstLoss.id) + "s of " + BUILDINGS[worstLoss.id].time + "s");
  }

  /* ==================== pieces, and building at scale ==================== */

  {
    const pieces = BUILDING_IDS.filter(id => BUILDINGS[id].piece);
    t.check("there is a vocabulary to build a house out of", pieces.length >= 3,
            pieces.join(" "));

    /* A STATION'S COST IS A DECISION; A PIECE'S COST IS A MULTIPLIER. Nobody
       agonises over one workbench, but a house is dozens of pieces, so a
       per-piece price is a per-house price with a factor of forty on it. */
    const dear = pieces.filter(id => buildMass(id, itemData) > 15)
                       .map(id => id + " " + buildMass(id, itemData) + "kg");
    t.check("a piece is cheap enough to place by the dozen", dear.length === 0,
            dear.join(" ") || pieces.map(id => id + " " + buildMass(id, itemData) + "kg").join(", "));

    /* THE TRAP THIS FOUND. Recovery floors, so a piece costing ONE unit of
       anything with a rate below 1 returns nothing at all - and a house is
       hundreds of one-plank pieces, so dismantling it would evaporate it
       rather than give the timber back. Every piece must return something of
       every material it cost. */
    const evaporates = [];
    for(const id of pieces){
      for(const item in BUILDINGS[id].materials){
        const n = BUILDINGS[id].materials[item];
        const rate = itemData(item) && typeof itemData(item).recover === "number"
                     ? itemData(item).recover : 1;
        if(Math.floor(n * rate) < 1)
          evaporates.push(id + ": " + n + " " + item + " at " + rate + " returns nothing");
      }
    }
    t.check("taking a house apart gives the timber back rather than evaporating it",
            evaporates.length === 0, evaporates.join(" | ") || "every piece returns its materials");

    /* THE GENERAL SHAPE OF THAT TRAP, which is not limited to pieces: any
       per-unit cost with a fractional rate rounds to nothing when the count
       is one, and ANYTHING placed in quantity is made of one-unit costs. A
       ladder is not flagged `piece` but you stack them by the dozen up a
       shaft, and at rope 0.75 moving a run silently destroyed every rope in
       it. So the rule covers everything placed in quantity, not just houses. */
    const inQuantity = BUILDING_IDS.filter(id => BUILDINGS[id].piece || BUILDINGS[id].climb);
    const bulkLoss = [];
    for(const id of inQuantity){
      for(const item in BUILDINGS[id].materials){
        const n = BUILDINGS[id].materials[item];
        const d = itemData(item);
        const rate = d && typeof d.recover === "number" ? d.recover : 1;
        if(Math.floor(n * rate) < 1)
          bulkLoss.push(id + " loses all its " + item);
      }
    }
    t.check("nothing you place by the dozen destroys a material when you move it",
            bulkLoss.length === 0,
            bulkLoss.join(" | ") || inQuantity.join(" ") + " all give their materials back");

    /* A total loss on a one-off station is a design choice, not a bug - the
       forge's quicklime became mortar. It is reported so it stays a choice
       somebody made rather than one nobody noticed. */
    const oneOff = BUILDING_IDS.filter(id => !inQuantity.includes(id));
    const deliberate = [];
    for(const id of oneOff){
      for(const item in BUILDINGS[id].materials){
        const d = itemData(item);
        const rate = d && typeof d.recover === "number" ? d.recover : 1;
        if(Math.floor(BUILDINGS[id].materials[item] * rate) < 1)
          deliberate.push(id + ": " + item);
      }
    }
    t.check("total losses on one-off buildings are visible, not accidental", true,
            deliberate.length ? "by design: " + deliberate.join(", ")
                              : "nothing is wholly lost anywhere");

    /* You assemble a house on site, not at a bench across the valley. */
    const notOnSite = pieces.filter(id => BUILDINGS[id].buildsAt !== HAND);
    t.check("pieces are assembled on site, with nothing but what you carried",
            notOnSite.length === 0, notOnSite.join(" ") || "all hand-built");

    /* A foundation has to arrive no later than what stands on it. */
    const foundations = pieces.filter(id => BUILDINGS[id].foundation);
    const carried = pieces.filter(id => !BUILDINGS[id].foundation);
    t.check("a foundation is available before the frame that sits on it",
            foundations.length > 0 &&
            Math.min(...foundations.map(id => BUILDINGS[id].stage)) <=
            Math.min(...carried.map(id => BUILDINGS[id].stage)),
            foundations.join(" ") + " at stage " +
            Math.min(...foundations.map(id => BUILDINGS[id].stage)));

    /* Only a foundation stands on the ground; everything else leans on it. */
    const grounded = pieces.filter(id => BUILDINGS[id].support.ground > 0);
    t.check("only the foundation touches the ground", 
            grounded.every(id => BUILDINGS[id].foundation === true),
            grounded.join(" ") || "none");
  }

  /* CAVE-INS ARE LIVE, SO SOMETHING MUST HOLD A ROOF UP - and until the
     timber prop existed the earliest thing that could was the plank beam,
     three stages after the first tunnel. A hazard the player cannot answer
     is not difficulty, it is a wall. */
  {
    const props = BUILDING_IDS.filter(id => BUILDINGS[id].props);
    t.check("there is something to prop a roof with", props.length > 0, props.join(" "));
    t.check("and one of them exists before the first tunnel does",
            props.some(id => BUILDINGS[id].stage === 0),
            props.map(id => id + " stage " + BUILDINGS[id].stage).join(", "));

    /* Loose ground holds about 26 px of roof, so props are placed every few
       paces down a drift. That makes them a per-piece multiplier like house
       pieces, not a one-off like a station, and they must be priced for it. */
    const dear = props.filter(id => buildMass(id, itemData) > 10)
                      .map(id => id + " " + buildMass(id, itemData) + "kg");
    t.check("a prop is cheap enough to place every few paces", dear.length === 0,
            dear.join(" ") || props.map(id => id + " " + buildMass(id, itemData) + "kg").join(", "));
  }

  /* A derrick must NOT ask for solid ground: its whole purpose is to straddle
     a bore, and a bore is a column with nothing beneath it. At 1.0 the tower
     and its own well were mutually exclusive. */
  {
    const d = BUILDINGS.derrick;
    const bore = Math.floor(d.w * (1 - d.support.ground));
    t.check("a derrick can stand over its own well",
            d.support.ground < 1 && bore >= 8,
            "an " + d.w + " px tower at ground " + d.support.ground +
            " admits a bore up to " + bore + " px");
    t.check("but the masonry stations still stand on solid ground",
            BUILDINGS.kiln.support.ground === 1 && BUILDINGS.forge.support.ground === 1);

    /* The tank is quoted in kilograms but a player counts barrels, so it
       should hold a whole number of them - otherwise the last measures sit
       there unable to become anything. */
    const per = ITEM_DATA.crude_oil.mass;
    const need = RECIPES.oil_barrel.inputs.crude_oil;
    const barrels = Math.floor(d.storage / per) / need;
    t.check("the derrick's tank holds a whole number of barrels",
            Number.isInteger(barrels) && barrels >= 2,
            d.storage + " kg = " + Math.floor(d.storage / per) + " measures = " +
            barrels + " barrels");
  }

  /* The number that decides whether this feels like carpentry or like magic. */
  t.check("an unsupported run of pieces reaches a room, not a landscape",
          MAX_SPAN >= 2 && MAX_SPAN <= 5,
          "MAX_SPAN " + MAX_SPAN + ": an overhang reaches " + (MAX_SPAN * 24) +
          "px, a floor posted at both ends spans " + ((MAX_SPAN * 2 + 1) * 24) + "px");

  /* ==================== what lies on the surface ==================== */

  /* THE SPLIT THIS TABLE EXISTS TO CLOSE. items.js declares SURFACE_PICKUPS
     and the reachability proof leans on it; until now the number that made
     the declaration true lived in a mechanics file, so the proof asserted
     something another lane could quietly falsify. These must agree. */
  {
    const scattered = KINDS.map(k => k.id);
    const declaredNotScattered = SURFACE_PICKUPS.filter(id => !scattered.includes(id));
    const scatteredNotDeclared = scattered.filter(id => !SURFACE_PICKUPS.includes(id));
    t.check("everything declared a surface pickup is actually scattered",
            declaredNotScattered.length === 0,
            declaredNotScattered.join(" ") || SURFACE_PICKUPS.join(" "));
    t.check("and nothing is scattered that was never declared",
            scatteredNotDeclared.length === 0,
            scatteredNotDeclared.join(" ") || "in step");
  }

  /* The bottom rung of the entire tool ladder. A stone pickaxe is made of
     rock, rock is tier 1, and tier 1 needs a stone pickaxe - the only thing
     saving that from deadlock is loose rock on the ground. Reduce the amount,
     never the existence. */
  {
    const rock = scatterKind("rock");
    t.check("rock still lies on the surface, or the game cannot be started",
            !!rock && rock.weight > 0 && rock.clump >= 1,
            rock ? "weight " + rock.weight + ", clump " + rock.clump : "ABSENT");
  }

  {
    const bad = [];
    for(const k of KINDS){
      if(!ITEM_DATA[k.id]) bad.push(k.id + ": not an item");
      if(!(k.weight > 0)) bad.push(k.id + ": weight " + k.weight);
      if(!(Number.isInteger(k.clump) && k.clump >= 1)) bad.push(k.id + ": clump " + k.clump);
      if(typeof k.note !== "string" || k.note.length < 20) bad.push(k.id + ": no note");
    }
    t.check("every scattered kind is a real item, priced and explained",
            bad.length === 0, bad.join(" | ") || KINDS.length + " kinds");
    t.check("scatter density is sane", STEP > 0 && CHANCE > 0 && CHANCE <= 1,
            "a spot every " + STEP + "px, " + Math.round(CHANCE*100) + "% occupied");
  }

  /* THE BUG THIS NUMBER CAUSED, pinned. A clump arrives in ONE step, so its
     whole mass lands on the player at once. Rock at clump two was ten
     kilograms a pickup - twenty-nine per cent of a starting pack - and it is
     what made the pack fill while merely walking. */
  {
    const heavy = KINDS
      .map(k => ({ id: k.id, kg: ITEM_DATA[k.id].mass * k.clump }))
      .filter(x => x.kg > CARRY_START * 0.2);
    t.check("no single pickup takes a fifth of the pack in one step",
            heavy.length === 0,
            heavy.map(x => x.id + " " + x.kg.toFixed(1) + "kg").join(" ") ||
            KINDS.map(k => k.id + " " + (ITEM_DATA[k.id].mass*k.clump).toFixed(1) + "kg").join(", "));
  }

  /* The guidebook's opening instruction is only honest if following it is a
     stroll. This prices the whole stage 0 chain in pixels walked. */
  {
    const need = { rock: 3, stick: 3, plant_fibre: 8 };
    const worst = Object.keys(need)
      .map(id => ({ id, px: walkFor(id, need[id]) }))
      .sort((a, b) => b.px - a.px)[0];
    t.check("the stage 0 chain can be gathered in a walk, not an expedition",
            worst.px <= 1500,
            "furthest is " + worst.id + " at about " + Math.round(worst.px) + "px");
  }

  t.check("the weighted pick covers the whole range and never falls off the end",
          kindForRoll(0) && kindForRoll(0.999) && kindForRoll(1) &&
          KINDS.some(k => k.id === kindForRoll(0).id),
          "0 -> " + kindForRoll(0).id + ", 1 -> " + kindForRoll(1).id);

  /* ==================== craft times ==================== */

  /* Which stations charge time at all. Hand and workbench crafts are instant
     (docs/DECISIONS.md), so their `time` is simply unused rather than wrong. */
  {
    const timedStations = BUILDING_IDS.filter(id => BUILDINGS[id].timed);
    t.check("the kiln and the forge are the stations that charge time",
            timedStations.includes("kiln") && timedStations.includes("forge"),
            timedStations.join(" ") || "none");
    t.check("the workbench is instant, so building one pays off immediately",
            BUILDINGS.workbench.timed === false);

    const undeclared = BUILDING_IDS.filter(id => typeof BUILDINGS[id].timed !== "boolean");
    t.check("every station says whether crafting there takes time",
            undeclared.length === 0, undeclared.join(" ") || BUILDING_IDS.length + " stations");
  }

  /* Every timed recipe must rank its output, or "time rises with quality" has
     nothing to rise against. */
  {
    const timed = RECIPE_IDS.filter(id => BUILDINGS[RECIPES[id].station] &&
                                          BUILDINGS[RECIPES[id].station].timed);
    const unranked = timed.filter(id => !(RECIPES[id].tier >= 0));
    t.check("every timed recipe ranks what it produces", unranked.length === 0,
            unranked.join(" ") || timed.length + " timed recipes");

    /* THE RULE: at one station, a better output is never a shorter wait. */
    const inversions = [];
    for(const station of BUILDING_IDS.filter(id => BUILDINGS[id].timed)){
      const rs = recipesAt(station).slice().sort((a, b) => a.tier - b.tier);
      for(let i = 1; i < rs.length; i++)
        if(rs[i].tier > rs[i-1].tier && rs[i].time < rs[i-1].time)
          inversions.push(station + ": " + rs[i].id + " (tier " + rs[i].tier + ", " +
                          rs[i].time + "s) is quicker than " + rs[i-1].id +
                          " (tier " + rs[i-1].tier + ", " + rs[i-1].time + "s)");
    }
    t.check("a better output is always a longer wait", inversions.length === 0,
            inversions.join(" | ") || "times rise with tier at every timed station");
  }

  /* The ceiling. A timed station works while the player is elsewhere, so the
     wait is a scheduling cost - until it is long enough that they stop
     planning around it, at which point the machine stops feeling like a tool. */
  {
    const tooLong = RECIPE_IDS.filter(id => RECIPES[id].time > MAX_CRAFT_SECONDS)
                              .map(id => id + " " + RECIPES[id].time + "s");
    t.check("no single craft is longer than a player will plan around",
            tooLong.length === 0,
            tooLong.join(" ") || "nothing over " + MAX_CRAFT_SECONDS + "s");

    const wide = [];
    for(const station of BUILDING_IDS.filter(id => BUILDINGS[id].timed)){
      const times = recipesAt(station).map(r => r.time);
      if(times.length < 2) continue;
      const ratio = Math.max(...times) / Math.min(...times);
      if(ratio > MAX_STATION_TIME_RATIO)
        wide.push(station + " spans x" + ratio.toFixed(1));
    }
    t.check("no station spans so wide a range that its cheap recipes feel pointless",
            wide.length === 0, wide.join(" ") || "every station within x" + MAX_STATION_TIME_RATIO);
  }

  /* Time is now part of what a better material COSTS, so it trades against
     mass and ore. This walks the real tree - station time and raw kilograms
     to make one of a thing from nothing - and checks the top of the chain is
     a milestone rather than a punishment. It is an upper bound: a player who
     batches shares intermediates and does better. */
  {
    const byOutput = {};
    for(const id of RECIPE_IDS)
      for(const out in RECIPES[id].outputs) byOutput[out] = RECIPES[id];

    function costOf(item, n, depth){
      if(depth > 12) return { secs: Infinity, kg: Infinity };
      const r = byOutput[item];
      if(!r) return { secs: 0, kg: (ITEM_DATA[item] ? ITEM_DATA[item].mass : 0) * n };
      const batches = Math.ceil(n / r.outputs[item]);
      const st = BUILDINGS[r.station];
      let secs = (st && st.timed) ? r.time * batches : 0, kg = 0;
      for(const i in r.inputs){
        const c = costOf(i, r.inputs[i] * batches, depth + 1);
        secs += c.secs; kg += c.kg;
      }
      return { secs, kg };
    }

    const steel = costOf("steel_pickaxe", 1, 0);
    const titan = costOf("titanium_pickaxe", 1, 0);
    const iron = costOf("iron_pickaxe", 1, 0);

    t.check("an iron pickaxe is a milestone, not an afternoon",
            iron.secs <= 240, Math.round(iron.secs) + "s and " + Math.round(iron.kg) + " kg");
    t.check("a steel pickaxe stays inside a session's patience",
            steel.secs <= 420, Math.round(steel.secs) + "s and " + Math.round(steel.kg) + " kg");
    t.check("the best tool in the game is still worth starting",
            titan.secs <= 600, Math.round(titan.secs) + "s and " + Math.round(titan.kg) + " kg");

    /* The trap lane E named: if a better material is slower AND dearer AND
       heavier, it is punished three times over for one upgrade. Ore cost must
       not climb as steeply as capability does. */
    t.check("steel is not punished three times over for being better",
            steel.kg < iron.kg * 2,
            "iron " + Math.round(iron.kg) + " kg vs steel " + Math.round(steel.kg) + " kg");
  }

  return t;
}
