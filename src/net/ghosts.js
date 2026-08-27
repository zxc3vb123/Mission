/* The other players, as seen from here. LANE NET.

   A remote body is never simulated locally - its owner runs it and sends a
   pose (docs/DECISIONS.md). What arrives is 18 poses a second over a link
   with jitter, and what has to be drawn is 60 frames a second of something
   that moves like a person, so this file is one job: smoothing, and drawing
   the result.

   It draws its own figure rather than lane B's. `drawClonk` lives in
   `src/actor/render_actor.js`, which is lane B's internal file and not
   importable across a lane boundary - so the ghost is a plain silhouette in
   the player's own colour, with the proportions lane B's clonk actually has
   (6 px across, 16 tall, origin at the middle) so the two read as the same
   kind of creature. `docs/REQUESTS.md` asks lane B to publish the real one,
   at which point this becomes four lines. */

import { state } from "../core/state.js";
import { colourFor } from "./room.js";

const SNAP  = 96;    /* further than this is a respawn, not a walk */
const EASE  = 0.34;  /* per tick at 36 Hz */
const STALE = 180;   /* 5 s without a pose: draw them faded */
const GONE  = 900;   /* 25 s: stop drawing them at all */

export function createGhosts(){
  const map = new Map();

  function get(id){
    let g = map.get(id);
    if(!g){
      g = { id, name: id, colour: colourFor(id),
            x: 0, y: 0, dir: 1, act: "", lamp: false,
            tx: 0, ty: 0, aimX: 1, aimY: 0, seen: 0, fresh: false };
      map.set(id, g);
    }
    return g;
  }

  return {
    setName(id, name){ get(id).name = name || id; },
    remove(id){ map.delete(id); },
    clear(){ map.clear(); },
    count(){ return map.size; },
    all(){ return [...map.values()]; },
    get(id){ return map.get(id) || null; },

    /* a pose off the wire: the target, not the position */
    pose(id, p){
      const g = get(id);
      g.tx = p.x; g.ty = p.y;
      g.dir = p.dir; g.act = p.act; g.lamp = p.lamp;
      g.aimX = p.aimX; g.aimY = p.aimY;
      g.seen = state.tick;
      if(!g.fresh){ g.x = p.x; g.y = p.y; g.fresh = true; }
    },

    /* one simulation tick of smoothing. Render state only - nothing here
       may touch the world, and nothing here is part of the simulation. */
    tick(){
      for(const g of map.values()){
        const dx = g.tx - g.x, dy = g.ty - g.y;
        if(dx*dx + dy*dy > SNAP*SNAP){ g.x = g.tx; g.y = g.ty; continue; }
        g.x += dx * EASE;
        g.y += dy * EASE;
      }
    },

    draw(ctx){
      if(!map.size) return;
      const z = state.cam.zoom || 3;
      const hw = state.view.w/(2*z) + 24, hh = state.view.h/(2*z) + 24;
      const x0 = state.cam.x - hw, x1 = state.cam.x + hw;
      const y0 = state.cam.y - hh, y1 = state.cam.y + hh;

      for(const g of map.values()){
        const age = state.tick - g.seen;
        if(age > GONE) continue;
        if(g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;

        ctx.save();
        ctx.globalAlpha = age > STALE ? 0.35 : 1;
        const x = Math.round(g.x), y = Math.round(g.y);

        /* body, then head, then the tool arm - the same silhouette lane B
           draws, without the animation only its owner knows about */
        ctx.fillStyle = g.colour.dark;
        ctx.fillRect(x - 3, y - 3, 6, 11);
        ctx.fillStyle = g.colour.css;
        ctx.fillRect(x - 3, y - 8, 6, 6);
        ctx.fillRect(x - 3 + (g.dir > 0 ? 4 : 0), y - 7, 2, 2);   /* facing */

        /* an arm out towards whatever they are working on */
        const a = Math.hypot(g.aimX, g.aimY) || 1;
        ctx.fillRect(Math.round(x + (g.aimX/a)*4) - 1,
                     Math.round(y + (g.aimY/a)*4) - 1, 2, 2);

        /* the name, small enough to be a label and not a banner */
        ctx.globalAlpha *= 0.85;
        ctx.font = "5px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#0b0d10";
        ctx.fillText(g.name, x + 0.5, y - 10.5);
        ctx.fillStyle = g.colour.css;
        ctx.fillText(g.name, x, y - 11);
        ctx.restore();
      }
    }
  };
}
