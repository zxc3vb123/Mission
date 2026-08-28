/* THE PACK - what you are carrying, and what you can make of it. LANE H (ui).
   Opens on I, or on C with the bench lit.

   The owner's words about the version before this one: "improve the crafting
   thing, make it look like a proper inventory instead of this shit." It was a
   list of rows with a coloured square on each, which is a debug view. What
   they described is the genre standard - your pack as things you recognise, a
   bench you put things into, and a result you take.

   FOUR DECISIONS WORTH KNOWING BEFORE CHANGING ANYTHING HERE.

   1. THE GRID DOES NOT IMPLY SLOTS. The pack is limited by MASS, not by slot
      count (docs/DECISIONS.md, "Carrying is mass-limited"), so this draws one
      tile per kind you actually carry and never a row of empty slots waiting
      to be filled. A grid of empty squares would teach the player the one
      thing about this backpack that is not true, and hauling pressure is the
      whole reason lane D exists. The load bar, not the tile count, is the
      limit, and it says so in words underneath.

   2. THE BENCH IS A SELECTION, NOT CUSTODY. Putting a rock on the bench does
      not take it out of your pack; it says "use this". Nothing is ever held
      by this screen, so there is no state to hand back when the screen
      closes, the game reloads or the player dies mid-arrangement - and no way
      for matter to go missing inside a UI buffer. Conservation is a law here
      (docs/GAME_DESIGN.md 2), and the safest way to obey it is never to be
      holding anything.

   3. MATCHING IS ON WHAT, NEVER ON WHERE - see src/ui/bench.js. Lane F's
      recipes are ingredient lists, so which slot a stick sits in cannot
      matter without invalidating every recipe they have written.

   4. THE CRAFT IS STILL LANE C'S. The bench decides what you are ASKING for;
      items.craft() decides whether it happens, because it knows about the
      station under your feet, the hopper beside it, the tool in your hand and
      the room in your pack. This screen never moves an item itself: throwing
      out goes through items.drop(), which spawns real chunks and reports how
      many actually left, and that return is what the player is told. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { RECIPES, RECIPE_IDS, HAND, recipesAt } from "../content/recipes.js";
import { ITEM_IDS, itemData } from "../content/items.js";
import { BUILDINGS } from "../content/buildings.js";
import { KEY_PACK, KEY_CRAFT, KEY_PREV, KEY_NEXT, KEY_CONFIRM, KEY_SWITCH,
         keyCap } from "./keys.js";
import { registerScreen } from "./screens.js";
import { itemIcon } from "./icon.js";
import { benchMatch, benchTotals, benchFor } from "./bench.js";

/* A pack filled to exactly its limit must not read as over: masses are
   fractional kilograms and the inventory uses the same slack. */
const EPS = 1e-9;

/* Enough for the widest recipe lane F has, with room to lay it out. */
export const BENCH_SLOTS = 6;

/* Stable display order: lane F's table order, so a tile's position never
   depends on how much of it you have and never moves under the cursor. */
const ORDER = Object.create(null);
for(let i=0;i<ITEM_IDS.length;i++) ORDER[ITEM_IDS[i]] = i;

function unitMass(items, id){
  if(items && items.itemDef){
    const d = items.itemDef(id);
    if(d && d.mass > 0) return d.mass;
  }
  const d = itemData(id);
  return d ? d.mass : 0;
}
function displayName(items, id){
  const d = itemData(id) || (items && items.itemDef ? items.itemDef(id) : null);
  return d && d.name ? d.name : id;
}

/* ---- pure, so tools/tests/ui.test.js can read the pack without a DOM ---- */

export function packRows(items){
  if(!items || !items.inventory) return [];
  const inv = items.inventory;
  const all = inv.all();
  const rows = [];
  for(const id in all){
    const n = all[id];
    if(n <= 0) continue;
    const unit = unitMass(items, id);
    rows.push({
      id, name: displayName(items, id), count: n, unit, mass: n * unit,
      category: (itemData(id) || {}).category || "other"
    });
  }
  const carried = inv.carriedMass();
  for(const r of rows) r.share = carried > 0 ? r.mass / carried : 0;
  rows.sort((a,b) => {
    const oa = ORDER[a.id] === undefined ? 1e6 : ORDER[a.id];
    const ob = ORDER[b.id] === undefined ? 1e6 : ORDER[b.id];
    return oa - ob || a.id.localeCompare(b.id);
  });
  return rows;
}

export function packTotals(items){
  if(!items || !items.inventory){
    return { carried:0, capacity:0, free:0, pct:0, burdened:false, full:false, kinds:0 };
  }
  const inv = items.inventory;
  const carried = inv.carriedMass(), capacity = inv.capacity();
  return {
    carried, capacity,
    free: inv.freeMass ? inv.freeMass() : Math.max(0, capacity - carried),
    pct: capacity > 0 ? Math.min(100, carried / capacity * 100) : 0,
    burdened: inv.encumbrance ? inv.encumbrance() > 0 : false,
    full: inv.isFull ? inv.isFull() : false,
    kinds: packRows(items).length
  };
}

/* ------------------------------------------------------------------------ */

