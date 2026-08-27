# LANE E — Core & UI

**You own:** `src/core/`, `src/ui/`, `src/systems.js`, `src/main.js`, `tools/`,
`docs/`, `index.html`

**Your job:** the engine everything else stands on, the screen the player looks
at, and keeping five other lanes from tripping over each other.

---

## What already works

- `loop.js` — fixed 36 Hz simulation, render once per animation frame.
- `state.js` — the shared state object with a documented owner per branch.
- `bus.js` — the event channel between lanes.
- `input.js` — keys and mouse, world-space cursor.
- `render.js` — canvas, camera transform, the fixed layer order every lane draws into.
- `shape.js` — vertex collision and pixel-stepped movement, shared by anything that
  moves through terrain.
- `fx.js` — dust, steam, splashes, blast rings.
- `camera.js` — follow, cursor lean, clamping, free camera.
- `ui/hud.js` — stats panel, vitals, inventory strip, tips.
- `tools/testkit.js` + `tools/run-tests.js` — headless boot and the test runner.

34 checks green across four suites.

---

## Task list

### M1 — the frame around the game
- [ ] Save and load: seed plus the landscape diff, player, inventory, structures.
      Design the format so each lane serialises its own state through a
      `serialise()` / `restore(data)` hook on its system object.
- [ ] Pause, and a proper start screen: new world (seed), continue, settings.
- [ ] Settings: zoom, darkness intensity, volume when audio exists, key bindings.
- [ ] Performance HUD behind a key, and a frame-budget test in `tools/`.

### M2 — the interfaces the player lives in
- [ ] Inventory and crafting screens as a real UI layer (lane C supplies the data,
      you render it).
- [ ] The guidebook panel: reads lane F's stage data and the player's actual
      inventory, and always answers "what now?".
- [ ] Tooltips everywhere: what a material is, what an item is for, why a recipe is
      unavailable.

### M3 — feel
- [ ] Audio: digging, footsteps, water, machinery. Positional, quiet by default.
- [ ] Screen effects: darkness adaptation when you come out of a mine, weather.
- [ ] Camera work: lead the view while running, pull back in caverns.

### Continuous — your integration duties
- [ ] Keep `docs/ARCHITECTURE.md` accurate the day an API changes.
- [ ] Review merges to `main`, keep the test suite green, cut releases.
- [ ] Watch the frame budget: 36 Hz means ~27 ms per tick and everything must fit.

---

## Rules for this lane

- You own the contracts, so you are the only lane that may change them — but do it
  by agreement, in `docs/REQUESTS.md`, not unilaterally.
- Never put game logic in core. If it is a rule about the world, it belongs to a
  lane. Core provides mechanisms, not policy.
- `src/systems.js` has marked slots for lanes C, D and F. Those lanes add their own
  line; you keep the ordering sane.
- Rendering never mutates simulation state, and simulation never touches the DOM.

## Gotchas

- The renderer draws `renderLight` last in world space: anything drawn after it is
  not darkened, which is almost never what you want.
- `tools/testkit.js` boots the game with no DOM. Anything you add to core must
  survive that — guard DOM access the way `render_land.js` and `lighting.js` do.
- Determinism matters for save/load: the world is rebuilt from a seed plus a diff,
  so any `Math.random()` in simulation code is a bug.
