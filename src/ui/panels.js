/* The always-on furniture. LANE H (ui).

   Three small things that sit over the game the whole time:

     - the hotbar, so what is in your hands is visible
     - the load bar, so a refused pickup has a visible cause
     - one line naming the keys that open everything else, because a screen
       nobody knows the key for is a screen nobody opens

   The two big screens live elsewhere and are mounted from here: the pack and
   crafting (src/ui/craft.js, I) and the guidebook (src/ui/book.js, G). This
   file used to hold a stage-guide panel as well; that is now the first page
   of the book, so there is one thing to open rather than two.

   NOTHING HERE POLLS. The owner's word for the old version was "laggy": it
   redrew on state.tick % 6, which at a fixed 36 Hz means an input could sit
   on screen unacknowledged for a sixth of a second. Everything that changes
   the pack or the hands already announces itself on the bus, so these redraw
   on the announcement. The slow sweep that remains is a backstop for the one
   thing nobody announces - a lane moving the pack's capacity directly - and
   nothing the player DID waits for it.

   Nothing here writes simulation state. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { createBook, everObtained } from "./book.js";
import { createBuildMenu } from "./build.js";
import { createBar } from "./bar.js";
import { keyHint } from "./keys.js";
import { iconMarkup } from "./icon.js";
import { clearScreens } from "./screens.js";

/* Kept exported from here because it was exported from here; the set itself
   now lives with the guidebook, which is what reads it. */
export { everObtained };

export function createPanels(world, items, build){
  if(typeof document === "undefined") return { name: "panels" };

  /* This runs before the screens below register themselves, so a second
     buildSystems() in one page does not leave the previous game's dead DOM
     on the stack for escape to try to close. */
  clearScreens();

  const host = document.createElement("div");
  host.id = "panels";
  document.body.appendChild(host);

  const hotbarEl = document.createElement("div");
  hotbarEl.id = "hotbar";
  host.appendChild(hotbarEl);

  const hint = document.createElement("div");
  hint.id = "keyhint";
  hint.textContent = keyHint();
  host.appendChild(hint);

  const loadBox = document.createElement("div");
  loadBox.id = "loadbar";
  loadBox.className = "panel";
  host.appendChild(loadBox);

  /* The two big screens and the bar are mounted here rather than in
     systems.js, because the bar has to be built AFTER every screen has
     registered itself - it draws one button per registered screen, and a
     screen that registers later would otherwise never get one. */
  const book = createBook(world, items, build);
  const buildMenu = createBuildMenu(world, items, build);
  const bar = createBar();

  /* ------------------------------------------------------------ hotbar --- */
  let lastBar = "";
  function renderHotbar(){
    const hb = items.hotbar;
    if(!hb){ hotbarEl.innerHTML = ""; return; }
    const slots = hb.slots(), sel = hb.selected();
    let html = "";
    for(let i=0;i<slots.length;i++){
      const id = slots[i];
      const d = id ? items.itemDef(id) : null;
      const n = id ? items.inventory.count(id) : 0;
      html += '<div class="slot'+(i===sel?" sel":"")+'">' +
              '<span class="k">'+(i+1)+'</span>' +
              (d ? iconMarkup(id, 15) +
                   '<span class="nm">'+d.name+'</span><span class="ct">'+n+'</span>'
                 : '<span class="empty">-</span>') +
              '</div>';
    }
    /* only touch the DOM when it would actually differ - a redraw on every
       keypress is free only if it does not relayout */
    if(html !== lastBar){ lastBar = html; hotbarEl.innerHTML = html; }
  }

  /* ---------------------------------------------------------- load bar --- */
  let lastLoad = "";
  function renderLoad(){
    const inv = items.inventory;
    const carried = inv.carriedMass(), cap = inv.capacity();
    const pct = Math.min(100, cap>0 ? carried/cap*100 : 0);
    const burdened = inv.encumbrance ? inv.encumbrance() > 0 : false;
    const full = inv.isFull ? inv.isFull() : false;
    const html =
      '<div class="lrow"><span>pack</span>' +
      '<span class="lv'+(full?" bad":(burdened?" warn":""))+'">' +
      carried.toFixed(1)+' / '+cap+' kg'+(full?"  FULL":"")+'</span></div>' +
      '<div class="lbar"><i style="width:'+pct.toFixed(1)+'%"></i></div>';
    if(html !== lastLoad){ lastLoad = html; loadBox.innerHTML = html; }
  }

  function renderAll(){ renderHotbar(); renderLoad(); }

  /* React, do not poll. */
  for(const ev of ["inv:changed", "item:equipped", "item:dropped", "craft:done"]){
    bus.on(ev, renderAll);
  }
  /* The hotbar cursor moves on a digit key even when nothing is equipped
     either side of the move, and that fires no item:equipped. */
  bus.on("input:key", e => { if(e.down) renderHotbar(); });

  renderAll();

  return {
    name: "panels",
    tick(){
      if(book.tick) book.tick();
      if(buildMenu.tick) buildMenu.tick();
      if(bar.tick) bar.tick();
      /* backstop only: capacity can change with no event behind it */
      if(state.tick % 18 === 0) renderLoad();
    },
    api: {
      toggleGuide(){ if(book.api) book.api.toggle(); },
      book: book.api,
      buildMenu: buildMenu.api,
      bar: bar.api,
      everObtained
    }
  };
}
