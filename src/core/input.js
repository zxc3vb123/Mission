/* Raw keyboard and mouse state. LANE E (core).
   Lanes read `keys` and `mouse`; they do not attach their own listeners,
   so that key bindings stay in one place. */

import { bus } from "./bus.js";
import { state } from "./state.js";

export const keys = {};
export const mouse = { x:0, y:0, wx:0, wy:0, down:false, right:false };

export function attachInput(canvas){
  window.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if(k===" ") e.preventDefault();
    bus.emit("input:key", { key:k, down:true });
  });
  window.addEventListener("keyup", e => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    bus.emit("input:key", { key:k, down:false });
  });
  window.addEventListener("blur", () => {
    for(const k in keys) keys[k] = false;
    mouse.down = false;
  });

  canvas.addEventListener("mousemove", e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener("mousedown", e => {
    if(e.button===0){ mouse.down = true; bus.emit("input:mouse", { button:0, down:true }); }
    if(e.button===2){ bus.emit("input:mouse", { button:2, down:true }); }
    if(e.button===1) e.preventDefault();
  });
  window.addEventListener("mouseup", e => {
    if(e.button===0){ mouse.down = false; bus.emit("input:mouse", { button:0, down:false }); }
  });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    state.cam.zoom = Math.max(1, Math.min(8, state.cam.zoom * (e.deltaY<0 ? 1.15 : 1/1.15)));
  }, { passive:false });
}

/* screen -> world, recomputed every tick by the renderer */
export function updateMouseWorld(){
  const { view, cam } = state;
  mouse.wx = (mouse.x - view.w/2)/cam.zoom + cam.x;
  mouse.wy = (mouse.y - view.h/2)/cam.zoom + cam.y;
}
