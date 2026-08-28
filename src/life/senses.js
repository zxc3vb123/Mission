/* What a creature can tell about the world. LANE I (creatures).

   Two senses, and both of them exist so that a defence the player ALREADY
   HAS becomes a tactic: light, and quiet.

   ------------------------------------------------------------------ light
   `world.api.lightAt(x, y)` is the right question with the wrong shape for
   this, and the reason is worth writing down because the alternative looks
   like a bug. Lane A's light is a RENDERING product: a coarse grid solved
   over the VISIBLE RECTANGLE, every frame, by `renderLight`. So it answers
   beautifully where the camera is pointing, returns 0 - "pitch dark" -
   everywhere else, and is never solved at all in a headless tick. Behaviour
   keyed on it would differ between a creature on screen and the same
   creature off it, which is exactly what the lane brief forbids: distance
   may change how a thing is computed and never what it comes to.

   So this file answers it as a SIMULATION query instead - how much light
   falls on this point, whoever happens to be looking - from the emitters
   the game already publishes. Same falloff as lane A uses, so what a
   crawler believes and what the player can see agree. There is a request
   open with lane A for the real thing (docs/REQUESTS.md, "life -> world: a
   light query that answers away from the camera"); when it lands, this
   becomes a call.

   THE HEAD LAMP IS THE BEAM AND NOT THE HALO, and that is a design decision
   rather than an approximation. Lane A's lamp lights a long cone in the
   direction of aim and a short 62 px glow all round. If the glow counted,
   the lamp would be a force field - nothing could ever get within 25 px of
   a player who had it switched on, and there would be no game here at all.
   What a crawler will not walk into is the BEAM. Which means: point your
   light at it and it backs off, turn away and it comes from behind, and the
   answer to being surrounded is to put a fire DOWN, because a fire is not a
   cone. That is the first time in this project that a lamp and a campfire
   have differed in a way anybody can feel.

   ------------------------------------------------------------------ noise
   Nothing publishes how loud the player is, and nothing needs to but this,
   so it is derived here from the pose lane B already writes: digging is
   loud, walking carries, standing still barely travels at all. */

import { state } from "../core/state.js";
import { building as BUILDINGS } from "../content/buildings.js";
import { bus } from "../core/bus.js";
import { HEAR_STILL, HEAR_MOVING, HEAR_DIGGING } from "./spec.js";

/* Lights that are standing in the world. Registered exactly the way lane A
   registers them for drawing - off lane C's structure events, with lane F's
   table saying which defs glow - so this list cannot drift from theirs by
   anyone forgetting a call. It is only ever a copy of two events. */
const placed = new Map();

function lightKey(e){ return e.defId + "@" + e.x + "," + e.y; }

/* Lane A asked lane F for `light: { r, power }` and lane F's table says
   `radius`. Both are read here so that this lane is right either way; the
   mismatch itself is lane F's to settle and is in docs/REQUESTS.md. */
function lightOf(def){
  if(!def || !def.light) return null;
  const r = def.light.r > 0 ? def.light.r : (def.light.radius > 0 ? def.light.radius : 48);
  const power = def.light.power > 0 ? def.light.power : 1;
  return { r, power };
}

bus.on("structure:placed", e => {
  const def = BUILDINGS(e.defId);
  const l = lightOf(def);
  if(!l) return;
  const w = e.rot ? def.h : def.w, h = e.rot ? def.w : def.h;
  placed.set(lightKey(e), { x: e.x + w / 2, y: e.y + h / 2, r: l.r, power: l.power });
});
bus.on("structure:removed",   e => placed.delete(lightKey(e)));
bus.on("structure:collapsed", e => placed.delete(lightKey(e)));

export function clearPlacedLights(){ placed.clear(); }
export function placedLightCount(){ return placed.size; }

/* Anything that is not a building may announce itself here - a dropped
   torch, a burning wreck, whatever comes later. Same shape as lane A's
   addLightSource so nothing new has to be learnt. */
