/* Darkness and light. LANE A (world).

   Underground is black. Light comes from three places:

     - the sky: pixels whose background is sky are daylit, and that light
       bleeds a little way into the mouth of a shaft
     - the head lamp: rays cast from the player, blocked by solid material,
       with a wider reach in the direction being aimed at
     - glowing materials: lava and uranium light their own caverns

   Light is computed on a coarse grid over the visible area only, then
   drawn as one smoothly scaled darkness overlay. Nothing is stored in the
   landscape, so this costs nothing when the player is above ground. */

import { MATS } from "./materials.js";
import { LW, LH, land, bg, surface, isSolid } from "./landscape.js";
import { state } from "../core/state.js";
import { clamp } from "../core/rng.js";

export const CELL = 4;                 /* world pixels per light cell */
const MAX_CELLS = 260*260;

let gw = 0, gh = 0, gx0 = 0, gy0 = 0;
let lightGrid = new Float32Array(MAX_CELLS);
let matGrid   = new Uint8Array(MAX_CELLS);
let tmpGrid   = new Float32Array(MAX_CELLS);

const overlay = (typeof document !== "undefined") ? document.createElement("canvas") : null;
const overlayCtx = overlay ? overlay.getContext("2d") : null;
let overlayImg = null;

export const lightConfig = {
  enabled: true,
  darkness: 0.985,        /* how black unlit ground gets (0..1) */
  skyBleed: 2,            /* blur passes: how far daylight creeps into a shaft */
  rays: 128
};

function sampleCell(gx,gy){
  const wx = clamp(gx0*CELL + gx*CELL + (CELL>>1), 0, LW-1);
  const wy = clamp(gy0*CELL + gy*CELL + (CELL>>1), 0, LH-1);
  return wy*LW + wx;
}

export function computeLight(rect){
  gx0 = Math.floor(rect.x0/CELL) - 1;
  gy0 = Math.floor(rect.y0/CELL) - 1;
  gw  = Math.ceil((rect.x1-rect.x0)/CELL) + 3;
  gh  = Math.ceil((rect.y1-rect.y0)/CELL) + 3;
  if(gw*gh > MAX_CELLS){                       /* zoomed far out: coarser */
    const scale = Math.sqrt(MAX_CELLS/(gw*gh));
    gw = Math.max(2, Math.floor(gw*scale));
    gh = Math.max(2, Math.floor(gh*scale));
  }

  /* --- 1. daylight --- */
  for(let gy=0; gy<gh; gy++){
    for(let gx=0; gx<gw; gx++){
      const g = gy*gw+gx;
      const wx = gx0*CELL + gx*CELL + (CELL>>1);
      const wy = gy0*CELL + gy*CELL + (CELL>>1);
      if(wx<0 || wx>=LW || wy>=LH){ lightGrid[g] = 0; matGrid[g] = 0; continue; }
      if(wy<0){ lightGrid[g] = 1; matGrid[g] = 0; continue; }
      const i = wy*LW+wx;
      matGrid[g] = land[i];
      if(wy < surface[wx]) lightGrid[g] = 1;
      else lightGrid[g] = bg[i] ? 0 : 0.85;
    }
  }

  /* --- 2. let it bleed into shaft mouths --- */
  for(let pass=0; pass<lightConfig.skyBleed; pass++){
    for(let gy=0; gy<gh; gy++){
      const row = gy*gw;
      for(let gx=0; gx<gw; gx++){
        const a = lightGrid[row + Math.max(0,gx-1)];
        const b = lightGrid[row + gx];
        const c = lightGrid[row + Math.min(gw-1,gx+1)];
        tmpGrid[row+gx] = (a+b*2+c)*0.25;
      }
    }
    for(let gx=0; gx<gw; gx++){
      for(let gy=0; gy<gh; gy++){
        const a = tmpGrid[Math.max(0,gy-1)*gw+gx];
        const b = tmpGrid[gy*gw+gx];
        const c = tmpGrid[Math.min(gh-1,gy+1)*gw+gx];
        lightGrid[gy*gw+gx] = (a+b*2+c)*0.25;
      }
    }
  }

  /* --- 3. glowing materials --- */
  for(let gy=0; gy<gh; gy++){
    for(let gx=0; gx<gw; gx++){
      const g = gy*gw+gx;
      const M = MATS[matGrid[g]];
      if(!M || !M.light) continue;
      const strength = M.light;
      const rad = M.light>0.8 ? 4 : 2;
      for(let dy=-rad; dy<=rad; dy++){
        const yy = gy+dy;
        if(yy<0||yy>=gh) continue;
        for(let dx=-rad; dx<=rad; dx++){
          const xx = gx+dx;
          if(xx<0||xx>=gw) continue;
          const d = Math.sqrt(dx*dx+dy*dy);
          if(d>rad) continue;
          const v = strength*(1 - d/(rad+1));
          const gi = yy*gw+xx;
          if(lightGrid[gi] < v) lightGrid[gi] = v;
        }
      }
    }
  }

  /* --- 4. the head lamp --- */
  const p = state.player;
  const lamp = p.lamp;
  if(lamp && lamp.on && lamp.power>0) castLamp(p, lamp);

  return { gw, gh, gx0, gy0, grid: lightGrid };
}

