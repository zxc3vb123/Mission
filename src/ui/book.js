/* THE GUIDEBOOK (G). LANE H (ui).

   Everything you need to play, in one searchable place: what to do next, how
   every mechanic works, every recipe, every building, and every key. It
   replaces the hand-written key list that used to sit in the corner of the
   screen, which went stale twice because it was prose about bindings rather
   than the bindings themselves.

   WHAT THIS BOOK REFUSES TO DO

   It will not imply that something works. The owner's complaint is "I cannot
   tell what is in the game", and a reference that quietly describes unbuilt
   mechanics answers that question wrongly - worse than not answering it. So
   every entry carries a state, and the not-yet ones are greyed and badged
   wherever they appear, in the contents, in the search results and at the
   top of the page itself:

     live     the mechanic is in the build you are holding
     planned  the mechanic does not exist yet. Lane F marks reference pages
              itself (reference.js, rule three); recipes and buildings are
              marked when the SYSTEM is missing - no crafting, no placement.
     locked   the mechanic exists but nothing in the game can currently
              produce what it needs. A forge is real code and a real cost,
              and you still cannot have one, because nothing makes bricks
              yet. Saying "planned" there would be wrong in the other
              direction, so it gets its own word and names the missing thing.

   `locked` is computed, not declared - see reachability() below. It walks
   outward from what the world yields until nothing new becomes makeable, so
   it moves on its own as lanes land recipes. Nobody has to remember to
   update it.

   THE TWO THINGS THE CONTENT LAYER WILL NOT DO
   Lane F's reference.js keeps numbers out of page prose (they live in
   page.figures, derived from the real tables) and keeps key bindings out
   entirely, because bindings are a UI fact. Both come from this side: the
   figures are printed from `figures`, and the keys page is generated from
   src/ui/keys.js. Neither can go stale in a way a content edit could cause. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { keys as rawKeys } from "../core/input.js";
import { REFERENCE_IDS, referencePage, searchReference } from "../content/reference.js";
import { ITEM_IDS, ITEM_DATA, itemData } from "../content/items.js";
import { RECIPES, RECIPE_IDS, HAND } from "../content/recipes.js";
import { BUILDINGS, BUILDING_IDS, buildMass } from "../content/buildings.js";
import { STAGES, stage as stageDef, highestStageReached, highestCostedStage } from "../content/stages.js";
import { guideFor, hintFor } from "../content/guide.js";
import { keyBindings, keyKeywords, keyCap, KEY_BOOK, KEY_PACK } from "./keys.js";
import { registerScreen } from "./screens.js";

/* What the player has ever held. Stage progress is not undone by spending:
   smelting your last iron does not put you back a stage. */
export const everObtained = new Set();
bus.on("inv:changed", e => { if(e && e.id) everObtained.add(e.id); });
bus.on("item:collected", e => { if(e && e.id) everObtained.add(e.id); });

/* ------------------------------------------------------------------------
   REACHABILITY - the honest answer to "is this actually in the game?"

   Seed with what the world itself yields (raw materials you dig, gathered
   things lying on the surface), then repeatedly ask: which recipes can now
   be made, and which buildings can now be raised? Anything the answer adds
   becomes available and the question is asked again, until a pass adds
   nothing. What is left over is unreachable, and we can say WHY.

   This is deliberately generous about the world half - if a material has a
   band it is treated as diggable - because the failure that matters is
   telling a player something is missing when they could have had it.
------------------------------------------------------------------------ */
export function reachability(items, build){
  const canCraftMech = !!(items && typeof items.craft === "function");
  const canPlaceMech = !!(build && typeof build.place === "function");

  const have = new Set();
  for(const id of ITEM_IDS){
    const c = ITEM_DATA[id].category;
    if(c === "raw" || c === "gathered") have.add(id);
  }

  const recipeLive = Object.create(null);
  const buildingLive = Object.create(null);

  let changed = true;
  while(changed){
    changed = false;

    for(const bid of BUILDING_IDS){
      if(buildingLive[bid] || !canPlaceMech) continue;
      const b = BUILDINGS[bid];
      if(b.buildsAt && b.buildsAt !== HAND && !buildingLive[b.buildsAt]) continue;
      let ok = true;
      for(const id in (b.materials||{})) if(!have.has(id)){ ok = false; break; }
      if(!ok) continue;
      buildingLive[bid] = true;
      changed = true;
    }

    for(const rid of RECIPE_IDS){
      if(recipeLive[rid]) continue;
      const r = RECIPES[rid];
      if(r.station !== HAND && !(canCraftMech && buildingLive[r.station])) continue;
      if(r.tool && !have.has(r.tool)) continue;
      let ok = true;
      for(const id in (r.inputs||{})) if(!have.has(id)){ ok = false; break; }
      if(!ok) continue;
      recipeLive[rid] = true;
      changed = true;
      for(const id in (r.outputs||{})){
        if(!have.has(id)){ have.add(id); }
      }
    }
  }
  return { have, recipeLive, buildingLive, canCraftMech, canPlaceMech };
}

