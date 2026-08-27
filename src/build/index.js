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
     ghost(defId, opts) clearGhost() ghostDef() ghostVerdict()
     rotateGhost() ghostRot()  a piece is a rectangle and turns 90 degrees
     claimingClicks()          -> is this click the build menu's, not the shovel's
     reach                     how far the player can build

   EVENTS emitted:
     "structure:placed"     { defId, x, y }
     "structure:built"      { defId, x, y }
     "structure:collapsed"  { defId, x, y, why, dropped }
     "build:refused"        { defId, reason, missing }
     "structure:deconstructing" { defId, x, y, need, returns }
     "structure:removed"        { defId, x, y, why, returned, dropped }
     "build:ghost"              { active, defId }  lane B: do not dig while active */

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

  /* A click that places a building must not ALSO be a click that digs.
     Lane B swings while the mouse is held and cannot see the ghost, so the
     same press both put a workbench down and took a bite out of the ground
     under it - which is worse than it sounds, because a building needs its
     footing and could lose it to the very click that placed it.

     Rather than make lane B reach into this lane, the fact is announced:
     "build:ghost { active }" is true from the moment a ghost is armed until
     the mouse is RELEASED after placing. Holding it past the placement is
     the part that matters - the ghost clears on the click, so a flag that
     cleared with it would let the still-held button dig on the next tick.

     DO NOT REMOVE THIS AS UNUSED. LANE B CONSUMES IT: src/actor/clonk.js
     listens for it and skips its swing while active (commit fdb66ca, where
     they dropped their own latch in favour of this). It was very nearly
     deleted as redundant while they were switching TO it, which would have
     left the bug with no fix at all. Their suite covers it from their side
     and this one covers it from ours; if both go green after you remove it,
     something is wrong with the tests, not with the deletion being safe.

     ONE THING LANE B'S END-TO-END CHECK DOES NOT PROVE, flagged by them: it
     arms a ghost with an empty pack, so it exercises a REFUSED placement,
     not a completed one. The claim holds either way because a refusal
     deliberately keeps the ghost armed to try again - so if refusal is ever
     changed to clear the ghost, their check keeps passing while the real
     behaviour changes underneath it. */
  let ghostRot = false;
  let holdingAfterPlace = false;
  let announced = false;

  function claiming(){ return !!ghostDef || holdingAfterPlace; }
  function announce(){
    const now = claiming();
    if(now === announced) return;
    announced = now;
    bus.emit("build:ghost", { active: now, defId: ghostDef });
  }

  const verdictAt = (defId, x, y, opts) => canPlace(world, items, defId, x, y, opts);

  for(const off of detach) off();
  detach = [
    /* a new world has nothing standing in it */
    bus.on("world:generated", () => {
      clearStructures(); ghostDef = null; holdingAfterPlace = false; announce();
    }),

    /* left click puts down whatever the build menu has armed */
    bus.on("input:mouse", e => {
      if(e.button !== 0) return;

      if(!e.down){
        /* the press is over, so the actor may swing again */
        if(holdingAfterPlace){ holdingAfterPlace = false; announce(); }
        return;
      }

      if(!ghostDef) return;
      const r = place(world, items, ghostDef, mouse.wx, mouse.wy, { rot: ghostRot });
      if(r.ok){
        ghostDef = null;                        /* one click, one building */
        holdingAfterPlace = true;               /* but the click is still ours */
      } else {
        bus.emit("build:refused", { defId: ghostDef, reason: r.reason,
                                    missing: r.missing });
      }
      announce();
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

      lastVerdict = ghostDef
        ? verdictAt(ghostDef, mouse.wx, mouse.wy, { rot: ghostRot }) : null;
    },

    renderBuild(ctx){
      renderStructures(ctx, state.tick);
      if(ghostDef) renderGhost(ctx, lastVerdict);
    },

    serialise(){ return { structures: serialiseStructures() }; },
    restore(data){ if(data) restoreStructures(data.structures); },

    api: {
      place: (defId, x, y, opts) => place(world, items, defId, x, y, opts),
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
      ghost(defId, opts){
        ghostDef = defId || null;
        if(opts && typeof opts.rot === "boolean") ghostRot = opts.rot;
        announce();
      },
      /* Turn the armed piece ninety degrees: one plank def is both a beam
         and a post, so the build screen needs a key for this. */
      rotateGhost(){ ghostRot = !ghostRot; return ghostRot; },
      ghostRot: () => ghostRot,
      clearGhost(){ ghostDef = null; announce(); },
      /* LANE B: true while a click belongs to the build menu rather than to
         the shovel. Listen for "build:ghost" instead if you prefer. */
      claimingClicks: claiming,
      ghostDef: () => ghostDef,
      ghostVerdict: () => lastVerdict,
      reach: REACH
    }
  };
}
