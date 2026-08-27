/* Headless test kit. LANE E (core).

   Builds the game with no DOM and steps it tick by tick, so every lane can
   test its own system in Node:

     import { boot } from "../testkit.js";
     const g = boot(12345);
     g.tick(60);
     g.check("something is true", cond, "detail");

   Run everything with:  npm test                                        */

import { state } from "../src/core/state.js";
import { keys, mouse } from "../src/core/input.js";
import { updateFX, clearFX } from "../src/core/fx.js";
import { buildSystems } from "../src/systems.js";

export function boot(seed = 12345){
  clearFX();
  const built = buildSystems({ headless:true, seed });
  const { systems, world, items, actor, camera } = built;

  state.view.w = 1280; state.view.h = 720;
  camera.snap();

  /* Systems are module singletons, so a second boot() in the same process
     inherits whatever the previous suite left behind. Reset the shared
     player-facing state here so every suite starts from the same place.

     WHAT THIS DOES NOT RESET: the landscape. The world is regenerated from
     your seed, but anything with its own cursor over that world - the
     background settling scan, for one - carries on where the last suite
     left it. So a test that shapes terrain and then measures something must
     guarantee its own ground rather than assume a quiet world. See
     docs/WORKFLOW.md, "neither is one suite passing". */
  state.tick = 0;
  items.api.inventory.clear();
  items.api.clearDrops();

  function tick(n = 1){
    for(let i=0;i<n;i++){
      state.tick++;
      for(const s of systems) if(s.tick) s.tick();
      updateFX();
    }
  }

  return {
    systems, world: world.api, items: items.api, actor: actor.api, camera,
    state, keys, mouse, tick,
    press(k, down = true){ keys[k] = down; },
    releaseAll(){ for(const k in keys) keys[k] = false; mouse.down = false; }
  };
}

/* ------------------------------ asserts ------------------------------- */
export function suite(name){
  const results = [];
  return {
    name,
    check(label, cond, extra){
      results.push({ ok: !!cond, label, extra });
      return !!cond;
    },
    results,
    report(){
      return results.map(r =>
        (r.ok ? "PASS  " : "FAIL  ") + name + ": " + r.label +
        (r.extra !== undefined ? "   [" + r.extra + "]" : "")
      );
    },
    failed(){ return results.filter(r => !r.ok).length; }
  };
}

/* helpers lanes reuse */
export function countSolid(world, x0, y0, w, h){
  let n = 0;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++) if(world.isSolid(x,y)) n++;
  return n;
}
export function findMaterial(world, matIndex, run = 8, horizontal = true){
  const { W, H } = world.size();
  for(let x=200;x<W-200;x+=13){
    for(let y=world.surfaceAt(x)+30; y<H-60; y+=3){
      let ok = true;
      for(let k=0;k<run;k++){
        const mx = horizontal ? x+k : x, my = horizontal ? y : y+k;
        if(world.matAt(mx,my) !== matIndex){ ok = false; break; }
      }
      if(ok) return { x, y };
    }
  }
  return null;
}
