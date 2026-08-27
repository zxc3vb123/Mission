/* Entry point. LANE E (core).
   Wires input, the renderer, the systems and the menu together, then starts
   the loop. */

import { state, VERSION } from "./core/state.js";
import { attachInput } from "./core/input.js";
import { createRenderer } from "./core/render.js";
import { createLoop } from "./core/loop.js";
import { saveGame, hasSave } from "./core/persist.js";
import { bus } from "./core/bus.js";
import { buildSystems } from "./systems.js";
import { createMenu } from "./ui/menu.js";

const canvas = document.getElementById("view");
attachInput(canvas);

const renderer = createRenderer(canvas);
const built = buildSystems({});
const { systems, world, items, actor, camera } = built;

const ctx = {
  systems,
  world: world.api,
  items: items.api,
  actor: actor.api,
  camera
};
const menu = createMenu(ctx);

const loop = createLoop(systems, renderer);
loop.start();

/* autosave every 50 seconds of played time, and once on the way out */
const AUTOSAVE_TICKS = 1800;
let lastAutosave = 0;
systems.push({
  name: "autosave",
  tick(){
    if(state.tick - lastAutosave < AUTOSAVE_TICKS) return;
    lastAutosave = state.tick;
    saveGame(systems, items.api);
  }
});
window.addEventListener("beforeunload", () => { saveGame(systems, items.api); });

bus.on("game:saved", r => console.log(r.ok ? "saved" : "save failed: " + r.error));

/* handy while developing: mission.world.regenerate(1234) */
window.mission = { state, systems, loop, renderer, menu, VERSION, ...ctx };
console.log("Mission " + VERSION + (hasSave() ? " (save found)" : ""));
