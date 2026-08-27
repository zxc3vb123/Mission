/* The actor system. LANE B (actor).

   PUBLISHED API:
     pos()        -> { x, y }
     respawn()
     setLamp(cfg) -> merge into state.player.lamp (radius, cone, power, on)

   EVENTS emitted:
     "player:died"  { x, y }

   This lane writes state.player; everyone else reads it. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { setShapeTests } from "../core/shape.js";
import { createClonkController, clonk } from "./clonk.js";
import { drawClonk } from "./render_actor.js";

export function createActor(world){
  setShapeTests(world.isSolid, world.isLiquid);
  const ctrl = createClonkController(world);

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
      clonk
    }
  };
}
