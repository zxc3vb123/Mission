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
         CARRY_START, itemData } from "../../src/content/items.js";

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
    const orphans = ITEM_IDS.filter(id => ITEM_DATA[id].category === "raw" && !yields.has(id));
    t.check("no raw item exists that nothing in the world yields", orphans.length === 0,
            orphans.join(" ") || "none");
  }

  /* --- no drift from lane C's live registry --- */
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
    }
    t.check("ITEM_DATA has not drifted from the item registry", drift.length === 0,
            drift.join(" | ") || "names, colours and tiers all match");
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

  return t;
}
