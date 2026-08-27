/* Drawing what has been built. LANE C (build).

   Colours are a visual choice and live here rather than in lane F's data:
   BUILDINGS carries what a thing costs and how big it is, not what it looks
   like. Everything is drawn from its footprint, so a building never lies
   about the space it occupies.

   Nothing here mutates simulation state. */

import { building } from "../content/buildings.js";
import { structures } from "./structures.js";

const LOOK = {
  campfire:  { body:"#4a3a2c", trim:"#e0913a", glow:"#ff9b3a" },
  workbench: { body:"#7a5a34", trim:"#a8814d" },
  chest:     { body:"#6d4f2c", trim:"#b39a63" },
  kiln:      { body:"#8a6650", trim:"#c2b99e" },
  sawmill:   { body:"#7a5a34", trim:"#c3ccd4" },
  forge:     { body:"#5a4a44", trim:"#e0913a" }
};
const DEFAULT_LOOK = { body:"#6b6157", trim:"#9a938b" };

export function renderStructures(ctx, tick){
  for(const s of structures){
    const look = LOOK[s.defId] || DEFAULT_LOOK;
    const done = s.built ? 1 : Math.min(1, s.progress / s.need);

    ctx.save();

    /* Under construction it rises out of the ground as the work is done, so
       progress is legible from across the valley without opening anything. */
    const h = s.built ? s.h : Math.max(1, Math.round(s.h * done));
    const y = s.y + (s.h - h);

    ctx.fillStyle = look.body;
    ctx.fillRect(s.x, y, s.w, h);
    ctx.fillStyle = look.trim;
    ctx.fillRect(s.x, y, s.w, Math.max(1, Math.round(h*0.18)));

    if(!s.built){
      /* scaffolding hatch, so a half-built thing never reads as finished */
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      for(let i=0;i<s.w;i+=5){
        ctx.beginPath();
        ctx.moveTo(s.x+i, y+h);
        ctx.lineTo(s.x+i+4, y);
        ctx.stroke();
      }
    } else if(look.glow){
      const f = 0.6 + 0.4*Math.sin(tick*0.09);
      ctx.fillStyle = look.glow;
      ctx.globalAlpha = 0.5 + 0.3*f;
      ctx.fillRect(s.x + s.w*0.25, s.y - 3, s.w*0.5, 4);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

/* The ghost: where it would go, and whether it may. Green reads as yes, red
   as no, and the reason itself is the UI's to print. */
export function renderGhost(ctx, verdict){
  if(!verdict || !verdict.site) return;
  const s = verdict.site;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = verdict.ok ? "#6fd08a" : "#d06f6f";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = verdict.ok ? "#9cf0b4" : "#f09c9c";
  ctx.lineWidth = 1;
  ctx.strokeRect(s.x+0.5, s.y+0.5, s.w-1, s.h-1);
  ctx.restore();
}
