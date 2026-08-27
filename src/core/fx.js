/* Shared visual particles: dust, steam, splashes, blast rings.
   LANE E (core). Any lane may call these - they never affect simulation. */

import { rnd, clamp } from "./rng.js";
import { state } from "./state.js";

export const fxParticles = [];
export const fxShocks = [];

export function addDust(x,y,col){
  fxParticles.push({ x, y, vx:(rnd()-0.5)*0.8, vy:-rnd()*0.6, life:0, max:18+rnd()*14,
                     col, size:1+rnd()*1.4, grav:0.06, light:0 });
}
export function addSteam(x,y){
  fxParticles.push({ x, y, vx:(rnd()-0.5)*0.5, vy:-0.6-rnd()*0.5, life:0, max:40+rnd()*30,
                     col:"rgba(230,230,235,0.7)", size:1.5+rnd()*2.5, grav:-0.01, light:0 });
}
export function addSplash(x,y,col){
  fxParticles.push({ x, y, vx:(rnd()-0.5)*1.6, vy:-0.8-rnd()*1.2, life:0, max:22+rnd()*12,
                     col, size:1+rnd()*1.5, grav:0.12, light:0 });
}
export function addSpark(x,y,col){
  fxParticles.push({ x, y, vx:(rnd()-0.5)*2.2, vy:-rnd()*2.0, life:0, max:16+rnd()*12,
                     col, size:1+rnd(), grav:0.10, light:1 });
}
export function addShock(x,y,r){
  fxShocks.push({ x, y, r:2, max:r*2.2, life:0 });
  state.cam.shake = 12; state.cam.shakeMag = 3;
}

/* the landscape decides whether a particle is blocked; injected to keep
   core free of world imports */
let solidTest = () => false;
export function setFxSolidTest(fn){ solidTest = fn; }

export function updateFX(){
  for(let i=fxParticles.length-1;i>=0;i--){
    const p = fxParticles[i];
    p.vy += p.grav;
    p.x += p.vx; p.y += p.vy;
    p.life++;
    if(p.life>p.max || solidTest(Math.round(p.x), Math.round(p.y))) fxParticles.splice(i,1);
  }
  for(let s=fxShocks.length-1;s>=0;s--){
    const sh = fxShocks[s];
    sh.r += (sh.max-sh.r)*0.25; sh.life++;
    if(sh.life>14) fxShocks.splice(s,1);
  }
  if(state.cam.shake>0) state.cam.shake--;
}

export function renderFX(ctx){
  for(let f=0;f<fxParticles.length;f++){
    const e = fxParticles[f];
    ctx.globalAlpha = clamp(1 - e.life/e.max, 0, 1);
    ctx.fillStyle = e.col;
    ctx.fillRect(e.x-e.size/2, e.y-e.size/2, e.size, e.size);
  }
  ctx.globalAlpha = 1;
  for(let s=0;s<fxShocks.length;s++){
    const sh = fxShocks[s];
    ctx.globalAlpha = clamp(1-sh.life/14,0,1)*0.6;
    ctx.strokeStyle = "#ffd479"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, 6.283); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function clearFX(){ fxParticles.length = 0; fxShocks.length = 0; }
