/* The HUD. LANE E (ui).
   Reads state and lane APIs, writes DOM. It never touches simulation. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { mouse, keys } from "../core/input.js";
import { clamp } from "../core/rng.js";
import { ghostArmed, cancelGhost } from "./build.js";

/* Engine test tools, off by default and switched on in Settings. Exported
   rather than hidden so the settings panel can reach it without a handle on
   this system. */
export const debugTools = { blast: false };

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
  /* anything in src/ui that wants a line in front of the player */
  bus.on("ui:tip", e => { if(e && e.text) showTip(e.text); });
  bus.on("world:generated", () => { renderInv(); showTip("New landscape generated"); });
  bus.on("player:died", () => showTip("The clonk died. Respawning."));

  /* A station buried mid-job gives back what it was holding - the inputs and
     any output nobody had collected - as real chunks on the ground. Say so.
     A player who watches their kiln come down with iron inside it will assume
     the iron is gone, and go and mine it again for no reason. */
  bus.on("structure:collapsed", e => {
    const held = (e && e.held) || null;
    const parts = [];
    for(const id in (held || {})){
      if(held[id] > 0) parts.push(held[id] + " " + items.itemDef(id).name.toLowerCase());
    }
    if(parts.length) showTip("It came down - " + parts.join(", ") + " fell out onto the ground");
    else if(e && e.interrupted) showTip("It came down, and the work in it was lost");
  });

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
  /* THE ONLY RIGHT-BUTTON HANDLER IN src/ui, and the suite fails if a second
     one appears. It used to be two: this one fired the blast tool and
     build.js cancelled an armed ghost, so a right click to take back a
     misplaced building also cratered the ground you were about to build on.
     Having each handler check the other would not have fixed it - the answer
     would then depend on which listener the bus called first - so there is
     one handler and it decides.

     Cancelling wins over blasting. The cancel is a real player action and the
     blast is a terrain-engine test tool, and where a real verb and a test
     tool overlap, the verb takes it.

     THE BLAST IS OFF UNLESS YOU ASK FOR IT (Settings, in the pause menu).
     It permanently craters the world on a single click and it was only ever
     there to exercise the engine. That was harmless while right mouse meant
     nothing else; now that it is the universal "no", a destructive default
     sitting under it is a trap rather than a convenience. */
  bus.on("input:mouse", e => {
    if(e.button !== 2 || !e.down) return;
    if(ghostArmed()){ cancelGhost(); return; }
    if(!debugTools.blast) return;
    world.blast(mouse.wx, mouse.wy, 22);
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
