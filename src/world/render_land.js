/* Painting the landscape. LANE A (world).

   The landscape lives on an offscreen canvas the size of the map. Only
   tiles that changed are repainted, then the whole thing is blitted once
   per frame. Pixel colour = material tint + grain + surface shading, all
   derived from the pixel position, so nothing has to be stored. */

import { MATS, M_SKY, M_EARTH, M_LAVA } from "./materials.js";
import { LW, LH, land, bg, isSolid, isLiquid, TS, TX, TY, tileDirty, dirtyList } from "./landscape.js";
import { pxs } from "./dynamics.js";
import { hash2, fbm, rnd } from "../core/rng.js";
import { state } from "../core/state.js";

export const landCan = (typeof document !== "undefined")
  ? document.createElement("canvas") : { width:LW, height:LH, getContext:()=>null };
landCan.width = LW; landCan.height = LH;
export const landCtx = landCan.getContext ? landCan.getContext("2d", { alpha:true }) : null;
const tileImg = landCtx ? landCtx.createImageData(TS,TS) : { data:new Uint8ClampedArray(TS*TS*4) };

let animPhase = 0;
export const lavaTiles = [];
const lavaTileSeen = new Uint8Array(TX*TY);

export function paintPixel(x,y,d,o){
  const m = land[y*LW+x];
  if(m===M_SKY){ d[o]=0; d[o+1]=0; d[o+2]=0; d[o+3]=0; return; }
  const M = MATS[m];
  let r=M.col[0], g=M.col[1], b=M.col[2];

  const n  = hash2(x,y,M.seed);
  const np = fbm(x*0.10, y*0.10, M.seed+53, 2);
  let sh = (n-0.5)*M.grain + (np-0.5)*M.patch;

  if(M.fleck && hash2(x,y,M.seed+911) < M.fleckChance*(0.45+np)){
    r=M.fleck[0]; g=M.fleck[1]; b=M.fleck[2];
    sh *= 0.5;
  }
  r+=sh; g+=sh; b+=sh;

  if(M.solid){
    if(!isSolid(x,y-1)){
      const grass = (m===M_EARTH && bg[y*LW+x]===0 && !isLiquid(x,y-1));
      if(grass){ r = r*0.35 + 96*0.65; g = g*0.35 + 140*0.65; b = b*0.35 + 58*0.65; }
      else { r+=34; g+=32; b+=26; }
    } else if(!isSolid(x,y-2)){
      if(m===M_EARTH && bg[y*LW+x]===0){ r = r*0.6 + 74*0.4; g = g*0.6 + 104*0.4; b = b*0.6 + 46*0.4; }
      else { r+=17; g+=16; b+=13; }
    } else if(!isSolid(x,y-3)){
      r+=7; g+=7; b+=5;
    }
    if(!isSolid(x,y+1)){ r-=22; g-=20; b-=18; }
    if(!isSolid(x-1,y) || !isSolid(x+1,y)){ r-=6; g-=6; b-=5; }
    d[o+3]=255;
  } else if(M.isLiq){
    if(m===M_LAVA){
      const glow = fbm(x*0.06, y*0.06 - animPhase*0.35, 777, 2);
      r += glow*70; g += glow*54; b += glow*8;
      if(!isLiquid(x,y-1)){ r += 40; g += 20; }
      d[o+3]=255;
      const tt = ((y/TS)|0)*TX + ((x/TS)|0);
      if(!lavaTileSeen[tt]){ lavaTileSeen[tt]=1; lavaTiles.push(tt); }
    } else {
      let dep = 0;
      if(isLiquid(x,y-1)) dep+=8;
      if(isLiquid(x,y-4)) dep+=8;
      if(isLiquid(x,y-10)) dep+=8;
      r -= dep; g -= dep*0.7; b -= dep*0.2;
      if(!isLiquid(x,y-1)){ r+=26; g+=34; b+=44; }
      d[o+3]=232;
    }
  } else {
    d[o+3]=255;
    if(isSolid(x,y-1)){ r-=6; g-=5; b-=4; }
  }
  d[o]   = r<0?0:(r>255?255:r);
  d[o+1] = g<0?0:(g>255?255:g);
  d[o+2] = b<0?0:(b>255?255:b);
}

