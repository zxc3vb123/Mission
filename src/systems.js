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
import { setPourWorld } from "./items/pour.js";
import { setBucketWorld } from "./items/buckets.js";
import { createBuild } from "./build/index.js";
import { createIndustry } from "./industry/index.js";
import { createActor } from "./actor/index.js";
import { createFarm } from "./farm/index.js";
import { createLife } from "./life/index.js";
import { createNet } from "./net/index.js";
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
  /* Putting ground back: soil and sand the player is carrying become real
     terrain again through lane A's dumpItem. */
  setPourWorld(world.api);
  setBucketWorld(world.api);
  /* Placement, structures and storage. Buildings sit ON the world; the
     landscape stays lane A's. */
  const build = createBuild(world.api, items.api);
  systems.push(build);

  /* A BUILT FLOOR IS SOMETHING TO STAND ON. The actor is constructed above,
     before build exists, so its collision is completed here: terrain OR a
     finished structure. Without this line every plank, beam and foundation is
     a picture the player walks through - which is exactly what shipped, and
     what the owner reported three times. */
  actor.api.setStructureSolid(build.api.solidAt);
  actor.api.setClimbable(build.api.climbableAt);      /* and a ladder is climbed */

  /* ---- lane D: industry and rocket ----
     Rail haulage: track, wagons, and material that arrives where it was
     sent. Needs build.api because a wagon empties itself into whatever
     container is standing at the end of the line. */
  const industry = createIndustry(world.api, items.api, build.api);
  systems.push(industry);

  /* ---- lane J: farming, animals and food ----
     Crops grow on the surface whether or not anybody is watching, which is
     the whole point of them (docs/DECISIONS.md, the full survival loop).
     Needs items.api because a seed leaves the pack and a harvest comes back
     into it, and world.api because a plot stands on real soil and drinks
     real water. */
  const farm = createFarm(world.api, items.api);
  systems.push(farm);

  /* ---- lane I: creatures and fighting ----
     Something hostile underground that gets worse with depth, and a swing
     that uses whatever is already in your hands. Ticks after the actor so a
     crawler reacts to where the player IS rather than where they were, and
     needs items.api for the one question the swing asks: what am I holding. */
  const life = createLife(world.api, items.api);
  systems.push(life);

  /* ---- lane net ---- */
  /* Coop: rooms, remote players, and terrain that agrees. Dormant until a
     room is opened - it wraps nothing, listens to nothing and sends nothing
     while the game is single player. Last in tick order on purpose, so one
     frame carries everything this tick did rather than last tick's. */
  const net = createNet({ systems, world, items: items.api, actor: actor.api });
  systems.push(net);

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
