/* Putting a building down. LANE C (build).

   Placement answers one question - may this go here, and if not, why not -
   and it answers it the same way for the ghost preview, for the build menu
   and for the actual placement. One code path, so the preview can never
   promise something the placement then refuses.

   A refusal always carries a reason the UI can show. "You cannot build
   there" teaches nothing; "needs solid ground under it" teaches the rule. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { building } from "../content/buildings.js";
import { structures, makeStructure, overlaps, groundFraction,
         buriedFraction, wallFraction, anchorAbove, has,
         terrainHolds, spanForCandidate, recomputeSpans, currentSpans,
         MAX_SPAN } from "./structures.js";

/* How far the player can reach to build, in pixels. The clonk is 16 tall,
   so this is a bit over three body heights - close enough that you must walk
   to the site, generous enough that you are not fighting the cursor. */
export const REACH = 70;

/* How near a station must be to count as "you are working at it". Matches
   the radius the crafting screen asks structuresNear() with. */
export const STATION_R = 40;

/* A footprint may clip a little terrain - ground is never perfectly flat -
   but it may not be sunk into a hillside. */
const MAX_BURIED = 0.12;

/* Where a building would actually sit if you pointed here: resting on the
   first solid ground below the cursor, centred on it. Nothing floats, so the
   only sensible interpretation of "build here" is "build on the ground here". */
/* A piece is a rectangle and may be laid on its side, so one plank def gives
   both a beam and a post. Two orientations only: diagonals are a different
   collision model and this one is honest about being rectangles. */
