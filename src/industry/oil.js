/* Getting oil out of the ground. LANE D (industry).

   The owner's era, not ours (docs/DECISIONS.md, 2026-08-28): a timber
   derrick, a walking beam, a pump and barrels. Not a pipeline. So the shape
   of the machine is a slow nodding beam over a hole somebody dug, and the
   slowness turns out not to be flavour - see STROKE_TICKS, where it is what
   makes the whole thing cheap enough to run anywhere on the map.

   THE MACHINE IS TWO LANE C STRUCTURES AND NONE OF THIS PLACES THEM. Lane F
   named both (`derrick` and `walking_beam`) and lane C's place() raises
   them, holds them up, drops them when their footing goes and saves them.
   This file is only what makes the pair work: a bore, a stroke, and oil
   arriving in the derrick's own tank - the same `storage: 400` store that
   `storageAt()` reads and that lane F's oil_barrel recipe consumes from. A
   wagon can dock at a derrick and take the oil away with nothing new.

   EXTRACTION IS NOT A RECIPE, and that distinction is the whole reason this
   file exists rather than a table entry. A recipe converts a station's store
   into its store. A well converts THE GROUND into a store, and the ground is
   not in the store. A no-input recipe that yields oil is a machine that
   prints matter: it cannot know whether there is anything underneath it,
   because lane C's crafting has no way to ask. So the ground is consulted
   here, where the world is already being touched.

   THE THREE FACTS THIS IS BUILT ON, all lane A's and all measured by them
   rather than assumed (src/world/liquids.js):

     - `drawLiquid(x, y, n)` reaches a FIXED 12 px and never walks the body,
       so a pump costs the same in an ocean as in a puddle. Reaching further
       is what a longer pipe is for, which is the lever this machine wanted.
     - A dry well returns `taken: 0` because nothing was in reach, not
       because a counter said so. `liquidAt().reachable` is the number that
       tells a derrick it is finished.
     - Nothing is created or destroyed at that boundary. What is drawn is
       what is reported, and this lane owns it from then on.

   DISTANCE. The owner has ruled that automation runs unattended, and lane C
   satisfied it by construction: every structure ticks every tick, so there
   is no catch-up model to get subtly wrong. That works for a forge because a
   forge only touches its own store.

   A DERRICK TOUCHES THE WORLD, and the world is streamed - `drawLiquid`
   takes only from resident ground, and `liquidAt` pages a chunk in to
   answer. So a derrick a thousand pixels away either draws nothing, which is
   distance changing the RESULT, or pages a chunk in every time it asks,
   which is distance changing the COST.

   THE PERIOD SOLVED IT. A walking beam nods about twenty times a minute. At
   one draw every three seconds a derrick simply asks the world for real,
   every stroke, wherever the player is - and the page-in that costs is
   thousandths of what a per-tick pump would have cost. Ordinary per-tick
   work, no sleeping, no banked debt, nothing that has to happen on load. The
   honest model and the cheap one turned out to be the same model. */

import { bus } from "../core/bus.js";
import { BUILDINGS } from "../content/buildings.js";
import { PIXELS_PER_BARREL, OIL_PER_STROKE, STROKE_TICKS,
         PIPE_HAND, PIPE_DERRICK, MIN_BORE, OIL_ITEM,
         BEAM_REACH } from "./spec.js";

/* Lane C's structures are lane C's. This lane keeps its own pump state
   beside them, keyed by structure id, rather than decorating somebody
   else's object with fields they never agreed to. */
const pumps = new Map();

export function clearPumps(){ pumps.clear(); }

export function pumpState(s){
  let st = pumps.get(s.id);
  if(!st){
    st = { stroke: 0, pixels: 0, lifted: 0, intake: null,
           dry: false, jammed: false, beam: false };
    pumps.set(s.id, st);
  }
  return st;
}

/* ---------------------------------------------------------------- bore --- */

/* Where the pipe string ends: the deepest open pixel under the rig.

   Cast down every column of the footprint and take the deepest, so a derrick
   standing BESIDE its shaft still reaches it. A derrick has to straddle the
   hole rather than stand on it - it needs ground to hold it up and the hole
   is by definition not ground - so demanding that the centre column be open
   would make the machine unplaceable in exactly the case it is for. */
export function boreIntake(world, rig, pipe){
  let best = null, bestDepth = -1;
  const from = Math.round(rig.y + rig.h);
  for(let cx = Math.round(rig.x); cx < Math.round(rig.x + rig.w); cx++){
    let d = 0;
    while(d < pipe && !world.isSolid(cx, from + d)) d++;
    if(d > bestDepth){ bestDepth = d; best = { x: cx, y: from + d - 1 }; }
  }
  return bestDepth >= MIN_BORE
    ? { x: best.x, y: best.y, depth: bestDepth } : null;
}

/* How much pipe a rig can hang. THIS IS WHERE THE TOWER EARNS ITS PLACE
   rather than decorating the hole: a hand-rigged pump lifts from a shallow
   shaft, and the timber derrick is what lets a long string of pipe reach a
   deep one. Which is what a derrick was actually for. */