export function noteLight(id, opt){
  if(!id || !opt) return false;
  placed.set("x:" + id, { x: opt.x, y: opt.y, r: opt.r > 0 ? opt.r : 48,
                          power: opt.power > 0 ? opt.power : 1 });
  return true;
}
export function forgetLight(id){ return placed.delete("x:" + id); }

/* Is there solid ground between these two points? Sampled every few pixels
   rather than every pixel: a creature deciding whether to step forward does
   not need a shadow map, and the cost of this is what keeps the whole
   system inside its budget. */
function occluded(world, x0, y0, x1, y1){
  const dx = x1 - x0, dy = y1 - y0;
  const d = Math.sqrt(dx * dx + dy * dy);
  if(d < 4) return false;
  const steps = Math.min(24, Math.ceil(d / 4));
  for(let i = 1; i < steps; i++){
    const t = i / steps;
    if(world.isSolid(Math.round(x0 + dx * t), Math.round(y0 + dy * t))) return true;
  }
  return false;
}

/* One emitter's contribution, in lane A's own falloff so that a creature
   agrees with the darkness the player is looking at. */
function fall(d, maxD){
  if(d >= maxD) return 0;
  const v = 1 - d / maxD;
  return v * v;
}

/* The head lamp's BEAM, cast the way lane A casts it. `coneHalf` is lane A's
   0.62 radians; the reach is the lamp's own `cone`, and the halo is not
   here on purpose - see the note at the top of this file. */
const CONE_HALF = 0.62;

function lampLight(world, x, y){
  const p = state.player;
  const lamp = p.lamp;
  if(!lamp || !lamp.on || !(lamp.power > 0)) return 0;
  const dx = x - p.x, dy = y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const maxD = lamp.cone * lamp.power;
  if(d >= maxD) return 0;
  const aimA = Math.atan2(p.aim.y, p.aim.x);
  const a = Math.atan2(dy, dx);
  const da = Math.abs(((a - aimA + Math.PI * 3) % 6.28318) - Math.PI);
  if(da >= CONE_HALF) return 0;
  if(occluded(world, p.x, p.y, x, y)) return 0;
  return fall(d, maxD);
}

/* How lit is this point, for something that lives in the dark. */
export function lightHere(world, x, y){
  let best = lampLight(world, x, y);

  if(best < 1 && placed.size){
    for(const L of placed.values()){
      const dx = x - L.x, dy = y - L.y;
      const maxD = L.r * L.power;
      const d2 = dx * dx + dy * dy;
      if(d2 >= maxD * maxD) continue;
      const v = fall(Math.sqrt(d2), maxD);
      if(v <= best) continue;
      if(occluded(world, L.x, L.y, x, y)) continue;
      best = v;
    }
  }

  /* Daylight. Above the surface line is open sky, and a thing that lives
     under the ground does not come up into it. One array read, and it is
     what keeps the surface the player's ground rather than shared. */
  if(best < 1 && world.surfaceAt){
    const s = world.surfaceAt(x);
    if(y < s + 2) best = 1;
  }

  return best > 1 ? 1 : best;
}

/* ------------------------------------------------------------------ noise --
   Movement has to be MEASURED rather than asked for: lane B publishes a pose
   and not a velocity. `sampleMotion()` runs once at the top of the life tick
   and leaves the answer here, so that nothing downstream can get the order
   wrong and compare a position with itself. */
let lastX = 0, lastY = 0, moved = false;

export function sampleMotion(){
  const p = state.player;
  moved = Math.abs(p.x - lastX) > 0.35 || Math.abs(p.y - lastY) > 0.35;
  lastX = p.x;
  lastY = p.y;
}

/* How far the player is audible right now. Digging is a tool striking rock
   thirty-six times a second; walking is boots; standing still is breathing.
   The player has had all three of these controls since the first build and
   has never had a reason to use them. */
export function noiseRadius(){
  if(state.player.digging) return HEAR_DIGGING;
  return moved ? HEAR_MOVING : HEAR_STILL;
}
