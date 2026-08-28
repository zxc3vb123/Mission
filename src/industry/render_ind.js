/* Drawing track and rolling stock. LANE D (industry).

   The owner: "the carriages etc look like shit. make them look good and
   nice." They were right - a wagon was a flat box with a lighter band across
   the top, which is the same rectangle every building is, in a different
   colour.

   THE LIGHT COMES FROM THE UPPER LEFT, and that is not a choice made here.
   Lane A's trees already commit to it: `drawTree` paints the trunk and then
   paints the *sunward side* down the left edge in a lighter tone. Everything
   in this file lights the top and left faces and shades the bottom and
   right, so the machines belong to the same world as the scenery.

   THREE TONES PER OBJECT, not two. A single lit band along the top reads as
   a stripe; a lit edge, a body and a shaded base read as a solid thing. That
   is most of the difference between the old wagon and this one.

   EVERYTHING IS DRAWN FROM SPANS - fillRect and the two helpers below, and
   no arcs. Partly because an antialiased circle at this scale is a grey
   smudge rather than a wheel, and partly because a renderer made of spans
   can be run headless against a pixel buffer, which is how this was actually
   looked at rather than guessed at.

   THE DRAWING NEVER LEAVES THE FOOTPRINT. Lane B stands on structures now,
   and the owner has already reported falling through planks; a drawing that
   disagrees with the solid box puts them on air or blocks them on nothing.
   Wheels, load and beam all stay inside the w/h the simulation publishes,
   and the nodding beam moves only pixels.

   Rendering never mutates simulation state (ARCHITECTURE rule 5): nothing
   here decides anything, it reads what the tick wrote. */

import { state } from "../core/state.js";
import { rails } from "./rails.js";
import { wagons } from "./wagon.js";
import { pumpState } from "./oil.js";
import { RAIL_H, STROKE_TICKS } from "./spec.js";

/* ------------------------------------------------------------ helpers --- */

/* A filled disc built out of horizontal spans. Integer edges, so a wheel is
   a wheel at 1x rather than a grey blur. */
function disc(ctx, cx, cy, r, col){
  ctx.fillStyle = col;
  for(let dy = -r; dy <= r; dy++){
    const half = Math.floor(Math.sqrt(r*r - dy*dy) + 0.001);
    if(half < 0) continue;
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half*2 + 1, 1);
  }
}

/* A straight bar of given thickness between two points, stepped along its
   longer axis. Used for beams, legs and braces. */
function bar(ctx, x0, y0, x1, y1, t, col){
  ctx.fillStyle = col;
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  for(let i = 0; i <= n; i++){
    const x = x0 + dx * i / n, y = y0 + dy * i / n;
    ctx.fillRect(Math.round(x), Math.round(y), t, t);
  }
}

function viewSpan(pad = 48){
  const hw = state.view.w / (2 * state.cam.zoom) + pad;
  return { x0: state.cam.x - hw, x1: state.cam.x + hw };
}

/* ---------------------------------------------------------------- rail --- */

const RAIL_LIT   = "#9aa1a9";
const SLEEPER    = "#5b4736";
const SLEEPER_LIT= "#755c44";
const BALLAST    = "#4a4238";

export function renderRails(ctx){
  const { x0, x1 } = viewSpan();
  for(const r of rails){
    if(r.x + r.w < x0 || r.x > x1) continue;

    /* ballast first: a thin dark bed, so track laid across a dip reads as
       track on ground rather than as a stripe floating over it */
    ctx.fillStyle = BALLAST;
    ctx.fillRect(r.x, r.y + RAIL_H - 1, r.w, 2);

    /* sleepers, with the sunward pixel on top of each */
    for(let k = 2; k < r.w - 1; k += 7){
      ctx.fillStyle = SLEEPER;
      ctx.fillRect(r.x + k, r.y + 1, 3, RAIL_H);
      ctx.fillStyle = SLEEPER_LIT;
      ctx.fillRect(r.x + k, r.y + 1, 3, 1);
    }

    /* the rail itself: a dark web with a bright head, which is what makes a
       run of track read as two continuous lines from a distance */
    ctx.fillStyle = "#4c5157";
    ctx.fillRect(r.x, r.y, r.w, 2);
    ctx.fillStyle = RAIL_LIT;
    ctx.fillRect(r.x, r.y, r.w, 1);
  }
}

/* --------------------------------------------------------------- wagon --- */

const TUB_LIT   = "#8a6a44";
const TUB_BODY  = "#6b5236";
const TUB_SHADE = "#42321f";
const TUB_IN    = "#241c14";
const BAND      = "#5b636b";
const BAND_LIT  = "#828b94";
const IRON      = "#23262a";
const HUB       = "#585f66";

