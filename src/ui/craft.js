/* The crafting screen (C). LANE E (ui).

   Reads lane F's recipe table and lane C's published items API, and nothing
   else. It shows every recipe in the game at once, because the recipe list IS
   the tech tree (docs/GAME_DESIGN.md section 3) and a player who cannot see
   what a workbench would buy them has no reason to haul the wood for one.

   Two rules this screen holds itself to:

     - it never says "ready" for something that would fail. Station, tool,
       every input, and the room left in the pack are all checked before a
       row goes green, and the row says which one is missing when it is not.
     - it does not move under the cursor. The rows are built once and only
       their text and colour change afterwards, so a count ticking up while
       you read never shifts the thing you were about to click.

   Crafting goes through items.craft(recipeId, station) when lane C has landed
   it. Until then there is a hand-only fallback here that takes the inputs and
   adds the outputs itself, all-or-nothing: a craft that cannot complete puts
   back everything it took, because a screen that eats four fibre and gives
   nothing is worse than one that refuses. Station recipes are never faked -
   they say so instead. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { RECIPES, RECIPE_IDS, HAND, recipesAt } from "../content/recipes.js";
import { itemData } from "../content/items.js";
import { BUILDINGS } from "../content/buildings.js";

/* A pack filled to exactly its limit must not read as over: masses are
   fractional kilograms and the inventory uses the same slack. */
const EPS = 1e-9;