export function pipeLengthFor(rig){
  return rig.defId === "derrick" || rig.derrick ? PIPE_DERRICK : PIPE_HAND;
}

/* Is there a finished walking beam standing by to work the rod? Lane F split
   the tower from the engine deliberately, and this is the gate that makes
   the split mean something: a bore you have sunk and cannot yet pump is a
   real intermediate state, and the metal is on the half that earns it. */
export function beamBeside(build, s){
  const cx = s.x + s.w/2, cy = s.y + s.h;
  for(const o of build.structuresNear(cx, cy, BEAM_REACH))
    if(o.defId === "walking_beam" && o.built) return o;
  return null;
}

/* ---------------------------------------------------------------- tank --- */

function storeMass(store, itemDef){
  let m = 0;
  for(const id in store.items) m += store.items[id] * itemDef(id).mass;
  return m;
}

/* Room for one more measure. A rig that is full STOPS rather than
   overflowing - lane C's rule for stations, and the same reason: unattended
   is not infinite, and the scarcity belongs in the logistics. */
function hasRoom(store, itemDef){
  return storeMass(store, itemDef) + itemDef(OIL_ITEM).mass <= store.cap + 1e-9;
}

/* --------------------------------------------------------------- tick ---- */

/* One rig, one tick. `rig` supplies the geometry and the tank - a lane C
   structure, or in a test a plain object of the same shape. `st` is this
   lane's pump state for it. Returns pixels raised, which is 0 on all the
   ordinary ticks between strokes. */
export function tickRig(world, rig, st, itemDef, hasBeam = true){
  if(!rig.built || !rig.store) return 0;

  if(!hasBeam){
    if(!st.beamWarned){
      st.beamWarned = true;
      bus.emit("rig:idle", { x: rig.x, y: rig.y, why: "no walking beam" });
    }
    return 0;
  }
  st.beamWarned = false;

  if(!hasRoom(rig.store, itemDef)){
    if(!st.jammed){
      st.jammed = true;
      bus.emit("rig:jammed", { x: rig.x, y: rig.y, why: "full" });
    }
    return 0;
  }
  st.jammed = false;

  if(++st.stroke < STROKE_TICKS) return 0;
  st.stroke = 0;

  /* Recomputed on the stroke rather than cached, because the shaft is
     terrain: the player may have deepened it, filled it in, or had it cave
     in since the last one. A cached bore is a machine that believes in a
     hole that is not there. */
  const bore = boreIntake(world, rig, pipeLengthFor(rig));
  st.intake = bore;
  if(!bore){
    bus.emit("rig:idle", { x: rig.x, y: rig.y, why: "no shaft under it" });
    return 0;
  }

  const got = world.drawLiquid(bore.x, bore.y, OIL_PER_STROKE);
  if(got.taken <= 0){
    /* Dry, or out of reach - and from here those are the same thing, which
       is lane A's point: what the pipe cannot reach is not yours. */
    const at = world.liquidAt(bore.x, bore.y);
    if(!st.dry && !(at && at.reachable > 0)){
      st.dry = true;
      bus.emit("well:dry", { x: rig.x, y: rig.y, lifted: st.lifted });
    }
    return 0;
  }
  st.dry = false;
  st.pixels += got.taken;
  st.lifted += got.taken;

  /* Whole measures only. The remainder stays as pixels on the rig, so
     nothing is rounded into or out of existence between strokes. */
  while(st.pixels >= PIXELS_PER_BARREL && hasRoom(rig.store, itemDef)){
    st.pixels -= PIXELS_PER_BARREL;
    rig.store.items[OIL_ITEM] = (rig.store.items[OIL_ITEM] || 0) + 1;
    bus.emit("rig:raised", { id: OIL_ITEM, count: rig.store.items[OIL_ITEM],
                             x: rig.x, y: rig.y });
  }
  return got.taken;
}

/* Every derrick standing in the world, worked once each. */
export function updateDerricks(world, build, itemDef){
  for(const s of build.all()){
    if(s.defId !== "derrick" || !s.built) continue;
    tickRig(world, s, pumpState(s), itemDef, !!beamBeside(build, s));
  }
}

/* What a rig would tell the player if it had a gauge: how deep the bore is
   and how much crude is still within the pipe's reach. Costs a chunk page-in
   when the rig is far away, so this is for a screen to ask, never for the
   tick to poll. */
export function wellReading(world, rig){
  const bore = boreIntake(world, rig, pipeLengthFor(rig));
  if(!bore) return { bore: null, depth: 0, reachable: 0, matIndex: -1 };
  const at = world.liquidAt(bore.x, bore.y);
  return { bore, depth: bore.depth,
           reachable: at ? at.reachable : 0,
           matIndex: at ? at.matIndex : -1 };
}

/* A plain rig for tests and for anything that wants the mechanism without a
   structure. Same shape lane C's structures present, deliberately. */
export function makeRig(x, y, w, h, opts){
  return { id: -1, defId: (opts && opts.defId) || "derrick",
           x, y, w, h, built: true,
           derrick: !(opts && opts.derrick === false),
           store: { cap: (opts && opts.cap) || 400, items: Object.create(null) } };
}

export { BUILDINGS };