export function renderTile(t){
  if(!landCtx) return;
  const tx = t%TX, ty = (t/TX)|0;
  const x0 = tx*TS, y0 = ty*TS;
  const w = Math.min(TS, LW-x0), h = Math.min(TS, LH-y0);
  const img = (w===TS && h===TS) ? tileImg : landCtx.createImageData(w,h);
  const d = img.data;
  let o = 0;
  for(let y=y0;y<y0+h;y++)
    for(let x=x0;x<x0+w;x++,o+=4) paintPixel(x,y,d,o);
  landCtx.putImageData(img, x0, y0);
}

export function flushDirty(limit){
  const n = Math.min(dirtyList.length, limit===undefined?100000:limit);
  for(let i=0;i<n;i++){
    const t = dirtyList[i];
    tileDirty[t] = 0;
    renderTile(t);
  }
  if(n===dirtyList.length) dirtyList.length = 0;
  else dirtyList.splice(0,n);
}
export function renderAll(){
  dirtyList.length = 0;
  tileDirty.fill(0);
  lavaTiles.length = 0; lavaTileSeen.fill(0);
  for(let t=0;t<TX*TY;t++) renderTile(t);
}
/* lava keeps glowing: re-render its tiles now and then */
export function animateLava(tick){
  if(tick%9!==0 || !lavaTiles.length) return;
  animPhase = tick*0.05;
  for(let i=0;i<lavaTiles.length;i++){
    const t = lavaTiles[i];
    if(!tileDirty[t]){ tileDirty[t]=1; dirtyList.push(t); }
  }
}

/* ------------------------------ sky ---------------------------------- */
export function renderSky(ctx){
  const { view, cam } = state;
  const top = Math.max(0, Math.min(1, (cam.y-200)/700));
  const gr = ctx.createLinearGradient(0,0,0,view.h);
  gr.addColorStop(0, "rgb("+Math.round(96-top*84)+","+Math.round(152-top*134)+","+Math.round(206-top*180)+")");
  gr.addColorStop(1, "rgb("+Math.round(176-top*160)+","+Math.round(200-top*184)+","+Math.round(214-top*196)+")");
  ctx.fillStyle = gr;
  ctx.fillRect(0,0,view.w,view.h);
}
export function renderParallax(ctx){
  const { view, cam, tick } = state;
  if(cam.y > 620) return;
  const layers = [
    { d:0.30, col:"rgba(74,96,86,0.55)", amp:52, base:250, freq:0.0016 },
    { d:0.48, col:"rgba(56,74,64,0.75)", amp:70, base:300, freq:0.0026 }
  ];
  for(let l=0;l<layers.length;l++){
    const L = layers[l];
    ctx.fillStyle = L.col;
    ctx.beginPath();
    ctx.moveTo(0,view.h);
    for(let sx=0; sx<=view.w; sx+=8){
      const wx = (sx - view.w/2)/cam.zoom + cam.x*L.d;
      const h  = L.base + (fbm(wx*L.freq, 5.5, 991+l*37, 3)-0.5)*L.amp*2;
      const sy = (h - cam.y*L.d - 60)*cam.zoom + view.h/2;
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(view.w, view.h);
    ctx.closePath();
    ctx.fill();
  }
  if(cam.y > 520) return;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  for(let i=0;i<14;i++){
    const bx = (i*613 + tick*0.25) % 3000;
    const wx = bx - cam.x*0.18;
    const wy = 40 + (i%5)*46;
    const sx = wx*0.6 + view.w/2 - 400;
    const sy = (wy - cam.y*0.18)*cam.zoom*0.5 + view.h*0.18;
    if(sx<-200 || sx>view.w+200) continue;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 70+(i%4)*40, 16+(i%3)*8, 0, 0, 6.283);
    ctx.fill();
  }
}

/* ------------------------- landscape + loose ------------------------- */
export function renderLandscape(ctx){
  flushDirty(700);
  ctx.drawImage(landCan, 0, 0);
}
export function renderLoose(ctx){
  for(let p=0;p<pxs.length;p++){
    const q = pxs[p], M = MATS[q.m];
    ctx.fillStyle = "rgb("+M.col[0]+","+M.col[1]+","+M.col[2]+")";
    ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
  }
}
