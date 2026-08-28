/* THE BUILD MENU (B). LANE H (ui).

   Lane C finished placement hours before this existed and nobody could reach
   it. `build.api.ghost(defId)` arms a ghost and a left click puts the thing
   down, but no key called ghost() and no button offered it, so an entire
   working system - the preview, the reach, the rising build, the refusal
   reasons, deconstruction - was invisible. The owner asked for "sawmills I
   build from planks and bricks and put in the ground" while that was already
   true and unusable. This file is the entry point, and nothing more: every
   mechanic below it is lane C's and already worked.

   FOUR THINGS THAT ONLY MAKE SENSE IF SOMEONE TELLS YOU, so this screen tells
   you rather than leaving them to be reported as bugs:

     - A RED GHOST WITH NO WORDS IS A MYSTERY. canPlace() returns a reason for
       every refusal and it was going nowhere, so it is printed at the cursor.
     - A PLACED BUILDING IS NOT A FINISHED ONE. It rises over def.time seconds
       and has() stays false until it is done, so "place a workbench, open
       crafting, be told you have no workbench" is the likeliest false bug
       report in the game. Anything rising gets a named progress bar.
     - REACH IS FINITE. "too far away" reads as broken if you did not know
       reach existed, so the menu says how far you can build from where you
       stand, in the same breath as arming the ghost.
     - LADDERS DO NOT DROP TO THE FLOOR. They fix to a wall, and a rope ladder
       hangs from something solid above, so they are placed where the cursor
       points. The row says so, because a ghost that does not fall to the
       ground looks broken to someone expecting it to.

   This screen never places anything itself. It arms lane C's ghost and gets
   out of the way; the click, the verdict and the materials are all theirs. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { mouse } from "../core/input.js";
import { BUILDINGS, BUILDING_IDS, buildMass } from "../content/buildings.js";
import { itemData } from "../content/items.js";
import { KEY_BUILD, keyCap } from "./keys.js";
import { registerScreen, closeOthers } from "./screens.js";
import { itemIcon } from "./icon.js";

/* ---- pure, so the suite can read the menu without a DOM ---- */

/* One row per building, with everything the player has to weigh: what it
   costs, whether they are carrying it, what that is in kilograms and trips,
   and what holds it up. Ordered by lane F's table, which is stage order. */
export function buildRows(items, build){
  const inv = items && items.inventory ? items.inventory : null;
  const cap = inv ? inv.capacity() : 0;
  return BUILDING_IDS.map(id => {
    const b = BUILDINGS[id];
    const cost = b.materials || {};
    const need = [];
    let haveAll = true;
    for(const iid in cost){
      const have = inv ? inv.count(iid) : 0;
      if(have < cost[iid]) haveAll = false;
      need.push({ id: iid, need: cost[iid], have,
                  name: (itemData(iid) || {}).name || iid,
                  col: (itemData(iid) || {}).col || "#8a7c6c" });
    }
    const kg = buildMass(id, itemData);
    const s = b.support || {};
    return {
      id, name: b.name, stage: b.stage, kg, time: b.time,
      trips: cap > 0 ? Math.max(1, Math.ceil(kg / cap)) : 0,
      need, haveAll,
      buildsAt: b.buildsAt,
      atCursor: !!(s.wall || s.anchor),   /* does not drop to the floor */
      climb: !!b.climb,
      canPlaceMech: !!(build && typeof build.place === "function")
    };
  });
}

/* Everything standing in the world that is not finished yet, with how far
   along it is. This is the answer to the false bug report. */
export function risingRows(build){
  if(!build || typeof build.all !== "function") return [];
  let all = [];
  try { all = build.all() || []; } catch(err){ return []; }
  const out = [];
  for(const s of all){
    if(!s || s.built) continue;
    const need = s.need > 0 ? s.need : 1;
    out.push({
      defId: s.defId,
      name: (BUILDINGS[s.defId] || {}).name || s.defId,
      progress: Math.max(0, Math.min(1, (s.progress || 0) / need)),
      secondsLeft: Math.max(0, Math.round((need - (s.progress || 0)) / 36))
    });
  }
  return out;
}

