/* Drawing the character. LANE B (actor). */

import { state } from "../core/state.js";
import { clonk, CLONK_VERTS, DIG_VERTS } from "./clonk.js";
import { TOOLS } from "../content/tools.js";

/* What the hands are holding, as something drawable. A player should be able
   to tell a pickaxe from a shovel without opening a screen, so the SHAPE is
   what carries it - three silhouettes that still read at eight pixels - and
   the colour only says which tier it is. Bare hands are a shape of their own,
   because empty-handed is the normal state in stage 0 and "why can I not dig
   this rock" is a question the character itself should answer.

   Exported because it is testable without a canvas: kinds must stay distinct. */
/* The silhouettes drawHeld can actually draw. A tool kind from lane F's table
   is not automatically one of these: they added `kind: "knife"` for the
   fighting system, it passed straight through, and drawHeld had no branch for
   it - so a carried knife fell through to the BARE-HANDS FIST, the one shape
   that means "holding nothing". Nothing tests render code (WORKFLOW 5d), so
   the only symptom was one red check in this lane's own suite.

   More kinds are coming: every tool is a weapon now, so lane F will add more.
   Hence a map with a fallback rather than a case per kind - a new kind
   degrades to a drawable shape instead of to empty hands. */
const DRAWABLE = { shovel:"shovel", pickaxe:"pickaxe", axe:"axe", blade:"blade", item:"item" };
export const DRAWABLE_KINDS = Object.keys(DRAWABLE);   /* what drawHeld has a branch for */
const AS = { knife:"blade" };          /* an edge with no shaft is the blade shape */

function silhouette(kind){
  return DRAWABLE[kind] || AS[kind] || "blade";
}

export function heldLook(held){
  if(!held || !held.id) return { kind:"hands", col:"#e3bd94", dark:"#c79a72" };
  const def = held.def || {};
  const col = def.col || "#b9c2cb", dark = def.dark || "#6d747c";
  const t = TOOLS[held.id];
  if(t && t.kind && t.kind !== "hands") return { kind: silhouette(t.kind), col, dark };
  if(def.category === "tool") return { kind:"blade", col, dark };
  return { kind:"item", col, dark };
}

/* Drawn in the swung hand's frame: the hand is at the origin, the tool points
   along +x. Every head hangs off the end of a wooden shaft except the blade,
   which is all head, and the carried item, which just sits in the fist. */
