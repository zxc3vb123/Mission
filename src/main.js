/* Entry point. LANE E (core).
   Wires input, the renderer and the systems together, then starts the loop. */

import { state, VERSION } from "./core/state.js";
import { attachInput } from "./core/input.js";
import { createRenderer } from "./core/render.js";
import { createLoop } from "./core/loop.js";
import { buildSystems } from "./systems.js";

const canvas = document.getElementById("view");
attachInput(canvas);

const renderer = createRenderer(canvas);
const { systems } = buildSystems({});
const loop = createLoop(systems, renderer);
loop.start();

/* handy while developing: window.mission.world.regenerate(1234) */
window.mission = { state, systems, loop, renderer, VERSION };
console.log("Mission " + VERSION);
