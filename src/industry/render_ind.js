/* Drawing track and rolling stock. LANE D (industry).

   Rendering never mutates simulation state (ARCHITECTURE rule 5), so nothing
   in here decides anything - it reads the same numbers the tick wrote.

   The one thing worth stating: a wagon SHOWS ITS LOAD. How full the box is,
   and what colour the heap in it is, come from the goods actually in the
   store. A player should be able to tell a full cart from an empty one at a
   glance across a mine, because that is the whole information a haulage
   system has to convey. */

import { state } from "../core/state.js";
import { rails } from "./rails.js";
import { wagons } from "./wagon.js";
import { RAIL_H } from "./spec.js";

const RAIL_TOP = "#8d9199";
const RAIL_DARK = "#4c5157";
const SLEEPER = "#5b4a36";

function viewSpan(pad = 40){
  const hw = state.view.w / (2 * state.cam.zoom) + pad;
  return { x0: state.cam.x - hw, x1: state.cam.x + hw };
}

export function renderRails(ctx){
  const { x0, x1 } = viewSpan();
  for(const r of rails){
    if(r.x + r.w < x0 || r.x > x1) continue;

    /* sleepers first, then the rail on top of them */
    ctx.fillStyle = SLEEPER;
    for(let k = 3; k < r.w; k += 8) ctx.fillRect(r.x + k, r.y + 1, 3, RAIL_H);

    ctx.fillStyle = RAIL_DARK;
    ctx.fillRect(r.x, r.y, r.w, RAIL_H);
    ctx.fillStyle = RAIL_TOP;
    ctx.fillRect(r.x, r.y, r.w, 1);
  }
}

export function renderWagons(ctx, itemDef){
  const { x0, x1 } = viewSpan();
  for(const w of wagons){
    if(w.x + w.w < x0 || w.x - w.w > x1) continue;
    const x = Math.round(w.x - w.w/2), y = Math.round(w.y);

    /* THE LOAD, drawn before the sides so it sits inside the box. Height is
       the fraction of capacity by mass; colour is whatever is heaviest in
       there, which is almost always what the cart was filled with. */
    let mass = 0, heaviest = null, heaviestMass = 0;
    for(const id in w.store.items){
      const m = w.store.items[id] * itemDef(id).mass;
      mass += m;
      if(m > heaviestMass){ heaviestMass = m; heaviest = id; }
    }
    if(mass > 0 && heaviest){
      const fill = Math.max(2, Math.round((w.h - 5) * Math.min(1, mass / w.store.cap)));
      ctx.fillStyle = itemDef(heaviest).col;
      ctx.fillRect(x + 2, y + (w.h - 4) - fill, w.w - 4, fill);
    }

    /* the box: sides and a floor, open at the top so the load shows */
    ctx.fillStyle = w.derailed ? "#7a4a3a" : "#5c5347";
    ctx.fillRect(x, y, 2, w.h - 4);
    ctx.fillRect(x + w.w - 2, y, 2, w.h - 4);
    ctx.fillRect(x, y + w.h - 6, w.w, 2);

    /* wheels, dropped to the rail. A derailed wagon leans, which is the only
       cue that tells a player at a distance why the line has stopped. */
    ctx.fillStyle = "#33373b";
    const wy = y + w.h - 4 + (w.derailed ? 2 : 0);
    ctx.fillRect(x + 3, wy, 4, 4);
    ctx.fillRect(x + w.w - 7, wy + (w.derailed ? 2 : 0), 4, 4);
  }
}
