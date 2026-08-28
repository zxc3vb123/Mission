/* Drawing what has been built. LANE C (build).

   Every structure used to be a filled rectangle with a lighter stripe across
   the top, which is what it looked like: a kiln, a chest, a workbench and a
   forge were the same box in four colours. Next to lane A's trees, which have
   lit and shaded faces and ragged silhouettes, they read as placeholders.

   FOUR RULES, in the order they earn their keep:

     1. THE OUTLINE IS WHAT IS RECOGNISED at this scale. A kiln is a dome with
        a mouth, a forge has a chimney, a chest has a lid. Colour only says
        which one it is; shape says what it is. So each thing draws its own
        silhouette rather than sharing a rectangle.
     2. SHOW WHAT IT IS MADE OF. Plank lines, brick courses, iron banding -
        two or three strokes. A flat fill reads as a UI element rather than an
        object standing in the world.
     3. LIGHT EVERYTHING THE SAME WAY, AND THE WAY THE WORLD IS ALREADY LIT.
        Lane A's trees paint their sunward side down the LEFT, so the light in
        this world comes from the upper left - it is already on screen in the
        thing the player sees most of. Lit on the top and left, body on the
        right, shade along the bottom: three tones rather than two, because a
        single top band reads as a stripe rather than as a lit edge once
        there is anything detailed beside it. Agreed with lane D so the
        buildings and the machines read as one game without either lane
        importing the other's colours.
     4. GROUND IT. A shadow where the thing meets the terrain, or it floats.

   And one that is not decoration: A WORKING STATION LOOKS LIKE IT IS WORKING.
   Stations run unattended, so smoke at a kiln and a glow in a forge are the
   only way to tell across a base which machines are running.

   THE FOOTPRINT IS A CONTRACT, and it is the one thing here that is not a
   matter of taste. `w` and `h` are what the actor collides with now that
   structures are solid, so ART THAT PROMISES A LEDGE THE PHYSICS DOES NOT
   HAVE is how a player ends up standing on air - and they have already
   reported falling through planks three times.

   So nothing draws outside its box. The forge's chimney and the prop's head
   beam both did until the footprints were drawn over the art and looked at;
   neither was visible from the code. */

import { building } from "../content/buildings.js";
import { structures } from "./structures.js";

/* body, trim and the two lighting shades every building shares. */
const LOOK = {
  campfire:         { body:"#5a4632", trim:"#8a6a42", glow:"#ff9b3a" },
  workbench:        { body:"#7a5a34", trim:"#a8814d" },
  chest:            { body:"#6d4f2c", trim:"#b39a63" },
  kiln:             { body:"#8a6650", trim:"#c2b99e", glow:"#ff8a3a" },
  sawmill:          { body:"#6b4d2c", trim:"#8a6a42", metal:"#c3ccd4" },
  forge:            { body:"#5a4a44", trim:"#8d8d95", glow:"#ff7a2a" },
  ladder:           { body:"#8a6a42", trim:"#b39a63" },
  rope_ladder:      { body:"#b39a63", trim:"#d8c48a" },
  timber_prop:      { body:"#7a5a34", trim:"#a8814d" },
  brick_foundation: { body:"#a8664a", trim:"#c98f6b" },
  plank_beam:       { body:"#8a6a42", trim:"#b08a55" },
  plank_floor:      { body:"#94734a", trim:"#b89263" }
};
const DEFAULT_LOOK = { body:"#6b6157", trim:"#9a938b" };

const LIT   = "rgba(255,238,200,0.22)";   /* the sky side */
const SHADE = "rgba(0,0,0,0.30)";         /* the underside */
const LINE  = "rgba(0,0,0,0.22)";         /* joints and courses */

/* ------------------------------------------------------------ helpers --- */

function shadow(ctx, s){
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(s.x - 1, s.y + s.h - 1, s.w + 2, 2);
}
/* The sun is up and to the left, as lane A's trees have it. */
function litTop(ctx, x, y, w){
  ctx.fillStyle = LIT;
  ctx.fillRect(x, y, w, 1);
}
function litLeft(ctx, x, y, h){
  ctx.fillStyle = LIT;
  ctx.fillRect(x, y, 1, h);
}
function shadeBase(ctx, x, y, w, h){
  ctx.fillStyle = SHADE;
  ctx.fillRect(x, y + h - Math.max(1, Math.round(h*0.18)), w, Math.max(1, Math.round(h*0.18)));
}
function shadeRight(ctx, x, y, w, h){
  ctx.fillStyle = SHADE;
  ctx.fillRect(x + w - 1, y, 1, h);
}
/* Lit top and left, shaded right and bottom - the whole convention in one
   call, so every silhouette gets it the same way. */