function addLight(wx, wy, v){
  const gx = Math.floor(wx/CELL) - gx0;
  const gy = Math.floor(wy/CELL) - gy0;
  if(gx<0||gy<0||gx>=gw||gy>=gh) return;
  const g = gy*gw+gx;
  if(lightGrid[g] < v) lightGrid[g] = v;
}

function castLamp(p, lamp){
  const rays = lightConfig.rays;
  const aimA = Math.atan2(p.aim.y, p.aim.x);
  const coneHalf = 0.62;
  const step = CELL*0.75;
  for(let i=0;i<rays;i++){
    const a = (i/rays)*6.28318;
    let da = Math.abs(((a - aimA + Math.PI*3) % 6.28318) - Math.PI);
    const inCone = da < coneHalf;
    const maxD = (inCone ? lamp.cone : lamp.radius) * lamp.power;
    const ca = Math.cos(a), sa = Math.sin(a);
    for(let d=2; d<maxD; d+=step){
      const wx = p.x + ca*d, wy = p.y + sa*d;
      if(wx<0||wy<0||wx>=LW||wy>=LH) break;
      let v = 1 - d/maxD;
      v = v*v*(inCone ? 1 : 0.85);
      addLight(wx, wy, v);
      if(isSolid(Math.round(wx), Math.round(wy))){
        addLight(wx+ca*CELL, wy+sa*CELL, v*0.55);   /* light the wall face */
        break;
      }
    }
  }
  addLight(p.x, p.y, 1);
}

export function renderLight(ctx){
  if(!lightConfig.enabled || !overlayCtx) return;
  if(!overlayImg || overlayImg.width!==gw || overlayImg.height!==gh){
    overlay.width = gw; overlay.height = gh;
    overlayImg = overlayCtx.createImageData(gw, gh);
  }
  const d = overlayImg.data;
  const dark = lightConfig.darkness;
  for(let i=0, o=0; i<gw*gh; i++, o+=4){
    const l = lightGrid[i];
    const a = clamp((1 - l), 0, 1) * dark;
    d[o] = 5; d[o+1] = 6; d[o+2] = 10;
    d[o+3] = Math.round(a*255);
  }
  overlayCtx.putImageData(overlayImg, 0, 0);

  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(overlay, gx0*CELL, gy0*CELL, gw*CELL, gh*CELL);
  ctx.imageSmoothingEnabled = smooth;

  /* a warm halo so the lamp reads as a lamp and not just a hole in the dark */
  const p = state.player;
  if(p.lamp && p.lamp.on && p.lamp.power>0){
    const r = p.lamp.radius*p.lamp.power*0.9;
    const gr = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
    gr.addColorStop(0, "rgba(255,226,160,0.20)");
    gr.addColorStop(1, "rgba(255,200,120,0)");
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
    ctx.globalCompositeOperation = op;
  }
}

/* how lit a world position is - lane B/C/D can use this for gameplay */
export function lightAt(wx, wy){
  const gx = Math.floor(wx/CELL) - gx0;
  const gy = Math.floor(wy/CELL) - gy0;
  if(gx<0||gy<0||gx>=gw||gy>=gh) return 0;
  return lightGrid[gy*gw+gx];
}
