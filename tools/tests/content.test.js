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

    /* The pending list must shrink to nothing, not quietly become permanent. */
    const landed = PENDING_YIELD.filter(id => yields.has(id));
    t.check("PENDING_YIELD still describes things the world does not yield yet",
            landed.length === 0,
            landed.length ? landed.join(" ") + " now has a source - drop it from PENDING_YIELD"
                          : "pending: " + (PENDING_YIELD.join(" ") || "nothing"));
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

  return t;
}