export function footprint(def, rot){
  return rot ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

export function siteFor(world, defId, wx, wy, rot){
  const def = building(defId);
  if(!def) return null;
  const fp = footprint(def, rot);
  const x = Math.round(wx - fp.w/2);
  const from = Math.round(wy);

  /* Anything that does not stand ON the ground goes WHERE YOU POINT: a
     ladder, a hanging rope, and a plank you are laying across two posts.
     Dropping a ladder to the floor would put it at the bottom of the shaft
     you are trying to climb out of, which is exactly the wrong place. Only
     things that want ground under them are dropped to the ground. */
  const sup = def.support || {};
  if((sup.ground ?? 1) <= 0 || sup.wall || sup.anchor === "above"){
    const at = { x, y: Math.round(wy - fp.h/2), w: fp.w, h: fp.h };
    return sup.piece ? snapToNeighbours(world, at) : at;
  }

  /* Cast down from the cursor in every column of the footprint and rest the
     building on the HIGHEST ground it finds. Sitting on the highest point
     means it bridges a dip rather than burying its uphill end in the slope,
     which is what a real foundation does. Casting per column rather than
     reading the surface map also means this works in a tunnel, where the
     terrain surface is far overhead. */
  let top = Infinity;
  for(let cx = x; cx < x + fp.w; cx++){
    for(let k = 0; k <= 48; k++){
      if(world.isSolid(cx, from+k)){ if(from+k < top) top = from+k; break; }
    }
  }
  /* nothing below: the cursor may have been inside the ground already */
  if(top === Infinity){
    for(let k = 1; k <= 48; k++){
      if(world.isSolid(Math.round(wx), from-k)){ top = from-k; break; }
    }
  }
  if(!isFinite(top)) return null;
  return { x, y: top - fp.h, w: fp.w, h: fp.h };
}

/* How near an edge has to be before a piece lines itself up with it. A third
   of a plank's thickness: close enough that a rough aim lands flush, far
   enough that you can still deliberately leave a gap. */
export const SNAP = 8;

/* Line a piece up with what is already there.

   A house is dozens of pieces, and lane F costed one at 148 kg of materials -
   but the real cost of forty pieces is forty careful aims, and that is a cost
   in nobody's table. Snapping is what turns it back into forty rough ones.

   Each axis is snapped independently against the edges of nearby pieces, so
   a plank aimed roughly past the end of a deck lands flush with it, and one
   aimed roughly above a post sits exactly on top. Candidates that would
   overlap something are dropped, so snapping can never move a piece INTO a
   neighbour - if you aimed at a gap you get the gap. */
function snapToNeighbours(world, at){
  const near = structures.filter(o =>
    o.x < at.x + at.w + 40 && o.x + o.w > at.x - 40 &&
    o.y < at.y + at.h + 40 && o.y + o.h > at.y - 40);
  if(!near.length) return at;

  /* A snapped position is only worth taking if you could actually build
     there. The nearest edge is often the wrong one - aim a little low beside
     a plank and the closest candidate is the one BELOW it, which on flat
     ground is a plank buried in the dirt. So candidates are filtered by
     whether they are buildable, and the nearest survivor wins. */
  const usable = r =>
    buriedFraction(world, r.x, r.y, r.w, r.h) <= MAX_BURIED &&
    !structures.some(o => overlaps(r, o));

  const edgeX = [], edgeY = [];
  for(const o of near){
    edgeX.push(o.x, o.x + o.w, o.x - at.w, o.x + o.w - at.w);
    edgeY.push(o.y, o.y + o.h, o.y - at.h, o.y + o.h - at.h);
  }
  /* the raw aim is an option on each axis, but only as a fallback */
  const xs = edgeX.concat([at.x]), ys = edgeY.concat([at.y]);

  /* ALIGNING BEATS BEING NEAR. Scoring by distance alone would always pick
     the untouched cursor position, since it is zero away from itself - which
     is snapping that never snaps. So prefer the candidate that lines up on
     more axes, and only then the one closest to where they pointed. */
  let best = null, bestScore = null;
  for(const nx of xs){
    if(Math.abs(nx - at.x) > SNAP) continue;
    for(const ny of ys){
      if(Math.abs(ny - at.y) > SNAP) continue;
      const r = { x:nx, y:ny, w:at.w, h:at.h };
      if(!usable(r)) continue;
      const aligned = (edgeX.includes(nx) ? 1 : 0) + (edgeY.includes(ny) ? 1 : 0);
      const d = Math.abs(nx - at.x) + Math.abs(ny - at.y);
      if(!bestScore || aligned > bestScore.aligned ||
         (aligned === bestScore.aligned && d < bestScore.d)){
        bestScore = { aligned, d };
        best = r;
      }
    }
  }
  return best || at;
}

/* The single verdict. Returns { ok, reason, site }. */
export function canPlace(world, items, defId, wx, wy, opts){
  const def = building(defId);
  if(!def) return { ok:false, reason:"no such building" };
  const rot = !!(opts && opts.rot);

  const site = siteFor(world, defId, wx, wy, rot);
  if(!site) return { ok:false, reason:"nothing solid to build on", rot };
  site.rot = rot;

  const p = state.player;
  const cx = site.x + site.w/2, cy = site.y + site.h/2;
  if(Math.hypot(cx - p.x, cy - p.y) > REACH)
    return { ok:false, reason:"too far away", site };

  if(buriedFraction(world, site.x, site.y, site.w, site.h) > MAX_BURIED)
    return { ok:false, reason:"there is ground in the way", site };

  /* One support question for every kind of thing: how far is this from
     something that actually holds it up? Terrain by its own rule is zero;
     resting on a structure inherits its distance; being held only from the
     side costs one, and past MAX_SPAN nothing is holding it. */
  const sup = def.support || {};
  recomputeSpans(world);
  const span = spanForCandidate(world, def, site, structures, currentSpans());
  if(span > MAX_SPAN){
    let reason;
    if(sup.wall) reason = "needs a wall to fix it to";
    else if(sup.anchor === "above") reason = "needs something solid to hang from";
    else if(isFinite(span)) reason = "too far from anything holding it up";
    else if((sup.ground ?? 1) > 0) reason = "needs solid ground under it";
    else reason = "nothing would hold it up there";
    return { ok:false, reason, site, span };
  }

  for(const s of structures){
    if(overlaps(site, s)) return { ok:false, reason:"something is already there", site };
  }

  /* buildsAt is a capability, like a recipe's tool: the station must be
     standing and finished nearby, and it is not consumed. */
  if(def.buildsAt && def.buildsAt !== "hand"){
    const near = structures.some(s =>
      s.defId === def.buildsAt && s.built &&
      Math.hypot(s.x + s.w/2 - p.x, s.y + s.h/2 - p.y) <= STATION_R);
    if(!near){
      const st = building(def.buildsAt);
      return { ok:false, reason:"needs a "+((st && st.name) || def.buildsAt), site };
    }
  }

  const missing = [];
  for(const id in def.materials){
    const have = items.inventory.count(id);
    const need = def.materials[id];
    if(have < need) missing.push({ id, need, have });
  }
  if(missing.length) return { ok:false, reason:"missing materials", missing, site };

  return { ok:true, site };
}

/* Place it: consume the materials and start raising it. It is not finished
   the instant it appears - def.time seconds of work stand between a heap of
   material and a working station. */
export function place(world, items, defId, wx, wy, opts){
  const verdict = canPlace(world, items, defId, wx, wy, opts);
  if(!verdict.ok) return verdict;

  const def = building(defId);
  for(const id in def.materials) items.inventory.take(id, def.materials[id]);

  const s = makeStructure(defId, verdict.site.x, verdict.site.y,
                          verdict.site.rot);
  structures.push(s);
  bus.emit("structure:placed", { defId, x:s.x, y:s.y, rot:s.rot });
  return { ok:true, structure:s, site:verdict.site };
}