function light(ctx, x, y, w, h){
  litTop(ctx, x, y, w);
  litLeft(ctx, x, y, h);
  shadeRight(ctx, x, y, w, h);
  shadeBase(ctx, x, y, w, h);
}
function plankLines(ctx, x, y, w, h, step){
  ctx.fillStyle = LINE;
  for(let i = step; i < h; i += step) ctx.fillRect(x, y + i, w, 1);
}
function studLines(ctx, x, y, w, h, step){
  ctx.fillStyle = LINE;
  for(let i = step; i < w; i += step) ctx.fillRect(x + i, y, 1, h);
}
function brickCourses(ctx, x, y, w, h, course){
  ctx.fillStyle = LINE;
  for(let i = course, row = 0; i < h; i += course, row++){
    ctx.fillRect(x, y + i, w, 1);
    /* stagger the perpends so it reads as bonded rather than as a grid */
    const off = (row % 2) ? Math.round(course*0.9) : 0;
    for(let j = off; j < w; j += course*1.8) ctx.fillRect(x + j, y + i - course, 1, course);
  }
}

/* ------------------------------------------------------- silhouettes --- */
/* Each takes the whole footprint and draws inside it. Overhang is allowed
   where it cannot be mistaken for something to stand on. */

const DRAW = {
  campfire(ctx, s, k, t, done){
    const cx = s.x + s.w/2, base = s.y + s.h;
    /* a ring of stones, wider than it is tall */
    ctx.fillStyle = k.body;
    ctx.fillRect(s.x, base - 3, s.w, 3);
    ctx.fillStyle = k.trim;
    for(let i = 0; i < s.w; i += 4) ctx.fillRect(s.x + i, base - 4, 3, 2);
    /* crossed logs */
    ctx.strokeStyle = "#6b4f2e"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - s.w*0.3, base - 3); ctx.lineTo(cx + s.w*0.3, base - s.h*0.7);
    ctx.moveTo(cx + s.w*0.3, base - 3); ctx.lineTo(cx - s.w*0.3, base - s.h*0.7);
    ctx.stroke();
    if(done) flame(ctx, cx, base - 4, s.w*0.28, t, k.glow);
  },

  workbench(ctx, s, k, t, done){
    const topH = Math.max(3, Math.round(s.h*0.28));
    /* legs first, inset, so the top reads as overhanging them */
    ctx.fillStyle = k.body;
    const legW = Math.max(2, Math.round(s.w*0.10));
    ctx.fillRect(s.x + legW, s.y + topH, legW, s.h - topH);
    ctx.fillRect(s.x + s.w - 2*legW, s.y + topH, legW, s.h - topH);
    /* a rail between them */
    ctx.fillRect(s.x + legW, s.y + s.h - Math.round((s.h-topH)*0.45), s.w - 3*legW, 2);
    /* the top, full width */
    ctx.fillStyle = k.trim;
    ctx.fillRect(s.x, s.y, s.w, topH);
    plankLines(ctx, s.x, s.y, s.w, topH, 3);
    litTop(ctx, s.x, s.y, s.w);
    litLeft(ctx, s.x, s.y, topH);
    shadeRight(ctx, s.x, s.y, s.w, topH);
    ctx.fillStyle = SHADE;
    ctx.fillRect(s.x, s.y + topH - 1, s.w, 1);
  },

  chest(ctx, s, k, t, done){
    const lid = Math.max(3, Math.round(s.h*0.34));
    ctx.fillStyle = k.body;
    ctx.fillRect(s.x, s.y + lid, s.w, s.h - lid);
    plankLines(ctx, s.x, s.y + lid, s.w, s.h - lid, 4);
    /* the lid, a shade lighter; inside the box like everything else */
    ctx.fillStyle = k.trim;
    ctx.fillRect(s.x, s.y, s.w, lid);
    ctx.fillStyle = LINE;
    ctx.fillRect(s.x, s.y + lid - 1, s.w, 1);
    /* iron bands and a latch: the detail that says "chest" */
    ctx.fillStyle = "rgba(40,36,32,0.75)";
    const b = Math.max(2, Math.round(s.w*0.12));
    ctx.fillRect(s.x + b, s.y, 2, s.h);
    ctx.fillRect(s.x + s.w - b - 2, s.y, 2, s.h);
    ctx.fillRect(s.x + s.w/2 - 1, s.y + lid - 2, 3, 4);
    light(ctx, s.x, s.y, s.w, s.h);
  },

  kiln(ctx, s, k, t, done){
    const base = s.y + s.h;
    /* a dome: stacked courses narrowing toward the top */
    const rows = Math.max(4, Math.round(s.h/4));
    const rowH = Math.ceil(s.h/rows);
    for(let r = 0; r < rows; r++){
      const f = r / (rows - 1);
      const inset = Math.round((s.w*0.42) * f * f);
      const y = base - Math.round(s.h * (r+1)/rows);
      const rx = s.x + inset, rw = s.w - inset*2;
      ctx.fillStyle = k.body;
      ctx.fillRect(rx, y, rw, rowH);
      /* courses drawn PER ROW, inside the dome. Drawn across the bounding
         box they hung in the sky either side of the taper, which is the kind
         of thing that only shows up when you look at it. */
      ctx.fillStyle = LINE;
      ctx.fillRect(rx, y + rowH - 1, rw, 1);
      const off = (r % 2) ? Math.round(rowH*0.9) : 0;
      for(let j = off; j < rw - 1; j += rowH*1.8) ctx.fillRect(rx + j, y, 1, rowH);
      /* the lit left face of each course */
      ctx.fillStyle = LIT;
      ctx.fillRect(rx, y, 1, rowH);
    }
    /* the mouth */
    const mw = Math.round(s.w*0.34), mh = Math.round(s.h*0.30);
    ctx.fillStyle = done ? "rgba(20,10,6,0.95)" : "rgba(20,10,6,0.5)";
    ctx.fillRect(s.x + s.w/2 - mw/2, base - mh, mw, mh);
    if(done){
      ctx.fillStyle = k.glow;
      ctx.globalAlpha = 0.35 + 0.25*Math.sin(t*0.07);
      ctx.fillRect(s.x + s.w/2 - mw/2 + 1, base - mh + 1, mw - 2, mh - 2);
      ctx.globalAlpha = 1;
    }
    litTop(ctx, s.x + Math.round(s.w*0.42), s.y, Math.round(s.w*0.16));
    litLeft(ctx, s.x, s.y + Math.round(s.h*0.45), Math.round(s.h*0.55));
    shadeRight(ctx, s.x, s.y + Math.round(s.h*0.45), s.w, Math.round(s.h*0.55));
  },

  forge(ctx, s, k, t, done){
    const base = s.y + s.h;
    const hoodH = Math.max(4, Math.round(s.h*0.30));
    /* stone body */
    ctx.fillStyle = k.body;
    ctx.fillRect(s.x, s.y + hoodH, s.w, s.h - hoodH);
    brickCourses(ctx, s.x, s.y + hoodH, s.w, s.h - hoodH, 5);
    /* hood, narrowing, and a chimney off to one side */
    ctx.fillStyle = k.trim;
    ctx.fillRect(s.x + 2, s.y + hoodH - 2, s.w - 4, 3);
    ctx.fillRect(s.x + Math.round(s.w*0.18), s.y + 3, Math.round(s.w*0.64), hoodH - 4);
    /* The chimney stays INSIDE the footprint. Drawn proud of the box it
       looked like something to stand on, and the box is what the actor
       collides with - art that promises a ledge the physics does not have is
       how a player ends up standing on air. */
    ctx.fillRect(s.x + Math.round(s.w*0.62), s.y, Math.round(s.w*0.18), 4);
    /* the fire */
    const fw = Math.round(s.w*0.36), fh = Math.round(s.h*0.26);
    ctx.fillStyle = "rgba(18,10,6,0.95)";
    ctx.fillRect(s.x + s.w/2 - fw/2, base - fh - 2, fw, fh);
    if(done){
      ctx.fillStyle = k.glow;
      ctx.globalAlpha = 0.45 + 0.30*Math.sin(t*0.11);
      ctx.fillRect(s.x + s.w/2 - fw/2 + 1, base - fh - 1, fw - 2, fh - 2);
      ctx.globalAlpha = 1;
    }
    litTop(ctx, s.x + Math.round(s.w*0.18), s.y + 2, Math.round(s.w*0.64));
    litLeft(ctx, s.x, s.y + hoodH, s.h - hoodH);
    shadeRight(ctx, s.x, s.y + hoodH, s.w, s.h - hoodH);
    shadeBase(ctx, s.x, s.y, s.w, s.h);
  },

  sawmill(ctx, s, k, t, done){
    const roofH = Math.max(4, Math.round(s.h*0.30));
    /* posts and a frame */
    ctx.fillStyle = k.body;
    const p = Math.max(2, Math.round(s.w*0.07));
    ctx.fillRect(s.x + p, s.y + roofH, p, s.h - roofH);
    ctx.fillRect(s.x + s.w - 2*p, s.y + roofH, p, s.h - roofH);
    ctx.fillRect(s.x + p, s.y + s.h - 3, s.w - 3*p, 3);
    /* a pitched roof, drawn as two steps rather than a triangle so it reads
       at four pixels tall */
    ctx.fillStyle = k.trim;
    ctx.fillRect(s.x, s.y + roofH - 2, s.w, 2);
    ctx.fillRect(s.x + Math.round(s.w*0.12), s.y + 1, Math.round(s.w*0.76), roofH - 2);
    plankLines(ctx, s.x + Math.round(s.w*0.12), s.y + 1, Math.round(s.w*0.76), roofH - 2, 3);
    /* the blade */
    ctx.strokeStyle = k.metal || "#cfd8e0"; ctx.lineWidth = 1;
    const bx = s.x + s.w*0.5, by = s.y + s.h - Math.round((s.h-roofH)*0.55);
    const br = Math.max(3, Math.round(s.h*0.16));
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI*2); ctx.stroke();
    if(done){
      ctx.beginPath();
      ctx.moveTo(bx - br, by); ctx.lineTo(bx + br, by);
      ctx.stroke();
    }
    litTop(ctx, s.x, s.y + roofH - 2, s.w);
    litLeft(ctx, s.x + Math.round(s.w*0.12), s.y + 1, roofH - 2);
    shadeRight(ctx, s.x, s.y + roofH - 2, s.w, 2);
  },

  ladder(ctx, s, k){
    ctx.fillStyle = k.body;
    const rail = Math.max(1, Math.round(s.w*0.18));
    ctx.fillRect(s.x, s.y, rail, s.h);
    ctx.fillRect(s.x + s.w - rail, s.y, rail, s.h);
    ctx.fillStyle = k.trim;
    for(let y = 2; y < s.h - 1; y += 4) ctx.fillRect(s.x, s.y + y, s.w, 1);
  },

  rope_ladder(ctx, s, k){
    ctx.strokeStyle = k.body; ctx.lineWidth = 1;
    ctx.beginPath();
    for(let y = 0; y < s.h; y += 2){
      const wob = Math.sin(y*0.5) * 0.8;
      ctx.moveTo(s.x + 0.5 + wob, s.y + y);
      ctx.lineTo(s.x + 0.5 + wob, s.y + y + 2);
      ctx.moveTo(s.x + s.w - 0.5 + wob, s.y + y);
      ctx.lineTo(s.x + s.w - 0.5 + wob, s.y + y + 2);
    }
    ctx.stroke();
    ctx.fillStyle = k.trim;
    for(let y = 3; y < s.h - 1; y += 5) ctx.fillRect(s.x, s.y + y, s.w, 1);
  },

  timber_prop(ctx, s, k){
    /* A post under a head beam, and the T is the whole silhouette. Rather
       than overhang the box to get it - which would promise a ledge the
       physics does not have - the POST is inset and the head is full width,
       so the shape survives inside the footprint. */
    ctx.fillStyle = k.body;
    const inset = s.w >= 4 ? 1 : 0;
    ctx.fillRect(s.x + inset, s.y + 2, s.w - inset*2, s.h - 2);
    studLines(ctx, s.x + inset, s.y + 2, s.w - inset*2, s.h - 2, 2);
    /* The head beam it holds the roof with. Kept inside the footprint for
       the same reason as the forge's chimney: a beam drawn wider than the
       box reads as a ledge, and the box is what the player stands on. */
    ctx.fillStyle = k.trim;
    ctx.fillRect(s.x, s.y, s.w, 2);
    litTop(ctx, s.x, s.y, s.w);
    litLeft(ctx, s.x + inset, s.y + 2, s.h - 2);
    shadeRight(ctx, s.x + inset, s.y + 2, s.w - inset*2, s.h - 2);
  },

  brick_foundation(ctx, s, k){
    ctx.fillStyle = k.body;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    brickCourses(ctx, s.x, s.y, s.w, s.h, 3);
    light(ctx, s.x, s.y, s.w, s.h);
  },

  plank_beam(ctx, s, k){
    ctx.fillStyle = k.body;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    /* grain along the long axis, and end-grain at the cuts */
    if(s.w >= s.h) plankLines(ctx, s.x, s.y, s.w, s.h, 2);
    else           studLines(ctx, s.x, s.y, s.w, s.h, 2);
    ctx.fillStyle = LINE;
    if(s.w >= s.h){ ctx.fillRect(s.x, s.y, 1, s.h); ctx.fillRect(s.x + s.w - 1, s.y, 1, s.h); }
    else          { ctx.fillRect(s.x, s.y, s.w, 1); ctx.fillRect(s.x, s.y + s.h - 1, s.w, 1); }
    light(ctx, s.x, s.y, s.w, s.h);
  }
};
DRAW.plank_floor = DRAW.plank_beam;