export function createCraft(world, items, build){
  if(typeof document === "undefined" || !items || !items.inventory){
    return { name: "craft" };
  }

  const inv = items.inventory;

  /* ------------------------------------------------------------- data --- */

  function def(id){
    const d = itemData(id);
    if(d) return d;
    return (items.itemDef && items.itemDef(id)) || null;
  }
  function itemName(id){ const d = def(id); return d ? d.name : id; }
  function itemMass(id){
    /* the inventory weighs things with lane C's registry, so this must too */
    if(items.itemDef){ const d = items.itemDef(id); if(d && d.mass > 0) return d.mass; }
    const d = itemData(id);
    return d ? d.mass : 0;
  }
  function itemCol(id){ const d = def(id); return d && d.col ? d.col : "#8a7c6c"; }
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

  const canCraftApi = () => typeof items.craft === "function";
  const canPlace = () => !!(build && typeof build.place === "function");

  /* Which stations the player is standing at. Null means "nobody can tell
     us yet" - lane C's nearbyStations() and lane B's placement are both
     still to come - and that is reported as such rather than guessed. */
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
      if(build && typeof build.structuresNear === "function"){
        const p = state.player;
        const near = build.structuresNear(p.x, p.y, 40) || [];
        const set = new Set();
        for(const s of near) set.add(typeof s === "string" ? s : (s && (s.defId || s.id)));
        return set;
      }
    } catch(err){ /* a lane mid-landing must not take the screen down */ }
    return null;
  }

  /* ----------------------------------------------------- craftability --- */

  /* Lane C's own verdict, once it has one. It knows where the player is
     standing and we do not, so when it answers it wins - we keep our own
     checks only to explain a refusal in words. */
  function laneCVerdict(r){
    if(typeof items.canCraft !== "function") return null;
    try {
      const res = items.canCraft(r.id, r.station);
      if(res === true || res === false) return { ok: res, why: null };
      if(res && typeof res === "object" && "ok" in res){
        return { ok: !!res.ok, why: (typeof res.reason === "string" && res.reason) ||
                                    (typeof res.why === "string" && res.why) || null };
      }
    } catch(err){ /* mid-landing lane: fall back to our own reading */ }
    return null;
  }

  /* Every reason this recipe cannot be made right now, first one wins.
     Null means "nothing here says no". */
  function localCheck(r, here){
    const inputs = r.inputs || {};
    const outputs = r.outputs || {};

    /* station */
    if(r.station !== HAND){
      if(here === null){
        return { can:false, kind:"gate",
                 why: canPlace() ? "no " + stationName(r.station).toLowerCase() + " here"
                                 : "stations are not in this build yet" };
      }
      if(!here.has(r.station)){
        return { can:false, kind:"gate",
                 why: "stand at a " + stationName(r.station).toLowerCase() };
      }
    }

    /* tool: required, never consumed */
    if(r.tool && !inv.has(r.tool, 1)){
      return { can:false, kind:"tool", why: "needs a " + itemName(r.tool).toLowerCase() };
    }

    /* inputs */
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

    /* room in the pack, counting the inputs that leave it first */
    let dm = 0;
    for(const id in inputs) dm -= inputs[id] * itemMass(id);
    for(const id in outputs) dm += outputs[id] * itemMass(id);
    if(inv.carriedMass() + dm > inv.capacity() + EPS){
      return { can:false, kind:"mass", why: "pack too full for the result" };
    }

    /* the mechanic itself */
    if(!canCraftApi() && r.station !== HAND){
      return { can:false, kind:"gate", why:"station crafting is not in this build yet" };
    }

    return null;
  }

  /* One place decides whether a recipe can be made, and the click handler
     asks the same function the display did - so what you see is what runs. */
  function evaluate(r, here){
    const v = laneCVerdict(r);
    const local = localCheck(r, here);
    if(v && v.ok) return { can:true, kind:"ok", why:"ready" };
    if(v && !v.ok){
      return { can:false, kind: local ? local.kind : "gate",
               why: v.why || (local ? local.why : "not craftable here") };
    }
    if(local) return { can:false, kind:local.kind, why:local.why };
    return { can:true, kind:"ok", why:"ready" };
  }

  /* ---------------------------------------------------------- crafting --- */

  /* Hand-only, and all-or-nothing. Used until items.craft() exists. */
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
        /* undo: pull the partial output back out, then the inputs go back in.
           Both fit by construction - the mass was ours a moment ago. */
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
    for(const id in (r.outputs||{})) parts.push((r.outputs[id]) + " " + itemName(id).toLowerCase());
    return parts.join(", ");
  }

  function doCraft(r){
    const ev = evaluate(r, stationsHere());
    if(!ev.can){ say(ev.why, false); return false; }

    let ok = false, msg = null;
    if(canCraftApi()){
      try {
        const res = items.craft(r.id, r.station);
        /* lane C may return a boolean, a result object, or nothing at all */
        if(res === false) ok = false;
        else if(res && typeof res === "object" && "ok" in res){ ok = !!res.ok; msg = res.reason || res.msg || null; }
        else ok = true;
        usedApi = true;
      } catch(err){ ok = false; msg = "crafting failed"; }
    } else {
      const out = fallbackCraft(r);
      ok = out.ok; msg = out.msg;
    }

    say(ok ? ("made " + craftedLabel(r)) : (msg || "could not make that"), ok);
    render();
    return ok;
  }

  /* Whether anything went through lane C's API this session - the footer
     says which path is live so a tester is never guessing. */
  let usedApi = false;

  /* --------------------------------------------------------------- DOM --- */

  const host = document.createElement("div");
  host.id = "craft";
  host.className = "panel";
  host.style.display = "none";
  document.body.appendChild(host);

  const head = document.createElement("div");
  head.className = "ctitle";
  head.textContent = "CRAFTING";
  host.appendChild(head);

  const msg = document.createElement("div");
  msg.className = "cmsg";
  msg.textContent = "";
  host.appendChild(msg);

  const list = document.createElement("div");
  list.className = "clist";
  host.appendChild(list);

  const detail = document.createElement("div");
  detail.className = "cdetail";
  host.appendChild(detail);

  const foot = document.createElement("div");
  foot.className = "cfoot";
  host.appendChild(foot);

  /* One row per recipe, built once. Nothing below ever creates or removes a
     node again - only textContent and className change. */
  const rows = [];

  function el(tag, cls, parent, text){
    const n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    if(parent) parent.appendChild(n);
    return n;
  }

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
        el("i", "csw", chip).style.background = itemCol(id);
        const txt = el("span", "ctxt", chip, "");
        chips.push({ id, need: r.inputs[id], txt, chip });
      }
      if(!chips.length) el("span", "cnone", line2, "no materials");

      const line3 = el("div", "ctool", row);
      const line4 = el("div", "cout", row);

      const outParts = [];
      for(const id in (r.outputs||{})){
        outParts.push(r.outputs[id] + " " + itemName(id).toLowerCase());
      }
      let outMass = 0;
      for(const id in (r.outputs||{})) outMass += r.outputs[id] * itemMass(id);
      line4.textContent = "makes " + outParts.join(", ") +
                          "  ·  " + outMass.toFixed(1) + " kg  ·  " + r.time + " s";

      const idx = rows.length;
      row.addEventListener("mousemove", () => { if(sel !== idx){ sel = idx; paintSelection(); } });
      row.addEventListener("click", () => { sel = idx; paintSelection(); doCraft(r); });

      rows.push({ r, row, stat, chips, tool: line3, section: sec, avail: savail, station: st });
    }
  }

  let open = false;
  let sel = 0;

  /* ------------------------------------------------------------ render --- */

  function say(text, good){
    msg.textContent = text || "";
    msg.className = "cmsg" + (text ? (good ? " good" : " bad") : "");
  }

  function paintSelection(){
    for(let i=0;i<rows.length;i++){
      rows[i].row.classList.toggle("sel", i === sel);
    }
    const r = rows[sel] ? rows[sel].r : null;
    detail.textContent = r ? (r.note || "") : "";
  }

  function scrollSelectionIntoView(){
    const row = rows[sel] && rows[sel].row;
    if(row && typeof row.scrollIntoView === "function") row.scrollIntoView({ block:"nearest" });
  }

  function render(){
    if(!open) return;
    const here = stationsHere();

    /* section headings: what this station's rows are gated on */
    const seen = Object.create(null);
    for(const row of rows){
      if(seen[row.station]) continue;
      seen[row.station] = true;
      let txt = "";
      if(row.station === HAND) txt = "anywhere, nothing built";
      else if(here === null) txt = canPlace() ? "none nearby" : "not in this build yet";
      else txt = here.has(row.station) ? "you are here" : "not nearby";
      if(row.avail.textContent !== txt) row.avail.textContent = txt;
      row.avail.className = "cavail" + (row.station === HAND || (here && here.has(row.station)) ? " on" : "");
    }

    for(const row of rows){
      const r = row.r;
      const ev = evaluate(r, here);

      row.row.className = "crow" + (ev.can ? " can" : " cant") +
                          (row === rows[sel] ? " sel" : "");
      row.stat.textContent = ev.can ? "ready — enter" : ev.why;
      row.stat.className = "cstat " + (ev.can ? "ok" : (ev.kind === "gate" ? "gate" : "miss"));

      for(const c of row.chips){
        const have = inv.count(c.id);
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

    foot.textContent = "q/e select · enter craft · click a row · c closes" +
                       (canCraftApi() ? "" : "   — hand recipes only in this build");
    paintSelection();
  }

  function move(d){
    if(!rows.length) return;
    sel = (sel + d + rows.length) % rows.length;
    paintSelection();
    scrollSelectionIntoView();
  }

  function setOpen(v){
    open = !!v;
    host.style.display = open ? "block" : "none";
    if(open){ say("", true); render(); scrollSelectionIntoView(); }
  }

  /* --------------------------------------------------------------- keys --- */

  bus.on("input:key", e => {
    if(!e.down) return;
    if(state.paused) return;                 /* the pause menu owns the keyboard */
    if(e.key === "c"){ setOpen(!open); return; }
    if(!open) return;
    if(e.key === "q"){ move(-1); return; }
    if(e.key === "e"){ move(1); return; }
    if(e.key === "enter"){ const row = rows[sel]; if(row) doCraft(row.r); return; }
  });

  /* An inventory change while the screen is up must show immediately, or a
     chunk picked up under an open screen looks like it did nothing. */
  bus.on("inv:changed", () => { if(open) render(); });

  paintSelection();

  return {
    name: "craft",
    tick(){
      /* the pack is event-driven, but the station under your feet is not */
      if(open && state.tick % 6 === 0) render();
    },
    api: {
      toggle(){ setOpen(!open); },
      isOpen(){ return open; },
      /* which path a craft actually took, for tests and for the reporter */
      usesItemsApi(){ return canCraftApi(); },
      craftedViaApi(){ return usedApi; },
      craft(id){ const r = RECIPES[id]; return r ? doCraft(r) : false; }
    }
  };
}
