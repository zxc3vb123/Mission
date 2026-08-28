/* The actor system. LANE B (actor).

   PUBLISHED API:
     pos()        -> { x, y }
     respawn()
     setLamp(cfg) -> merge into state.player.lamp (radius, cone, power, on)
     tool()       -> the equipped tool id, or null for bare hands

   EVENTS emitted:
     "player:died"  { x, y }

   This lane writes state.player; everyone else reads it. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { setShapeTests } from "../core/shape.js";
import { createClonkController, clonk } from "./clonk.js";
import { drawClonk } from "./render_actor.js";

/* WHAT THE BODY COLLIDES WITH. Terrain is lane A's pixel material; a built
   floor is lane C's structure list, and the two are different questions. The
   owner reported falling through their own plank floor three times, and the
   cause was that this lane asked only the first: lane C published
   `solidAt(x, y)` and nothing called it, so every plank, beam and foundation
   was a picture.

   The hook is set from systems.js once lane C's build system exists, because
   the actor is constructed before it. Defaulting to "no structures" keeps an
   actor built without build - the headless suites do this - working exactly
   as before. */
let structureSolid = () => null;

export function createActor(world, items){
  setShapeTests((x, y) => world.isSolid(x, y) || !!structureSolid(x, y),
                world.isLiquid);

  /* What the character is holding. Lane C owns the hotbar; this lane only
     reads it, and passes it to lane A so the tier gate can do its job. The
     bus cache is the fallback for an actor built without items. */
  let equippedId = null;
  bus.on("item:equipped", e => { equippedId = (e && e.id) ? e.id : null; });
  function toolId(){
    if(items && items.equipped){
      const e = items.equipped();
      return e ? e.id : null;
    }
    return equippedId;
  }
  clonk.held = (items && items.equipped) ? items.equipped() : null;

  const ctrl = createClonkController(world, toolId);

  bus.on("world:generated", () => ctrl.respawn());

  return {
    name: "actor",
    init(){ ctrl.respawn(); },
    tick(){
      /* what is in the hands, cached once a tick for the renderer as well as
         the gate - the hotbar is lane C's and we only ever read it */
      clonk.held = (items && items.equipped) ? items.equipped() : null;
      ctrl.tick();
    },
    renderActor(ctx){ drawClonk(ctx); },
    api: {
      pos: () => ({ x: clonk.x, y: clonk.y }),
      respawn: ctrl.respawn,
      setLamp(cfg){ Object.assign(state.player.lamp, cfg); },
      tool: toolId,

      /* Lane C hands us their solidity query here. Kept as a QUERY rather
         than a cached flag, so a player standing on a plank that is taken
         down - or whose terrain collapses - falls the instant it is gone. */
      setStructureSolid(fn){ structureSolid = fn || (() => null); },

      clonk
    }
  };
}
