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

import { isLoaded, rSolid, surface } from "./landscape.js";
import { LW } from "./config.js";
import { TOOLS } from "../content/tools.js";
import { state } from "../core/state.js";
import { rnd, hash2 } from "../core/rng.js";
import { addDust } from "../core/fx.js";
import { bus } from "../core/bus.js";

export const trees = [];
export const grass = [];
export const clutter = [];

export function clearScenery(){ trees.length = 0; grass.length = 0; clutter.length = 0; }

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

/* ------------------------------------------------------------ drawing ----
   Everything below varies per item, and every variation comes from that
   item's stored seed through hash2 - never from Math.random, and never
   from anything that changes when a chunk pages in and out. Two clients
   drawing the same forest have to draw the same trees, and a tree must not
   reshuffle when you walk away and come back.

   The terrain underneath is deliberately untouched. This is about what
   sits on it. */

/* a stable 0..1 for this item and purpose */
function vary(seed, k){ return hash2(seed, k, 5701); }

const CONIFER = [
  { dark: "#1a3418", mid: "#2b4f28", lit: "#4a7c3c" },
  { dark: "#16301b", mid: "#28502c", lit: "#457f45" },
  { dark: "#1c3714", mid: "#325626", lit: "#54873c" }
];
const BROADLEAF = [
  { dark: "#193a16", mid: "#2f6127", lit: "#549240" },
  { dark: "#1d3a12", mid: "#376024", lit: "#5c9440" }
];

export function drawTree(ctx, t, tick){
  const lean = t.fall * (t.fdir || 1) * 1.45;
  const S = t.seed, h = t.h;
  const sway = Math.sin(tick*0.02 + t.sway) * 1.6 * (1 - t.fall);

  ctx.save();
  ctx.translate(t.x, t.y + 2);
  /* a standing tree is never quite upright */
  ctx.rotate(lean + (vary(S,1) - 0.5) * 0.13 * (1 - t.fall));

  /* --- trunk: tapered, and flared where it meets the ground ---
     It stops inside the canopy rather than at the treetop, or a bare stick
     pokes out of the top of every tree. */
  const trunkTop = -h * (t.kind === 0 ? 0.84 : 0.80);
  const wBase = 2.2 + h*0.030 + vary(S,2)*1.4;
  const wTop  = wBase * 0.34;
  const flare = wBase * 0.55;
  ctx.fillStyle = "#42301f";
  ctx.beginPath();
  ctx.moveTo(-wBase/2 - flare, 4);
  ctx.quadraticCurveTo(-wBase/2, 0, -wTop/2 + sway*0.3, trunkTop);
  ctx.lineTo( wTop/2 + sway*0.3, trunkTop);
  ctx.quadraticCurveTo( wBase/2, 0,  wBase/2 + flare, 4);
  ctx.closePath();
  ctx.fill();
  /* the sunward side catches the light */
  ctx.fillStyle = "#584028";
  ctx.beginPath();
  ctx.moveTo(-wBase/2 - flare, 4);
  ctx.quadraticCurveTo(-wBase/2, 0, -wTop/2 + sway*0.3, trunkTop);
  ctx.lineTo(-wTop/2 + 0.9 + sway*0.3, trunkTop);
  ctx.quadraticCurveTo(-wBase/2 + 1.1, 0, -wBase/2 - flare + 1.6, 4);
  ctx.closePath();
  ctx.fill();

  if(t.kind === 0) drawConifer(ctx, t, h, S, sway);
  else             drawBroadleaf(ctx, t, h, S, sway);

  ctx.restore();
}

/* A tier with a ragged lower edge. A clean hypotenuse is what makes the
   old version read as a road sign rather than as a tree. */
function tier(ctx, apexX, apexY, x0, x1, baseY, S, k){
  const steps = 5;
  ctx.beginPath();
  ctx.moveTo(apexX, apexY);
  ctx.lineTo(x0, baseY);
  for(let i = 1; i <= steps; i++){
    const u = i / steps;
    const jag = (vary(S, k*17 + i) - 0.5) * (baseY - apexY) * 0.22;
    const dip = (i % 2 ? 1 : 0.35) * jag;
    ctx.lineTo(x0 + (x1 - x0) * u, baseY + dip);
  }
  ctx.closePath();
  ctx.fill();
}

function drawConifer(ctx, t, h, S, sway){
  const pal = CONIFER[(S + t.x) % CONIFER.length];
  /* Tiers overlap by more than half their height. Spaced any further apart
     they stop reading as one canopy and become a stack of separate
     chevrons with trunk showing between them, which is the thing that made
     the old version look like signage. */
  const lay = 4 + Math.floor(vary(S,3) * 3);            /* 4..6 tiers */
  const spread = 0.46 + vary(S,4) * 0.16;
  const drop = h * (0.56 / lay);
  const tall = h * 0.15;                                /* flatter than wide */
  for(let i = 0; i < lay; i++){
    const ly = -h + i*drop + h*0.22;
    const taper = 1 - i * (0.10 + vary(S,5)*0.05);
    const lw = h * spread * taper * (0.88 + vary(S, 20+i) * 0.26);
    const sx = sway * (1 - i*0.18);
    const apexY = ly - tall, baseY = ly + tall;
    /* the underside first, offset down: depth for almost nothing */
    ctx.fillStyle = pal.dark;
    tier(ctx, sx, apexY + 1.2, -lw/2 + sx - 1.0, lw/2 + sx + 1.0, baseY + 2.0, S, i);
    ctx.fillStyle = pal.mid;
    tier(ctx, sx, apexY, -lw/2 + sx, lw/2 + sx, baseY, S, i);
    /* and the sunward face, which is most of the left half */
    ctx.fillStyle = pal.lit;
    tier(ctx, sx, apexY, -lw/2 + sx, -lw*0.04 + sx, baseY - 0.5, S, i + 7);
  }
}

