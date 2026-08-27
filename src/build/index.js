/* The build system. LANE C (build).

   PUBLISHED API (build.api):
     place(defId, x, y)        -> { ok, reason?, missing?, structure? }
     canPlace(defId, x, y)     -> the same verdict, without building anything
     structuresNear(x, y, r)   -> [structure]
     stationsNear(x, y, r)     -> Set of built station ids
     storageAt(x, y)           -> a container, or null
     has(defId)                -> is one built anywhere
     all()                     -> every structure
     ghost(defId) clearGhost() ghostDef() ghostVerdict()
     reach                     how far the player can build

   EVENTS emitted:
     "structure:placed"     { defId, x, y }
     "structure:built"      { defId, x, y }
     "structure:collapsed"  { defId, x, y, why, dropped }
     "build:refused"        { defId, reason, missing } */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { mouse } from "../core/input.js";
import { itemDef } from "../items/itemdefs.js";
import { structures, clearStructures, updateStructures, structuresNear,
         has, serialiseStructures, restoreStructures } from "./structures.js";
import { canPlace, place, REACH, STATION_R } from "./placement.js";
import { renderStructures, renderGhost } from "./render_build.js";
import { containerAt, storageApi } from "./storage.js";

/* One boot, one set of listeners - see the same note in items/drops.js. */
let detach = [];

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
      has,
      all: () => structures.slice(),

      /* the build menu arms a ghost; the world shows where it would go */
      ghost(defId){ ghostDef = defId || null; },
      clearGhost(){ ghostDef = null; },
      ghostDef: () => ghostDef,
      ghostVerdict: () => lastVerdict,
      reach: REACH
    }
  };
}
