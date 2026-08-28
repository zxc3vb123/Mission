/* The chunk store. LANE A (world).

   The map is too big to hold as one flat buffer, so it lives as a grid of
   128 x 128 chunks. A chunk is in one of three states:

     resident   its land/bg/flags buffers exist and can be read and written
     archived   it was changed and then evicted, so a run-length copy of it
                is kept and restored verbatim when it is needed again
     absent     never visited, or visited and never changed: it is simply
                regenerated from the seed, which is deterministic and gives
                exactly the same pixels back

   Chunks come and go around the camera. Buffers are pooled and reused, so
   walking across the map allocates nothing after the first few chunks.

   Nothing outside src/world/ talks to this file: other lanes see only
   matAt / setMat / isSolid, which look the same as they always did. */

import { CHUNK, CSHIFT, CW, CH, CPIX, TPC, EVICT_GRACE, MAX_RESIDENT } from "./config.js";
import { state } from "../core/state.js";

export const grid     = new Array(CW * CH).fill(null);
export const resident = [];
const archive   = new Array(CW * CH).fill(null);
const diffs     = new Array(CW * CH).fill(null);   /* from a loaded save */
const pool      = [];
const POOL_MAX  = 96;

let archiveBytes = 0;
let fillChunk = null;                 /* injected by generate.js */

/* Anything that keeps its own per-chunk state - the repaint queue, the
   physics queues, the chunk canvas - registers here rather than being
   called by name, so this file stays ignorant of the rest of the lane. */
const loadHooks = [], unloadHooks = [];

export function setChunkFiller(fn){ fillChunk = fn; }
export function onChunkLoad(fn){ loadHooks.push(fn); }
export function onChunkUnload(fn){ unloadHooks.push(fn); }

function fireLoad(c){ for(let i = 0; i < loadHooks.length; i++) loadHooks[i](c); }
function fireUnload(c){ for(let i = 0; i < unloadHooks.length; i++) unloadHooks[i](c); }

export const stats = { loads: 0, evictions: 0, regens: 0, restores: 0 };

/* --------------------------------------------------------------- chunks --- */
function makeChunk(){
  return {
    cx: 0, cy: 0, ci: 0, x0: 0, y0: 0,
    land:  new Uint8Array(CPIX),
    bg:    new Uint8Array(CPIX),
    flags: new Uint8Array(CPIX),
    tileDirty: new Uint8Array(TPC * TPC),
    lava:      new Uint8Array(TPC * TPC),
    born: 0,
    modified: false,
    can: null, ctx: null
  };
}

export function chunkAt(cx, cy){
  if(cx < 0 || cy < 0 || cx >= CW || cy >= CH) return null;
  return grid[cy * CW + cx];
}

export function loadChunk(cx, cy){
  if(cx < 0 || cy < 0 || cx >= CW || cy >= CH) return null;
  const ci = cy * CW + cx;
  const have = grid[ci];
  if(have) return have;

  const c = pool.length ? pool.pop() : makeChunk();
  c.cx = cx; c.cy = cy; c.ci = ci;
  c.x0 = cx << CSHIFT; c.y0 = cy << CSHIFT;
  c.flags.fill(0);
  c.lava.fill(0);
  c.tileDirty.fill(0);   /* the load hook queues the whole chunk to repaint */
  c.modified = false;
  c.born = state.tick;

  const arc = archive[ci];
  if(arc){
    decode(arc, c);
    c.modified = true;
    stats.restores++;
  } else {
    fillChunk(c);
    stats.regens++;
    const d = diffs[ci];
    if(d){ applyDiff(d, c); c.modified = true; }
  }

  grid[ci] = c;
  resident.push(c);
  stats.loads++;
  fireLoad(c);
  return c;
}

export function releaseChunk(c){
  if(!c || grid[c.ci] !== c) return;
  if(c.modified){
    const old = archive[c.ci];
    if(old) archiveBytes -= old.data.byteLength;
    const enc = encode(c);
    archive[c.ci] = enc;
    archiveBytes += enc.data.byteLength;
  }
  grid[c.ci] = null;
  const k = resident.indexOf(c);
  if(k >= 0) resident.splice(k, 1);
  fireUnload(c);
  c.can = null; c.ctx = null;
  if(pool.length < POOL_MAX) pool.push(c);
  stats.evictions++;
}

export function clearChunks(){
  for(let i = resident.length - 1; i >= 0; i--){
    const c = resident[i];
    grid[c.ci] = null;
    fireUnload(c);
    c.can = null; c.ctx = null;
    if(pool.length < POOL_MAX) pool.push(c);
  }
  resident.length = 0;
  archive.fill(null);
  diffs.fill(null);
  archiveBytes = 0;
  stats.loads = stats.evictions = stats.regens = stats.restores = 0;
}