function drawBroadleaf(ctx, t, h, S, sway){
  const pal = BROADLEAF[(S + t.x) % BROADLEAF.length];
  const blobs = 6 + Math.floor(vary(S,6) * 4);          /* 6..9 */
  const spread = h * (0.17 + vary(S,7)*0.07);
  const top = -h + h*0.10;
  for(let pass = 0; pass < 3; pass++){
    ctx.fillStyle = pass === 0 ? pal.dark : (pass === 1 ? pal.mid : pal.lit);
    for(let b = 0; b < blobs; b++){
      const a = (b / blobs) * 6.283 + vary(S, 30+b) * 1.4;
      const rr = spread * (0.7 + vary(S, 40+b) * 0.6);
      const bx = Math.cos(a) * rr + sway;
      const by = top + Math.sin(a) * rr * 0.72;
      /* dark sits low and right, lit sits high and left */
      const ox = pass === 0 ? 1.4 : (pass === 2 ? -1.6 : 0);
      const oy = pass === 0 ? 2.0 : (pass === 2 ? -1.8 : 0);
      const sz = h * (0.17 + vary(S, 50+b) * 0.09) * (pass === 2 ? 0.72 : 1);
      ctx.beginPath();
      ctx.ellipse(bx + ox, by + oy, sz, sz * (0.78 + vary(S,60+b)*0.22), 0, 0, 6.283);
      ctx.fill();
    }
  }
}

/* ------------------------------------------------------------- grass ----
   A band rather than a line: heights and greens vary, and a blade leans
   with the ground it stands on, which matters because this surface is all
   curves. */
const GRASS = ["#4f7d2c", "#5d8c34", "#6b9a3a", "#7fa83e", "#87643a"];

export function drawGrass(ctx, rect, tick){
  ctx.lineWidth = 1;
  for(let i = 0; i < grass.length; i++){
    const g = grass[i];
    if(g.x < rect.x0 || g.x > rect.x1) continue;
    const v = vary(g.x, g.y);
    const slope = (surface[Math.max(0, g.x-3)] - surface[Math.min(LW-1, g.x+3)]) * 0.18;
    const sway = Math.sin(tick*0.035 + g.s) * (0.7 + v*0.9);
    const hgt = g.h * (0.6 + v*0.9);
    ctx.strokeStyle = GRASS[(g.x + (g.k ? 3 : 0)) % GRASS.length];
    ctx.beginPath();
    ctx.moveTo(g.x + 0.5, g.y + 0.5);
    /* a bend rather than a spike */
    ctx.quadraticCurveTo(g.x + 0.5 + slope*0.5 + sway*0.4, g.y + 0.5 - hgt*0.6,
                         g.x + 0.5 + slope + sway, g.y + 0.5 - hgt);
    ctx.stroke();
  }
}

/* ----------------------------------------------------------- clutter ----
   Stones, shrubs, flowers and fallen branches. Their real job is to make
   the EMPTY stretches read as empty: a barren place looks barren only next
   to somewhere with things lying about in it. */
export function drawClutter(ctx, rect, tick){
  for(let i = 0; i < clutter.length; i++){
    const c = clutter[i];
    if(c.x < rect.x0 || c.x > rect.x1) continue;
    const v = vary(c.x, c.y);
    if(c.kind === 0){                                   /* a loose stone */
      ctx.fillStyle = v > 0.5 ? "#7d756a" : "#6b6459";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - c.s*0.4, c.s, c.s*0.7, v*2, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = "#918a7e";
      ctx.beginPath();
      ctx.ellipse(c.x - c.s*0.25, c.y - c.s*0.65, c.s*0.45, c.s*0.3, v*2, 0, 6.283);
      ctx.fill();
    } else if(c.kind === 1){                            /* a shrub */
      const sway = Math.sin(tick*0.03 + c.s) * 0.6;
      for(let b = 0; b < 4; b++){
        ctx.fillStyle = b < 2 ? "#2f5624" : "#3e6d2c";
        ctx.beginPath();
        ctx.ellipse(c.x + (b-1.5)*c.s*0.5 + sway, c.y - c.s*0.5 - (b%2)*c.s*0.4,
                    c.s*0.7, c.s*0.55, 0, 0, 6.283);
        ctx.fill();
      }
    } else if(c.kind === 2){                            /* a flower */
      const sway = Math.sin(tick*0.04 + c.s) * 0.8;
      ctx.strokeStyle = "#4f7d2c"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x + 0.5, c.y + 0.5);
      ctx.lineTo(c.x + 0.5 + sway, c.y + 0.5 - c.s*2.2);
      ctx.stroke();
      ctx.fillStyle = c.col;
      ctx.beginPath();
      ctx.arc(c.x + 0.5 + sway, c.y + 0.5 - c.s*2.4, c.s*0.75, 0, 6.283);
      ctx.fill();
    } else {                                            /* a fallen branch */
      ctx.strokeStyle = "#4a3524";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(c.x - c.s*1.6, c.y);
      ctx.quadraticCurveTo(c.x, c.y - c.s*0.8, c.x + c.s*1.6, c.y - c.s*0.2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
}
