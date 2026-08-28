/* Drawing what is alive. LANE I (creatures).

   No test in this repo executes one line of this file - the suites are
   headless (docs/WORKFLOW.md 5d) - so it is kept deliberately small and
   dull, and it was opened in a browser and made to draw before it shipped.

   THE TRAP 5d NAMES, avoided on purpose below: on a hidden or unsized page
   `state.view.w` is 0, so the usual `view.w / (2 * zoom) + pad` cull
   collapses to a band a few pixels wide and everything vanishes in a way
   that looks exactly like code that never ran. A floor on the half-width
   costs nothing and removes the whole class. */

import { state } from "../core/state.js";
import { BANDS } from "./spec.js";

const BODY = ["#241d22", "#1d1820", "#17141c"];
const EDGE = ["#3a2f38", "#2f2833", "#26212c"];
const EYE  = ["#d8b06a", "#e0a15a", "#e88a5a"];

export function drawCrawlers(ctx, list){
  if(!list.length) return;

  const zoom = state.cam.zoom || 3;
  const hw = Math.max(state.view.w, 640) / (2 * zoom) + 40;
  const hh = Math.max(state.view.h, 360) / (2 * zoom) + 40;
  const x0 = state.cam.x - hw, x1 = state.cam.x + hw;
  const y0 = state.cam.y - hh, y1 = state.cam.y + hh;

  for(const c of list){
    if(c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
    const b = BANDS[c.band] || BANDS[0];
    const s = b.size;
    const x = c.x, y = c.y;

    /* legs: four of them, walking with the body's own phase, so a crawler
       that is holding at the edge of the light is visibly holding still */
    ctx.strokeStyle = EDGE[c.band] || EDGE[0];
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i = 0; i < 4; i++){
      const t = c.phase + i * 1.6;
      const lx = x + (i < 2 ? -s : s) * 0.7;
      const ly = y + s * 0.4;
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + Math.cos(t) * s * 0.9, ly + Math.abs(Math.sin(t)) * s * 0.5 + s * 0.5);
    }
    ctx.stroke();

    /* the body, low and wide - it reads as something that lives in a
       crawlspace rather than something that stands up */
    ctx.fillStyle = BODY[c.band] || BODY[0];
    ctx.beginPath();
    ctx.ellipse(x, y, s * 1.5, s, 0, 0, 6.28318);
    ctx.fill();

    /* two eyes catching the light, on the side it is facing. This is the
       only part a player usually sees, and it is the point: what you meet
       in an unlit shaft is a pair of eyes at knee height. */
    ctx.fillStyle = EYE[c.band] || EYE[0];
    const ex = x + c.dir * s * 1.0, ey = y - s * 0.25;
    ctx.fillRect(ex - 0.5, ey - 0.5, 1, 1);
    ctx.fillRect(ex + c.dir * 1.5 - 0.5, ey - 0.5, 1, 1);

    /* hurt: a thin bar, and only while it is hurt. A health bar over
       everything alive would turn a mine into an interface. */
    if(c.hp < c.hpMax){
      const w = s * 3;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - w / 2, y - s - 4, w, 1.5);
      ctx.fillStyle = "rgba(200,70,60,0.9)";
      ctx.fillRect(x - w / 2, y - s - 4, w * Math.max(0, c.hp / c.hpMax), 1.5);
    }
  }
}

/* The stroke itself: a short arc where the tool went, fading over the few
   ticks after the swing. Lane B owns the ARM - this is only the trail, so
   that a swing at nothing still reads as a swing. */
export function drawSwing(ctx, last){
  if(!last) return;
  const age = state.tick - last.tick;
  if(age < 0 || age > 6) return;
  const a = 1 - age / 6;
  const ang = Math.atan2(last.ay, last.ax);
  ctx.save();
  ctx.strokeStyle = last.hit ? "rgba(255,225,200," + (a * 0.85).toFixed(2) + ")"
                             : "rgba(210,215,225," + (a * 0.45).toFixed(2) + ")";
  ctx.lineWidth = last.hit ? 1.6 : 1;
  ctx.beginPath();
  ctx.arc(last.x, last.y, last.reach, ang - 0.9 + age * 0.22, ang + 0.5 + age * 0.22);
  ctx.stroke();
  ctx.restore();
}
