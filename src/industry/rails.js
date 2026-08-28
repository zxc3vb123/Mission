/* Track. LANE D (industry).

   WHY RAIL IS NOT A LANE C STRUCTURE, since a machine is supposed to be data
   and lane C's place() is supposed to raise it.

   It is, for everything that stands still. A derrick, a boiler and a pump
   will all be BUILDINGS entries, and this lane will not write a line of
   placement for any of them. Track is the exception, for one reason: a rail
   is not a thing standing in a spot, it is a RUNNING SURFACE with topology.
   A wagon has to ask, every tick, "what is under me, and where does it go
   next" - and the answer has to come from the same module that knows how a
   wagon rolls, because it is asked at 36 Hz and it is the whole of the
   physics. Lane C's structure list has no vocabulary for a joint, a gradient
   or a run, and no reason to grow one. So the track lives beside the wagon
   and takes on the duties a structure would have had:

     - it needs ground under it, checked when laid and again while it lies
     - it costs materials out of the pack, and gives them back when it goes
     - it saves and restores

   THE NETWORK IS GEOMETRY, NOT A GRAPH. There is no adjacency list. A wagon
   asks what rail is under a point, and that is the whole of it. Which means
   digging the ballast out from under one segment cannot corrupt a topology -
   there is none to corrupt. The wagon simply finds nothing under it and comes
   off, which is the derailment the brief asks for rather than a crash. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { RAIL_LEN, RAIL_H, RAIL_COST, MIN_BALLAST, BALLAST_DEPTH,
         JOIN_GAP, MAX_STEP, BALLAST_CHECK, PUSH_REACH } from "./spec.js";

/* How far past the edge of the view track is still watched. Generous, so a
   length just off screen still falls in when its ballast goes. */
const SIM_MARGIN = 260;

export const rails = [];
let nextId = 1;

/* Bucketed by x, so a lookup is a handful of comparisons rather than a scan.
   Hundreds of segments will exist and every wagon asks every tick. */
const BUCKET = 128;
const buckets = new Map();
const keyOf = x => Math.floor(x / BUCKET);

function index(r){
  for(let k = keyOf(r.x); k <= keyOf(r.x + r.w - 1); k++){
    let b = buckets.get(k);
    if(!b) buckets.set(k, b = []);
    b.push(r);
  }
}
function unindex(r){
  for(let k = keyOf(r.x); k <= keyOf(r.x + r.w - 1); k++){
    const b = buckets.get(k);
    if(!b) continue;
    const i = b.indexOf(r);
    if(i >= 0) b.splice(i, 1);
  }
}

export function clearRails(){
  rails.length = 0;
  buckets.clear();
  nextId = 1;
}

function atColumn(x){ return buckets.get(keyOf(x)) || []; }

/* The segment under a point, if the point is riding on it. `slack` is how far
   off the running surface still counts as being on it. */
export function railAt(x, y, slack = 4){
  for(const r of atColumn(x)){
    if(x < r.x || x >= r.x + r.w) continue;
    if(y >= r.y - slack && y <= r.y + r.h + slack) return r;
  }
  return null;
}

/* The height of the running surface in this column, nearest to `nearY`.
   Null when there is no track here at all. */
export function railTopAt(x, nearY){
  let best = null, bestD = Infinity;
  for(const r of atColumn(x)){
    if(x < r.x || x >= r.x + r.w) continue;
    const d = nearY === undefined ? 0 : Math.abs(r.y - nearY);
    if(d < bestD){ bestD = d; best = r; }
  }
  return best ? best.y : null;
}

/* ------------------------------------------------------------- ballast --- */

/* What fraction of a segment has solid ground close under it. */
export function ballastFraction(world, x, y, w){
  let held = 0;
  for(let cx = x; cx < x + w; cx++){
    for(let k = 1; k <= BALLAST_DEPTH; k++){
      if(world.isSolid(cx, y + RAIL_H + k - 1)){ held++; break; }
    }
  }
  return w > 0 ? held / w : 0;
}

/* ---------------------------------------------------------------- lay ---- */

/* Where a rail would sit if you pointed here: resting on the first solid
   ground below the cursor. The same reading of "build here" as lane C's
   siteFor - nothing floats, so it means "on the ground here". */
export function siteFor(world, wx, wy){
  const x = Math.round(wx - RAIL_LEN/2);
  const from = Math.round(wy);

  let top = Infinity;
  for(let cx = x; cx < x + RAIL_LEN; cx++){
    for(let k = 0; k <= 48; k++){
      if(world.isSolid(cx, from + k)){ if(from + k < top) top = from + k; break; }
    }
  }
  if(top === Infinity){
    for(let k = 1; k <= 48; k++){
      if(world.isSolid(Math.round(wx), from - k)){ top = from - k; break; }
    }
  }
  if(!isFinite(top)) return null;
  return { x, y: top - RAIL_H, w: RAIL_LEN, h: RAIL_H };
}

function overlapsRail(site){
  for(const r of rails){
    if(site.x < r.x + r.w && site.x + site.w > r.x &&
       site.y < r.y + r.h + 2 && site.y + site.h + 2 > r.y) return r;
  }
  return null;
}

/* The segments this one would join onto, end to end within a joint's slack. */
export function neighboursOf(site){
  const out = [];
  for(const r of rails){
    const gapL = site.x - (r.x + r.w);           /* r is to the left */
    const gapR = r.x - (site.x + site.w);        /* r is to the right */
    if(gapL >= 0 && gapL <= JOIN_GAP){ out.push(r); continue; }
    if(gapR >= 0 && gapR <= JOIN_GAP) out.push(r);
  }
  return out;
}

/* ONE VERDICT, for the preview and for the laying itself - the rule lane C
   follows, so a preview can never promise what laying then refuses. */