/* ------------------------------------------------------------------------ */

/* RIGHT MOUSE IS DECIDED IN ONE PLACE, and it is not here.

   Cancelling a ghost and firing the blast tool were two independent
   input:mouse listeners in two files, so a right click to cancel a misplaced
   ghost also cratered the ground you were about to build on. Both files are
   this lane's, so this is a decision rather than a negotiation - and the fix
   is not "each handler checks the other", because then the answer depends on
   which listener the bus happens to call first. Instead there is exactly one
   right-button handler in src/ui (hud.js), and it asks these two functions.

   The suite fails if a second file in this folder ever binds button 2. */
let armedRef = () => null;
let disarmRef = () => {};

/* The building the player is about to place, or null. */
export function ghostArmed(){
  try { return armedRef(); } catch(err){ return null; }
}
/* Put the ghost away. Safe to call when nothing is armed. */
export function cancelGhost(){
  try { disarmRef(); } catch(err){ /* nothing armed, or no build lane */ }
}

export function createBuildMenu(world, items, build){
  if(typeof document === "undefined") return { name: "buildmenu" };

  const el = (tag, cls, parent, text) => {
    const n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    if(parent) parent.appendChild(n);
    return n;
  };

  const canPlaceMech = () => !!(build && typeof build.place === "function");

  /* ---------------------------------------------------------- the panel --- */

  const host = document.createElement("div");
  host.id = "buildmenu";
  host.className = "panel";
  host.style.display = "none";
  document.body.appendChild(host);

  const head = el("div", "ptitle", host);
  el("span", "pttl", head, "BUILD");
  const headNote = el("span", "ptload", head, "");
  const closeX = el("span", "pclose", head, "×");
  closeX.title = "close (" + keyCap(KEY_BUILD).toLowerCase() + " or esc)";
  closeX.addEventListener("click", () => setOpen(false));

  const msg = el("div", "cmsg", host, "");
  const list = el("div", "clist", host);
  const foot = el("div", "cfoot", host, "");

  /* Rows built once; only text and colour change afterwards. */
  const rows = [];
  for(const d of buildRows(items, build)){
    const row = el("div", "crow", list);
    row.dataset.building = d.id;

    const l1 = el("div", "cline1", row);
    el("span", "cname", l1, d.name);
    const stat = el("span", "cstat", l1, "");

    const l2 = el("div", "cin", row);
    const chips = [];
    for(const n of d.need){
      const chip = el("span", "chip", l2);
      chip.appendChild(itemIcon(n.id, 13));
      const txt = el("span", "ctxt", chip, "");
      chips.push({ id: n.id, need: n.need, name: n.name, txt, chip });
    }
    if(!chips.length) el("span", "cnone", l2, "nothing");

    const l3 = el("div", "cout", row, "");
    const l4 = el("div", "ctool", row, "");

    row.addEventListener("click", () => arm(d.id));
    rows.push({ d, row, stat, chips, haul: l3, hint: l4 });
  }

  /* -------------------------------------------- the hint at the cursor --- */

  /* A refusal the player cannot read is a refusal they will call a bug. This
     floats at the cursor while a ghost is armed and says either what is
     wrong or that a click will place it. */
  const hint = document.createElement("div");
  hint.id = "ghosthint";
  hint.style.display = "none";
  document.body.appendChild(hint);

  /* ------------------------------------------------ what is going up ----- */

  const rise = document.createElement("div");
  rise.id = "rising";
  rise.className = "panel";
  rise.style.display = "none";
  document.body.appendChild(rise);

  let open = false;

  /* --------------------------------------------------------------- arm --- */

  function arm(id){
    if(!canPlaceMech()){ say("placing is not in this build yet", false); return false; }
    if(typeof build.ghost !== "function"){ say("placing is not in this build yet", false); return false; }
    const d = rows.find(r => r.d.id === id);
    if(d && !d.d.haveAll){
      /* Arm it anyway. Seeing the ghost refuse for a reason you can read is
         how you learn where a thing may go, and the materials line already
         says what is short. */
      say("you are short of materials - the ghost will still show you where it could go", false);
    } else {
      say("click in the world to place it" +
          (d && d.d.atCursor ? " - it goes where the cursor points, not on the floor below it" : ""), true);
    }
    build.ghost(id);
    /* Get out of the way: you cannot click the world through a panel. */
    setOpen(false);
    return true;
  }

  function disarm(){
    if(build && typeof build.clearGhost === "function") build.clearGhost();
    hint.style.display = "none";
  }

  function armed(){
    try {
      return (build && typeof build.ghostDef === "function") ? build.ghostDef() : null;
    } catch(err){ return null; }
  }

  /* -------------------------------------------------------------- draw --- */

  function say(text, good){
    msg.textContent = text || "";
    msg.className = "cmsg" + (text ? (good ? " good" : " bad") : "");
  }

  function render(){
    if(!open) return;
    for(const r of rows){
      const d = r.d;
      const inv = items.inventory;

      let haveAll = true;
      for(const c of r.chips){
        const have = inv.count(c.id);
        if(have < c.need) haveAll = false;
        const t = have + "/" + c.need + " " + c.name.toLowerCase();
        if(c.txt.textContent !== t) c.txt.textContent = t;
        c.chip.className = "chip " + (have >= c.need ? "ok" : "miss");
      }
      d.haveAll = haveAll;

      const gated = !canPlaceMech();
      const needsStation = d.buildsAt && d.buildsAt !== "hand" &&
                           !(build && typeof build.has === "function" && build.has(d.buildsAt));

      let why, cls;
      if(gated){ why = "not in this build yet"; cls = "gate"; }
      else if(needsStation){
        why = "needs a " + ((BUILDINGS[d.buildsAt] || {}).name || d.buildsAt).toLowerCase();
        cls = "gate";
      }
      else if(!haveAll){ why = "not enough materials"; cls = "miss"; }
      else { why = "click to place"; cls = "ok"; }
      if(r.stat.textContent !== why) r.stat.textContent = why;
      r.stat.className = "cstat " + cls;
      r.row.className = "crow " + (cls === "ok" ? "can" : "cant");

      const haul = d.kg + " kg" + (d.trips ? "  ·  " + d.trips +
                   (d.trips === 1 ? " backpack trip" : " backpack trips") : "") +
                   "  ·  " + d.time + " s to raise once it is down";
      if(r.haul.textContent !== haul) r.haul.textContent = haul;

      let h = d.atCursor
        ? "goes where the cursor points - it fixes to a wall or hangs from above, it does not drop to the floor"
        : "goes on solid ground under the cursor";
      if(d.climb) h += " · you can climb it";
      if(r.hint.textContent !== h) r.hint.textContent = h;
    }

    const reach = build && typeof build.reach === "number" ? build.reach : null;
    headNote.textContent = reach ? ("you can build within " + reach + " px of where you stand") : "";
    foot.textContent = "click a row to arm it, then click in the world · " +
                       "right mouse or " + keyCap(KEY_BUILD).toLowerCase() + " cancels · " +
                       keyCap(KEY_BUILD).toLowerCase() + " closes";
  }

  /* The cursor hint and the rising bars are the two genuinely continuous
     things here - the mouse moves and a building rises with no event behind
     either - so these redraw per tick while there is something to say. */
  function renderHint(){
    const id = armed();
    if(!id){
      if(hint.style.display !== "none") hint.style.display = "none";
      return;
    }
    let v = null;
    try {
      v = (typeof build.ghostVerdict === "function") ? build.ghostVerdict() : null;
    } catch(err){ v = null; }

    const name = (BUILDINGS[id] || {}).name || id;
    let text, ok;
    if(!v){ text = name + " - move the cursor to where you want it"; ok = true; }
    else if(v.ok){ text = "click to put the " + name.toLowerCase() + " here"; ok = true; }
    else {
      text = v.reason || "cannot go there";
      /* Lane D hit "needs a Workbench" while standing next to one, so a
         station refusal now carries how near is near enough. Saying the
         distance turns "it is missing" into "it is too far", which are
         different problems with different answers. */
      if(v.needsStation && v.within > 0) text += " within " + v.within + " px";
      ok = false;
    }

    /* Rotation is lane C's key and lane C's handler, which is right - one
       handler, and it is theirs. What was missing is anybody telling the
       player it exists, and a beam that cannot be stood on end is half a
       feature. So the key is printed here, read from build.api rather than
       typed, the same way the guidebook prints it. */
    const rot = build && build.rotateKey;
    if(rot) text += "   ·   " + keyCap(rot) + " turns it";

    if(hint.textContent !== text) hint.textContent = text;
    hint.className = ok ? "ok" : "bad";
    hint.style.display = "block";
    hint.style.left = (mouse.x + 16) + "px";
    hint.style.top = (mouse.y + 18) + "px";
  }

  function renderRising(){
    const list2 = risingRows(build);
    if(!list2.length){
      if(rise.style.display !== "none") rise.style.display = "none";
      return;
    }
    rise.style.display = "block";
    let html = '<div class="rttl">going up</div>';
    for(const r of list2){
      html += '<div class="rrow"><span class="rnm">' + r.name + '</span>' +
              '<span class="rsec">' + r.secondsLeft + ' s</span>' +
              '<div class="rbar"><i style="width:' + (r.progress*100).toFixed(0) + '%"></i></div>' +
              '</div>';
    }
    /* It is not usable until it is done, and that is the whole reason this
       panel exists - so say it, not just show a bar. */
    html += '<div class="rnote">not usable until it is finished</div>';
    rise.innerHTML = html;
  }

  function setOpen(v){
    open = !!v;
    host.style.display = open ? "block" : "none";
    if(open){ closeOthers("build"); say("", true); render(); }
  }

  /* --------------------------------------------------------------- keys --- */

  bus.on("input:key", e => {
    if(!e.down || state.paused) return;
    if(e.key !== KEY_BUILD) return;
    /* B while a ghost is armed cancels it: the same key that armed it is the
       one a player will reach for to stop. */
    if(armed()){ disarm(); say("", true); return; }
    setOpen(!open);
  });

  bus.on("build:refused", e => {
    if(open && e && e.reason) say(e.reason, false);
  });
  bus.on("structure:built", e => {
    const n = (BUILDINGS[e && e.defId] || {}).name || "It";
    bus.emit("ui:tip", { text: n + " is finished - you can use it now" });
  });

  for(const ev of ["inv:changed", "structure:built", "structure:collapsed"]){
    bus.on(ev, () => { if(open) render(); });
  }

  /* hud.js owns the right button and asks us through these */
  armedRef = armed;
  disarmRef = () => { disarm(); say("", true); };

  registerScreen({
    id: "build", label: "Build", key: KEY_BUILD,
    isOpen: () => open,
    open: () => setOpen(true),
    close: () => { setOpen(false); disarm(); }
  });

  return {
    name: "buildmenu",
    tick(){
      renderHint();
      if(state.tick % 6 === 0) renderRising();
      if(open && state.tick % 6 === 0) render();
    },
    api: {
      toggle(){ setOpen(!open); },
      isOpen(){ return open; },
      arm, disarm,
      rows(){ return buildRows(items, build); },
      rising(){ return risingRows(build); }
    }
  };
}