function drawHeld(ctx, look){
  const shaft = (len) => {
    ctx.strokeStyle = "#7b5a34"; ctx.lineWidth = 1.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-1,-1); ctx.lineTo(len, len*0.2); ctx.stroke();
  };
  ctx.fillStyle = look.col;

  if(look.kind === "shovel"){
    shaft(7.5);
    /* one broad flat blade, wider than the shaft and square across the end */
    ctx.beginPath();
    ctx.moveTo(7.2,-0.6); ctx.lineTo(11.4,0.4); ctx.lineTo(11.0,3.0); ctx.lineTo(7.0,2.2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = look.dark;
    ctx.fillRect(6.6,-0.4,1.0,2.6);

  } else if(look.kind === "pickaxe"){
    shaft(9.0);
    /* a narrow head ACROSS the top, pointed at both ends */
    ctx.beginPath();
    ctx.moveTo(8.2,-4.6); ctx.lineTo(10.6,-2.4); ctx.lineTo(10.6,3.0);
    ctx.lineTo(8.2,5.2);  ctx.lineTo(9.5,1.2);  ctx.lineTo(9.5,-0.8);
    ctx.closePath(); ctx.fill();

  } else if(look.kind === "axe"){
    shaft(8.5);
    /* a wedge on ONE side, which is what separates it from the pick */
    ctx.beginPath();
    ctx.moveTo(7.8,-1.0); ctx.lineTo(11.4,-3.8); ctx.lineTo(12.0,0.6);
    ctx.lineTo(8.4,1.4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = look.dark;
    ctx.fillRect(7.4,-1.2,1.1,2.6);

  } else if(look.kind === "blade"){
    /* no shaft worth drawing: a knife is a hand and an edge */
    ctx.beginPath();
    ctx.moveTo(4.4,-0.8); ctx.lineTo(8.8,-1.8); ctx.lineTo(9.0,0.2); ctx.lineTo(4.6,0.9);
    ctx.closePath(); ctx.fill();

  } else if(look.kind === "item"){
    /* anything else is simply carried, in its own colour */
    ctx.fillRect(4.4,-1.7,3.2,3.2);
    ctx.fillStyle = look.dark;
    ctx.fillRect(4.4,-1.7,3.2,0.9);

  } else {
    /* bare hands: a fist, and nothing else */
    ctx.beginPath(); ctx.arc(5.0,0.4,1.7,0,6.283); ctx.fill();
    ctx.fillStyle = look.dark;
    ctx.beginPath(); ctx.arc(5.0,0.9,1.7,0,3.2); ctx.fill();
  }
}

export function drawClonk(ctx){
  const c = clonk;
  ctx.save();
  ctx.translate(Math.round(c.x*2)/2, Math.round(c.y*2)/2);
  const d = c.dir;
  ctx.scale(d,1);

  let legA = 0, legB = 0;
  if(c.act==="WALK"){ legA = Math.sin(c.walkPhase)*3; legB = -legA; }
  else if(c.act==="FLIGHT"){ legA = 2; legB = -1; }
  else if(c.act==="SCALE"){ legA = Math.sin(c.walkPhase)*2; legB = -legA; }
  else if(c.act==="HANGLE"){ legA = Math.sin(c.walkPhase)*2.5; legB = -legA; }
  else if(c.act==="SWIM"){ legA = Math.sin(c.walkPhase)*3; legB = -legA; }

  ctx.fillStyle = "#2c3138";
  ctx.fillRect(-3+legA*0.5, 2, 2.6, 6);
  ctx.fillRect( 0.6+legB*0.5, 2, 2.6, 6);
  ctx.fillStyle = "#1b1f24";
  ctx.fillRect(-3.4+legA*0.5, 7, 3.4, 2);
  ctx.fillRect( 0.4+legB*0.5, 7, 3.4, 2);

  ctx.fillStyle = "#3c6ea6";
  ctx.fillRect(-3.4,-4, 7, 7);
  ctx.fillStyle = "#4d84c0";
  ctx.fillRect(-3.4,-4, 7, 2);
  ctx.fillStyle = "#8a5a30";
  ctx.fillRect(-3.4, 1.6, 7, 1.6);

  ctx.fillStyle = "#e3bd94";
  ctx.beginPath(); ctx.arc(0.4,-6.6,3.1,0,6.283); ctx.fill();
  ctx.fillStyle = "#d8a13c";
  ctx.beginPath(); ctx.arc(0.4,-7.2,3.3,Math.PI*1.03,Math.PI*2.05); ctx.fill();
  ctx.fillRect(0.4,-7.6,4.0,1.1);
  ctx.fillStyle = "#20242a";
  ctx.fillRect(1.6,-6.9,1.2,1.2);

  /* the lamp itself, sitting on the front of the helmet */
  const lamp = state.player.lamp;
  if(lamp && lamp.on){
    ctx.fillStyle = "#f6e6b4";
    ctx.fillRect(3.0,-8.2,1.6,1.6);
    ctx.fillStyle = "rgba(255,236,180,0.45)";
    ctx.fillRect(2.6,-8.6,2.4,2.4);
  }

  let sa;
  if(c.act==="DIG" && c.chopping){
    /* a chop is a wider arc than a dig, and starts from over the shoulder */
    sa = -0.35 + Math.sin(c.digPhase)*0.95;
  } else if(c.act==="DIG"){
    const base = Math.atan2(c.digY, Math.abs(c.digX)||0.001);
    sa = base + Math.sin(c.digPhase)*0.55;
  } else if(c.act==="HANGLE"){ sa = -1.5; }
  else if(c.act==="SCALE"){ sa = -0.9; }
  else { sa = 0.45 + Math.sin(c.walkPhase)*0.12; }
  ctx.save();
  ctx.translate(1.5,-1.6);
  ctx.rotate(sa);
  ctx.strokeStyle = "#e3bd94"; ctx.lineWidth = 1.8; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(4.5,0.6); ctx.stroke();
  drawHeld(ctx, heldLook(c.held));
  ctx.restore();

  if(state.debug.showVerts){
    ctx.fillStyle = "rgba(255,80,80,0.9)";
    const vs = (c.act==="DIG") ? DIG_VERTS : CLONK_VERTS;
    for(let i=0;i<vs.length;i++) ctx.fillRect(vs[i][0]*d-0.5, vs[i][1]-0.5, 1, 1);
  }
  ctx.restore();

  /* where the tool is about to bite - the ground only; a tree takes the whole
     swing and there is no circle to show */
  if(c.act==="DIG" && !c.chopping){
    ctx.strokeStyle = "rgba(255,255,255,0.30)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(c.x+c.digX*4, c.y+c.digY*4, 9, 0, 6.283);
    ctx.stroke();
  }
}