/* A small flame, shared by the campfire and anything else that burns. */
function flame(ctx, cx, base, r, t, col){
  const f = 0.75 + 0.25*Math.sin(t*0.13);
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(cx - r*f, base);
  ctx.quadraticCurveTo(cx - r*0.3*f, base - r*1.6*f, cx, base - r*2.4*f);
  ctx.quadraticCurveTo(cx + r*0.3*f, base - r*1.6*f, cx + r*f, base);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.moveTo(cx - r*0.45*f, base);
  ctx.quadraticCurveTo(cx, base - r*1.3*f, cx + r*0.45*f, base);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* Smoke from a station that is actually working, so a base can be read at a
   glance: which of these is running right now. */
function smoke(ctx, s, tick, seed){
  ctx.fillStyle = "rgba(210,210,205,0.30)";
  for(let i = 0; i < 3; i++){
    const age = ((tick*0.6 + i*22 + seed*7) % 60) / 60;
    const y = s.y - age * s.h * 0.8;
    const x = s.x + s.w*0.5 + Math.sin(age*5 + i) * s.w*0.22;
    const r = 1 + age*2.5;
    ctx.globalAlpha = 0.30 * (1 - age);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* --------------------------------------------------------------- draw --- */

/* Machines another lane paints. Lane D's derrick is a timber frame you see
   THROUGH - four legs and sky between them - so a solid rectangle behind it
   turns a frame into a crate with sticks on it. Their renderBuild runs after
   this one, so skipping here leaves no gap.

   Two entries is not worth a mechanism. If a third lane wants the same, this
   becomes a `look: false` on the building rather than a longer list. */
const DRAWN_ELSEWHERE = new Set(["derrick", "walking_beam"]);

export function renderStructures(ctx, tick){
  for(const s of structures){
    if(DRAWN_ELSEWHERE.has(s.defId)) continue;
    const look = LOOK[s.defId] || DEFAULT_LOOK;
    const def = building(s.defId);
    const done = s.built;

    ctx.save();

    if(!done){
      /* Rising out of the ground as the work is done, so progress is legible
         from across the valley - and hatched, so a half-built thing never
         reads as a finished one. */
      const f = Math.min(1, s.progress / s.need);
      const h = Math.max(1, Math.round(s.h * f));
      const y = s.y + (s.h - h);
      ctx.fillStyle = look.body;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(s.x, y, s.w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      for(let i = 0; i < s.w; i += 5){
        ctx.beginPath();
        ctx.moveTo(s.x + i, y + h); ctx.lineTo(s.x + i + 4, y);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    shadow(ctx, s);
    const draw = DRAW[s.defId];
    if(draw) draw(ctx, s, look, tick, done);
    else {
      ctx.fillStyle = look.body;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = look.trim;
      ctx.fillRect(s.x, s.y, s.w, Math.max(1, Math.round(s.h*0.18)));
      light(ctx, s.x, s.y, s.w, s.h);
    }

    /* Working stations say so. Stations run unattended now, so this is the
       only way to tell across a base which machines are running. */
    if(s.job && def && def.processing) smoke(ctx, s, tick, s.id);

    /* Coming apart: the same hatch as scaffolding, thinning as it goes, so a
       building being dismantled never reads as one being raised. */
    if(s.taking){
      const left = 1 - Math.min(1, s.taking.ticks / s.taking.need);
      ctx.globalAlpha = 0.35 + 0.5*left;
      ctx.strokeStyle = "rgba(255,190,120,0.55)";
      ctx.lineWidth = 1;
      for(let i = 0; i < s.w; i += 4){
        ctx.beginPath();
        ctx.moveTo(s.x + i, s.y); ctx.lineTo(s.x + i + 3, s.y + s.h);
        ctx.stroke();
      }
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
