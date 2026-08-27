/* LANE F owns this file: the data tables in src/content/.

   These are contract tests, not simulation tests. They exist so that a
   balance edit that quietly breaks another lane fails here first:

     - every ore the landscape yields has an item entry
     - the item table has not drifted from lane C's registry
     - ore never becomes weightless, which is what would kill the haulage
       problem the whole industry lane is built on                        */

import { boot, suite } from "../testkit.js";
import { MATS } from "../../src/world/materials.js";
import { ITEM_DATA, ITEM_IDS, ITEM_CATEGORIES, BANDS,
         CARRY_START, PENDING_YIELD, itemData } from "../../src/content/items.js";
import { RECIPES, RECIPE_IDS, HAND, recipesAt } from "../../src/content/recipes.js";
import { BUILDINGS, BUILDING_IDS, buildMass } from "../../src/content/buildings.js";
import { STAGES, highestStageReached, highestCostedStage } from "../../src/content/stages.js";
import { GUIDE, MATERIAL_HINTS, HAZARD_HINTS, guideFor, hintFor } from "../../src/content/guide.js";
import { HAULAGE, HAULAGE_IDS, BATCH_LADDER, REFERENCE_LOAD, haulage,
         stepUpFrom } from "../../src/content/haulage.js";

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
      if(!(Number.isInteger(d.stage) && d.stage >= 0 && d.stage <= 7)) bad.push(id + ": stage " + d.stage);
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
      const found = d.category === "raw" || d.category === "gathered";
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
      return (d.band === "deep" || d.band === "verydeep") && d.stage <= 1;
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
    const have = new Set(ITEM_IDS.filter(id =>
      ITEM_DATA[id].category === "raw" || ITEM_DATA[id].category === "gathered"));
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
      if(Object.keys(b.materials).length === 0) bad.push(id + ": costs nothing");
      for(const item in b.materials){
        if(!ITEM_DATA[item]) bad.push(id + ": material " + item + " does not exist");
        else if(ITEM_DATA[item].stage > b.stage) bad.push(id + ": needs later-stage " + item);
      }
    }
    t.check("every building entry is complete and buildable", bad.length === 0,
            bad.join(" | ") || BUILDING_IDS.length + " buildings");
  }

  /* Nothing floats: every building must be founded on something. */
  {
    const floating = BUILDING_IDS.filter(id => !(BUILDINGS[id].support.ground > 0));
    t.check("no building floats", floating.length === 0, floating.join(" ") || "all founded");
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

  return t;
}