/* ---------------------------------------------------------- residency ----- */
/* Everything inside `need` is loaded before this returns, because it is
   about to be drawn. The ring out to `keep` is filled a chunk at a time so
   that crossing a chunk boundary is not a visible hitch, and anything
   beyond `keep` is evicted. The gap between the two is hysteresis: without
   it, standing on a boundary would load and evict the same chunk forever. */
let need = { x0: 0, y0: 0, x1: -1, y1: -1 };
let keep = { x0: 0, y0: 0, x1: -1, y1: -1 };
let focusCx = 0, focusCy = 0;

function chunkRect(x0, y0, x1, y1){
  return {
    x0: Math.max(0, x0 >> CSHIFT), y0: Math.max(0, y0 >> CSHIFT),
    x1: Math.min(CW - 1, x1 >> CSHIFT), y1: Math.min(CH - 1, y1 >> CSHIFT)
  };
}

export function setFocus(x0, y0, x1, y1, needMargin, keepMargin){
  need = chunkRect(x0 - needMargin, y0 - needMargin, x1 + needMargin, y1 + needMargin);
  keep = chunkRect(x0 - keepMargin, y0 - keepMargin, x1 + keepMargin, y1 + keepMargin);
  focusCx = ((x0 + x1) / 2) / CHUNK;
  focusCy = ((y0 + y1) / 2) / CHUNK;

  for(let cy = need.y0; cy <= need.y1; cy++)
    for(let cx = need.x0; cx <= need.x1; cx++)
      if(!grid[cy * CW + cx]) loadChunk(cx, cy);

  /* Evicting the instant a chunk leaves the keep box is a trap: anything
     that reads one pixel a long way off - a machine, a HUD probe - would
     regenerate a whole chunk every tick for the privilege. A chunk is
     therefore given a grace period before it can be thrown out, so a far
     read costs one generation rather than one per tick. The hard cap is
     what stops that grace turning into a leak when something sweeps a
     large area: past it, the oldest chunks outside the box go first. */
  const now = state.tick;
  const spare = [];
  for(let i = resident.length - 1; i >= 0; i--){
    const c = resident[i];
    if(c.cx >= keep.x0 && c.cx <= keep.x1 && c.cy >= keep.y0 && c.cy <= keep.y1) continue;
    if(now - c.born > EVICT_GRACE) releaseChunk(c);
    else spare.push(c);
  }
  if(resident.length > MAX_RESIDENT){
    spare.sort((a, b) => a.born - b.born);
    for(let i = 0; i < spare.length && resident.length > MAX_RESIDENT; i++)
      releaseChunk(spare[i]);
  }
}

/* Fill the outer ring a little at a time, nearest to the camera first, so
   the ground you are walking towards arrives before you can see it. */
export function prefetch(budget){
  let done = 0;
  while(done < budget){
    let bestX = -1, bestY = -1, bestD = Infinity;
    for(let cy = keep.y0; cy <= keep.y1; cy++)
      for(let cx = keep.x0; cx <= keep.x1; cx++){
        if(grid[cy * CW + cx]) continue;
        const dx = cx + 0.5 - focusCx, dy = cy + 0.5 - focusCy;
        const d = dx * dx + dy * dy;
        if(d < bestD){ bestD = d; bestX = cx; bestY = cy; }
      }
    if(bestX < 0) break;
    loadChunk(bestX, bestY);
    done++;
  }
  return done;
}

export function inKeep(cx, cy){
  return cx >= keep.x0 && cx <= keep.x1 && cy >= keep.y0 && cy <= keep.y1;
}

/* ------------------------------------------------------------ storage ----- */
/* land is under 128 material indices and bg is one bit, so a pixel packs
   into one byte and a chunk compresses as runs of that byte. Terrain is
   mostly long runs, so this is small; the raw fallback exists only so a
   pathologically speckled chunk cannot cost more than the buffer itself. */
const packBuf = new Uint8Array(CPIX);

function packChunk(c, out){
  const land = c.land, bgb = c.bg;
  for(let i = 0; i < CPIX; i++) out[i] = land[i] | (bgb[i] ? 128 : 0);
  return out;
}

function encode(c){
  const packed = packChunk(c, packBuf);
  const out = [];
  let prev = packed[0], run = 1;
  for(let i = 1; i < CPIX; i++){
    const v = packed[i];
    if(v === prev && run < 65535){ run++; continue; }
    out.push(prev, run); prev = v; run = 1;
  }
  out.push(prev, run);
  const enc = Uint16Array.from(out);
  if(enc.byteLength >= CPIX) return { raw: true, data: packed.slice() };
  return { raw: false, data: enc };
}

function decode(a, c){
  const land = c.land, bgb = c.bg;
  if(a.raw){
    const d = a.data;
    for(let i = 0; i < CPIX; i++){ const v = d[i]; land[i] = v & 127; bgb[i] = v >>> 7; }
    return;
  }
  const d = a.data;
  let i = 0;
  for(let k = 0; k < d.length; k += 2){
    const v = d[k], n = d[k + 1], m = v & 127, b = v >>> 7;
    for(let j = 0; j < n; j++, i++){ land[i] = m; bgb[i] = b; }
  }
}

