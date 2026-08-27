/* Momentum. LANE B (actor).

   The character does not snap to a target speed. It accelerates against the
   grip of whatever is under its feet, coasts when you let go, and has to
   brake through zero before it can run the other way. Sand and gravel are
   slippery; rock and granite bite.

   Everything here is a pure function - speed in, speed out - so the test
   file can measure the curve without booting a game.

   All rates are pixels per tick, at the fixed 36 Hz simulation step. */

/* how hard the feet can push, at full grip */
export const WALK_ACCEL = 0.26;
/* how hard they can brake with no input */
export const WALK_BRAKE = 0.34;
/* turning is a brake first: firmer than accelerating, still not instant */
export const TURN_BOOST = 1.55;
/* air steering is weak, and it never adds speed you did not already have */
export const AIR_ACCEL  = 0.085;
export const AIR_DRAG   = 0.012;
/* below this a walker is treated as stopped, so it does not creep forever */
export const STOP_EPS   = 0.05;

/* friction is 0-100 in the material table. Clamp it so nothing is frictionless
   and nothing grips better than granite. */
export function gripOf(friction){
  const f = friction < 10 ? 10 : (friction > 100 ? 100 : friction);
  return f/100;
}

/* One tick of ground acceleration towards `target`.
   grip 0..1 scales every rate: on sand you take longer to get going, longer
   to stop, and longer to turn round. */
export function groundSpeed(v, target, grip){
  let rate;
  if(target === 0)          rate = WALK_BRAKE * grip;      /* coasting to a stop */
  else if(v*target < 0)     rate = WALK_ACCEL * grip * TURN_BOOST;  /* skidding round */
  else if(Math.abs(v) > Math.abs(target)) rate = WALK_BRAKE * grip; /* over speed, bleed it */
  else                      rate = WALK_ACCEL * grip;      /* pushing off */

  const d = target - v;
  if(Math.abs(d) <= rate) return target;
  const out = v + (d > 0 ? rate : -rate);
  return (target === 0 && Math.abs(out) < STOP_EPS) ? 0 : out;
}

/* One tick in the air. Steering can turn you, slowly, but it cannot push you
   past walking speed - momentum from a run-up or a wall jump is yours to keep
   and yours to lose. */
export function airSpeed(v, target){
  if(target === 0){
    if(Math.abs(v) <= AIR_DRAG) return 0;
    return v - (v > 0 ? AIR_DRAG : -AIR_DRAG);
  }
  if(v*target > 0 && Math.abs(v) >= Math.abs(target)) return v;   /* already faster */
  const d = target - v;
  if(Math.abs(d) <= AIR_ACCEL) return target;
  return v + (d > 0 ? AIR_ACCEL : -AIR_ACCEL);
}

/* How many ticks it takes to get from `v` to `target` on this grip.
   Used by the tests, and handy when balancing. */
export function ticksToSpeed(v, target, grip, limit = 400){
  let n = 0;
  while(v !== target && n < limit){ v = groundSpeed(v, target, grip); n++; }
  return n;
}
