/* The shared world state. LANE E (core).
   Every lane may READ anything here. A lane may only WRITE the branch it
   owns (marked below). Adding a field to somebody else's branch is a
   coordination change - put it in docs/REQUESTS.md instead. */

export const VERSION = "0.2.0";

export const state = {
  version: VERSION,
  tick: 0,
  paused: false,

  /* written by core */
  view: { w: 0, h: 0 },
  cam:  { x: 0, y: 0, zoom: 3, free: false, shake: 0, shakeMag: 0 },
  fps: 0,

  /* written by world (lane A) */
  world: {
    W: 0, H: 0,          /* landscape size in pixels */
    seed: 0,
    waterLevel: 0,
    spawn: { x: 0, y: 0 }
  },

  /* written by actor (lane B): the public pose everyone else reads,
     e.g. the lamp needs it, the camera follows it, buildings check reach */
  player: {
    x: 0, y: 0, dir: 1, act: "FLIGHT",
    energy: 100, breath: 100,
    aim: { x: 1, y: 0 },
    digging: false,
    lamp: { on: true, radius: 62, cone: 96, power: 1 }
  },

  /* written by ui (lane E) */
  debug: { showVerts: false }
};

export function resetRuntimeState(){
  state.tick = 0;
  state.cam.shake = 0;
}
