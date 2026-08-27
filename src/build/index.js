/* The build system. LANE C (build).

   PUBLISHED API (build.api):
     place(defId, x, y)        -> { ok, reason?, missing?, structure? }
     canPlace(defId, x, y)     -> the same verdict, without building anything
     structuresNear(x, y, r)   -> [structure]
     stationsNear(x, y, r)     -> Set of built station ids
     storageAt(x, y)           -> a container, or null
     jobAt(structure)          -> 0..1 progress, or null
     isProcessingStation(defId)
     has(defId)                -> is one built anywhere
     structureAt(x, y)         -> the structure under a point, or null
     climbableAt(x, y)         -> a finished ladder at this point, or null
     deconstruct(x, y)         -> start taking one apart
     cancelDeconstruct(x, y)   -> change your mind
     wouldReturn(x, y)         -> what taking it apart would give back
     all()                     -> every structure
     ghost(defId) clearGhost() ghostDef() ghostVerdict()
     reach                     how far the player can build

   EVENTS emitted:
     "structure:placed"     { defId, x, y }
     "structure:built"      { defId, x, y }
     "structure:collapsed"  { defId, x, y, why, dropped }
     "build:refused"        { defId, reason, missing }
     "structure:deconstructing" { defId, x, y, need, returns }
     "structure:removed"        { defId, x, y, why, returned, dropped } */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { mouse } from "../core/input.js";
import { itemDef } from "../items/itemdefs.js";
import { structures, clearStructures, updateStructures, structuresNear,
         has, serialiseStructures, restoreStructures, startDeconstruct,
         cancelDeconstruct, deconstructProgress, recoverableFrom,
         recoverFraction, climbableAt } from "./structures.js";
import { canPlace, place, REACH, STATION_R } from "./placement.js";
import { renderStructures, renderGhost } from "./render_build.js";
import { containerAt, storageApi } from "./storage.js";
import { collectFrom, jobProgress, isProcessingStation } from "./production.js";
import { keys } from "../core/input.js";

/* One boot, one set of listeners - see the same note in items/drops.js. */
let detach = [];

/* The structure a point falls inside, if any. */
function structureAt(x, y){
  for(const s of structures){
    if(x >= s.x && x < s.x+s.w && y >= s.y && y < s.y+s.h) return s;
  }
  return null;
}

export function createBuild(world, items){
  let ghostDef = null;
  let lastVerdict = null;

  const verdictAt = (defId, x, y) => canPlace(world, items, defId, x, y);

  for(const off of detach) off();
  detach = [
    /* a new world has nothing standing in it */
    bus.on("world:generated", () => { clearStructures(); ghostDef = null; }),

    /* left click puts down whatever the build menu has armed */
    bus.on("input:mouse", e => {
      if(e.button !== 0 || !e.down || !ghostDef) return;
      const r = place(world, items, ghostDef, mouse.wx, mouse.wy);
      if(r.ok) ghostDef = null;                 /* one click, one building */
      else bus.emit("build:refused", { defId: ghostDef, reason: r.reason,
                                       missing: r.missing });
    })
  ];

  return {
    name: "build",

    tick(){
      updateStructures(world, items.spawnDrop, state.tick);

      /* Stations hand over what they have finished when you stand at them,
         under the same burden rule as chunks on the ground. */
      const p = state.player;
      const burdened = items.inventory.load() >= 0.65;
      if(!burdened || keys[items.grabKey]){
        for(const s of structures) collectFrom(s, items.inventory, p.x, p.y);
      }

      lastVerdict = ghostDef ? verdictAt(ghostDef, mouse.wx, mouse.wy) : null;
    },

    renderBuild(ctx){
      renderStructures(ctx, state.tick);
      if(ghostDef) renderGhost(ctx, lastVerdict);
    },

    serialise(){ return { structures: serialiseStructures() }; },
    restore(data){ if(data) restoreStructures(data.structures); },

    api: {
      place: (defId, x, y) => place(world, items, defId, x, y),
      canPlace: verdictAt,
      structuresNear,
      stationsNear(x, y, r = STATION_R){
        const set = new Set();
        for(const s of structuresNear(x, y, r)) if(s.built) set.add(s.defId);
        return set;
      },
      storageAt: (x, y) => storageApi(containerAt(x, y), itemDef),
      /* what a particular station is working on, 0..1, or null */
      jobAt(s){ return s && s.job ? jobProgress(s) : null; },
      isProcessingStation,
      has,
      all: () => structures.slice(),

      structureAt,
      /* LANE B: what the clonk can go up. Null means nothing to climb here. */
      climbableAt,
      /* Taking a building down on purpose. Unlike a collapse it is deliberate,
         so it takes time - half the build - and can be called off. What comes
         back is per-material: see recoverFraction in structures.js. */
      deconstruct(x, y){
        const s = structureAt(x, y);
        if(!s) return { ok:false, reason:"nothing there" };
        if(s.taking) return { ok:false, reason:"already being taken apart",
                              structure:s, progress:deconstructProgress(s) };
        startDeconstruct(s);
        return { ok:true, structure:s, returns:recoverableFrom(s),
                 ticks:s.taking.need };
      },
      cancelDeconstruct(x, y){
        const s = structureAt(x, y);
        return !!(s && cancelDeconstruct(s));
      },
      wouldReturn(x, y){
        const s = structureAt(x, y);
        return s ? recoverableFrom(s) : null;
      },
      deconstructProgress(x, y){
        const s = structureAt(x, y);
        return s ? deconstructProgress(s) : 0;
      },
      recoverFraction,

      /* the build menu arms a ghost; the world shows where it would go */
      ghost(defId){ ghostDef = defId || null; },
      clearGhost(){ ghostDef = null; },
      ghostDef: () => ghostDef,
      ghostVerdict: () => lastVerdict,
      reach: REACH
    }
  };
}
