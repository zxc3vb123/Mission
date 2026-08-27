/* The world system. LANE A (world).

   PUBLISHED API - other lanes may use exactly these:
     matAt(x,y) isSolid(x,y) isLiquid(x,y) isFree(x,y) matInfo(x,y)
     digSpeedFor(matIndex,toolId) -> pixels per second, 0 = cannot cut
     digFreeCircle(x,y,r,collect,toolId) anyDiggable(x,y,r,toolId)
     blast(x,y,r) setMat(x,y,m)
     chopAt(x,y,r,toolId) -> { hit, felled, progress, canChop }
     treeAt(x,y,r) -> { x, y, standing, progress } | null   chopSpeedFor(toolId)
     lightAt(x,y) lightConfig
     surfaceAt(x) size() counts() chunkStats() regenerate(seed)

   The map is 4096 x 2560 pixels and is streamed: chunks are generated
   around the camera and thrown away behind it. None of that shows in the
   API - matAt still answers for any pixel on the map, paging the ground in
   if it has to.

   EVENTS emitted:
     "dig:yield"   { item, x, y }     the world yielded one item at this spot
                                     (digging, and the logs off a felled tree)
     "tree:felled" { x, y, wood }    notification only - the logs themselves
                                     arrive as "dig:yield", so nothing that
                                     listens to both may spawn them twice
     "world:generated" { seed }

   Everything else in src/world/ is internal to this lane. */

import { MATS } from "./materials.js";
import { LW, LH, NEED_MARGIN, KEEP_MARGIN, PREFETCH_PER_TICK } from "./config.js";
import { surface, matAt, isSolid, isLiquid, isFree, setMat } from "./landscape.js";
import { setFocus, prefetch, chunkStats, serialiseChanges, restoreChanges } from "./chunks.js";
import { updatePXS, updateMassMover, updateInstable, updateConversions,
         backgroundScan, pxs, mmQueue, insQueue } from "./dynamics.js";
import { digFreeCircle, anyDiggable, blast, digSpeedFor } from "./dig.js";
import { generate } from "./generate.js";
import { trees, updateScenery, drawTree, drawGrass, chopAt, treeNear, chopSpeedFor } from "./scenery.js";
import { renderSky, renderParallax, renderLandscape, renderLoose, renderAll, animateLava } from "./render_land.js";
import { computeLight, renderLight as drawLight, lightAt, lightConfig } from "./lighting.js";
import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { setFxSolidTest } from "../core/fx.js";

/* the box of world that has to exist right now: what the camera can see */
function viewBox(cx, cy){
  const zoom = state.cam.zoom || 3;
  const hw = (state.view.w || 1280) / (2 * zoom);
  const hh = (state.view.h || 720) / (2 * zoom);
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}
function focusOn(cx, cy){
  const b = viewBox(cx, cy);
  setFocus(b.x0, b.y0, b.x1, b.y1, NEED_MARGIN, KEEP_MARGIN);
}

export function createWorld(){
  setFxSolidTest(isSolid);

  function regenerate(seed){
    generate(seed);
    focusOn(state.world.spawn.x, state.world.spawn.y);
    renderAll();
    bus.emit("world:generated", { seed: state.world.seed });
  }

  return {
    name: "world",

    init(seed){ regenerate(seed === undefined ? Math.floor(Math.random()*1e9) : seed); },

    tick(){
      focusOn(state.cam.x, state.cam.y);
      prefetch(PREFETCH_PER_TICK);
      updatePXS();
      backgroundScan();
      updateMassMover();
      updateInstable();
      updateConversions();
      updateScenery();
      animateLava(state.tick);
    },

    /* the terrain the player has changed, as a difference from the seed */
    serialise(){
      const chunks = serialiseChanges();
      return chunks.length ? { chunks } : undefined;
    },
    restore(data){
      if(!data || !data.chunks) return;
      restoreChanges(data.chunks);
      renderAll();
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
      digFreeCircle, anyDiggable, blast, digSpeedFor,
      chopAt, chopSpeedFor,
      treeAt: (x, y, r) => {
        const t = treeNear(x, y, r);
        return t ? { x: t.x, y: t.y, standing: t.fall === 0,
                     progress: 1 - t.hp / t.hpMax } : null;
      },
      lightAt, lightConfig,
      surfaceAt: x => surface[Math.max(0, Math.min(LW-1, Math.round(x)))],
      size: () => ({ W: LW, H: LH }),
      counts: () => ({ pxs: pxs.length, mm: mmQueue.length, ins: insQueue.length }),
      chunkStats,
      regenerate,
      setMat
    }
  };
}
