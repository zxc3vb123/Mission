/* Fixed 36 Hz simulation, render once per animation frame. LANE E (core).

   Systems are ticked in the order they are registered in src/systems.js.
   A system may implement `tick()` and any render hook from core/render.js. */

import { state } from "./state.js";
import { updateMouseWorld } from "./input.js";
import { updateFX } from "./fx.js";

export const TICK_HZ = 36;
export const TICK_MS = 1000/TICK_HZ;

export function createLoop(systems, renderer){
  let acc = 0, last = 0, fpsT = 0, fpsN = 0, running = false;

  function step(){
    state.tick++;
    updateMouseWorld();
    for(const s of systems) if(s.tick) s.tick();
    updateFX();
  }

  /* paused: the world holds still but the screen keeps drawing, so menus
     render over a live picture instead of a frozen frame */
  function maybeStep(){ if(!state.paused) step(); }

  function frame(now){
    if(!running) return;
    if(!last) last = now;
    let dt = now - last; last = now;
    if(dt > 250) dt = 250;
    acc += dt;
    let n = 0;
    while(acc >= TICK_MS && n < 4){ maybeStep(); acc -= TICK_MS; n++; }
    renderer.draw(systems);
    fpsN++; fpsT += dt;
    if(fpsT > 500){ state.fps = fpsN*1000/fpsT; fpsN = 0; fpsT = 0; }
    requestAnimationFrame(frame);
  }

  return {
    start(){ running = true; last = 0; requestAnimationFrame(frame); },
    stop(){ running = false; },
    step   /* exported so the headless test harness can drive ticks */
  };
}
