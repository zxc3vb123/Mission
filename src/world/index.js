/* The world system. LANE A (world).

   PUBLISHED API - other lanes may use exactly these:
     matAt(x,y) isSolid(x,y) isLiquid(x,y) isFree(x,y) matInfo(x,y)
     digFreeCircle(x,y,r,collect) anyDiggable(x,y,r) blast(x,y,r)
     lightAt(x,y) surfaceAt(x) size() regenerate(seed)

   EVENTS emitted:
     "dig:yield"   { item, x, y }     enough material dug for one item
     "world:generated" { seed }

   Everything else in src/world/ is internal to this lane. */

import { MATS } from "./materials.js";
import { LW, LH, land, surface, matAt, isSolid, isLiquid, isFree, setMat } from "./landscape.js";
import { updatePXS, updateMassMover, updateInstable, updateConversions,
         backgroundScan, pxs, mmQueue, insQueue } from "./dynamics.js";
import { digFreeCircle, anyDiggable, blast } from "./dig.js";
import { generate } from "./generate.js";
import { trees, grass, updateScenery, drawTree, drawGrass } from "./scenery.js";
import { renderSky, renderParallax, renderLandscape, renderLoose, renderAll, animateLava } from "./render_land.js";
import { computeLight, renderLight as drawLight, lightAt, lightConfig } from "./lighting.js";
import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { setFxSolidTest } from "../core/fx.js";

export function createWorld(){
  setFxSolidTest(isSolid);

  function regenerate(seed){
    generate(seed);
    renderAll();
    bus.emit("world:generated", { seed: state.world.seed });
  }

  return {
    name: "world",

    init(seed){ regenerate(seed === undefined ? Math.floor(Math.random()*1e9) : seed); },

    tick(){
      updatePXS();
      backgroundScan();
      updateMassMover();
      updateInstable();
      updateConversions();
      updateScenery();
      animateLava(state.tick);
    },

    renderSky, renderParallax,

    renderBack(ctx){
      const hw = state.view.w/(2*state.cam.zoom) + 90;
      const x0 = state.cam.x - hw, x1 = state.cam.x + hw;
      for(let i=0;i<trees.length;i++){
        const t = trees[i];
        if(t.x<x0 || t.x>x1) continue;
        drawTree(ctx, t, state.tick);
      }
    },

    renderLandscape,

    renderScenery(ctx){
      const hw = state.view.w/(2*state.cam.zoom) + 8;
      drawGrass(ctx, { x0: state.cam.x-hw, x1: state.cam.x+hw }, state.tick);
    },

    renderLoose,

    renderLight(ctx){
      const hw = state.view.w/(2*state.cam.zoom), hh = state.view.h/(2*state.cam.zoom);
      computeLight({ x0: state.cam.x-hw, x1: state.cam.x+hw,
                     y0: state.cam.y-hh, y1: state.cam.y+hh });
      drawLight(ctx);
    },

    api: {
      matAt, isSolid, isLiquid, isFree,
      matInfo: (x,y) => MATS[matAt(x,y)],
      digFreeCircle, anyDiggable, blast,
      lightAt, lightConfig,
      surfaceAt: x => surface[Math.max(0, Math.min(LW-1, Math.round(x)))],
      size: () => ({ W: LW, H: LH }),
      counts: () => ({ pxs: pxs.length, mm: mmQueue.length, ins: insQueue.length }),
      regenerate,
      setMat
    }
  };
}
