/* Trees and grass. LANE A (world).
   Scenery is not part of the landscape buffer: it is drawn on top and
   reacts to the ground under it being dug away. */

import { isSolid } from "./landscape.js";
import { state } from "../core/state.js";
import { rnd } from "../core/rng.js";
import { addDust } from "../core/fx.js";

export const trees = [];
export const grass = [];

export function clearScenery(){ trees.length = 0; grass.length = 0; }

export function updateScenery(){
  for(let i=0;i<trees.length;i++){
    const t = trees[i];
    if(t.fall===0){
      if(!isSolid(t.x, t.y+2) && !isSolid(t.x-1, t.y+3) && !isSolid(t.x+1, t.y+3)){
        t.fall = 0.001;
        t.fdir = rnd()<0.5 ? -1 : 1;
      }
    } else if(t.fall < 1){
      t.fall += 0.012 + t.fall*0.09;
      if(t.fall>1) t.fall = 1;
      if(!isSolid(t.x, t.y+2)) t.y += 1.4;
      if(t.fall===1) for(let k=0;k<10;k++) addDust(t.x+(rnd()-0.5)*20, t.y, "rgb(108,74,44)");
    } else {
      if(!isSolid(t.x, t.y+2) && t.y < state.world.H-4) t.y += 1.4;
    }
  }
  for(let g=grass.length-1;g>=0;g--){
    if(!isSolid(grass[g].x, grass[g].y+1)) grass.splice(g,1);
  }
}

export function drawTree(ctx, t, tick){
  const lean = t.fall * (t.fdir||1) * 1.45;
  ctx.save();
  ctx.translate(t.x, t.y+2);
  ctx.rotate(lean);
  const w = 3 + (t.h>56?1:0);
  ctx.fillStyle = "#4a3524";
  ctx.fillRect(-w/2, -t.h, w, t.h+2);
  ctx.fillStyle = "#5c4430";
  ctx.fillRect(-w/2, -t.h, 1, t.h+2);
  const sway = Math.sin(tick*0.02 + t.sway)*1.6*(1-t.fall);
  if(t.kind===0){
    const lay = 3 + (t.h>52?1:0);
    for(let i=0;i<lay;i++){
      const ly = -t.h + i*(t.h*0.22);
      const lw = (t.h*0.42) * (1 - i*0.18);
      ctx.fillStyle = i%2 ? "#2b4f28" : "#33602e";
      ctx.beginPath();
      ctx.moveTo(sway*(1-i*0.2), ly - t.h*0.20);
      ctx.lineTo(-lw/2 + sway, ly + t.h*0.14);
      ctx.lineTo( lw/2 + sway, ly + t.h*0.14);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    for(let b=0;b<5;b++){
      const a = b/5*6.283 + t.seed;
      const bx = Math.cos(a)*t.h*0.20 + sway, by = -t.h - 2 + Math.sin(a)*t.h*0.14;
      ctx.fillStyle = b%2 ? "#33652b" : "#285325";
      ctx.beginPath();
      ctx.ellipse(bx, by, t.h*0.26, t.h*0.20, 0, 0, 6.283);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawGrass(ctx, rect, tick){
  ctx.lineWidth = 1;
  for(let i=0;i<grass.length;i++){
    const g = grass[i];
    if(g.x < rect.x0 || g.x > rect.x1) continue;
    const sway = Math.sin(tick*0.035 + g.s)*1.1;
    ctx.strokeStyle = g.k ? "#7fa83e" : "#5d8c34";
    ctx.beginPath();
    ctx.moveTo(g.x+0.5, g.y+0.5);
    ctx.lineTo(g.x+0.5+sway, g.y+0.5-g.h);
    ctx.stroke();
  }
}
