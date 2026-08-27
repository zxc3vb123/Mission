# LANE B — Actor

**You own:** `src/actor/`, `tools/tests/actor.test.js`

**Your job:** the body. How it walks, climbs, falls, swims, tires and swings a
tool. If the player ever feels like they are driving a floating rectangle, that is
your bug.

---

## What already works

- `clonk.js` — procedures WALK, FLIGHT, SCALE (wall climbing), HANGLE (moving
  along a ceiling), SWIM, DIG, with a hard-coded shovel dig.
- Vertex collision through `core/shape.js`: eight shape vertices stepped one pixel
  at a time, so the body walks over bumps, gets stopped by undiggable material and
  can be buried when sand collapses on it.
- Breath underwater, drowning, lava damage, fall damage above a threshold, respawn.
- `state.player` is published every tick: position, direction, action, energy,
  breath, aim, lamp. That is what every other lane reads.
- `render_actor.js` draws the figure, the tool and the helmet lamp.

Six actor checks are green.

---

## Task list

### M1 — make the movement honest
- [ ] Momentum: acceleration and deceleration, ground friction from the material
      under the feet, no instant direction flips at full speed.
- [ ] Jump that obeys physics: one jump, arc set at takeoff, only slight air
      steering. Jump height depends on carried mass.
- [ ] Climbing needs holds. Replace "scale any wall" with: ledges you can pull up
      onto, rough rock you can climb slowly, smooth or wet surfaces you cannot.
      Ladders and ropes (placed by lane C) are the reliable way up.
- [ ] Falls: damage curve by impact speed, landing stagger, a short recovery.
- [ ] Carry weight matters. Read `items.inventory.carriedMass()` and scale walk
      speed, jump height and climb ability. Publish `setCarryLimit(kg)`; at the
      limit, movement is a shuffle, and over it you cannot climb at all.

### M2 — tools instead of a built-in shovel
- [ ] `useTool(id)`: digging speed and what can be dug come from the equipped tool
      and lane A's `digSpeedFor(matIndex, toolId)`. Bare hands: soil only, slowly.
- [ ] Swing animation and timing per tool; digging becomes strokes, not a beam.
- [ ] Stamina: digging, climbing and hauling drain it; standing still and eating
      restore it. Exhaustion halves your speed rather than stopping you dead.

### M3 — survival
- [ ] Hunger over real time, fed by lane C's food items; weakness before harm.
- [ ] Injury state: a bad fall limits climbing until healed.
- [ ] Sleep in a shelter to pass the night and recover.

### M4+ — interacting with the built world
- [ ] Riding: ladders, ropes, elevators, and standing on moving carts and platforms
      (velocity inheritance, no jitter).
- [ ] Pushing: a wheelbarrow or a cart in front of you, slower and heavier.
- [ ] Two-handed carry for big objects that do not fit in a backpack.

---

## Rules for this lane

- Only `src/actor/` is yours. You may call `world.api` and `items.api`; you may not
  import their internals.
- You write `state.player` and nothing else in shared state.
- Physics runs at a fixed 36 Hz tick. Never scale movement by frame time.
- Keep the vertex model. Do not replace it with a bounding box: sliding over
  uneven pixel ground is the whole feel of the game.
- Any new movement ability needs a check in your test file that proves it — and one
  that proves the *limit* (e.g. "cannot climb a smooth wall", "cannot jump at full
  load").

## Gotchas

- The dig procedure uses a smaller vertex set so the body fits its own tunnel. If
  you change the dig radius or the body size, change both or the player gets stuck.
- Being buried is a legitimate state, not a bug: the escape is digging out. The
  emergency unstick after ~4 seconds is a last resort — do not make it generous.
- `state.player.aim` drives the lamp cone. Keep it normalised.
