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
         buriedFraction, has } from "./structures.js";

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
export function siteFor(world, defId, wx, wy){
  const def = building(defId);
  if(!def) return null;
  const x = Math.round(wx - def.w/2);
  const from = Math.round(wy);

  /* Cast down from the cursor in every column of the footprint and rest the
     building on the HIGHEST ground it finds. Sitting on the highest point
     means it bridges a dip rather than burying its uphill end in the slope,
     which is what a real foundation does. Casting per column rather than
     reading the surface map also means this works in a tunnel, where the
     terrain surface is far overhead. */
  let top = Infinity;
  for(let cx = x; cx < x + def.w; cx++){
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
  return { x, y: top - def.h, w: def.w, h: def.h };
}

/* The single verdict. Returns { ok, reason, site }. */
export function canPlace(world, items, defId, wx, wy){
  const def = building(defId);
  if(!def) return { ok:false, reason:"no such building" };

  const site = siteFor(world, defId, wx, wy);
  if(!site) return { ok:false, reason:"nothing solid to build on" };

  const p = state.player;
  const cx = site.x + site.w/2, cy = site.y + site.h/2;
  if(Math.hypot(cx - p.x, cy - p.y) > REACH)
    return { ok:false, reason:"too far away", site };

  if(buriedFraction(world, site.x, site.y, site.w, site.h) > MAX_BURIED)
    return { ok:false, reason:"there is ground in the way", site };

  const want = def.support ? (def.support.ground ?? 1) : 1;
  if(groundFraction(world, site.x, site.y, site.w, site.h) < want - 1e-9)
    return { ok:false, reason:"needs solid ground under it", site };

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
export function place(world, items, defId, wx, wy){
  const verdict = canPlace(world, items, defId, wx, wy);
  if(!verdict.ok) return verdict;

  const def = building(defId);
  for(const id in def.materials) items.inventory.take(id, def.materials[id]);

  const s = makeStructure(defId, verdict.site.x, verdict.site.y);
  structures.push(s);
  bus.emit("structure:placed", { defId, x:s.x, y:s.y });
  return { ok:true, structure:s, site:verdict.site };
}