export function canLay(world, items, wx, wy, opts){
  const site = siteFor(world, wx, wy);
  if(!site) return { ok:false, reason:"nothing solid to lay it on" };

  if(!(opts && opts.anywhere)){
    const p = state.player;
    if(Math.hypot(site.x + site.w/2 - p.x, site.y - p.y) > PUSH_REACH)
      return { ok:false, reason:"too far away", site };
  }

  if(overlapsRail(site))
    return { ok:false, reason:"there is track there already", site };

  if(ballastFraction(world, site.x, site.y, site.w) < MIN_BALLAST)
    return { ok:false, reason:"needs ground under the sleepers", site };

  for(const n of neighboursOf(site)){
    if(Math.abs(n.y - site.y) > MAX_STEP)
      return { ok:false, reason:"too steep to join the track", site };
  }

  const missing = [];
  for(const id in RAIL_COST){
    const have = items.inventory.count(id), need = RAIL_COST[id];
    if(have < need) missing.push({ id, need, have });
  }
  if(missing.length) return { ok:false, reason:"missing materials", missing, site };

  return { ok:true, site };
}

export function layRail(world, items, wx, wy, opts){
  const v = canLay(world, items, wx, wy, opts);
  if(!v.ok) return v;

  for(const id in RAIL_COST) items.inventory.take(id, RAIL_COST[id]);

  const r = { id: nextId++, x: v.site.x, y: v.site.y, w: v.site.w, h: RAIL_H };
  rails.push(r);
  index(r);
  bus.emit("rail:laid", { x: r.x, y: r.y, w: r.w });
  return { ok:true, rail:r };
}

/* Lay a run from x0 to x1, following the ground: what dragging along the
   ground should do, and what a test wants. Reports what it managed and what
   stopped it, rather than throwing away the difference.

   `opts.y` aims the run at a level rather than at the surface map, which is
   what laying track along the floor of a drift needs - underground, the
   surface is a hundred pixels overhead and means nothing. */
export function layRun(world, items, x0, x1, opts){
  const laid = [];
  const dir = x0 <= x1 ? 1 : -1;
  const aim = opts && typeof opts.y === "number" ? opts.y : null;
  for(let x = x0; dir > 0 ? x <= x1 : x >= x1; x += dir * RAIL_LEN){
    const y = aim !== null ? aim : world.surfaceAt(x) - 8;
    const r = layRail(world, items, x + dir * RAIL_LEN/2, y, opts);
    if(!r.ok) return { laid, stoppedBy: r.reason, at: x };
    laid.push(r.rail);
  }
  return { laid, stoppedBy: null };
}

/* --------------------------------------------------------------- take ---- */

/* Conservation of matter: track that goes gives back what it was made of.
   Pulled up on purpose or fallen in when its ballast was dug out, the steel
   exists afterwards either way. */
export function removeRail(r, spawnDrop, why){
  const i = rails.indexOf(r);
  if(i < 0) return null;
  rails.splice(i, 1);
  unindex(r);
  const returned = {};
  for(const id in RAIL_COST){
    returned[id] = RAIL_COST[id];
    if(spawnDrop)
      for(let k = 0; k < RAIL_COST[id]; k++) spawnDrop(r.x + r.w/2, r.y - 2, id);
  }
  bus.emit("rail:removed", { x: r.x, y: r.y, why: why || "taken up", returned });
  return returned;
}

export function removeRailAt(x, y, spawnDrop){
  const r = railAt(x, y, 6);
  return r ? removeRail(r, spawnDrop, "taken up") : null;
}

/* --------------------------------------------------------------- tick ---- */

/* Nothing floats, and that applies to track. A segment whose ballast has been
   dug out falls in and gives its steel back - so a rail line fails one length
   at a time, exactly where the mine subsided.

   Checked on a schedule rather than every tick: hundreds of segments each
   sweeping their own ballast every frame is the shape of a late-game
   slideshow, and a rail does not need to notice within a thirty-sixth of a
   second that the ground has gone. */
export function updateRails(world, spawnDrop, tick){
  /* ONLY TRACK IN THE SIMULATED BAND IS CHECKED, and that is the engine's
     existing rule rather than a shortcut. Lane A runs liquids and cave-ins
     in a band around the camera, not across the map, because only loaded
     ground is simulated at all. A ballast check READS TERRAIN, so a rail
     line stretching across the map would page a chunk in every few ticks
     for ground nobody is looking at - which is exactly what turned a 1.8 ms
     tick into a 30 ms one and gated the deploy.

     Deferring it costs nothing real: the ground under a rail can only be dug
     out by something that is there, and when the player comes back the
     length falls in as it always would. This is damage being NOTICED late,
     not damage being lost - which is a different thing from a machine
     producing less because nobody was watching, and that this lane does not
     do (see the derrick in oil.js). */
  const band = state.view.w / (2 * (state.cam.zoom || 3)) + SIM_MARGIN;
  const cx = state.cam.x;
  for(let i = rails.length - 1; i >= 0; i--){
    const r = rails[i];
    if(((r.id + tick) % BALLAST_CHECK) !== 0) continue;
    if(Math.abs(r.x + r.w/2 - cx) > band) continue;
    if(ballastFraction(world, r.x, r.y, r.w) < MIN_BALLAST)
      removeRail(r, spawnDrop, "the ground went from under it");
  }
}

/* --------------------------------------------------------------- save ---- */

export function serialiseRails(){
  return rails.map(r => [r.x, r.y, r.w]);
}
export function restoreRails(data){
  clearRails();
  if(!Array.isArray(data)) return;
  for(const rec of data){
    const r = { id: nextId++, x: rec[0], y: rec[1], w: rec[2] || RAIL_LEN, h: RAIL_H };
    rails.push(r);
    index(r);
  }
}