function nameOf(id){
  const d = itemData(id);
  return d && d.name ? d.name : id;
}
function stationLabel(id){
  if(id === HAND) return "By hand";
  const b = BUILDINGS[id];
  return b ? b.name : id;
}

/* Why a recipe is not live, in one sentence that names the thing. */
export function recipeStatus(rid, R){
  const r = RECIPES[rid];
  if(!r) return { status:"planned", why:"no such recipe" };
  if(R.recipeLive[rid]) return { status:"live", why:"" };

  if(r.station !== HAND && !R.canCraftMech){
    return { status:"planned", why:"crafting at a station is not in this build yet" };
  }
  if(r.station !== HAND && !R.buildingLive[r.station]){
    return { status:"locked", why:"needs a " + stationLabel(r.station).toLowerCase() +
                                 ", which cannot be built yet" };
  }
  if(r.tool && !R.have.has(r.tool)){
    return { status:"locked", why:"needs a " + nameOf(r.tool).toLowerCase() +
                                 ", and nothing in the game makes one yet" };
  }
  for(const id in (r.inputs||{})){
    if(!R.have.has(id)){
      return { status:"locked", why:"nothing in the game produces " +
                                    nameOf(id).toLowerCase() + " yet" };
    }
  }
  return { status:"locked", why:"not reachable yet" };
}

export function buildingStatus(bid, R){
  const b = BUILDINGS[bid];
  if(!b) return { status:"planned", why:"no such building" };
  if(R.buildingLive[bid]) return { status:"live", why:"" };

  if(!R.canPlaceMech) return { status:"planned", why:"placing buildings is not in this build yet" };
  if(b.buildsAt && b.buildsAt !== HAND && !R.buildingLive[b.buildsAt]){
    return { status:"locked", why:"has to be built at a " +
                                  stationLabel(b.buildsAt).toLowerCase() +
                                  ", which cannot be built yet" };
  }
  for(const id in (b.materials||{})){
    if(!R.have.has(id)){
      return { status:"locked", why:"nothing in the game produces " +
                                    nameOf(id).toLowerCase() + " yet" };
    }
  }
  return { status:"locked", why:"not reachable yet" };
}

/* What actually holds a building up.

   NOT every building stands on the ground, and the two that do not are
   exactly the two whose whole point is that they do not: a ladder is fixed
   to a wall and a rope ladder hangs from an anchor above, both with `ground`
   at zero. This page used to print "and it needs solid ground under it" for
   everything, which would have been wrong in the most misleading possible
   place - a player reading it would go looking for a floor to stand a ladder
   on. So it branches on what the support record actually says, and a new
   support shape that nobody here has anticipated falls through to a truthful
   "nothing underneath it" rather than to a confident wrong answer. */
export function supportLine(b){
  const s = (b && b.support) || {};
  const parts = [];
  if(s.wall){
    parts.push("fixed to a wall - it needs solid material behind it, not under it");
  } else if(s.anchor === "above"){
    parts.push("hangs from its anchor above, and needs nothing underneath");
  } else if(s.anchor){
    parts.push("anchored " + s.anchor);
  } else if(s.ground >= 1){
    parts.push("solid ground under the whole of its footprint - nothing here floats");
  } else if(s.ground > 0){
    parts.push("solid ground under at least " + Math.round(s.ground * 100) +
               "% of its width - nothing here floats");
  } else {
    parts.push("nothing underneath it");
  }
  if(s.indoors) parts.push("and it has to be under cover");
  return parts.join(", ");
}

/* ---------------------------- the entry list --------------------------- */

/* Every entry the book can show, in reading order, each already carrying the
   state it will be rendered with. Pure, so the test can count what the book
   claims is live without a DOM. */
