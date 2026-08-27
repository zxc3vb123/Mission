/* What holds a structure up. LANE C (build).

   Two modes of building share one support model on purpose.

   A PREFAB is a whole thing: pick a sawmill, place a sawmill. Right for a
   machine, which has a defined shape and a defined job.

   A PIECE is a plank. The player decides the shape, one rectangle at a time,
   and pieces rest on each other - which is the entire point of building out
   of pieces and also the thing that turns into either carpentry or an
   infinite floating scaffold.

   THE SPAN RULE is what keeps it carpentry:

     - Something solid DIRECTLY BENEATH you - terrain, or another built
       structure - makes you span 0. Fully held.
     - Held only from the SIDE, you are your neighbour's span plus one.
     - Past MAX_SPAN, nothing is holding you and you fall.

   So a column can be any height, because each piece has one beneath it and
   stays span 0 - a tower is honest. But a floor reaching out from a post
   climbs a span per piece, so it can only run so far before it needs another
   post under it. That is the rule a player infers by building rather than by
   reading, and it is why "put a post there" is the answer rather than "the
   game said no".

   Spans propagate outward FROM THE GROUND, never in a circle: two pieces
   leaning on each other with nothing beneath both fall, because neither can
   reach the ground to start counting from. */

import * as CONTENT from "../content/buildings.js";
const building = CONTENT.building;

/* How close under a footprint still counts as holding it up. A pixel
   landscape is never laser-flat, so demanding solid at exactly one row would
   make most of the real surface unbuildable. A few pixels of hollow is a
   building bridging a dip; more than that is a building in mid-air. */
export const SUPPORT_DEPTH = 4;

/* How far a run of pieces may reach from the last thing under it.
   LANE F's number - it decides whether this feels like carpentry or magic.
   The fallback is used only until they name one. */
export const MAX_SPAN =
  (typeof CONTENT.MAX_SPAN === "number") ? CONTENT.MAX_SPAN : 4;

/* At least half a piece's height against solid material, for things fixed to
   a wall rather than standing on the ground. */
const WALL_FRACTION = 0.5;

export function rectsTouch(a, b, slack = 1){
  return a.x < b.x + b.w + slack && a.x + a.w + slack > b.x &&
         a.y < b.y + b.h + slack && a.y + a.h + slack > b.y;
}

/* b sits directly under a: overlapping horizontally, and a's underside is at
   b's top within the same tolerance the ground gets. */
export function sitsOn(a, b){
  if(a.x >= b.x + b.w || a.x + a.w <= b.x) return false;
  const gap = b.y - (a.y + a.h);
  return gap >= -1 && gap <= SUPPORT_DEPTH;
}

/* a hangs from b: b's underside meets a's top. */
export function hangsFrom(a, b){
  if(a.x >= b.x + b.w || a.x + a.w <= b.x) return false;
  const gap = a.y - (b.y + b.h);
  return gap >= -1 && gap <= 2;
}

/* b is beside a and overlapping vertically. */
export function beside(a, b){
  if(a.y >= b.y + b.h || a.y + a.h <= b.y) return false;
  const gapL = a.x - (b.x + b.w);
  const gapR = b.x - (a.x + a.w);
  return (gapL >= -1 && gapL <= 2) || (gapR >= -1 && gapR <= 2);
}

export function groundFraction(world, x, y, w, h){
  let solid = 0;
  for(let cx = x; cx < x+w; cx++){
    for(let d = 0; d < SUPPORT_DEPTH; d++){
      if(world.isSolid(cx, y+h+d)){ solid++; break; }
    }
  }
  return w > 0 ? solid/w : 0;
}

export function buriedFraction(world, x, y, w, h){
  let solid = 0, total = 0;
  for(let cy = y; cy < y+h; cy++){
    for(let cx = x; cx < x+w; cx++){
      total++;
      if(world.isSolid(cx, cy)) solid++;
    }
  }
  return total > 0 ? solid/total : 0;
}

export function wallFraction(world, x, y, w, h){
  let left = 0, right = 0;
  for(let cy = y; cy < y+h; cy++){
    if(world.isSolid(x-1, cy)) left++;
    if(world.isSolid(x+w, cy)) right++;
  }
  return h > 0 ? Math.max(left, right)/h : 0;
}