/* ------------------------------------------------- diff against the seed --- */
/* A save must not carry the whole map: the seed regenerates it. What it
   carries is where the player changed it. XOR the chunk against a freshly
   generated copy of itself and the answer is zero everywhere untouched,
   which run-length encodes down to almost nothing. */
let scratch = null;
const pristineBuf = new Uint8Array(CPIX);

function aimScratch(cx, cy, ci){
  if(!scratch) scratch = makeChunk();
  scratch.cx = cx; scratch.cy = cy; scratch.ci = ci;
  scratch.x0 = cx << CSHIFT; scratch.y0 = cy << CSHIFT;
  return scratch;
}

/* packBuf holds how the chunk actually is; regenerate it from the seed to
   fill pristineBuf, then run-length encode the difference between them */
function diffAgainstSeed(cx, cy, ci){
  const s = aimScratch(cx, cy, ci);
  fillChunk(s);
  packChunk(s, pristineBuf);

  const out = [];
  let prev = packBuf[0] ^ pristineBuf[0], run = 1, any = prev !== 0;
  for(let i = 1; i < CPIX; i++){
    const v = packBuf[i] ^ pristineBuf[i];
    if(v) any = true;
    if(v === prev && run < 65535){ run++; continue; }
    out.push(prev, run); prev = v; run = 1;
  }
  out.push(prev, run);
  return any ? out : null;
}

function applyDiff(d, c){
  const land = c.land, bgb = c.bg;
  let i = 0;
  for(let k = 0; k < d.length; k += 2){
    const v = d[k], n = d[k + 1];
    if(v === 0){ i += n; continue; }
    for(let j = 0; j < n; j++, i++){
      const p = (land[i] | (bgb[i] ? 128 : 0)) ^ v;
      land[i] = p & 127; bgb[i] = p >>> 7;
    }
  }
}

/* every chunk the player has changed, resident or archived, as save data */
export function serialiseChanges(){
  const out = [];
  const seen = new Uint8Array(CW * CH);
  for(const c of resident){
    if(!c.modified) continue;
    seen[c.ci] = 1;
    packChunk(c, packBuf);
    const d = diffAgainstSeed(c.cx, c.cy, c.ci);
    if(d) out.push({ c: c.ci, d });
  }
  const held = [];
  for(let ci = 0; ci < archive.length; ci++)
    if(archive[ci] && !seen[ci]) held.push(ci);
  for(const ci of held){
    const cy = (ci / CW) | 0, cx = ci % CW;
    decode(archive[ci], aimScratch(cx, cy, ci));
    packChunk(scratch, packBuf);
    const d = diffAgainstSeed(cx, cy, ci);
    if(d) out.push({ c: ci, d });
    seen[ci] = 1;
  }

  /* THE THIRD PLACE A CHANGE CAN BE, and the one that used to be missed.
     A save that has been loaded parks each chunk's difference in `diffs`
     to be applied when that chunk is next generated - so ground the player
     has not walked back to since loading is neither resident nor archived,
     and walking only those two lists lost it. Save, load, and save again
     without revisiting your tunnel, and the tunnel was gone from the second
     file, while the pixels stayed right on screen the whole time because
     reading them pages the chunk in and applies the diff.

     The parked value is already the encoded difference against the same
     seed, so it passes straight through. Found by lane NET. */
  for(let ci = 0; ci < diffs.length; ci++){
    if(!diffs[ci] || seen[ci]) continue;
    out.push({ c: ci, d: diffs[ci] });
  }
  return out;
}

/* Applied lazily: a chunk that is not loaded yet takes its diff when it is
   generated, so restoring does not have to fault in half the map. */
export function restoreChanges(list){
  if(!Array.isArray(list)) return 0;
  let n = 0;
  for(const e of list){
    if(!e || typeof e.c !== "number" || !Array.isArray(e.d)) continue;
    if(e.c < 0 || e.c >= CW * CH) continue;
    diffs[e.c] = e.d;
    n++;
    const c = grid[e.c];
    if(c){                       /* already loaded: rebuild it in place */
      fillChunk(c);
      applyDiff(e.d, c);
      c.modified = true;
      c.tileDirty.fill(0);   /* the load hook queues the whole chunk to repaint */
      c.flags.fill(0);
      fireLoad(c);
    }
  }
  return n;
}

export function chunkStats(){
  let archived = 0;
  for(let i = 0; i < archive.length; i++) if(archive[i]) archived++;
  return {
    resident: resident.length,
    archived,
    residentBytes: resident.length * (CPIX * 3 + TPC * TPC * 2),
    archiveBytes,
    loads: stats.loads, evictions: stats.evictions,
    regens: stats.regens, restores: stats.restores
  };
}