export function bookEntries(items, build){
  const R = reachability(items, build);
  const out = [];

  out.push({ kind:"next", id:"next", group:"What to do next",
             title:"What to do next", status:"live", why:"" });

  for(const id of REFERENCE_IDS){
    const p = referencePage(id);
    out.push({ kind:"page", id, group:"How it works", title:p.title,
               status: p.status === "live" ? "live" : "planned",
               why: p.status === "live" ? "" : "designed, but no system behind it yet" });
  }

  for(const rid of RECIPE_IDS){
    const r = RECIPES[rid];
    const s = recipeStatus(rid, R);
    out.push({ kind:"recipe", id:rid, group:"Recipes", title:r.name,
               sub: stationLabel(r.station), status:s.status, why:s.why });
  }

  for(const bid of BUILDING_IDS){
    const b = BUILDINGS[bid];
    const s = buildingStatus(bid, R);
    out.push({ kind:"building", id:bid, group:"Buildings", title:b.name,
               sub:"stage " + b.stage, status:s.status, why:s.why });
  }

  out.push({ kind:"keys", id:"keys", group:"Keys", title:"Every key",
             status:"live", why:"" });

  return out;
}

/* How much of the book describes the game as it actually is. The line this
   produces is the direct answer to "I cannot tell what is in the game". */
export function bookTally(entries){
  let live = 0, planned = 0, locked = 0;
  for(const e of entries){
    if(e.status === "live") live++;
    else if(e.status === "locked") locked++;
    else planned++;
  }
  return { live, planned, locked, total: entries.length };
}

/* --------------------------------- search ------------------------------ */

