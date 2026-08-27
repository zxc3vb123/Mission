/* The screens a player actually touches. LANE E (ui).

   Three things, all reading published APIs and lane F's data:

     - the hotbar, so the pack and the selected item are visible
     - the load bar, so a refused pickup has a visible cause
     - the guidebook (G), which says what to do next and computes every
       shortfall against the real inventory

   Nothing here writes simulation state. Where a mechanic does not exist yet
   the panel says so rather than pretending: an action whose mechanic is
   missing renders greyed with a reason, because a guidebook that tells you
   to do something impossible is worse than one that admits the gap. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { GUIDE, MATERIAL_HINTS, guideFor, hintFor } from "../content/guide.js";
import { STAGES, highestStageReached, highestCostedStage, stage as stageDef } from "../content/stages.js";
import { RECIPES, recipe as recipeDef } from "../content/recipes.js";
import { BUILDINGS, building as buildingDef, buildMass } from "../content/buildings.js";
import { ITEM_DATA, itemData } from "../content/items.js";

/* what the player has ever held: stage progress is not undone by spending */
export const everObtained = new Set();

export function createPanels(world, items, build){
  if(typeof document === "undefined") return { name: "panels" };

  const el = id => document.getElementById(id);
  const host = document.createElement("div");
  host.id = "panels";
  document.body.appendChild(host);

  const bar = document.createElement("div");
  bar.id = "hotbar";
  host.appendChild(bar);

  const loadBox = document.createElement("div");
  loadBox.id = "loadbar";
  loadBox.className = "panel";
  host.appendChild(loadBox);

  const book = document.createElement("div");
  book.id = "guide";
  book.className = "panel";
  book.style.display = "none";
  host.appendChild(book);

  let bookOpen = false;

  bus.on("inv:changed", e => { if(e && e.id) everObtained.add(e.id); });
  bus.on("item:collected", e => { if(e && e.id) everObtained.add(e.id); });
  bus.on("input:key", e => {
    if(!e.down) return;
    if(e.key === "g"){ bookOpen = !bookOpen; renderBook(); }
  });

  /* ------------------------------------------------------------ hotbar --- */
  function renderHotbar(){
    const hb = items.hotbar;
    if(!hb){ bar.innerHTML = ""; return; }
    const slots = hb.slots(), sel = hb.selected();
    let html = "";
    for(let i=0;i<slots.length;i++){
      const id = slots[i];
      const d = id ? items.itemDef(id) : null;
      const n = id ? items.inventory.count(id) : 0;
      html += '<div class="slot'+(i===sel?" sel":"")+'">' +
              '<span class="k">'+(i+1)+'</span>' +
              (d ? '<span class="sw" style="background:'+d.col+'"></span>' +
                   '<span class="nm">'+d.name+'</span><span class="ct">'+n+'</span>'
                 : '<span class="empty">-</span>') +
              '</div>';
    }
    bar.innerHTML = html;
  }

  /* ---------------------------------------------------------- load bar --- */
  function renderLoad(){
    const inv = items.inventory;
    const carried = inv.carriedMass(), cap = inv.capacity();
    const pct = Math.min(100, cap>0 ? carried/cap*100 : 0);
    const burdened = inv.encumbrance ? inv.encumbrance() > 0 : false;
    const full = inv.isFull ? inv.isFull() : false;
    loadBox.innerHTML =
      '<div class="lrow"><span>pack</span>' +
      '<span class="lv'+(full?" bad":(burdened?" warn":""))+'">' +
      carried.toFixed(1)+' / '+cap+' kg'+(full?"  FULL":"")+'</span></div>' +
      '<div class="lbar"><i style="width:'+pct.toFixed(1)+'%"></i></div>';
  }

  /* --------------------------------------------------------- guidebook --- */
  function hasBuilding(id){
    return build && typeof build.has === "function" ? build.has(id) : false;
  }
  const canBuild = () => !!(build && typeof build.place === "function");
  const canCraft = () => !!(items && typeof items.craft === "function");

  /* what a step still needs, counted against what is actually carried */
  function shortfall(need){
    if(!need) return null;
    if(need.items) return costLine(need.items);
    if(need.craft){
      const r = recipeDef(need.craft);
      if(!r) return null;
      return costLine(r.inputs || r.in || {}, r.station, "craft");
    }
    if(need.build){
      const b = buildingDef(need.build);
      if(!b) return null;
      const cost = b.cost || b.materials || {};
      const kg = (typeof buildMass === "function") ? buildMass(need.build, ITEM_DATA) : 0;
      return costLine(cost, null, "build", kg);
    }
    return null;
  }
  function costLine(cost, station, kind, kg){
    const parts = [];
    let met = true;
    for(const id in cost){
      const need = cost[id], have = items.inventory.count(id);
      if(have < need) met = false;
      const d = itemData(id);
      parts.push('<span class="'+(have>=need?"ok":"miss")+'">' +
                 (have)+"/"+need+" "+(d?d.name.toLowerCase():id)+'</span>');
    }
    let trips = "";
    if(kg > 0){
      const t = Math.max(1, Math.ceil(kg/items.inventory.capacity()));
      trips = ' <span class="trips">'+Math.round(kg)+' kg, '+t+(t===1?" trip":" trips")+'</span>';
    }
    let gate = "";
    if(kind === "build" && !canBuild()) gate = ' <span class="gate">placing is not in this build yet</span>';
    if(kind === "craft" && !canCraft()) gate = ' <span class="gate">crafting is not in this build yet</span>';
    return { met, html: parts.join(" &middot; ") + trips + gate };
  }

  function firstMissingHint(need){
    if(!need) return "";
    const cost = need.items ? need.items
              : need.craft && recipeDef(need.craft) ? (recipeDef(need.craft).inputs || {})
              : need.build && buildingDef(need.build) ? (buildingDef(need.build).cost || {})
              : {};
    for(const id in cost){
      if(items.inventory.count(id) < cost[id]){
        const h = typeof hintFor === "function" ? hintFor(id) : MATERIAL_HINTS[id];
        if(h) return '<div class="hint">' + (typeof h === "string" ? h : (h.text||"")) + '</div>';
      }
    }
    return "";
  }

  function renderBook(){
    book.style.display = bookOpen ? "block" : "none";
    if(!bookOpen) return;
    const st = highestStageReached(hasBuilding, id => everObtained.has(id));
    const costed = highestCostedStage();
    const S = stageDef(st) || STAGES[0];
    const G = guideFor(st);

    let html = '<div class="gtitle">Stage '+st+' &mdash; '+(S.name||"")+'</div>';
    if(S.goal) html += '<div class="ggoal">'+S.goal+'</div>';
    if(G && G.lookFor) html += '<div class="glook">'+G.lookFor+'</div>';

    if(st > costed){
      html += '<div class="guncosted">This stage is not costed yet &mdash; the ' +
              'tables stop at stage '+costed+'.</div>';
    } else if(G && G.actions && G.actions.length){
      html += '<ol class="gacts">';
      let firstOpen = true;
      for(const a of G.actions){
        const sf = shortfall(a.needs);
        const done = sf ? sf.met : false;
        const isNext = !done && firstOpen;
        if(isNext) firstOpen = false;
        html += '<li class="'+(done?"done":(isNext?"next":"later"))+'">' +
                '<div class="gdo">'+a.do+'</div>' +
                (a.why ? '<div class="gwhy">'+a.why+'</div>' : "") +
                (sf ? '<div class="gneed">'+sf.html+'</div>' : "") +
                (isNext ? firstMissingHint(a.needs) : "") +
                '</li>';
      }
      html += '</ol>';
    }
    html += '<div class="gfoot">g closes this</div>';
    book.innerHTML = html;
  }

  renderHotbar(); renderLoad();

  return {
    name: "panels",
    tick(){
      if(state.tick % 6 === 0){
        renderHotbar();
        renderLoad();
        if(bookOpen) renderBook();
      }
    },
    api: { toggleGuide(){ bookOpen = !bookOpen; renderBook(); }, everObtained }
  };
}
