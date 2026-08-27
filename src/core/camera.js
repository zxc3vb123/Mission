/* Camera follow. LANE E (core).
   Follows the player, leans toward the cursor, clamps to the map. */

import { state } from "./state.js";
import { mouse } from "./input.js";
import { clamp } from "./rng.js";

export function createCamera(){
  return {
    name: "camera",
    tick(){
      const { cam, view, player, world } = state;
      let tx, ty;
      if(cam.free){
        tx = cam.x + (mouse.x - view.w/2)/view.w*22;
        ty = cam.y + (mouse.y - view.h/2)/view.h*22;
      } else {
        tx = player.x + clamp((mouse.wx-player.x)*0.18, -60, 60);
        ty = player.y + clamp((mouse.wy-player.y)*0.18, -40, 40);
      }
      cam.x += (tx-cam.x)*0.12;
      cam.y += (ty-cam.y)*0.12;
      const hw = view.w/(2*cam.zoom), hh = view.h/(2*cam.zoom);
      cam.x = clamp(cam.x, hw, world.W-hw);
      cam.y = clamp(cam.y, hh, world.H-hh);
      if(hw*2 > world.W) cam.x = world.W/2;
      if(hh*2 > world.H) cam.y = world.H/2;
    },
    snap(){
      state.cam.x = state.player.x;
      state.cam.y = state.player.y;
    }
  };
}
