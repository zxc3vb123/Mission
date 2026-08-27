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
import { createBuild } from "./build/index.js";
import { createActor } from "./actor/index.js";
import { createCamera } from "./core/camera.js";
import { createHUD } from "./ui/hud.js";
import { createPanels } from "./ui/panels.js";
import { createCraft } from "./ui/craft.js";

export function buildSystems({ headless = false, seed } = {}){
  const world = createWorld();
  world.init(seed);

  const items = createItems();
  const actor = createActor(world.api, items.api);   /* b: the equipped tool gates digging */
  actor.init();

  const camera = createCamera();
  camera.snap();

  const systems = [world, items, actor, camera];

  /* ---- lane C ---- */
  /* Loose sticks, fibre and rock on the surface. Stage 0 asks the player to
     gather these and nothing else in the world yields them. */
  const gatherables = createGatherables(world.api);
  systems.push(gatherables);
  /* Placement, structures and storage. Buildings sit ON the world; the
     landscape stays lane A's. */
  const build = createBuild(world.api, items.api);
  systems.push(build);

  /* ---- lane D: industry and rocket (not built yet) ----
     const industry = createIndustry(world.api, items.api, build.api);
     systems.push(industry);                                            */

  if(!headless){
    const hud = createHUD(world.api, items.api, actor.api, camera);
    systems.push(hud);
    /* hotbar, load bar and the guidebook. `build.api` is live now that lane C
       has landed placement, so these no longer have to say "not yet". */
    systems.push(createPanels(world.api, items.api, build.api));
    systems.push(createCraft(world.api, items.api, build.api));   /* c: crafting screen */
    import("./core/audio.js").then(m => systems.push(m.createAudio(world.api))).catch(()=>{});
    import("./ui/whatsnew.js").then(m => systems.push(m.createWhatsNew())).catch(()=>{});  /* n: what's new */
  }

  return { systems, world, items, actor, camera };
}
