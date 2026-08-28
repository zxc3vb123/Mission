/* THE PACK - everything you are carrying, and everything you can make, on
   one screen. LANE H (ui). Opens on I, or on C with the crafting side lit.

   This file used to be the crafting list alone. The owner asked twice for one
   screen instead: the hotbar shows eight slots, the pack holds more than
   eight kinds of thing, and deciding what to make and deciding what to throw
   out are the same decision - you make room for the axe by dumping the soil.
   Splitting them across two screens made the player hold the numbers in their
   head. So the two panes sit side by side and share one load bar.

   THE PACK PANE answers three questions that nothing else in the game did:
     - what is actually in there, all of it, not the first eight kinds
     - what each stack WEIGHS, because the limit is mass and not slots, and a
       stack of forty fibre is lighter than one rock
     - what to drop. Every row can be thrown on the ground.

   Throwing out goes through lane C's items.drop(id, n), which spawns real
   chunks where the clonk stands and returns how many actually left. This
   screen never calls inventory.take() itself: taking without spawning would
   destroy matter, and conservation is a law here (docs/GAME_DESIGN.md 2),
   not a nicety. The count reported is always drop()'s return, never the
   number we asked for.

   THE CRAFTING PANE holds itself to two rules:
     - it never says "ready" for something that would fail. Lane C's
       canCraft() is the verdict - it knows where the player is standing and
       whether the result would fit - and our own reading is kept only to say
       WHICH thing is missing, in our words.
     - it does not move under the cursor. Recipe rows are built once and only
       their text and colour change, so a count ticking up while you read
       never shifts the row you were about to click. The pack rows cannot be
       built once - stacks appear and vanish - so they are ordered by lane F's
       table order instead of by weight, which means dropping something never
       reorders what is left. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { RECIPES, RECIPE_IDS, HAND, recipesAt } from "../content/recipes.js";
import { ITEM_IDS, itemData } from "../content/items.js";
import { BUILDINGS } from "../content/buildings.js";
import { KEY_PACK, KEY_CRAFT, KEY_PREV, KEY_NEXT, KEY_CONFIRM, KEY_SWITCH,
         keyCap } from "./keys.js";
import { registerScreen } from "./screens.js";
import { itemIcon } from "./icon.js";

/* A pack filled to exactly its limit must not read as over: masses are
   fractional kilograms and the inventory uses the same slack. */
const EPS = 1e-9;

/* Stable display order for pack rows: lane F's table order, so a stack's
   position never depends on how much of it you have. */
const ORDER = Object.create(null);
for(let i=0;i<ITEM_IDS.length;i++) ORDER[ITEM_IDS[i]] = i;

