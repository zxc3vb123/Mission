/* Drawing a crop. LANE J (farming).

   NO TEST IN THIS REPO EXECUTES ONE LINE OF THIS FILE (docs/WORKFLOW.md 5d):
   every suite runs headless, so a typo here throws on every frame in the
   live game while everything stays green. It is opened in a browser and
   counted rather than trusted.

   THE TRAP THAT COMES WITH DOING THAT: on a hidden or unsized page
   state.view.w is 0, so the usual half-a-screen cull collapses to a band
   about forty pixels wide and the whole farm vanishes - which looks exactly
   like code that never ran. Two lanes have lost time to it. The cull below
   takes a floor. */

import { state } from "../core/state.js";
import { hash2 } from "../core/rng.js";
import { plots, progress, isRipe } from "./crops.js";

/* the widest a plant gets, so the cull has something to be generous by */
const PAD = 16;
const MIN_VIEW = 640;

const SHOOT = "#4e7a32", SHOOT_DARK = "#33552080";
const STALK = "#8f9a44", RIPE = "#d8b45c", RIPE_DARK = "#a8842e";
const DRY = "#7a6a3e";

function viewBand(){
  const w = Math.max(state.view.w || 0, MIN_VIEW);
  const hw = w / (2 * (state.cam.zoom || 3)) + PAD;
  return { x0: state.cam.x - hw, x1: state.cam.x + hw };
}

export function renderCrops(ctx){
  const band = viewBand();
  for(const p of plots){
    if(p.x < band.x0 || p.x > band.x1) continue;
    drawPlant(ctx, p);
  }
}

function drawPlant(ctx, p){
  const g = p.wild ? 1 : progress(p);
  const ripe = p.wild || isRipe(p);
  /* Height grows with what it has drunk, so a field reads as a field at a
     glance: bare rows, green rows, gold rows. */
  const h = 2 + Math.round(g * 11);
  const lean = (hash2(p.x, p.y, 7) - 0.5) * 2.2;
  const shade = p.ok ? 0 : 1;

  ctx.save();
  ctx.translate(p.x + 0.5, p.y + 0.5);

  /* the stalk */
  ctx.strokeStyle = ripe ? RIPE_DARK : (shade ? DRY : SHOOT_DARK);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(lean * 0.4, -h * 0.6, lean, -h);
  ctx.stroke();

  /* two leaves, out of the stalk rather than stuck on it */
  if(g > 0.22){
    ctx.strokeStyle = shade ? DRY : (ripe ? STALK : SHOOT);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.45);
    ctx.quadraticCurveTo(-2.4, -h * 0.55, -3.4, -h * 0.35);
    ctx.moveTo(lean * 0.7, -h * 0.68);
    ctx.quadraticCurveTo(2.6, -h * 0.78, 3.6, -h * 0.58);
    ctx.stroke();
  }

  /* the ear, only once there is one */
  if(g > 0.6){
    const ears = ripe ? 4 : 2;
    ctx.fillStyle = ripe ? RIPE : STALK;
    for(let i = 0; i < ears; i++){
      const t = i / ears;
      const ex = lean * (0.82 + t * 0.18), ey = -h + t * 3.2;
      ctx.fillRect(Math.round(ex) - 1, Math.round(ey), 2, 2);
    }
  }

  ctx.restore();
}