function hasWord(haystack, word){
  if(!word) return false;
  return new RegExp("(^|[^a-z])" + word.replace(/[^a-z0-9']/g, "") + "([^a-z]|$)")
    .test(String(haystack).toLowerCase());
}

/* Reference pages keep lane F's ranking, which is tuned and tested over
   there. Recipes, buildings and the keys page are ranked here, because they
   are rendered from the tables rather than written as pages. Results stay
   grouped by kind rather than merged into one list: a score computed by two
   different functions is not a score you can sort across. */
export function bookSearch(query, entries){
  const q = String(query || "").toLowerCase().trim();
  if(!q) return null;
  const words = q.split(/[^a-z0-9']+/).filter(w => w.length > 1);
  if(!words.length) return null;

  const byId = Object.create(null);
  for(const e of entries) byId[e.kind + ":" + e.id] = e;

  const pages = [];
  for(const p of searchReference(q)){
    const e = byId["page:" + p.id];
    if(e) pages.push(e);
  }

  function score(text, weight){
    let s = 0;
    for(const w of words) if(hasWord(text, w)) s += weight;
    return s;
  }

  const recipes = [];
  for(const rid of RECIPE_IDS){
    const r = RECIPES[rid];
    let s = score(r.name, 6) + score(rid.replace(/_/g, " "), 4) +
            score(stationLabel(r.station), 2) + score(r.note || "", 1);
    for(const id in (r.inputs||{}))  s += score(nameOf(id), 3);
    for(const id in (r.outputs||{})) s += score(nameOf(id), 5);
    if(s > 0) recipes.push({ e: byId["recipe:" + rid], s });
  }

  const buildings = [];
  for(const bid of BUILDING_IDS){
    const b = BUILDINGS[bid];
    let s = score(b.name, 6) + score(bid.replace(/_/g, " "), 4) +
            score(b.enables || "", 2) + score(b.note || "", 1);
    for(const id in (b.materials||{})) s += score(nameOf(id), 3);
    if(s > 0) buildings.push({ e: byId["building:" + bid], s });
  }

  const kw = keyKeywords();
  let keyScore = 0;
  for(const w of words) if(kw.indexOf(w) >= 0) keyScore += 5;
  const keyHits = keyScore > 0 && byId["keys:keys"] ? [byId["keys:keys"]] : [];

  /* A thing that is not in the build should not lead a result list. It still
     appears - hiding it is the failure mode we are fixing - but it does not
     get to be the first answer to a question the game can already answer. */
  const rank = a => a.s * (a.e && a.e.status === "live" ? 1 : 0.55);
  const pick = arr => arr.filter(a => a.e)
                         .sort((a,b) => rank(b) - rank(a))
                         .map(a => a.e);

  return {
    pages, keys: keyHits,
    recipes: pick(recipes),
    buildings: pick(buildings),
    count: pages.length + recipes.length + buildings.length + keyHits.length
  };
}

/* ------------------------------------------------------------------------ */

const BADGE = {
  live:    { text:"", cls:"" },
  planned: { text:"not built yet", cls:"planned" },
  locked:  { text:"not reachable yet", cls:"locked" }
};

/* Keys the book eats while it is open, so searching for "sand" does not walk
   the clonk into a hole while you read about sand. */
const SWALLOW = ["a","d","w","s"," ","arrowleft","arrowright","arrowup",
                 "arrowdown","shift"];

export function createBook(world, items, build){
  if(typeof document === "undefined") return { name: "book" };

  const el = (tag, cls, parent, text) => {
    const n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    if(parent) parent.appendChild(n);
    return n;
  };

  const host = document.createElement("div");
  host.id = "book";
  host.className = "panel";
  host.style.display = "none";
  document.body.appendChild(host);

  const top = el("div", "btop", host);
  el("span", "btitle", top, "GUIDEBOOK");
  const search = document.createElement("input");
  search.className = "bsearch";
  search.type = "text";
  search.placeholder = "search - try \"cant dig\", \"full\", \"dark\", \"axe\"";
  search.spellcheck = false;
  top.appendChild(search);
  const closeBtn = el("span", "bclose", top, "×");
  closeBtn.title = "close (" + keyCap(KEY_BOOK).toLowerCase() + " or esc)";

  const tally = el("div", "btally", host, "");

  const cols = el("div", "bcols", host);
  const side = el("div", "bside", cols);
  const page = el("div", "bpage", cols);

  const foot = el("div", "bfoot", host, "");

  let open = false;
  let entries = [];
  let flat = [];             /* what the arrows walk, in display order */
  let sel = 0;
  let current = null;        /* the entry whose page is shown */
  let noMatch = false;       /* the search found nothing; the page says so */

  /* ------------------------------------------------------- the sidebar --- */

  function badgeInto(parent, status){
    const b = BADGE[status];
    if(!b || !b.text) return;
    el("span", "bbadge " + b.cls, parent, b.text);
  }

  function renderSide(){
    side.innerHTML = "";
    flat = [];

    const results = bookSearch(search.value, entries);
    noMatch = false;

    if(results){
      const groups = [
        ["How it works", results.pages],
        ["Recipes", results.recipes],
        ["Buildings", results.buildings],
        ["Keys", results.keys]
      ];
      let any = false;
      for(const [label, list] of groups){
        if(!list.length) continue;
        any = true;
        el("div", "bgroup", side, label);
        for(const e of list) rowFor(e);
      }
      if(!any){
        const words =
          "Nothing matches that. Try a plainer word - what you would say out " +
          "loud, not what the game calls it.";
        el("div", "bnone", side, words);
        /* and clear the page, or the last thing you read sits beside "nothing
           matches" looking exactly like the answer. noMatch keeps it cleared:
           without it the next inv:changed redraw puts the old page straight
           back, next to a sidebar still saying nothing matched. */
        noMatch = true;
        page.innerHTML = "";
        el("div", "bnone", page, words);
        current = null;
      }
    } else {
      let group = null;
      for(const e of entries){
        if(e.group !== group){ group = e.group; el("div", "bgroup", side, group); }
        rowFor(e);
      }
    }

    if(sel >= flat.length) sel = Math.max(0, flat.length - 1);
    paintSel();
  }

  function rowFor(e){
    const idx = flat.length;
    const row = el("div", "brow" + (e.status === "live" ? "" : " dim"), side);
    el("span", "bkind " + e.kind, row, "");
    el("span", "bname", row, e.title);
    if(e.sub) el("span", "bsub", row, e.sub);
    badgeInto(row, e.status);
    row.addEventListener("click", () => { sel = idx; showEntry(e); paintSel(); });
    flat.push({ e, row });
  }

  function paintSel(){
    for(let i=0;i<flat.length;i++) flat[i].row.classList.toggle("sel", i === sel);
  }

  /* ---------------------------------------------------------- the page --- */

  function pageHead(e, subtitle){
    page.innerHTML = "";
    const h = el("div", "bphead", page);
    el("span", "bptitle", h, e.title);
    badgeInto(h, e.status);
    if(subtitle) el("div", "bpsub", page, subtitle);
    if(e.status !== "live" && e.why){
      const w = el("div", "bpwarn " + e.status, page);
      el("b", null, w, e.status === "planned" ? "Not in the build yet. " : "Not reachable yet. ");
      el("span", null, w, e.why + ".");
    }
  }

  function chips(parent, cost, label){
    const wrap = el("div", "bchips", parent);
    if(label) el("span", "blabel", wrap, label);
    let any = false;
    for(const id in (cost||{})){
      any = true;
      const need = cost[id];
      const have = items && items.inventory ? items.inventory.count(id) : 0;
      const chip = el("span", "chip " + (have >= need ? "ok" : "miss"), wrap);
      el("i", "csw", chip).style.background = (itemData(id) || {}).col || "#8a7c6c";
      el("span", "ctxt", chip, have + "/" + need + " " + nameOf(id).toLowerCase());
    }
    if(!any) el("span", "cnone", wrap, "nothing");
    return wrap;
  }

  function figureTable(parent, figures){
    if(!figures || !figures.length) return;
    const t = el("div", "bfigs", parent);
    for(const f of figures){
      const r = el("div", "bfig", t);
      el("span", "bfl", r, f.label);
      el("span", "bfv", r, String(f.value));
    }
  }

  function seeAlso(parent, ids){
    if(!ids || !ids.length) return;
    const wrap = el("div", "bsee", parent);
    el("span", "blabel", wrap, "see also");
    for(const id of ids){
      const p = referencePage(id);
      if(!p) continue;
      const a = el("span", "blink", wrap, p.title);
      a.addEventListener("click", () => openById("page", id));
    }
  }

  function showPage(e){
    const p = referencePage(e.id);
    if(!p){ page.textContent = ""; return; }
    pageHead(e, null);
    el("div", "bbody", page, p.body);
    figureTable(page, p.figures);
    seeAlso(page, p.see);
  }

  function showRecipe(e){
    const r = RECIPES[e.id];
    if(!r){ page.textContent = ""; return; }
    pageHead(e, "Made " + (r.station === HAND ? "with your bare hands, anywhere"
                                              : "at a " + stationLabel(r.station).toLowerCase()));
    chips(page, r.inputs, "needs");

    const tool = el("div", "brow2", page);
    if(r.tool){
      const has = items && items.inventory ? items.inventory.has(r.tool, 1) : false;
      el("span", "blabel", tool, "tool");
      el("span", has ? "ok" : "miss", tool,
         nameOf(r.tool).toLowerCase() + " - required, and not used up");
    } else {
      el("span", "blabel", tool, "tool");
      el("span", "dim", tool, "none");
    }

    let outMass = 0;
    const outParts = [];
    for(const id in (r.outputs||{})){
      outParts.push(r.outputs[id] + " " + nameOf(id).toLowerCase());
      outMass += r.outputs[id] * ((itemData(id) || {}).mass || 0);
    }
    const makes = el("div", "brow2", page);
    el("span", "blabel", makes, "makes");
    el("span", null, makes, outParts.join(", ") + "  ·  " +
       outMass.toFixed(1) + " kg  ·  " + r.time + " s of work");

    if(r.note) el("div", "bnote", page, r.note);
  }

  function showBuilding(e){
    const b = BUILDINGS[e.id];
    if(!b){ page.textContent = ""; return; }
    pageHead(e, b.buildsAt === HAND
      ? "Built where it stands, with your bare hands"
      : "Built where it stands, and needs a " + stationLabel(b.buildsAt).toLowerCase());

    chips(page, b.materials, "costs");

    const kg = buildMass(e.id, itemData);
    const cap = items && items.inventory ? items.inventory.capacity() : 0;
    const trips = cap > 0 ? Math.max(1, Math.ceil(kg / cap)) : 0;
    const haul = el("div", "brow2", page);
    el("span", "blabel", haul, "to carry");
    el("span", null, haul, kg + " kg" +
       (trips ? "  ·  " + trips + (trips === 1 ? " backpack trip" : " backpack trips") : "") +
       "  ·  " + b.time + " s to raise");

    const foot2 = el("div", "brow2", page);
    el("span", "blabel", foot2, "footprint");
    el("span", null, foot2, b.w + " x " + b.h + " px");

    const stand = el("div", "brow2", page);
    /* "held up by", not "stands on" - two of these do not stand on anything */
    el("span", "blabel", stand, "held up by");
    el("span", null, stand, supportLine(b));

    if(b.climb){
      const cl = el("div", "brow2", page);
      el("span", "blabel", cl, "climbing");
      el("span", null, cl, "you can climb this one, which is how you get back up a shaft you dug straight down");
    }

    if(b.enables) el("div", "bbody", page, b.enables);
    if(b.note) el("div", "bnote", page, b.note);
  }

  function showKeys(e){
    pageHead(e, "Generated from the real bindings, so it cannot go stale.");
    for(const g of keyBindings(items)){
      el("div", "bgroup", page, g.group);
      for(const row of g.rows){
        const r = el("div", "bkey", page);
        el("span", "bkcap", r, row.cap);
        el("span", "bkwhat", r, row.what);
      }
    }
  }

  /* The other half of the book: what to do NEXT, against the actual pack.
     This used to be its own panel; it is the first page here instead, so
     there is one thing to open rather than two. */
  function showNext(e){
    const has = id => !!(build && typeof build.has === "function" && build.has(id));
    const st = highestStageReached(has, id => everObtained.has(id));
    const costed = highestCostedStage();
    const S = stageDef(st) || STAGES[0];
    const G = guideFor(st);

    pageHead({ title:"Stage " + st + " - " + (S.name || ""), status:"live", why:"" },
             S.goal || null);
    if(G && G.lookFor) el("div", "bbody", page, G.lookFor);

    if(st > costed){
      el("div", "bpwarn planned", page,
         "This stage is not costed yet - the tables stop at stage " + costed +
         ", so there is nothing here to check your pockets against.");
      return;
    }
    if(!(G && G.actions && G.actions.length)) return;

    const ol = el("ol", "bacts", page);
    let firstOpen = true;
    for(const a of G.actions){
      const sf = shortfall(a.needs);
      const done = sf ? sf.met : false;
      const isNext = !done && firstOpen;
      if(isNext) firstOpen = false;

      const li = el("li", done ? "done" : (isNext ? "next" : "later"), ol);
      el("div", "bdo", li, a.do);
      if(a.why) el("div", "bwhy", li, a.why);
      if(sf) li.appendChild(sf.node);
      if(isNext){
        const h = firstMissingHint(a.needs);
        if(h) el("div", "bhint", li, h);
      }
    }
  }

  /* What a step still needs, counted against what is actually carried. */
  function shortfall(need){
    if(!need) return null;
    if(need.items) return costNode(need.items, 0);
    if(need.craft){
      const r = RECIPES[need.craft];
      return r ? costNode(r.inputs || {}, 0) : null;
    }
    if(need.build){
      const b = BUILDINGS[need.build];
      if(!b) return null;
      /* buildMass takes the LOOKUP FUNCTION, not the table - passing the
         table made this throw the moment a build step appeared. */
      return costNode(b.materials || {}, buildMass(need.build, itemData));
    }
    return null;
  }
  function costNode(cost, kg){
    const node = document.createElement("div");
    node.className = "bneed";
    let met = true;
    for(const id in cost){
      const need = cost[id];
      const have = items && items.inventory ? items.inventory.count(id) : 0;
      if(have < need) met = false;
      el("span", have >= need ? "ok" : "miss", node,
         have + "/" + need + " " + nameOf(id).toLowerCase());
    }
    if(kg > 0){
      const cap = items && items.inventory ? items.inventory.capacity() : 0;
      const t = cap > 0 ? Math.max(1, Math.ceil(kg / cap)) : 0;
      el("span", "trips", node, kg + " kg" +
         (t ? ", " + t + (t === 1 ? " trip" : " trips") : ""));
    }
    return { met, node };
  }
  function firstMissingHint(need){
    if(!need) return "";
    const cost = need.items ? need.items
              : need.craft && RECIPES[need.craft] ? (RECIPES[need.craft].inputs || {})
              : need.build && BUILDINGS[need.build] ? (BUILDINGS[need.build].materials || {})
              : {};
    for(const id in cost){
      const have = items && items.inventory ? items.inventory.count(id) : 0;
      if(have < cost[id]){
        const h = typeof hintFor === "function" ? hintFor(id) : null;
        if(h) return typeof h === "string" ? h : (h.text || "");
      }
    }
    return "";
  }

  function showEntry(e){
    current = e;
    if(!e){ page.innerHTML = ""; return; }
    if(e.kind === "page") showPage(e);
    else if(e.kind === "recipe") showRecipe(e);
    else if(e.kind === "building") showBuilding(e);
    else if(e.kind === "keys") showKeys(e);
    else showNext(e);
  }

  function openById(kind, id){
    for(let i=0;i<flat.length;i++){
      if(flat[i].e.kind === kind && flat[i].e.id === id){
        sel = i; showEntry(flat[i].e); paintSel();
        if(flat[i].row.scrollIntoView) flat[i].row.scrollIntoView({ block:"nearest" });
        return true;
      }
    }
    /* not in the current result list - clear the search and try again */
    if(search.value){ search.value = ""; renderSide(); return openById(kind, id); }
    return false;
  }

  /* ---------------------------------------------------------- rendering --- */

  function render(){
    if(!open) return;
    entries = bookEntries(items, build);
    renderSide();

    const t = bookTally(entries);
    tally.textContent =
      t.live + " of " + t.total + " entries describe things that are in this build. " +
      (t.planned ? t.planned + " are designed but not built. " : "") +
      (t.locked ? t.locked + " are built but nothing can supply them yet." : "");

    /* keep the page in step with the pack: have/need counts live on it */
    if(current){
      const again = entries.find(e => e.kind === current.kind && e.id === current.id);
      showEntry(again || current);
    } else if(!noMatch){
      showEntry(entries[0]);
      sel = 0;
      paintSel();
    }
    foot.textContent = "type to search · up/down to move · enter to open · " +
                       keyCap(KEY_BOOK).toLowerCase() + " or esc closes · " +
                       keyCap(KEY_PACK).toLowerCase() + " opens the pack";
  }

  function setOpen(v){
    open = !!v;
    host.style.display = open ? "block" : "none";
    if(open){
      render();
      if(search.focus) search.focus();
    } else if(search.blur){
      search.blur();
    }
  }

  /* ---------------------------------------------------------------- keys --- */

  const typing = () => document.activeElement === search;

  search.addEventListener("input", () => {
    sel = 0;
    renderSide();
    if(flat[0]) showEntry(flat[0].e);      /* renderSide clears the page itself
                                              when nothing matched at all */
  });

  closeBtn.addEventListener("click", () => setOpen(false));

  function move(d){
    if(!flat.length) return;
    sel = (sel + d + flat.length) % flat.length;
    showEntry(flat[sel].e);
    paintSel();
    if(flat[sel].row.scrollIntoView) flat[sel].row.scrollIntoView({ block:"nearest" });
  }

  bus.on("input:key", e => {
    if(!e.down) return;
    if(state.paused) return;

    if(!open){
      if(e.key === KEY_BOOK) setOpen(true);
      return;
    }
    if(e.key === "arrowdown"){ move(1); return; }
    if(e.key === "arrowup"){ move(-1); return; }
    if(e.key === "enter"){ if(flat[sel]) showEntry(flat[sel].e); return; }

    /* The book opens with the caret in the search box, so that you can type
       the moment it appears. That makes the close key ambiguous: it is a
       command, and it is also the letter G, and "gathering" is a word people
       will type. The empty field settles it - nothing typed means nothing to
       lose, so G closes; once there is a query, G is a letter and escape is
       the way out. Without this the book could only ever be closed with
       escape, while the footer promised otherwise. */
    if(e.key === KEY_BOOK && (!typing() || !search.value)){ setOpen(false); return; }
    if(typing()) return;
  });

  /* The have/need counts on a recipe page are live, so the book redraws on
     the same events the pack screen does rather than on a tick counter. */
  for(const ev of ["inv:changed", "craft:done", "structure:built"]){
    bus.on(ev, () => { if(open) render(); });
  }

  registerScreen({
    id: "book", label: "Guidebook", key: KEY_BOOK,
    isOpen: () => open,
    open: () => setOpen(true),
    close: () => setOpen(false),
    /* the bar's "Keys" button jumps straight to the generated key page */
    api: { open(kind, id){ setOpen(true); return openById(kind || "page", id); } }
  });

  return {
    name: "book",
    tick(){
      /* Reading is not walking. Every keydown still reaches core's `keys`
         map, so without this a search for "sand" would hold A and D down
         and stroll the clonk off whatever it is standing on. */
      if(open) for(const k of SWALLOW) rawKeys[k] = false;
    },
    api: {
      toggle(){ setOpen(!open); },
      isOpen(){ return open; },
      open(kind, id){ setOpen(true); return openById(kind || "page", id); },
      search(q){ search.value = q; renderSide(); return flat.map(f => f.e); },
      entries(){ return bookEntries(items, build); },
      everObtained
    }
  };
}