/* How far the wheel markers have turned. Taken from the wagon's POSITION
   rather than from a counter, so the wheels are always in the pose the
   distance travelled implies - a cart shunted back and forth cannot wind
   its wheels forward, and a cart standing still does not creep. */
function spin(w){ return w.x / 3.2; }

export function renderWagons(ctx, itemDef){
  const { x0, x1 } = viewSpan();
  for(const w of wagons){
    if(w.x + w.w < x0 || w.x - w.w > x1) continue;

    const x = Math.round(w.x - w.w/2), y = Math.round(w.y);
    const W = w.w, H = w.h;

    /* A DERAILED WAGON LEANS. It is the only cue that tells a player across
       the mine why the line has stopped, and dropping it two pixels - which
       is what this did first - reads as nothing at all. So every part of the
       body is drawn through `lean`, which slopes a rectangle by splitting it
       into columns. One helper, and the whole cart tips together rather than
       some of it tipping and the rest staying level. */
    const drop = w.derailed ? 4 : 0;
    /* IT TIPS ABOUT ITS CENTRE, not downward. Sloping every column by
       `drop * (i/W)` pushed the whole body below the box - lane C's check of
       drawing the published rectangle over the art in red showed it in one
       glance, and no test or reading of the code had. Tipping about the
       middle raises one end as much as it drops the other, so a lean of four
       pixels costs two, and the art stays where the simulation says it is. */
    const leanAt = px => drop ? Math.round(drop * ((px - x) / W - 0.5)) : 0;
    const rect = (rx, ry, rw, rh) => {
      if(!drop){ ctx.fillRect(rx, ry, rw, rh); return; }
      for(let i = 0; i < rw; i++)
        ctx.fillRect(rx + i, ry + leanAt(rx + i), 1, rh);
    };

    /* --- what is in it, worked out before anything is drawn --- */
    let mass = 0, heaviest = null, heaviestMass = 0;
    for(const id in w.store.items){
      const m = w.store.items[id] * itemDef(id).mass;
      mass += m;
      if(m > heaviestMass){ heaviestMass = m; heaviest = id; }
    }
    const raw = w.store.cap > 0 ? Math.min(1, mass / w.store.cap) : 0;
    /* HOW FULL IT LOOKS IS NOT HOW FULL IT IS, on purpose. A wagon holds
       1500 kg (lane F's rung) and a player arrives with a backpack, so a
       useful load - twenty ore, a hundred and twelve kilos - is seven per
       cent of capacity and drew as nothing at all. A cart that looks empty
       while carrying two backpacks is worse than one with no gauge, because
       it is a gauge that lies. The curve makes a small load visibly a small
       load and keeps full looking full. */
    const full = raw > 0 ? Math.pow(raw, 0.5) : 0;

    /* --- contact shadow, so it sits ON the rail rather than over it.
       It does NOT lean: a shadow lies on the ground whatever the cart above
       it is doing, and leaning it was what put a derailed wagon's drawing a
       pixel below its own box. --- */
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(x + 2, y + H - 1, W - 4, 1);

    /* --- wheels, under the body and inside the footprint ---
       They do NOT lean with the body: a derailed wagon is a tub tipped over
       on wheels that are still lying on the ground, which is both what a
       derailment looks like and what keeps the art inside the box. */
    for(const cx of [x + 5, x + W - 6]){
      const wy = y + H - 4;
      disc(ctx, cx, wy, 3, IRON);
      disc(ctx, cx, wy, 1, HUB);
      /* three markers on the rim: rotation without a rotate transform, and
         it reads at a glance because the eye tracks the moving pixel */
      const p = spin(w);
      for(let k = 0; k < 3; k++){
        const a = p + k * 2.0944;
        ctx.fillStyle = HUB;
        ctx.fillRect(Math.round(cx + Math.cos(a)*2), Math.round(wy + Math.sin(a)*2), 1, 1);
      }
    }

    /* --- the tub ---
       THE LOAD HAS TO BE VISIBLE, and the first attempt hid it completely:
       the interior was drawn and then the near wall was painted straight
       over it, so only a wagon over half full showed anything at all. What a
       player most wants to read at a glance is how full the cart is, so the
       tub keeps a four-pixel OPENING along the top - you look down into it -
       and the load rises through that opening before it heaps over the rim. */
    /* Two pixels of headroom over the rim, so a heaped cart can crown
       WITHOUT the heap leaving the footprint. */
    const rim = y + 2;            /* the far rim, the line that says OPEN */
    const lip = y + 6;            /* the top of the near wall */
    const floor = y + H - 5;      /* inside floor */
    const openH = lip - rim - 1;  /* the band you can see into */

    /* the opening, dark */
    ctx.fillStyle = TUB_IN;
    rect(x + 1, rim + 1, W - 2, openH);

    if(full > 0 && heaviest){
      const col = itemDef(heaviest).col, dark = itemDef(heaviest).dark || TUB_SHADE;
      /* the load rises through the opening */
      const d = Math.max(1, Math.round(openH * Math.min(1, full / 0.8)));
      ctx.fillStyle = col;
      rect(x + 1, lip - d, W - 2, d);
      ctx.fillStyle = dark;
      rect(x + 1, lip - d, W - 2, 1);
      /* and then heaps proud of the rim, tapering, so a full cart is a mound
         rather than a level */
      if(full > 0.8){
        /* narrow and tapering fast, or a nearly full cart reads as one with
           a lid on rather than one heaped up */
        /* headroom, less whatever the lean has already spent going up: a
           tipped cart raises its high end, and a heap on top of that was the
           last pixel to escape the box */
        const room = rim - y - 1 - Math.ceil(drop/2);
        const crown = Math.min(room, Math.round((full - 0.8) * 22));
        for(let k = 0; k <= crown; k++){
          ctx.fillStyle = k === crown ? dark : col;
          const inset = 4 + k*2;
          if(W - inset*2 <= 0) break;
          rect(x + inset, rim - 1 - k, W - inset*2, 1);
        }
      }
    }

    /* the near side wall, over the lower part of the opening */
    ctx.fillStyle = TUB_BODY;
    rect(x, lip, W, floor - lip + 2);
    ctx.fillStyle = TUB_LIT;
    rect(x, lip, W, 1);                       /* the near lip catches light */
    ctx.fillStyle = TUB_SHADE;
    rect(x, lip + 3, W, 1);                   /* plank line */
    rect(x, floor + 1, W, 1);                 /* shaded base */

    /* corner bands, lit on their left edge like everything else */
    for(const bx of [x + 1, x + W - 3]){
      ctx.fillStyle = BAND;
      rect(bx, rim, 2, floor - rim + 2);
      ctx.fillStyle = BAND_LIT;
      rect(bx, rim, 1, floor - rim + 2);
    }

    /* the far rim, above everything */
    ctx.fillStyle = TUB_LIT;
    rect(x, rim, W, 1);
  }
}

