/* The HUD. LANE E (ui).
   Reads state and lane APIs, writes DOM. It never touches simulation. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { mouse, keys } from "../core/input.js";
import { clamp } from "../core/rng.js";

export function createHUD(world, items, actor, camera){
  const el = id => document.getElementById(id);
  const S = {
    fps: el("s_fps"), pxs: el("s_pxs"), mm: el("s_mm"), ins: el("s_ins"),
    act: el("s_act"), mat: el("s_mat"), depth: el("s_depth"),
    energy: el("v_energy"), breath: el("v_breath"),
    inv: el("inv"), tip: el("tip")
  };
  let tipT = 0;

  function showTip(text){
    if(!S.tip) return;
    S.tip.textContent = text;
    S.tip.style.opacity = 1;
    tipT = 120;
  }

  /* the inventory bar only shows what has actually been found */
  function renderInv(){
    if(!S.inv) return;
    const all = items.inventory.all();
    const ids = Object.keys(all).filter(id => all[id] > 0);
    if(!ids.length){ S.inv.innerHTML = '<span style="color:#7c8593">nothing carried</span>'; return; }
    S.inv.innerHTML = ids.map(id => {
      const d = items.itemDef(id);
      return '<div class="slot"><span class="sw" style="background:'+d.col+'"></span>'+
             d.name+' <span class="n">'+all[id]+'</span></div>';
    }).join("");
  }

  bus.on("inv:changed", renderInv);
  bus.on("item:collected", e => showTip("Picked up "+items.itemDef(e.id).name));
  bus.on("world:generated", () => { renderInv(); showTip("New landscape generated"); });
  bus.on("player:died", () => showTip("The clonk died. Respawning."));

  bus.on("input:key", e => {
    if(!e.down) return;
    if(e.key==="r"){ world.regenerate(Math.floor(Math.random()*1e9)); items.inventory.clear(); }
    if(e.key==="f"){
      state.cam.free = !state.cam.free;
      showTip(state.cam.free ? "Free camera" : "Camera follows the clonk");
    }
    if(e.key==="v") state.debug.showVerts = !state.debug.showVerts;
    if(e.key==="l"){
      const lamp = state.player.lamp;
      lamp.on = !lamp.on;
      showTip(lamp.on ? "Lamp on" : "Lamp off");
    }
  });
  bus.on("input:mouse", e => {
    if(e.button===2 && e.down) world.blast(mouse.wx, mouse.wy, 22);
  });

  renderInv();

  return {
    name: "hud",
    tick(){
      const c = world.counts();
      if(S.fps) S.fps.textContent = state.fps.toFixed(0);
      if(S.pxs) S.pxs.textContent = c.pxs;
      if(S.mm) S.mm.textContent = c.mm;
      if(S.ins) S.ins.textContent = c.ins;
      if(S.act) S.act.textContent = state.player.act;
      if(S.mat){
        const M = world.matInfo(Math.round(mouse.wx), Math.round(mouse.wy));
        S.mat.textContent = M.name + (M.solid ? (M.digFree?" (dig)":" (hard)") : (M.isLiq?" (liquid)":""));
      }
      if(S.depth){
        const d = Math.max(0, Math.round(state.player.y - world.surfaceAt(state.player.x)));
        S.depth.textContent = d + " px";
      }
      if(S.energy) S.energy.style.width = clamp(state.player.energy,0,100)+"%";
      if(S.breath) S.breath.style.width = clamp(state.player.breath,0,100)+"%";
      if(tipT>0){ tipT--; if(tipT===0 && S.tip) S.tip.style.opacity = 0; }
    },
    api: { showTip }
  };
}
