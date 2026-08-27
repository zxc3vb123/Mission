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

export function createActor(world, items){
  setShapeTests(world.isSolid, world.isLiquid);

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

  const ctrl = createClonkController(world, toolId);

  bus.on("world:generated", () => ctrl.respawn());

  return {
    name: "actor",
    init(){ ctrl.respawn(); },
    tick(){ ctrl.tick(); },
    renderActor(ctx){ drawClonk(ctx); },
    api: {
      pos: () => ({ x: clonk.x, y: clonk.y }),
      respawn: ctrl.respawn,
      setLamp(cfg){ Object.assign(state.player.lamp, cfg); },
      tool: toolId,
      clonk
    }
  };
}