export function createPack(world, items, build){
  if(typeof document === "undefined" || !items || !items.inventory){
    return { name: "pack" };
  }

  const inv = items.inventory;
  const itemName = id => displayName(items, id);
  const itemMass = id => unitMass(items, id);

  function stationName(id){
    if(id === HAND) return "By hand";
    const b = BUILDINGS[id];
    return b ? b.name : id;
  }

  const stations = [HAND];
  for(const id of RECIPE_IDS){
    const s = RECIPES[id].station;
    if(s !== HAND && !stations.includes(s)) stations.push(s);
  }

  const canCraftApi = () => typeof items.canCraft === "function";
  const canDoCraft  = () => typeof items.craft === "function";
  const canDrop     = () => typeof items.drop === "function";
  const canPlace    = () => !!(build && typeof build.place === "function");

  /* --------------------------------------------------------- stations --- */

  function stationsHere(){
    try {
      if(typeof items.nearbyStations === "function"){
        const list = items.nearbyStations();
        if(list && typeof list.has === "function") return list;
        if(Array.isArray(list)){
          const set = new Set();
          for(const s of list) set.add(typeof s === "string" ? s : (s && (s.defId || s.id)));
          return set;
        }
      }
      if(build && typeof build.stationsNear === "function"){
        const p = state.player;
        const set = build.stationsNear(p.x, p.y);
        if(set && typeof set.has === "function"){ set.add(HAND); return set; }
      }
    } catch(err){ /* a lane mid-landing must not take the screen down */ }
    return null;
  }

  function raisingHere(defId){
    try {
      if(!build || typeof build.structuresNear !== "function") return false;
      const p = state.player;
      for(const s of build.structuresNear(p.x, p.y, 40) || []){
        if(s && s.defId === defId && !s.built) return true;
      }
    } catch(err){ /* same */ }
    return false;
  }

  /* ----------------------------------------------------- craftability --- */

  function laneCVerdict(r){
    if(!canCraftApi()) return null;
    try {
      const res = items.canCraft(r.id, r.station);
      if(res === true) return { ok:true };
      if(res === false) return { ok:false };
      if(res && typeof res === "object" && "ok" in res){
        return {
          ok: !!res.ok,
          why: (typeof res.reason === "string" && res.reason) || null,
          missing: Array.isArray(res.missing) ? res.missing : null,
          /* EVERY input, not only the short ones - lane C publishes this so a
             chip does not have to infer a floor for a satisfied ingredient */
          inputs: Array.isArray(res.inputs) ? res.inputs : null,
          needsStation: !!res.needsStation,
          needsTool: !!res.needsTool,
          busy: !!res.busy,
          overBy: typeof res.overBy === "number" ? res.overBy : null
        };
      }
    } catch(err){ /* mid-landing lane: fall back to our own reading */ }
    return null;
  }

  function localCheck(r, here){
    const inputs = r.inputs || {}, outputs = r.outputs || {};

    if(r.station !== HAND){
      if(here === null){
        return { can:false, kind:"gate",
                 why: canPlace() ? "no " + stationName(r.station).toLowerCase() + " here"
                                 : "stations are not in this build yet" };
      }
      if(!here.has(r.station)){
        return { can:false, kind:"gate",
                 why: raisingHere(r.station)
                        ? "the " + stationName(r.station).toLowerCase() + " is still being built"
                        : "stand at a " + stationName(r.station).toLowerCase() };
      }
    }
    if(r.tool && !inv.has(r.tool, 1)){
      return { can:false, kind:"tool", why:"needs a " + itemName(r.tool).toLowerCase() };
    }
    let firstShort = null, shortKinds = 0;
    for(const id in inputs){
      const short = inputs[id] - inv.count(id);
      if(short > 0){ shortKinds++; if(!firstShort) firstShort = { id, short }; }
    }
    if(firstShort){
      let why = "need " + firstShort.short + " more " + itemName(firstShort.id).toLowerCase();
      if(shortKinds > 1) why += " +" + (shortKinds-1) + " other";
      return { can:false, kind:"short", why };
    }
    let dm = 0;
    for(const id in inputs) dm -= inputs[id] * itemMass(id);
    for(const id in outputs) dm += outputs[id] * itemMass(id);
    if(inv.carriedMass() + dm > inv.capacity() + EPS){
      return { can:false, kind:"mass", why:"pack too full for the result" };
    }
    if(!canDoCraft() && r.station !== HAND){
      return { can:false, kind:"gate", why:"station crafting is not in this build yet" };
    }
    return null;
  }

  /* A STATION DRAWS FROM ITS OWN HOPPER AS WELL AS YOUR PACK, so a shortfall
     is about the situation and not one container. Saying "you have 2 wood" to
     somebody carrying none reads as the screen being broken. */
  function missingWords(missing){
    if(!missing || !missing.length) return null;
    const first = missing[0];
    if(!first || !first.id) return null;
    const short = Math.max(0, (first.need|0) - (first.have|0)) || first.need;
    let s = "need " + short + " more " + itemName(first.id).toLowerCase();
    if(first.inStore > 0){
      s += " (" + first.inStore + " in the station" +
           (first.inPack > 0 ? ", " + first.inPack + " on you" : "") + ")";
    }
    if(missing.length > 1) s += " +" + (missing.length-1) + " other";
    return s;
  }

  function evaluate(r, here){
    const v = laneCVerdict(r);
    const local = localCheck(r, here);
    if(v && v.ok) return { can:true, kind:"ok", why:"ready", missing:null, inputs: v.inputs || null };
    if(v && !v.ok){
      /* BUSY FIRST, deliberately: a working station arrives with needsStation
         unset, so falling through would tell a player standing at their kiln
         to go and build a kiln. They have one. It is working. */
      if(v.busy) return { can:false, kind:"busy", why: v.why || "still working", missing:null };
      const kind = v.needsStation ? "gate"
                 : (v.needsTool ? "tool"
                 : (v.overBy > 0 ? "mass" : (local ? local.kind : "gate")));
      const over = v.overBy > 0 ? (v.overBy.toFixed(1) + " kg too heavy - drop something first") : null;
      const why = missingWords(v.missing) || over || v.why ||
                  (local ? local.why : "not craftable here");
      return { can:false, kind, why, missing: v.missing || null, inputs: v.inputs || null };
    }
    if(local) return { can:false, kind:local.kind, why:local.why, missing:null, inputs:null };
    return { can:true, kind:"ok", why:"ready", missing:null, inputs:null };
  }

  /* ---------------------------------------------------------- crafting --- */

  function fallbackCraft(r){
    if(r.station !== HAND) return { ok:false, msg:"only hand recipes can be made in this build" };
    const inputs = r.inputs || {}, outputs = r.outputs || {};
    if(r.tool && !inv.has(r.tool, 1)) return { ok:false, msg:"needs a " + itemName(r.tool).toLowerCase() };
    for(const id in inputs){
      if(!inv.has(id, inputs[id])) return { ok:false, msg:"not enough " + itemName(id).toLowerCase() };
    }
    const taken = [];
    const refund = () => { for(const t of taken) inv.add(t.id, t.n); };
    for(const id in inputs){
      if(!inv.take(id, inputs[id])){ refund(); return { ok:false, msg:"the pack changed mid-craft" }; }
      taken.push({ id, n: inputs[id] });
    }
    const added = [];
    for(const id in outputs){
      const got = inv.add(id, outputs[id]);
      if(got < outputs[id]){
        if(got > 0) inv.take(id, got);
        for(const a of added) inv.take(a.id, a.n);
        refund();
        return { ok:false, msg:"pack too full for the result" };
      }
      added.push({ id, n: outputs[id] });
    }
    return { ok:true, msg:null };
  }

  function craftedLabel(r){
    const parts = [];
    for(const id in (r.outputs||{})) parts.push(r.outputs[id] + " " + itemName(id).toLowerCase());
    return parts.join(", ");
  }

  let usedApi = false;

  function doCraft(r){
    const ev = evaluate(r, stationsHere());
    if(!ev.can){ say(ev.why, false); return false; }

    let ok = false, msg = null, timed = false;
    if(canDoCraft()){
      try {
        const res = items.craft(r.id, r.station);
        if(res === false) ok = false;
        else if(res && typeof res === "object" && "ok" in res){
          ok = !!res.ok; msg = res.reason || null; timed = !!res.timed;
        } else ok = true;
        usedApi = true;
      } catch(err){ ok = false; msg = "crafting failed"; }
    } else {
      const out = fallbackCraft(r);
      ok = out.ok; msg = out.msg;
    }

    /* MAKING IS INSTANT; PROCESSING TAKES TIME. A kiln or a forge returns
       started-not-finished with an empty output, and the goods wait in the
       station until somebody collects them. "Made charcoal" would be a lie
       for ninety seconds and would send the player looking in a pack with
       nothing new in it. */
    if(ok && timed){
      say(stationName(r.station).toLowerCase() + " started - " + craftedLabel(r) +
          " when it finishes, and it keeps working if you walk away", true);
    } else {
      say(ok ? ("made " + craftedLabel(r)) : (msg || "could not make that"), ok);
    }
    if(ok) clearBench();
    render();
    return ok;
  }

  /* ------------------------------------------------------ throwing out --- */

  function doDrop(id, n){
    if(!canDrop()){ say("throwing things out is not in this build yet", false); return 0; }
    const have = inv.count(id);
    const want = (n === "all") ? have : Math.min(n, have);
    if(want <= 0){ say("you are not carrying any " + itemName(id).toLowerCase(), false); return 0; }
    let got = 0;
    try { got = items.drop(id, want) | 0; } catch(err){ got = 0; }
    if(got > 0){
      say("dropped " + got + " " + itemName(id).toLowerCase() +
          " (" + (got * itemMass(id)).toFixed(1) + " kg)", true);
    } else {
      say("could not put that down", false);
    }
    render();
    return got;
  }

  /* --------------------------------------------------------------- DOM --- */

  const el = (tag, cls, parent, text) => {
    const n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    if(parent) parent.appendChild(n);
    return n;
  };

  const host = document.createElement("div");
  host.id = "pack";
  host.className = "panel";
  host.style.display = "none";
  document.body.appendChild(host);

  const head = el("div", "ptitle", host);
  el("span", "pttl", head, "PACK");
  const headLoad = el("span", "ptload", head, "");
  const closeX = el("span", "pclose", head, "×");
  closeX.title = "close (" + keyCap(KEY_PACK).toLowerCase() + " or esc)";
  closeX.addEventListener("click", () => setOpen(false));

  const msg = el("div", "cmsg", host, "");
  const cols = el("div", "pcols", host);

  /* ---- left: what you are carrying, as things ---- */
  const packCol = el("div", "pcol ppack", cols);
  const packHead = el("div", "chead", packCol);
  el("span", "cstation", packHead, "CARRYING");
  const packCount = el("span", "cavail", packHead, "");
  const grid = el("div", "pgrid", packCol);
  const packEmpty = el("div", "pempty", packCol,
    "Your pack is empty. Sticks, fibrous plants and loose rock lie on the " +
    "surface and need no tool - walk over them.");

  const loadWrap = el("div", "pload", packCol);
  const loadBar = el("div", "plbar", loadWrap);
  const loadFill = el("i", null, loadBar);
  const loadNote = el("div", "plnote", loadWrap, "");

  /* ---- right: the bench, the result, and the book ---- */
  const craftCol = el("div", "pcol pcraft", cols);
  const benchHead = el("div", "chead", craftCol);
  el("span", "cstation", benchHead, "MAKE");
  const benchWhere = el("span", "cavail", benchHead, "");

  const benchRow = el("div", "pbench", craftCol);
  const benchSlots = [];
  for(let i=0;i<BENCH_SLOTS;i++){
    const s = el("div", "bslot", benchRow);
    s.dataset.bench = String(i);
    benchSlots.push({ node: s, id: null, n: 0 });
  }
  el("div", "barrow", benchRow, "→");
  const resultSlot = el("div", "bslot bresult", benchRow);

  const matchLine = el("div", "pmatch", craftCol, "");
  const benchTools = el("div", "pbtools", craftCol);
  const clearBtn = el("span", "pbtn", benchTools, "clear bench");
  clearBtn.addEventListener("click", () => { clearBench(); render(); });
  const benchHint = el("span", "pbhint", benchTools, "");

  const bookHead = el("div", "chead cbookhead", craftCol);
  el("span", "cstation", bookHead, "EVERYTHING YOU CAN MAKE");
  const list = el("div", "clist", craftCol);

  const detail = el("div", "cdetail", host, "");
  const foot = el("div", "cfoot", host, "");

  /* The craft book: every recipe in the game, whether or not it can be made
     now, because the recipe list IS the tech tree. Clicking one lays it out
     on the bench - showing somebody the arrangement teaches more than a line
     of text, and it is how you find out what a stick is for. */
  const rows = [];
  for(const st of stations){
    const group = recipesAt(st);
    if(!group.length) continue;
    const sec = el("div", "csec", list);
    const sh = el("div", "chead", sec);
    el("span", "cstation", sh, stationName(st));
    const savail = el("span", "cavail", sh, "");

    for(const r of group){
      const row = el("div", "cbrow", sec);
      row.dataset.recipe = r.id;

      const outIds = Object.keys(r.outputs || {});
      if(outIds.length) row.appendChild(itemIcon(outIds[0], 26));

      const mid = el("div", "cbmid", row);
      const l1 = el("div", "cline1", mid);
      el("span", "cname", l1, r.name);
      const stat = el("span", "cstat", l1, "");
      const l2 = el("div", "cin", mid);
      const chips = [];
      for(const id in (r.inputs||{})){
        const chip = el("span", "chip", l2);
        chip.appendChild(itemIcon(id, 18));
        const txt = el("span", "ctxt", chip, "");
        chips.push({ id, need: r.inputs[id], txt, chip });
      }
      if(!chips.length) el("span", "cnone", l2, "no materials");

      const prog = el("div", "cprog", row);
      const progFill = el("i", null, prog);
      prog.style.display = "none";

      const idx = rows.length;
      row.addEventListener("mousemove", () => {
        if(side !== "craft" || csel !== idx){ side = "craft"; csel = idx; paintSelection(); }
      });
      row.addEventListener("click", () => {
        side = "craft"; csel = idx;
        layOut(r);
        paintSelection();
        render();
      });
      rows.push({ r, row, stat, chips, prog, progFill, avail: savail, station: st });
    }
  }

  /* ------------------------------------------------------------- state --- */

  let open = false;
  let side = "craft";
  let csel = 0, psel = 0;
  let packOrder = [];
  const packNodes = Object.create(null);
  let packKey = "";
  let held = null;            /* { id, n } riding the cursor */
  /* Which of several recipes with IDENTICAL ingredients the player means. An
     iron shovel and an iron axe are both one iron bar and one wood, so the
     bench cannot tell them apart and must ask rather than guess. */
  let pickId = null;

  /* --------------------------------------------------------- the bench --- */

  function benchState(){ return benchSlots.map(s => ({ id:s.id, n:s.n })); }
  function clearBench(){ for(const s of benchSlots){ s.id = null; s.n = 0; } pickId = null; }

  /* The recipe the bench currently means: the player's pick when it is still
     one of the matches, otherwise the first. */
  function chosen(m){
    if(!m.exactAll || !m.exactAll.length) return null;
    if(pickId && m.exactAll.indexOf(pickId) >= 0) return pickId;
    return m.exactAll[0];
  }
  function cyclePick(){
    const m = benchMatch(benchState());
    if(!m.exactAll || m.exactAll.length < 2) return;
    const at = m.exactAll.indexOf(chosen(m));
    pickId = m.exactAll[(at + 1) % m.exactAll.length];
    render();
  }

  function layOut(r){
    const laid = benchFor(r.id, BENCH_SLOTS);
    if(!laid){ say("that recipe does not fit on the bench", false); return; }
    for(let i=0;i<BENCH_SLOTS;i++){ benchSlots[i].id = laid[i].id; benchSlots[i].n = laid[i].n; }
    /* Clicking "iron axe" in the book must give an iron axe, not the iron
       shovel that happens to share its ingredients. */
    pickId = r.id;
    say("laid out " + r.name.toLowerCase() + " - press make, or change it", true);
  }
  function benchPut(i, id, n){
    const s = benchSlots[i];
    if(!s) return false;
    if(s.id && s.id !== id) return false;
    s.id = id; s.n = (s.n || 0) + n;
    return true;
  }
  function benchAdd(id, n){
    for(const s of benchSlots) if(s.id === id){ s.n += n; return true; }
    for(let i=0;i<BENCH_SLOTS;i++) if(!benchSlots[i].id) return benchPut(i, id, n);
    return false;
  }

  /* --------------------------------------------------------- the cursor --- */

  const heldNode = document.createElement("div");
  heldNode.id = "pheld";
  heldNode.style.display = "none";
  document.body.appendChild(heldNode);

  function showHeld(){
    heldNode.innerHTML = "";
    if(!held){ heldNode.style.display = "none"; return; }
    heldNode.appendChild(itemIcon(held.id, 26));
    el("span", "phn", heldNode, "x" + held.n);
    heldNode.style.display = "block";
  }
  function moveHeld(ev){
    if(!held) return;
    heldNode.style.left = (ev.clientX + 12) + "px";
    heldNode.style.top = (ev.clientY + 12) + "px";
  }
  function pickUp(id, n){ held = { id, n }; showHeld(); }
  function putDown(){ held = null; showHeld(); }

  /* Letting go outside the window throws it on the ground - the inventory
     idiom, and the same items.drop() the old buttons called. */
  function releaseOutside(){
    if(!held) return;
    const h = held;
    putDown();
    doDrop(h.id, h.n);
  }

  window.addEventListener("mousemove", ev => { if(open && held) moveHeld(ev); });
  window.addEventListener("mouseup", ev => {
    if(!open || !held) return;
    const r = host.getBoundingClientRect();
    const inside = ev.clientX >= r.left && ev.clientX <= r.right &&
                   ev.clientY >= r.top  && ev.clientY <= r.bottom;
    if(!inside){ releaseOutside(); render(); return; }
    putDown();          /* inside but over nothing: it goes back, losing nothing */
    render();
  });

  for(let i=0;i<BENCH_SLOTS;i++){
    const s = benchSlots[i];
    s.node.addEventListener("mouseup", ev => {
      if(!held) return;
      ev.stopPropagation();
      if(!benchPut(i, held.id, held.n)) benchAdd(held.id, held.n);
      putDown();
      render();
    });
    s.node.addEventListener("mousedown", ev => {
      ev.preventDefault();
      if(held || !s.id || s.n <= 0) return;
      pickUp(s.id, s.n);
      s.id = null; s.n = 0;
      moveHeld(ev);
      render();
    });
  }

  resultSlot.addEventListener("click", () => {
    const m = benchMatch(benchState());
    const pick = chosen(m);
    if(pick) doCraft(RECIPES[pick]);
    else say(m.empty ? "put something on the bench first" : "that is not a recipe yet", false);
  });
  /* Clicking the line switches between recipes the bench cannot tell apart. */
  matchLine.addEventListener("click", () => cyclePick());

  /* ------------------------------------------------------------ render --- */

  function say(text, good){
    msg.textContent = text || "";
    msg.className = "cmsg" + (text ? (good ? " good" : " bad") : "");
  }

  function buildGrid(rowsData){
    grid.innerHTML = "";
    for(const k in packNodes) delete packNodes[k];
    packOrder = [];

    for(const d of rowsData){
      const id = d.id;
      const tile = el("div", "pslot", grid);
      tile.dataset.item = id;
      tile.appendChild(itemIcon(id, 30));
      const ct = el("span", "psn", tile, "");
      const ms = el("span", "psm", tile, "");

      const idx = packOrder.length;
      tile.addEventListener("mousemove", () => {
        if(side !== "pack" || psel !== idx){ side = "pack"; psel = idx; paintSelection(); }
      });
      tile.addEventListener("mousedown", ev => {
        ev.preventDefault();
        if(held) return;
        const have = inv.count(id);
        if(have <= 0) return;
        /* shift takes the stack; otherwise one at a time, because a bench
           wants exact counts and a recipe rarely wants everything you own */
        pickUp(id, ev.shiftKey ? have : 1);
        moveHeld(ev);
        render();
      });
      tile.addEventListener("mouseup", ev => {
        if(!held) return;
        ev.stopPropagation();
        putDown();       /* back where it came from: nothing ever left */
        render();
      });

      packNodes[id] = { tile, ct, ms };
      packOrder.push(id);
    }
  }

  function renderPack(){
    const data = packRows(items);
    const key = data.map(d => d.id).join(",");
    if(key !== packKey){
      packKey = key;
      buildGrid(data);
      if(psel >= packOrder.length) psel = Math.max(0, packOrder.length - 1);
    }
    packEmpty.style.display = data.length ? "none" : "block";

    const onBench = benchTotals(benchState());
    for(const d of data){
      const n = packNodes[d.id];
      if(!n) continue;
      const ct = String(d.count);
      const ms = d.mass.toFixed(1) + " kg";
      if(n.ct.textContent !== ct) n.ct.textContent = ct;
      if(n.ms.textContent !== ms) n.ms.textContent = ms;
      n.tile.title = d.name + " - " + d.count + " x " + d.unit.toFixed(2) +
                     " kg = " + ms + (canDrop() ? "\ndrag out of this window to throw away" : "");
      n.tile.classList.toggle("onbench", (onBench[d.id] || 0) > 0);
      n.tile.classList.toggle("short", (onBench[d.id] || 0) > d.count);
    }

    const t = packTotals(items);
    const line = t.carried.toFixed(1) + " / " + t.capacity + " kg" + (t.full ? "   FULL" : "");
    if(headLoad.textContent !== line) headLoad.textContent = line;
    headLoad.className = "ptload" + (t.full ? " bad" : (t.burdened ? " warn" : ""));
    loadFill.style.width = t.pct.toFixed(1) + "%";
    loadFill.className = t.full ? "bad" : (t.burdened ? "warn" : "");

    let note;
    if(t.full){
      note = "Full. Nothing else fits - throw something out or build somewhere to put it.";
    } else if(t.burdened){
      note = "Heavy: you walk slower, and things stop being picked up for you. Hold " +
             keyCap(items.grabKey || "control") + " to take them anyway. " +
             t.free.toFixed(1) + " kg spare.";
    } else {
      note = t.free.toFixed(1) + " kg spare.";
    }
    /* the one thing a grid could wrongly imply, said out loud */
    note += "  The pack is limited by weight, not by slots.";
    if(loadNote.textContent !== note) loadNote.textContent = note;
    loadNote.className = "plnote" + (t.full ? " bad" : (t.burdened ? " warn" : ""));

    const kinds = t.kinds + (t.kinds === 1 ? " kind" : " kinds");
    if(packCount.textContent !== kinds) packCount.textContent = kinds;
  }

  function renderBench(){
    for(const s of benchSlots){
      s.node.innerHTML = "";
      s.node.classList.toggle("has", !!s.id);
      if(!s.id) continue;
      s.node.appendChild(itemIcon(s.id, 30));
      const have = inv.count(s.id);
      const cnt = el("span", "psn", s.node, String(s.n));
      cnt.className = "psn" + (have < s.n ? " short" : "");
      s.node.title = itemName(s.id) + " - " + s.n + " wanted, " + have + " carried";
    }

    const m = benchMatch(benchState());
    resultSlot.innerHTML = "";
    resultSlot.classList.remove("ready");

    if(m.empty){
      matchLine.textContent = "Drag things from your pack onto the bench, or click a recipe below to lay it out.";
      matchLine.className = "pmatch dim";
      benchHint.textContent = "shift-drag takes the whole stack";
      return;
    }

    const pick = chosen(m);
    if(pick){
      const r = RECIPES[pick];
      const alsoN = m.exactAll.length - 1;
      const ev = evaluate(r, stationsHere());
      const outIds = Object.keys(r.outputs || {});
      if(outIds.length){
        resultSlot.appendChild(itemIcon(outIds[0], 34));
        el("span", "psn", resultSlot, String(r.outputs[outIds[0]]));
      }
      resultSlot.classList.toggle("ready", ev.can);
      resultSlot.title = r.name + (ev.can ? " - click to make it" : " - " + ev.why);
      /* Say when the ingredients are ambiguous, and offer the other reading
         rather than silently choosing one of them. */
      const also = alsoN > 0
        ? "  ·  the same ingredients also make " +
          m.exactAll.filter(x => x !== pick).map(x => RECIPES[x].name.toLowerCase()).join(", ") +
          " - click here to switch"
        : "";
      matchLine.textContent = (ev.can
        ? (r.name + " - click the result, or press " + keyCap(KEY_CONFIRM).toLowerCase())
        : (r.name + " - " + ev.why)) + also;
      matchLine.className = "pmatch " + (ev.can ? "ok" : "miss") + (alsoN > 0 ? " pick" : "");
      benchHint.textContent = r.note || "";
      return;
    }

    if(m.stray.length){
      matchLine.textContent = "Nothing is made from " +
        m.stray.map(id => itemName(id).toLowerCase()).join(" and ") +
        " together with the rest of that. Take it off and try again.";
      matchLine.className = "pmatch miss";
    } else if(m.candidates.length){
      const c = m.candidates[0];
      const parts = [];
      for(const id in c.missing) parts.push(c.missing[id] + " more " + itemName(id).toLowerCase());
      matchLine.textContent = "Add " + parts.join(" and ") + " to make " +
                              RECIPES[c.id].name.toLowerCase() +
                              (m.candidates.length > 1
                                ? "  ·  " + (m.candidates.length - 1) + " other way" +
                                  (m.candidates.length > 2 ? "s" : "") + " from here"
                                : "");
      matchLine.className = "pmatch near";
    } else if(m.over.length){
      matchLine.textContent = "Too many " +
        m.over.map(id => itemName(id).toLowerCase()).join(" and ") +
        " for anything that uses them. Counts matter.";
      matchLine.className = "pmatch miss";
    } else {
      matchLine.textContent = "Nothing is made from that.";
      matchLine.className = "pmatch miss";
    }
    benchHint.textContent = "";
  }

  function jobsHere(){
    const by = Object.create(null);
    if(typeof items.craftProgress !== "function") return by;
    try {
      for(const j of items.craftProgress() || []) if(j && j.recipeId) by[j.recipeId] = j;
    } catch(err){ /* a lane mid-landing must not take the screen down */ }
    return by;
  }

  function renderBook(){
    const here = stationsHere();
    const jobs = jobsHere();

    const seen = Object.create(null);
    for(const row of rows){
      if(seen[row.station]) continue;
      seen[row.station] = true;
      let txt = "";
      if(row.station === HAND) txt = "always with you";
      else if(here === null) txt = canPlace() ? "none nearby" : "not in this build yet";
      else if(here.has(row.station)) txt = "you are here";
      else if(raisingHere(row.station)) txt = "still being built";
      else txt = "not nearby";
      if(row.avail.textContent !== txt) row.avail.textContent = txt;
      row.avail.className = "cavail" +
        (row.station === HAND || (here && here.has(row.station)) ? " on" : "");
    }

    for(const row of rows){
      const r = row.r;
      const ev = evaluate(r, here);
      const job = jobs[r.id];

      row.row.className = "cbrow" + (job ? " busy" : (ev.can ? " can" : " cant")) +
                          (side === "craft" && row === rows[csel] ? " sel" : "");

      if(job){
        const left = Math.max(0, Math.round((job.ticksLeft || 0) / 36));
        row.stat.textContent = "working - " + left + " s left";
        row.stat.className = "cstat busy";
        row.prog.style.display = "block";
        row.progFill.style.width = Math.round((job.progress || 0) * 100) + "%";
      } else {
        row.stat.textContent = ev.can ? "ready" : ev.why;
        row.stat.className = "cstat " +
          (ev.can ? "ok" : (ev.kind === "gate" || ev.kind === "busy" ? "gate" : "miss"));
        if(row.prog.style.display !== "none"){
          row.prog.style.display = "none";
          row.progFill.style.width = "0%";
        }
      }

      /* A chip counts what the craft could DRAW ON - the pack and the
         station's own hopper together, since lane C's stations prefer their
         delivered pile. Anything else shows "0/4" beside a row saying ready.

         `inputs` covers EVERY ingredient, so a satisfied one is exact rather
         than inferred; `missing` is the older, shortfall-only view and is
         kept as the fallback for a lane C mid-landing. */
      const info = Object.create(null);
      for(const it of (ev.inputs || [])) if(it && it.id) info[it.id] = it;
      for(const mm of (ev.missing || [])) if(mm && mm.id && !info[mm.id]) info[mm.id] = mm;
      for(const c of row.chips){
        const inPack = inv.count(c.id);
        const it = info[c.id];
        const have = it ? (it.have | 0) : (ev.can ? Math.max(c.need, inPack) : inPack);
        const t = have + "/" + c.need;
        if(c.txt.textContent !== t) c.txt.textContent = t;
        c.chip.className = "chip " + (have >= c.need ? "ok" : "miss");
        /* say WHERE, because "4 available" while carrying none reads wrong */
        const where = it && it.inStore > 0
          ? " (" + it.inStore + " in the station" +
            (it.inPack > 0 ? ", " + it.inPack + " on you" : "") + ")"
          : "";
        c.chip.title = itemName(c.id) + " - " + have + " available, " +
                       c.need + " needed" + where;
      }
    }
  }

  function paintSelection(){
    for(let i=0;i<rows.length;i++){
      rows[i].row.classList.toggle("sel", side === "craft" && i === csel);
    }
    for(let i=0;i<packOrder.length;i++){
      const n = packNodes[packOrder[i]];
      if(n) n.tile.classList.toggle("sel", side === "pack" && i === psel);
    }
    packCol.classList.toggle("focus", side === "pack");
    craftCol.classList.toggle("focus", side === "craft");

    if(side === "craft" && rows[csel]){
      detail.textContent = rows[csel].r.note || "";
    } else if(side === "pack"){
      const id = packOrder[psel];
      const d = id ? itemData(id) : null;
      detail.textContent = d && d.use ? d.use : "";
    } else detail.textContent = "";
  }

  function render(){
    if(!open) return;
    renderPack();
    renderBench();
    renderBook();
    const here = stationsHere();
    const at = here ? Array.from(here).filter(s => s !== HAND) : [];
    benchWhere.textContent = at.length
      ? "at a " + at.map(s => stationName(s).toLowerCase()).join(", ")
      : "bare hands";
    foot.textContent =
      "drag from your pack to the bench · shift-drag a whole stack · " +
      "drag out of this window to throw away · " +
      keyCap(KEY_SWITCH).toLowerCase() + " swap side · " +
      keyCap(KEY_CONFIRM).toLowerCase() + " make · " +
      keyCap(KEY_PACK).toLowerCase() + " closes" +
      (canDoCraft() ? "" : "   - hand recipes only in this build");
    paintSelection();
  }

  function move(d){
    if(side === "pack"){
      if(!packOrder.length) return;
      psel = (psel + d + packOrder.length) % packOrder.length;
    } else {
      if(!rows.length) return;
      csel = (csel + d + rows.length) % rows.length;
    }
    paintSelection();
    scrollSelectionIntoView();
  }
  function scrollSelectionIntoView(){
    const node = side === "pack"
      ? (packNodes[packOrder[psel]] && packNodes[packOrder[psel]].tile)
      : (rows[csel] && rows[csel].row);
    if(node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block:"nearest" });
  }

  /* Enter makes what is on the bench. With nothing matched it puts the
     selection on instead, so the keyboard path is the same two steps as the
     mouse one rather than a separate way of doing things. */
  function confirm(){
    const m = benchMatch(benchState());
    const pick = chosen(m);
    if(pick){ doCraft(RECIPES[pick]); return; }
    if(side === "pack"){
      const id = packOrder[psel];
      if(id) benchAdd(id, 1);
      render();
      return;
    }
    const row = rows[csel];
    if(row){ layOut(row.r); render(); }
  }

  function setOpen(v, which){
    open = !!v;
    host.style.display = open ? "block" : "none";
    if(open){
      if(which) side = which;
      say("", true);
      render();
      scrollSelectionIntoView();
    } else {
      putDown();
    }
  }

  /* --------------------------------------------------------------- keys --- */

  bus.on("input:key", e => {
    if(!e.down) return;
    if(state.paused) return;
    if(e.key === KEY_PACK){ setOpen(!open, "pack"); return; }
    if(e.key === KEY_CRAFT){ setOpen(!open, "craft"); return; }
    if(!open) return;
    if(e.key === KEY_SWITCH){ side = side === "pack" ? "craft" : "pack"; render(); scrollSelectionIntoView(); return; }
    if(e.key === KEY_PREV){ move(-1); return; }
    if(e.key === KEY_NEXT){ move(1); return; }
    if(e.key === KEY_CONFIRM){ confirm(); return; }
  });

  /* EVENT-DRIVEN, NOT POLLED. The owner's word for the old screen was
     "laggy": it redrew on state.tick % 6, which at a fixed 36 Hz leaves an
     input unacknowledged for a sixth of a second. */
  for(const ev of ["inv:changed", "item:equipped", "item:dropped", "job:started"]){
    bus.on(ev, () => { if(open) render(); });
  }
  bus.on("craft:done", e => {
    if(!open) return;
    const parts = [];
    for(const id in ((e && e.outputs) || {})) parts.push(e.outputs[id] + " " + itemName(id).toLowerCase());
    if(parts.length) say("made " + parts.join(", "), true);
    render();
  });
  bus.on("pickup:refused", e => {
    if(!open) return;
    say(e && e.reason === "burdened"
          ? "too heavy to pick that up - hold " + keyCap(items.grabKey || "control") + " to take it anyway"
          : "no room in the pack for that", false);
    render();
  });

  registerScreen({
    id: "pack", label: "Pack", key: KEY_PACK,
    isOpen: () => open,
    open: () => setOpen(true, "pack"),
    close: () => setOpen(false)
  });

  paintSelection();

  return {
    name: "pack",
    tick(){
      /* The backstop, and the only continuous things here: walking up to a
         workbench fires no event, and a station's progress bar moves on its
         own. Nothing the player DID waits for this. */
      if(open && state.tick % 6 === 0) render();
    },
    api: {
      toggle(which){ setOpen(!open, which); },
      isOpen(){ return open; },
      side(){ return side; },
      rows(){ return packRows(items); },
      totals(){ return packTotals(items); },
      usesItemsApi(){ return canDoCraft(); },
      craftedViaApi(){ return usedApi; },
      craft(id){ const r = RECIPES[id]; return r ? doCraft(r) : false; },
      drop(id, n){ return doDrop(id, n); },
      /* the bench, for tests and for anything that wants to drive it */
      bench(){ return benchState(); },
      benchAdd(id, n = 1){ const ok = benchAdd(id, n); render(); return ok; },
      benchClear(){ clearBench(); render(); },
      layOut(id){ const r = RECIPES[id]; if(r){ layOut(r); render(); } return !!r; },
      match(){ return benchMatch(benchState()); },
      chose(){ return chosen(benchMatch(benchState())); },
      cyclePick
    }
  };
}

/* systems.js registers this as createCraft; the screen it makes is the pack,
   and the bench is one of its two halves. */
export { createPack as createCraft };