/* -------------------------------------------------------------- derrick -- */

const TIMBER      = "#6b5236";
const TIMBER_LIT  = "#8a6a44";
const TIMBER_DARK = "#3d2e1e";
const RIG_IRON    = "#4a5057";

/* A timber tower: four legs battered inward, cross braced, with a crown
   block at the head. Drawn as a frame you can see through, which is why
   lane C skips these two ids and this lane paints them. */
function drawDerrick(ctx, s, tick){
  const x = s.x, y = s.y, W = s.w, H = s.h;
  const cx = x + W/2;
  const headIn = W*0.32;                 /* the batter: wide foot, narrow head */

  /* linear batter from full width at the foot to `headIn` at the head */
  const lx = (side, t) => cx + side * ((W/2 - 1) + (headIn - (W/2 - 1)) * t);

  /* cross braces first, so the legs sit over them */
  for(let k = 0; k < 4; k++){
    const t0 = k/4, t1 = (k+1)/4;
    /* the lowest girt is clamped INSIDE the box: at t1 = 1 it would be drawn
       at y + H, which is the first row the structure does not occupy */
    const y0 = y + H*t0, y1 = Math.min(y + H - 1, y + H*t1);
    bar(ctx, lx(-1,t0), y0, lx(1,t1), y1, 1, TIMBER_DARK);
    bar(ctx, lx(1,t0),  y0, lx(-1,t1), y1, 1, TIMBER_DARK);
    /* a girt at each level */
    ctx.fillStyle = TIMBER_DARK;
    ctx.fillRect(Math.round(lx(-1,t1)), Math.round(y1), Math.round(lx(1,t1)-lx(-1,t1)), 1);
  }

  /* the two legs, lit on their left face */
  for(const side of [-1, 1]){
    for(let r = 0; r < H; r++){
      const t = r / H;
      const px = Math.round(lx(side, t));
      ctx.fillStyle = TIMBER;
      ctx.fillRect(px - (side < 0 ? 0 : 1), y + r, 2, 1);
      ctx.fillStyle = TIMBER_LIT;
      ctx.fillRect(px - (side < 0 ? 0 : 1), y + r, 1, 1);
    }
  }

  /* crown block: the head frame the pipe string hangs from */
  ctx.fillStyle = RIG_IRON;
  ctx.fillRect(Math.round(cx - headIn) - 1, y, Math.round(headIn*2) + 2, 3);
  ctx.fillStyle = "#6a737c";
  ctx.fillRect(Math.round(cx - headIn) - 1, y, Math.round(headIn*2) + 2, 1);

  /* the cable and the pipe string down the middle */
  ctx.fillStyle = "#2c2620";
  ctx.fillRect(Math.round(cx), y + 3, 1, H - 3);

  /* a sill at the foot, so it meets the ground rather than stopping */
  ctx.fillStyle = TIMBER_DARK;
  ctx.fillRect(x, y + H - 2, W, 2);
  ctx.fillStyle = TIMBER;
  ctx.fillRect(x, y + H - 2, W, 1);
}

