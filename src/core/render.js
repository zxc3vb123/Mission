/* Canvas, camera and the draw order. LANE E (core).

   A system draws by implementing any of the hooks below. The order is
   fixed here so no lane has to know about any other lane's drawing:

     screen space : renderSky, renderParallax
     world  space : renderBack, renderLandscape, renderScenery, renderBuild,
                    renderItems, renderActor, renderLoose, renderFX, renderLight
     screen space : renderOverlay

   Need a new layer? That is a core change - ask in docs/REQUESTS.md. */

import { state } from "./state.js";
import { rnd } from "./rng.js";

export const SCREEN_LAYERS_BEFORE = ["renderSky", "renderParallax"];
export const WORLD_LAYERS = [
  "renderBack", "renderLandscape", "renderScenery", "renderBuild",
  "renderItems", "renderActor", "renderLoose", "renderFX", "renderLight"
];
export const SCREEN_LAYERS_AFTER = ["renderOverlay"];

export function createRenderer(canvas){
  const ctx = canvas.getContext("2d", { alpha:false });

  function resize(){
    canvas.width  = Math.floor(window.innerWidth);
    canvas.height = Math.floor(window.innerHeight);
    state.view.w = canvas.width;
    state.view.h = canvas.height;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener("resize", resize);
  resize();

  function draw(systems){
    const cam = state.cam;
    let shx = 0, shy = 0;
    if(cam.shake>0){
      shx = (rnd()-0.5)*cam.shakeMag*cam.shake*0.25;
      shy = (rnd()-0.5)*cam.shakeMag*cam.shake*0.25;
    }
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = "#07080a";
    ctx.fillRect(0,0,state.view.w,state.view.h);

    for(const layer of SCREEN_LAYERS_BEFORE)
      for(const s of systems) if(s[layer]) s[layer](ctx);

    ctx.setTransform(cam.zoom, 0, 0, cam.zoom,
                     -(cam.x+shx)*cam.zoom + state.view.w/2,
                     -(cam.y+shy)*cam.zoom + state.view.h/2);

    for(const layer of WORLD_LAYERS)
      for(const s of systems) if(s[layer]) s[layer](ctx);

    ctx.setTransform(1,0,0,1,0,0);
    for(const layer of SCREEN_LAYERS_AFTER)
      for(const s of systems) if(s[layer]) s[layer](ctx);
  }

  /* visible world rectangle, handy for culling */
  function viewRect(margin=0){
    const { view, cam } = state;
    const hw = view.w/(2*cam.zoom), hh = view.h/(2*cam.zoom);
    return { x0: cam.x-hw-margin, x1: cam.x+hw+margin,
             y0: cam.y-hh-margin, y1: cam.y+hh+margin };
  }

  return { ctx, canvas, resize, draw, viewRect };
}