function unitMass(items, id){
  /* the inventory weighs things with lane C's registry, so this must too */
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
function swatch(items, id){
  const d = itemData(id) || (items && items.itemDef ? items.itemDef(id) : null);
  return d && d.col ? d.col : "#8a7c6c";
}

/* ---- pure, so tools/tests/ui.test.js can read the pack without a DOM ---- */

/* One row per kind carried, heaviest-stack figures included. Ordered by the
   item table, NOT by weight: an order that depends on the counts would
   reshuffle itself under the cursor every time you dropped something. */
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
      id,
      name: displayName(items, id),
      col: swatch(items, id),
      count: n,
      unit,
      mass: n * unit,
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

/* The load line: what the whole pack weighs against what it holds. */
export function packTotals(items){
  if(!items || !items.inventory){
    return { carried:0, capacity:0, free:0, pct:0, burdened:false, full:false, kinds:0 };
  }
  const inv = items.inventory;
  const carried = inv.carriedMass(), capacity = inv.capacity();
  const rows = packRows(items);
  return {
    carried, capacity,
    free: inv.freeMass ? inv.freeMass() : Math.max(0, capacity - carried),
    pct: capacity > 0 ? Math.min(100, carried / capacity * 100) : 0,
    burdened: inv.encumbrance ? inv.encumbrance() > 0 : false,
    full: inv.isFull ? inv.isFull() : false,
    kinds: rows.length
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
  const itemCol  = id => swatch(items, id);

  function stationName(id){
    if(id === HAND) return "By hand";
    const b = BUILDINGS[id];
    return b ? b.name : id;
  }

  /* Every station that has recipes, hand first, in table order. */
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

  /* Which stations the player may work at. Lane C's nearbyStations() is the
     answer when it exists - it knows where the clonk is standing and we do
     not. Null means nobody can tell us yet, which is reported as such rather
     than guessed. Note "hand" is always in that set: your hands are a station
     you always have. */
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

  /* A building takes def.time seconds to raise after it is placed, and
     cannot be crafted at until it is finished. Without this the screen says
     "not nearby" while the player is standing on the workbench they just
     put down, which reads as a bug rather than as waiting. */
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

  /* Lane C's verdict wins where it has one; ours only supplies the wording,
     because `missing` is structured on purpose so the sentence stays ours. */
  function laneCVerdict(r){
    if(!canCraftApi()) return null;
    try {
      const res = items.canCraft(r.id, r.station);
      if(res === true) return { ok:true };
      if(res === false) return { ok:false };
      if(res && typeof res === "object" && "ok" in res){
        return {
          ok: !!res.ok,
          why: (typeof res.reason === "string" && res.reason) ||
               (typeof res.why === "string" && res.why) || null,
          missing: Array.isArray(res.missing) ? res.missing : null,
          needsStation: !!res.needsStation,
          needsTool: !!res.needsTool,
          busy: !!res.busy,
          /* kilograms over the limit, on a mass refusal only */
          overBy: typeof res.overBy === "number" ? res.overBy : null
        };
      }
    } catch(err){ /* mid-landing lane: fall back to our own reading */ }
    return null;
  }

  /* Our own reading, first refusal wins. Null means nothing here says no. */
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
      if(short > 0){
        shortKinds++;
        if(!firstShort) firstShort = { id, short };
      }
    }
    if(firstShort){
      let why = "need " + firstShort.short + " more " + itemName(firstShort.id).toLowerCase();
      if(shortKinds > 1) why += " +" + (shortKinds-1) + " other";
      return { can:false, kind:"short", why };
    }

    /* room in the pack, counting the inputs that leave it first. Rope is the
       real case: the fibre weighs less than the rope it becomes. */
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

  /* Our wording for lane C's structured `missing`, so a refusal names the
     thing rather than saying "missing materials". */
  /* A STATION DRAWS FROM ITS OWN HOPPER AS WELL AS YOUR PACK, so a shortfall
     is a statement about the situation and not about one container. Lane C
     sends `have` already summed, with `inStore` and `inPack` beside it, and
     saying "you have 2 wood" to somebody carrying none would read as the
     screen being broken. So when any of it is in the station, say so. */
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

  /* One place decides, and the click handler asks the same function the
     display did - so what you see is what runs. */
  function evaluate(r, here){
    const v = laneCVerdict(r);
    const local = localCheck(r, here);
    if(v && v.ok) return { can:true, kind:"ok", why:"ready", missing:null };
    if(v && !v.ok){
      /* BUSY IS CHECKED FIRST, and deliberately. A station takes one job at a
         time, and a busy one arrives with needsStation unset - so falling
         through to the station wording would tell a player who is standing at
         their kiln to go and build a kiln. They have one. It is working. */
      if(v.busy) return { can:false, kind:"busy", why: v.why || "still working" };
      const kind = v.needsStation ? "gate"
                 : (v.needsTool ? "tool"
                 : (v.overBy > 0 ? "mass" : (local ? local.kind : "gate")));
      /* Lane C hands over the number behind every refusal that has one, so a
         "no room" reads as the amount to put down rather than as a mood. */
      const over = v.overBy > 0 ? (v.overBy.toFixed(1) + " kg too heavy - drop something first") : null;
      const why = missingWords(v.missing) || over || v.why ||
                  (local ? local.why : "not craftable here");
      return { can:false, kind, why, missing: v.missing || null };
    }
    if(local) return { can:false, kind:local.kind, why:local.why, missing:null };
    return { can:true, kind:"ok", why:"ready", missing:null };
  }

  /* ---------------------------------------------------------- crafting --- */

  /* Hand-only, all-or-nothing. Used only if lane C's craft() is missing. */
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
          ok = !!res.ok;
          msg = res.reason || res.msg || null;
          timed = !!res.timed;
        } else ok = true;
        usedApi = true;
      } catch(err){ ok = false; msg = "crafting failed"; }
    } else {
      const out = fallbackCraft(r);
      ok = out.ok; msg = out.msg;
    }

    /* MAKING IS INSTANT; PROCESSING TAKES TIME. A kiln or a forge returns
       started-not-finished, with an empty outputs, and the goods wait inside
       the station until you walk back into it. Saying "made charcoal" there
       would be a lie for ninety seconds and would send the player looking in
       a pack that has nothing new in it. The real "made X" comes from the
       craft:done event below, whenever that turns out to be. */
    if(ok && timed){
      say(stationName(r.station).toLowerCase() + " started - " + craftedLabel(r) +
          " when it finishes, and it keeps working if you walk away", true);
    } else {
      say(ok ? ("made " + craftedLabel(r)) : (msg || "could not make that"), ok);
    }
    render();
    return ok;
  }

  /* ------------------------------------------------------ throwing out --- */

  /* Never inventory.take(). Lane C's drop() spawns the chunks where the
     clonk stands and returns how many actually left; that return is what we
     report, because asking for ten and getting three should say three. */
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
  /* A screen you can only shut by remembering which key opened it is a trap.
     The key still works and the footer still names it; this is for everyone
     who never learned it. */
  const closeX = el("span", "pclose", head, "×");
  closeX.title = "close (" + keyCap(KEY_PACK).toLowerCase() + " or esc)";
  closeX.addEventListener("click", () => setOpen(false));

  const msg = el("div", "cmsg", host, "");

  const cols = el("div", "pcols", host);

  /* ---- left: what you are carrying ---- */
  const packCol = el("div", "pcol ppack", cols);
  const packHead = el("div", "chead", packCol);
  el("span", "cstation", packHead, "CARRYING");
  const packCount = el("span", "cavail", packHead, "");

  const loadWrap = el("div", "pload", packCol);
  const loadBar = el("div", "plbar", loadWrap);
  const loadFill = el("i", null, loadBar);
  const loadNote = el("div", "plnote", loadWrap, "");

  const packList = el("div", "plist", packCol);
  const packEmpty = el("div", "pempty", packCol,
    "Your pack is empty. Sticks, fibrous plants and loose rock lie on the " +
    "surface and need no tool - walk over them.");

  /* ---- right: what you can make ---- */
  const craftCol = el("div", "pcol pcraft", cols);
  const list = el("div", "clist", craftCol);
  const detail = el("div", "cdetail", craftCol);

  const foot = el("div", "cfoot", host);

  /* Recipe rows, built once. Nothing below creates or removes one again. */
  const rows = [];
  for(const st of stations){
    const group = recipesAt(st);
    if(!group.length) continue;

    const sec = el("div", "csec", list);
    const sh = el("div", "chead", sec);
    el("span", "cstation", sh, stationName(st));
    const savail = el("span", "cavail", sh, "");

    for(const r of group){
      const row = el("div", "crow", sec);
      row.dataset.recipe = r.id;

      const line1 = el("div", "cline1", row);
      el("span", "cname", line1, r.name);
      const stat = el("span", "cstat", line1, "");

      const line2 = el("div", "cin", row);
      const chips = [];
      for(const id in (r.inputs||{})){
        const chip = el("span", "chip", line2);
        chip.appendChild(itemIcon(id, 13));
        const txt = el("span", "ctxt", chip, "");
        chips.push({ id, need: r.inputs[id], txt, chip });
      }
      if(!chips.length) el("span", "cnone", line2, "no materials");

      const line3 = el("div", "ctool", row);
      const line4 = el("div", "cout", row);
      /* the one genuinely continuous thing on this screen */
      const prog = el("div", "cprog", row);
      const progFill = el("i", null, prog);
      prog.style.display = "none";

      const outParts = [];
      let outMass = 0;
      for(const id in (r.outputs||{})){
        outParts.push(r.outputs[id] + " " + itemName(id).toLowerCase());
        outMass += r.outputs[id] * itemMass(id);
      }
      line4.textContent = "makes " + outParts.join(", ") +
                          "  ·  " + outMass.toFixed(1) + " kg  ·  " + r.time + " s";

      const idx = rows.length;
      row.addEventListener("mousemove", () => {
        if(side !== "craft" || csel !== idx){ side = "craft"; csel = idx; paintSelection(); }
      });
      row.addEventListener("click", () => { side = "craft"; csel = idx; paintSelection(); doCraft(r); });

      rows.push({ r, row, stat, chips, tool: line3, prog, progFill,
                  section: sec, avail: savail, station: st });
    }
  }

  /* Pack rows are rebuilt only when the SET of things carried changes, so a
     count ticking up does not rebuild the node under your cursor. */
  const packNodes = Object.create(null);
  let packOrder = [];
  let packKey = "";

  function buildPackRows(rowsData){
    packList.innerHTML = "";
    for(const k in packNodes) delete packNodes[k];
    packOrder = [];

    for(const d of rowsData){
      const id = d.id;
      const row = el("div", "prow", packList);
      row.dataset.item = id;

      const l1 = el("div", "pline1", row);
      l1.appendChild(itemIcon(id, 16));
      el("span", "pnm", l1, d.name);
      const ct = el("span", "pct", l1, "");
      const ms = el("span", "pms", l1, "");

      const l2 = el("div", "pline2", row);
      const share = el("div", "pshare", l2);
      const shareFill = el("i", null, share);
      const ea = el("span", "pea", l2, "");

      const btns = el("div", "pbtns", row);
      const mk = (label, n, title) => {
        const b = el("span", "pbtn", btns, label);
        b.title = title;
        b.addEventListener("click", ev => { ev.stopPropagation(); doDrop(id, n); });
        return b;
      };
      mk("drop 1", 1, "throw one on the ground");
      mk("10", 10, "throw ten on the ground");
      mk("all", "all", "throw the whole stack on the ground");

      const idx = packOrder.length;
      row.addEventListener("mousemove", () => {
        if(side !== "pack" || psel !== idx){ side = "pack"; psel = idx; paintSelection(); }
      });

      packNodes[id] = { row, ct, ms, ea, shareFill, btns };
      packOrder.push(id);
    }
  }

  let open = false;
  let side = "craft";        /* which pane the keys act on */
  let csel = 0, psel = 0;

  /* ------------------------------------------------------------ render --- */

  function say(text, good){
    msg.textContent = text || "";
    msg.className = "cmsg" + (text ? (good ? " good" : " bad") : "");
  }

  function paintSelection(){
    for(let i=0;i<rows.length;i++){
      rows[i].row.classList.toggle("sel", side === "craft" && i === csel);
    }
    for(let i=0;i<packOrder.length;i++){
      const n = packNodes[packOrder[i]];
      if(n) n.row.classList.toggle("sel", side === "pack" && i === psel);
    }
    packCol.classList.toggle("focus", side === "pack");
    craftCol.classList.toggle("focus", side === "craft");

    const r = (side === "craft" && rows[csel]) ? rows[csel].r : null;
    if(r){
      detail.textContent = r.note || "";
    } else if(side === "pack"){
      const id = packOrder[psel];
      const d = id ? itemData(id) : null;
      detail.textContent = d && d.use ? d.use : "";
    } else {
      detail.textContent = "";
    }
  }

  function renderPack(){
    const data = packRows(items);
    const key = data.map(d => d.id).join(",");
    if(key !== packKey){
      packKey = key;
      buildPackRows(data);
      if(psel >= packOrder.length) psel = Math.max(0, packOrder.length - 1);
    }
    packEmpty.style.display = data.length ? "none" : "block";

    for(const d of data){
      const n = packNodes[d.id];
      if(!n) continue;
      const ct = "x" + d.count;
      const ms = d.mass.toFixed(1) + " kg";
      const ea = d.unit.toFixed(2) + " kg each";
      if(n.ct.textContent !== ct) n.ct.textContent = ct;
      if(n.ms.textContent !== ms) n.ms.textContent = ms;
      if(n.ea.textContent !== ea) n.ea.textContent = ea;
      n.shareFill.style.width = (d.share * 100).toFixed(1) + "%";
      n.btns.classList.toggle("off", !canDrop());
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
      note = "Heavy: you walk slower, and things stop being picked up for you. " +
             "Hold " + keyCap(items.grabKey || "control") + " to take them anyway. " +
             t.free.toFixed(1) + " kg spare.";
    } else {
      note = t.free.toFixed(1) + " kg spare.";
    }
    if(loadNote.textContent !== note) loadNote.textContent = note;
    loadNote.className = "plnote" + (t.full ? " bad" : (t.burdened ? " warn" : ""));

    const kinds = t.kinds + (t.kinds === 1 ? " kind" : " kinds");
    if(packCount.textContent !== kinds) packCount.textContent = kinds;
  }

  /* Jobs running at the stations we are standing at, keyed by recipe. */
  function jobsHere(){
    const by = Object.create(null);
    if(typeof items.craftProgress !== "function") return by;
    try {
      for(const j of items.craftProgress() || []){
        if(j && j.recipeId) by[j.recipeId] = j;
      }
    } catch(err){ /* a lane mid-landing must not take the screen down */ }
    return by;
  }

  function renderCraft(){
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

      row.row.className = "crow" + (job ? " busy" : (ev.can ? " can" : " cant")) +
                          (side === "craft" && row === rows[csel] ? " sel" : "");

      if(job){
        const left = Math.max(0, Math.round((job.ticksLeft || 0) / 36));
        row.stat.textContent = "working - " + left + " s left";
        row.stat.className = "cstat busy";
        row.prog.style.display = "block";
        row.progFill.style.width = Math.round((job.progress || 0) * 100) + "%";
      } else {
        row.stat.textContent = ev.can
          ? ("ready - " + keyCap(KEY_CONFIRM).toLowerCase() +
             (fromStore ? " (from the station's store)" : ""))
          : ev.why;
        row.stat.className = "cstat " +
          (ev.can ? "ok" : (ev.kind === "gate" || ev.kind === "busy" ? "gate" : "miss"));
        if(row.prog.style.display !== "none"){
          row.prog.style.display = "none";
          row.progFill.style.width = "0%";
        }
      }

      /* A chip counts what the craft could DRAW ON, which since lane C's
         hoppers landed is the pack and the station's store together - not
         what is on your back. Anything else shows "0/4 wood" beside a row
         that says ready, and the player believes the screen over the game. */
      const missMap = Object.create(null);
      for(const mm of (ev.missing || [])) if(mm && mm.id) missMap[mm.id] = mm;
      let fromStore = false;
      for(const c of row.chips){
        const inPack = inv.count(c.id);
        const m = missMap[c.id];
        const have = m ? (m.have | 0) : (ev.can ? Math.max(c.need, inPack) : inPack);
        if(have > inPack) fromStore = true;
        const t = have + "/" + c.need + " " + itemName(c.id).toLowerCase();
        if(c.txt.textContent !== t) c.txt.textContent = t;
        c.chip.className = "chip " + (have >= c.need ? "ok" : "miss");
      }

      if(r.tool){
        const has = inv.has(r.tool, 1);
        row.tool.textContent = "tool: " + itemName(r.tool).toLowerCase() +
                               (has ? " (held, not used up)" : " (needed, not used up)");
        row.tool.className = "ctool " + (has ? "ok" : "miss");
      } else {
        row.tool.textContent = "tool: none";
        row.tool.className = "ctool dim";
      }
    }
  }

  function render(){
    if(!open) return;
    renderPack();
    renderCraft();
    foot.textContent =
      keyCap(KEY_SWITCH).toLowerCase() + " swap side · " +
      keyCap(KEY_PREV).toLowerCase() + "/" + keyCap(KEY_NEXT).toLowerCase() + " select · " +
      keyCap(KEY_CONFIRM).toLowerCase() + " " +
        (side === "pack" ? "throw one out" : "craft") + " · " +
      keyCap(KEY_PACK).toLowerCase() + " closes" +
      (canDoCraft() ? "" : "   - hand recipes only in this build") +
      (canDrop() ? "" : "   - dropping is not in this build yet");
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
      ? (packNodes[packOrder[psel]] && packNodes[packOrder[psel]].row)
      : (rows[csel] && rows[csel].row);
    if(node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block:"nearest" });
  }

  function confirm(){
    if(side === "pack"){
      const id = packOrder[psel];
      if(id) doDrop(id, 1);
    } else {
      const row = rows[csel];
      if(row) doCraft(row.r);
    }
  }

  function setOpen(v, which){
    open = !!v;
    host.style.display = open ? "block" : "none";
    if(open){
      if(which) side = which;
      say("", true);
      render();
      scrollSelectionIntoView();
    }
  }

  /* --------------------------------------------------------------- keys --- */

  bus.on("input:key", e => {
    if(!e.down) return;
    if(state.paused) return;                 /* the pause menu owns the keyboard */
    if(e.key === KEY_PACK){ setOpen(!open, "pack"); return; }
    if(e.key === KEY_CRAFT){ setOpen(!open, "craft"); return; }
    if(!open) return;
    if(e.key === KEY_SWITCH){ side = side === "pack" ? "craft" : "pack"; render(); scrollSelectionIntoView(); return; }
    if(e.key === KEY_PREV){ move(-1); return; }
    if(e.key === KEY_NEXT){ move(1); return; }
    if(e.key === KEY_CONFIRM){ confirm(); return; }
  });

  /* EVENT-DRIVEN, NOT POLLED. The owner's word for the old screen was
     "laggy": it redrew on state.tick % 6, which at a fixed 36 Hz is a redraw
     every sixth of a second, so a chunk picked up under an open screen sat
     there looking ignored for 167 ms. Nothing was slow - it was reacting to
     a timer rather than to the thing that happened. Everything that changes
     the pack already announces itself, so redraw on the announcement. */
  for(const ev of ["inv:changed", "item:equipped", "item:dropped", "job:started"]){
    bus.on(ev, () => { if(open) render(); });
  }
  /* A timed station finishing is the only "made X" a kiln or a forge ever
     earns, and it can arrive long after the click - or after the player has
     walked away and come back for it. */
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
      /* The backstop, and the only genuinely continuous thing on this screen:
         walking up to a workbench fires no event, and a lane that moves the
         pack's capacity directly fires none either. Correct and occasionally
         late beats wrong and instant - but nothing the player DID waits for
         this, because the events above already redrew for that. */
      if(open && state.tick % 6 === 0) render();
    },
    api: {
      toggle(which){ setOpen(!open, which); },
      isOpen(){ return open; },
      side(){ return side; },
      rows(){ return packRows(items); },
      totals(){ return packTotals(items); },
      /* which path a craft actually took, for tests and the reporter */
      usesItemsApi(){ return canDoCraft(); },
      craftedViaApi(){ return usedApi; },
      craft(id){ const r = RECIPES[id]; return r ? doCraft(r) : false; },
      drop(id, n){ return doDrop(id, n); }
    }
  };
}

/* systems.js registers this as createCraft; the screen it makes is the pack,
   and crafting is one of its two panes. Kept as an alias so the registration
   line stays a registration line. */
export { createPack as createCraft };