/* ---------------------------------------------------------- walking beam -- */

/* THE ONE MACHINE THAT MUST MOVE. A derrick working and a derrick idle look
   identical from across a valley unless something nods, and the stroke is
   the only evidence a player has that the well is paying without walking up
   to it. The phase is read from the pump's own stroke counter, so what the
   player sees IS what the machine is doing - it cannot nod while stalled. */
function drawBeam(ctx, s, phase){
  const x = s.x, y = s.y, W = s.w, H = s.h;

  /* THE FIRST VERSION READ AS A CRANE. The beam ran the full width and the
     braces reached the far corners, which is the silhouette of a gantry
     jib, not of a beam engine. What makes a nodding donkey recognisable is
     the proportion: a stubby A-frame in the MIDDLE, a short deep beam
     rocking over it, a horse head at one end and a flywheel at the other.
     Everything below is pulled in towards the centre for that reason. */
  const cx = x + Math.round(W*0.46);
  const pivotY = y + 6;
  const armL = Math.round(W*0.34), armR = Math.round(W*0.36);

  /* the A-frame: short legs, splayed, not reaching the corners */
  bar(ctx, cx - 1, pivotY, cx - 6, y + H - 2, 2, TIMBER);
  bar(ctx, cx + 1, pivotY, cx + 6, y + H - 2, 2, TIMBER);
  ctx.fillStyle = TIMBER_LIT;
  bar(ctx, cx - 1, pivotY, cx - 6, y + H - 2, 1, TIMBER_LIT);
  ctx.fillStyle = TIMBER_DARK;
  ctx.fillRect(cx - 5, y + H - 7, 11, 1);            /* the tie across it */

  /* the walking beam itself, rocking about the frame */
  const nod = Math.sin(phase * Math.PI * 2) * 3.0;
  const hx = cx - armL, hy = pivotY - nod;
  const tx = cx + armR, ty = pivotY + nod;
  bar(ctx, hx, hy, tx, ty, 3, TIMBER);
  bar(ctx, hx, hy, tx, ty, 1, TIMBER_LIT);
  ctx.fillStyle = RIG_IRON;                          /* the saddle bearing */
  ctx.fillRect(cx - 2, pivotY - 2, 4, 4);

  /* the horse head over the well, and the polished rod hanging from it */
  ctx.fillStyle = TIMBER;
  ctx.fillRect(Math.round(hx) - 3, Math.round(hy) - 1, 5, 5);
  ctx.fillStyle = TIMBER_DARK;
  ctx.fillRect(Math.round(hx) - 3, Math.round(hy) + 3, 5, 1);
  ctx.fillStyle = "#2c2620";
  ctx.fillRect(Math.round(hx) - 1, Math.round(hy) + 4, 1, y + H - Math.round(hy) - 4);

  /* the flywheel at the tail, and the pitman arm down to it */
  const fx = tx, fy = y + H - 6;
  const a = phase * Math.PI * 2;
  disc(ctx, fx, fy, 4, RIG_IRON);
  disc(ctx, fx, fy, 1, "#8a949d");
  ctx.fillStyle = TIMBER_DARK;                       /* its bearing block */
  ctx.fillRect(fx - 3, fy + 4, 6, y + H - (fy + 4) - 1);
  const px = fx + Math.cos(a)*2.6, py = fy + Math.sin(a)*2.6;
  ctx.fillStyle = "#8a949d";
  ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
  bar(ctx, tx, ty, px, py, 1, "#2c2620");

  /* ground line */
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(x + 1, y + H - 1, W - 2, 1);
}

/* Lane C raises the derrick and the beam and skips drawing them; this lane
   paints them, because a frame you see through cannot be a filled box. */
export function renderMachines(ctx, structures, tick){
  const { x0, x1 } = viewSpan();
  for(const s of structures){
    if(s.x + s.w < x0 || s.x > x1) continue;
    if(!s.built) continue;                 /* half-built stays lane C's hatch */
    if(s.defId === "derrick") drawDerrick(ctx, s, tick);
    else if(s.defId === "walking_beam"){
      /* the beam belongs to the derrick beside it, so it nods on that
         derrick's stroke rather than on a clock of its own */
      let phase = 0;
      for(const o of structures){
        if(o.defId !== "derrick" || !o.built) continue;
        if(Math.abs((o.x + o.w/2) - (s.x + s.w/2)) > 60) continue;
        phase = pumpState(o).stroke / STROKE_TICKS;
        break;
      }
      drawBeam(ctx, s, phase);
    }
  }
}
