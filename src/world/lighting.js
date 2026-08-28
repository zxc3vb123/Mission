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
import { LW, LH, surface, matAt, bgAt, isSolid } from "./landscape.js";
import { state } from "../core/state.js";
import { clamp } from "../core/rng.js";
import { bus } from "../core/bus.js";
import { building as BUILDINGS } from "../content/buildings.js";

/* World pixels per light cell. This is the base, used whenever the light
   field fits inside its budget; on a big window or zoomed out it coarsens
   instead of growing, so the cost of darkness follows the CELL BUDGET and
   not the size of the player's monitor. Four times the screen area used to
   mean four times the work, which is what made a large window lag.

   Coarsening is also what keeps this CORRECT. The old code clamped gw/gh
   without touching CELL, so past the budget the grid covered less world
   than the view and the darkness overlay simply stopped part way across
   the screen. Growing the cell keeps the same ground covered by fewer,
   larger cells, which is the trade that is actually invisible: the overlay
   is drawn smoothly scaled, so a coarser field reads as a softer one. */
export const CELL_BASE = 4;
const MAX_CELLS = 10000;               /* the budget, in cells */
const MAX_GRID  = 320*320;             /* buffer headroom, never exceeded */

export let CELL = CELL_BASE;

let gw = 0, gh = 0, gx0 = 0, gy0 = 0;
let lightGrid = new Float32Array(MAX_GRID);
let matGrid   = new Uint8Array(MAX_GRID);
let tmpGrid   = new Float32Array(MAX_GRID);

const overlay = (typeof document !== "undefined") ? document.createElement("canvas") : null;
const overlayCtx = overlay ? overlay.getContext("2d") : null;
let overlayImg = null;

/* ------------------------------------------------- placed light -----------
   A lamp you can put DOWN. Darkness is the early antagonist, and a campfire
   or a torch wedged in a shaft wall is the difference between exploring a
   tunnel and holding a light in the hand you wanted to dig with.

     addLightSource(id, { x, y, r, power, colour, attach })
     removeLightSource(id)

   `attach: {x, y}` ties the light to a pixel of ground. Dig that pixel away
   and the light goes out - which is what a torch wedged in a wall should
   do, and stops a glow hanging in the air where the wall used to be.

   Sources cast like the head lamp does rather than being splatted as a
   disc, so a fire lights the room it is in and not the far side of the
   rock. It is also cheaper: a few dozen short rays beats filling a circle
   of cells, and it is the same code the lamp already proved.

   Placed structures register THEMSELVES off lane C's events, the way props
   do for cave-ins, so an id cannot be orphaned by a collapse nobody
   remembered to handle. addLightSource stays published for everything that
   is not a placed building. */
export const lightSources = new Map();
export const MAX_LIT_PER_FRAME = 24;

export function addLightSource(id, opt){
  if(!id || !opt) return false;
  lightSources.set(String(id), {
    x: Math.round(opt.x), y: Math.round(opt.y),
    r: opt.r > 0 ? opt.r : 48,
    power: opt.power > 0 ? opt.power : 1,
    colour: opt.colour || null,
    attach: opt.attach ? { x: Math.round(opt.attach.x), y: Math.round(opt.attach.y) } : null
  });
  return true;
}
export function removeLightSource(id){ return lightSources.delete(String(id)); }
export function lightSourceCount(){ return lightSources.size; }

/* IS THERE A LIGHT NEAR THIS SPOT, anywhere on the map.

   Not the same question as lightAt(), and the difference matters enough to
   be worth two functions. lightAt answers "how lit is this pixel", which is
   the true answer but is computed for the VISIBLE RECTANGLE ONLY - off
   screen it returns 0, so anything deciding behaviour by it would behave
   correctly in view and wrongly everywhere else. This one asks the source
   registry instead, so it answers the same anywhere on the map whether or
   not anybody is looking.

   It does not know about walls: a fire on the far side of solid rock still
   counts as near. For "can this spot SEE the fire", lightAt is the honest
   answer and only works on screen.

   Returns the nearest source within r, or null. Cost is one pass over the
   placed lights, which is a handful; if that ever becomes hundreds this
   wants a grid. */