export function anchorAbove(world, x, y, w){
  for(let cx = x; cx < x+w; cx++) if(world.isSolid(cx, y-1)) return true;
  return false;
}

/* Does the TERRAIN alone hold this rect up, by whatever rule its def asks
   for? Nothing about other structures enters here. */
export function terrainHolds(world, def, r){
  const sup = (def && def.support) || {};
  if(sup.wall) return wallFraction(world, r.x, r.y, r.w, r.h) >= WALL_FRACTION - 1e-9;
  if(sup.anchor === "above") return anchorAbove(world, r.x, r.y, r.w);

  /* A PIECE needs real contact, not a waived requirement. Lane F writes
     `ground: 0` on a plank to mean "no minimum fraction" - a beam may rest
     one end on a rock - and reading that as "needs nothing" would let planks
     float anywhere, which is the whole failure this model exists to prevent.
     Any ground under any part of it is enough; none is not. */
  if(sup.piece) return groundFraction(world, r.x, r.y, r.w, r.h) > 0;

  const want = sup.ground ?? 1;
  if(want <= 0) return true;
  return groundFraction(world, r.x, r.y, r.w, r.h) >= want - 1e-9;
}

/* Work out every structure's span in one pass, outward from the ground.

   Anything the terrain holds by its own rule starts at 0. Everything else
   waits to hear from a neighbour: resting ON something inherits its span
   unchanged (a column is free), while being held from the SIDE costs one.
   A structure nothing ever reaches keeps span Infinity, which is the
   definition of unsupported.

   One pass over a settling frontier rather than a walk per structure, so a
   house of hundreds of planks costs about what one of eight stations does. */
export function computeSpans(world, list){
  const span = new Map();
  const frontier = [];

  for(const s of list){
    const def = building(s.defId);
    if(terrainHolds(world, def, s)){
      span.set(s, 0);
      frontier.push(s);
    } else {
      span.set(s, Infinity);
    }
  }

  /* Settle outward. Each structure asks what relation it has to something
     already reached, and takes the cheapest one offered. */
  let head = 0;
  while(head < frontier.length){
    const cur = frontier[head++];
    const curSpan = span.get(cur);
    if(curSpan >= MAX_SPAN + 1) continue;

    for(const other of list){
      if(other === cur) continue;
      const def = building(other.defId);
      const sup = (def && def.support) || {};

      let cost = null;
      if(sup.wall){
        /* A ladder needs a WALL. Nothing else holds it: letting it rest on
           the section below would mean digging out the rock behind a run of
           ladders left them hanging in the shaft, which is precisely the
           thing "nothing floats" exists to forbid. Each section answers for
           itself. */
        continue;
      } else if(sup.anchor === "above"){
        /* in tension, hanging off the section above: free */
        if(hangsFrom(other, cur)) cost = 0;
      } else if(sitsOn(other, cur)){
        cost = 0;                        /* something under it: fully held */
      } else if(beside(other, cur)){
        cost = 1;                        /* held from the side: a cantilever */
      }
      if(cost === null) continue;

      const next = curSpan + cost;
      if(next < span.get(other) && next <= MAX_SPAN){
        span.set(other, next);
        frontier.push(other);
      }
    }
  }
  return span;
}

/* What span a rect WOULD have if it were placed, given what already stands.
   Used by the ghost, so the preview refuses exactly what placement refuses. */
export function spanForCandidate(world, def, rect, list, spans){
  if(terrainHolds(world, def, rect)) return 0;
  const sup = (def && def.support) || {};
  if(sup.wall) return Infinity;         /* only a wall holds a wall-fixed thing */
  let best = Infinity;
  for(const o of list){
    const os = spans.get(o);
    if(!(os <= MAX_SPAN)) continue;
    let cost = null;
    if(sup.anchor === "above"){
      if(hangsFrom(rect, o)) cost = 0;
    } else if(sitsOn(rect, o)){
      cost = 0;
    } else if(beside(rect, o)){
      cost = 1;
    }
    if(cost === null) continue;
    best = Math.min(best, os + cost);
  }
  return best;
}
