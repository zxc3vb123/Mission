/* The system registry. LANE E owns this file, but it is where a new lane
   plugs itself in - one line, in tick order.

   Order matters: world first (terrain settles), then things standing on
   it, then the camera, then the HUD. Render order is separate and lives
   in core/render.js.

   ADDING A LANE:
     import { createBuild } from "./build/index.js";
     ...
     const build = createBuild(world.api, items.api);   // pass what you need
     systems.push(build);
*/

import { createWorld } from "./world/index.js";
import { createItems } from "./items/index.js";
import { createGatherables } from "./items/gatherables.js";
import { createActor } from "./actor/index.js";
import { createCamera } from "./core/camera.js";
import { createHUD } from "./ui/hud.js";
import { createPanels } from "./ui/panels.js";

export function buildSystems({ headless = false, seed } = {}){
  const world = createWorld();
  world.init(seed);

  const items = createItems();
  const actor = createActor(world.api);
  actor.init();

  const camera = createCamera();
  camera.snap();

  const systems = [world, items, actor, camera];

  /* ---- lane C ---- */
  /* Loose sticks, fibre and rock on the surface. Stage 0 asks the player to
     gather these and nothing else in the world yields them. */
  const gatherables = createGatherables(world.api);
  systems.push(gatherables);
  /* buildings, not built yet:
     const build = createBuild(world.api, items.api);
     systems.push(build);                                                */

  /* ---- lane D: industry and rocket (not built yet) ----
     const industry = createIndustry(world.api, items.api, build.api);
     systems.push(industry);                                            */

  if(!headless){
    const hud = createHUD(world.api, items.api, actor.api, camera);
    systems.push(hud);
    /* hotbar, load bar and the guidebook. `build` is undefined until lane C
       lands placement; the panels say so rather than pretending. */
    systems.push(createPanels(world.api, items.api, undefined));
  }

  return { systems, world, items, actor, camera };
}