export function lightSourceNear(x, y, r){
  let best = null, bestD = r * r;
  for(const [id, L] of lightSources){
    const dx = L.x - x, dy = L.y - y;
    const d2 = dx*dx + dy*dy;
    if(d2 > bestD) continue;
    bestD = d2;
    best = { id, x: L.x, y: L.y, power: L.power, r: L.r, dist: Math.sqrt(d2) };
  }
  return best;
}
export function clearLightSources(){ lightSources.clear(); }

/* A light tied to a pixel goes out when that pixel does. Checked on the
   tick rather than while drawing, because rendering may not change the
   world - and it is where the "it went out" event belongs. */
export function updateLightSources(){
  if(!lightSources.size) return;
  for(const [id, L] of lightSources){
    if(!L.attach) continue;
    if(!isSolid(L.attach.x, L.attach.y)){
      lightSources.delete(id);
      bus.emit("light:out", { id, x: L.x, y: L.y });
    }
  }
}

export const lightConfig = {
  enabled: true,
  darkness: 0.985,        /* how black unlit ground gets (0..1) */
  skyBleed: 2,            /* blur passes: how far daylight creeps into a shaft */
  rays: 128
};

export function computeLight(rect){
  /* pick the finest cell that keeps the whole view inside the budget */
  const wpx = rect.x1 - rect.x0, hpx = rect.y1 - rect.y0;
  CELL = CELL_BASE;
  /* one pixel at a time rather than doubling: the field softens gradually
     as the window grows instead of halving in resolution at a threshold */
  while(CELL < 64 &&
        (Math.ceil(wpx/CELL) + 3) * (Math.ceil(hpx/CELL) + 3) > MAX_CELLS) CELL++;
  gx0 = Math.floor(rect.x0/CELL) - 1;
  gy0 = Math.floor(rect.y0/CELL) - 1;
  gw  = Math.ceil(wpx/CELL) + 3;
  gh  = Math.ceil(hpx/CELL) + 3;
  if(gw*gh > MAX_GRID){                        /* never overrun the buffers */
    gw = Math.min(gw, 320); gh = Math.min(gh, 320);
  }

  /* Rays and blur cost scale with the field too. One blur pass on a coarse
     grid bleeds as far in world pixels as two did on a fine one, and rays
     only need to be dense enough that neighbouring ones land in adjacent
     cells at the lamp's reach. */
  const coarse = CELL > CELL_BASE;
  const passes = coarse ? 1 : lightConfig.skyBleed;
  const rays   = coarse ? Math.max(48, lightConfig.rays >> 1) : lightConfig.rays;

  /* --- 1. daylight --- */
  for(let gy=0; gy<gh; gy++){
    for(let gx=0; gx<gw; gx++){
      const g = gy*gw+gx;
      const wx = gx0*CELL + gx*CELL + (CELL>>1);
      const wy = gy0*CELL + gy*CELL + (CELL>>1);
      if(wx<0 || wx>=LW || wy>=LH){ lightGrid[g] = 0; matGrid[g] = 0; continue; }
      if(wy<0){ lightGrid[g] = 1; matGrid[g] = 0; continue; }
      const m = matAt(wx,wy);
      matGrid[g] = m;
      const M = MATS[m];
      const depth = wy - surface[wx];
      if(wy < surface[wx] || (M.density<25 && bgAt(wx,wy)===0)){
        lightGrid[g] = 1;                   /* open air and daylit water */
      } else if(M.density<25){
        lightGrid[g] = 0;                   /* inside a cave or a dug shaft */
      } else {
        /* ground seen from outside is daylit and fades with depth, so a
           hillside reads as a hillside and only the inside is black */
        lightGrid[g] = clamp(1 - depth/45, 0, 1) * 0.9;
      }
    }
  }

  /* --- 2. let it bleed into shaft mouths --- */
  for(let pass=0; pass<passes; pass++){
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

  /* --- 4. anything somebody put down --- */
  if(lightSources.size){
    const x0 = gx0*CELL, y0 = gy0*CELL;
    const x1 = x0 + gw*CELL, y1 = y0 + gh*CELL;
    let lit = 0;
    for(const L of lightSources.values()){
      if(lit >= MAX_LIT_PER_FRAME) break;
      /* off screen by more than its own reach: nothing it does is visible */
      if(L.x + L.r < x0 || L.x - L.r > x1 || L.y + L.r < y0 || L.y - L.r > y1) continue;
      castPoint(L.x, L.y, L.r * L.power, L.power, coarse ? 24 : 40);
      lit++;
    }
  }

  /* --- 5. the head lamp --- */
  const p = state.player;
  const lamp = p.lamp;
  if(lamp && lamp.on && lamp.power>0) castLamp(p, lamp, rays);

  return { gw, gh, gx0, gy0, grid: lightGrid };
}

function addLight(wx, wy, v){
  const gx = Math.floor(wx/CELL) - gx0;
  const gy = Math.floor(wy/CELL) - gy0;
  if(gx<0||gy<0||gx>=gw||gy>=gh) return;
  const g = gy*gw+gx;
  if(lightGrid[g] < v) lightGrid[g] = v;
}

/* a light that shines the same in every direction, stopped by solid ground */
function castPoint(wx, wy, radius, power, rays){
  if(!(radius > 0)) return;
  const step = CELL*0.75;
  for(let i=0;i<rays;i++){
    const a = (i/rays)*6.28318;
    const ca = Math.cos(a), sa = Math.sin(a);
    for(let d=1; d<radius; d+=step){
      const x = wx + ca*d, y = wy + sa*d;
      if(x<0||y<0||x>=LW||y>=LH) break;
      let v = 1 - d/radius;
      v = v*v*power;
      addLight(x, y, v);
      if(isSolid(Math.round(x), Math.round(y))){
        addLight(x+ca*CELL, y+sa*CELL, v*0.55);      /* light the wall face */
        break;
      }
    }
  }
  addLight(wx, wy, power);
}

function castLamp(p, lamp, rays){
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

  /* a warm halo per placed light, so a fire reads as a fire rather than as
     a patch of the dark being missing. This is where colour is used. */
  if(lightSources.size){
    const op0 = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    for(const L of lightSources.values()){
      const r = L.r * L.power * 0.8;
      const gr = ctx.createRadialGradient(L.x, L.y, 1, L.x, L.y, r);
      gr.addColorStop(0, L.colour || "rgba(255,196,110,0.20)");
      gr.addColorStop(1, "rgba(255,170,90,0)");
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(L.x, L.y, r, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = op0;
  }

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

/* ---------------------------------------------- structures that glow ------
   Same arrangement as cave-in props: lane C announces what it placed and
   lane F's table says which of those give light, so nothing has to be
   remembered by hand and a collapse cannot orphan an id. `addLightSource`
   stays published for anything that is not a placed building. */
function lightKey(e){ return "b:" + e.defId + "@" + e.x + "," + e.y; }

bus.on("structure:placed", e => {
  const def = BUILDINGS(e.defId);
  if(!def || !def.light) return;
  const w = e.rot ? def.h : def.w, h = e.rot ? def.w : def.h;
  addLightSource(lightKey(e), {
    x: e.x + w/2, y: e.y + h/2,
    r: def.light.r, power: def.light.power, colour: def.light.colour
  });
});
bus.on("structure:removed",   e => removeLightSource(lightKey(e)));
bus.on("structure:collapsed", e => removeLightSource(lightKey(e)));
