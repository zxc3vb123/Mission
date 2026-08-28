/* Trees and grass. LANE A (world).
   Scenery is not part of the landscape buffer: it is drawn on top and
   reacts to the ground under it being dug away.

   CHOPPING. Wood has exactly one source: felling a tree with an axe
   (src/content/items.js, and the whole of stage 1 hangs off it). So the
   axe gate has to be real - no axe, no wood, however clever you are:

     chop a standing tree   it topples, and the logs are yours when it lands
     dig the ground away    it topples on its own, and lies there as a downed
                            trunk that still needs an axe to cut up

   That second rule is what stops undermining being a way round the axe.
   Felling and bucking are the same verb, so the player only learns one. */

import { isLoaded, rSolid } from "./landscape.js";
import { TOOLS } from "../content/tools.js";
import { state } from "../core/state.js";
import { rnd } from "../core/rng.js";
import { addDust } from "../core/fx.js";
import { bus } from "../core/bus.js";

export const trees = [];
export const grass = [];

export function clearScenery(){ trees.length = 0; grass.length = 0; }

/* Hit points per tree are its height, so a big tree is a longer job, and
   an axe of relative speed 1.00 takes about four seconds over an average
   one. Fast enough not to be a chore, slow enough to be a decision. */
export const CHOP_RATE = 14;              /* hp per second at axe speed 1.00 */
const TRUNK_GRAB = 5;                     /* how far off the trunk still counts */

export function chopSpeedFor(toolId){
  const T = TOOLS[toolId];
  if(!T || T.kind !== "axe") return 0;    /* no axe, no wood. Ever. */
  return CHOP_RATE * T.speed;
}

function logsFrom(t){ return 2 + Math.floor(t.h / 18); }

/* the trunk as a line segment in world space, standing or fallen */
function trunkEnds(t){
  const lean = t.fall * (t.fdir || 1) * 1.45;
  const bx = t.x, by = t.y + 2;
  return { x0: bx, y0: by,
           x1: bx + Math.sin(lean) * t.h,
           y1: by - Math.cos(lean) * t.h };
}

function distToTrunk(t, px, py){
  const e = trunkEnds(t);
  const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
  const len2 = dx*dx + dy*dy || 1;
  let u = ((px - e.x0) * dx + (py - e.y0) * dy) / len2;
  u = u < 0 ? 0 : (u > 1 ? 1 : u);
  const cx = e.x0 + dx*u, cy = e.y0 + dy*u;
  return Math.sqrt((px-cx)*(px-cx) + (py-cy)*(py-cy));
}

/* the tree whose trunk is nearest this point, standing or lying */
export function treeNear(px, py, r){
  let best = null, bestD = r + TRUNK_GRAB;
  for(let i=0;i<trees.length;i++){
    const t = trees[i];
    if(!isLoaded(t.x, t.y)) continue;
    const d = distToTrunk(t, px, py);
    if(d < bestD){ bestD = d; best = t; }
  }
  return best;
}

/* One swing. Returns what happened so lane B can play the right cue and
   stop swinging when the answer is "not with that, you cannot".

   `collect` false fells the tree without yielding its logs, the same way
   digFreeCircle takes pixels without producing spoil. That is what lets
   lane NET replay a remote player's chop: the tree comes down on every
   screen, and the wood lands only in front of the player who swung. */
export function chopAt(px, py, r, toolId, collect){
  const rate = chopSpeedFor(toolId);
  const t = treeNear(px, py, r);
  if(!t) return { hit:false, felled:false, progress:0, canChop:rate > 0 };
  if(rate <= 0) return { hit:true, felled:false, progress:1 - t.hp/t.hpMax, canChop:false };

  t.hp -= rate / 36;                       /* the tick is fixed at 36 Hz */
  if(rnd() < 0.5) addDust(t.x + (rnd()-0.5)*4, py, "rgb(150,110,66)");

  if(t.hp > 0)
    return { hit:true, felled:false, progress:1 - t.hp/t.hpMax, canChop:true };

  t.hp = 0;
  const yields = collect !== false;
  if(t.fall === 0){
    t.fall = 0.001;
    t.fdir = px > t.x ? -1 : 1;            /* it falls away from the axe */
    /* Felled either way - the tree has to come down identically on every
       screen. `silent` only decides whether the logs are produced, so a
       replayed chop leaves the same world and not the same wood. */
    t.chopped = true;
    t.silent = !yields;
    return { hit:true, felled:true, progress:1, canChop:true };
  }
  /* already lying down - this was bucking it up into logs */
  if(yields) yieldWood(t); else dropTree(t);
  return { hit:true, felled:true, progress:1, canChop:true };
}

function dropTree(t){
  const i = trees.indexOf(t);
  if(i >= 0) trees.splice(i, 1);
}
function yieldWood(t){
  const n = logsFrom(t);
  for(let k=0;k<n;k++)
    bus.emit("dig:yield", { item:"wood", x: t.x + (k-n/2)*3, y: t.y - 2 });
  bus.emit("tree:felled", { x: t.x, y: t.y, wood: n });
  dropTree(t);
}

/* Only scenery standing on loaded ground is simulated: a tree twenty
   chunks away must not page its ground back in just to ask whether it is
   still upright. It picks up where it left off when you walk back. */
export function updateScenery(){
  for(let i=0;i<trees.length;i++){
    const t = trees[i];
    if(!isLoaded(t.x, t.y+2)) continue;
    if(t.fall===0){
      if(!rSolid(t.x, t.y+2) && !rSolid(t.x-1, t.y+3) && !rSolid(t.x+1, t.y+3)){
        t.fall = 0.001;
        t.fdir = rnd()<0.5 ? -1 : 1;
      }
    } else if(t.fall < 1){
      t.fall += 0.012 + t.fall*0.09;
      if(t.fall>1) t.fall = 1;
      if(!rSolid(t.x, t.y+2)) t.y += 1.4;
      if(t.fall===1){
        for(let k=0;k<10;k++) addDust(t.x+(rnd()-0.5)*20, t.y, "rgb(108,74,44)");
        /* Chopped down: the logs are yours. Merely undermined: it lies
           there, and still wants an axe before it is wood. */
        if(t.chopped){
          if(t.silent) dropTree(t); else yieldWood(t);
          i--; continue;
        }
      }
    } else {
      if(!rSolid(t.x, t.y+2) && t.y < state.world.H-4) t.y += 1.4;
    }
  }
  for(let g=grass.length-1;g>=0;g--){
    const b = grass[g];
    if(!isLoaded(b.x, b.y+1)) continue;
    if(!rSolid(b.x, b.y+1)) grass.splice(g,1);
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
