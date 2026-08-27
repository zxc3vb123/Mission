# LANE A — World

**You own:** `src/world/`, `tools/tests/world.test.js`, `tools/tests/lighting.test.js`

**Your job:** the ground. What it is made of, how it is dug, how it falls in,
floods, glows and goes dark. Everything the player struggles against physically.

---

## What already works

- `landscape.js` — one byte per pixel indexing the material table, plus a `bg`
  array recording whether sky or tunnel is behind each pixel, dirty-tile
  bookkeeping for repaints.
- `materials.js` — 26 materials with density / friction / digFree / dig2 /
  instable / maxSlide / maxAirSpeed / light, including all the ores in
  `docs/GAME_DESIGN.md` §6.
- `generate.js` — hills, soil, rock strata, granite, bedrock, caves, ore bodies
  banded by depth (`ORE_PLACEMENT` is the tuning table), the lake, underground
  water, oil and lava pools, trees and grass, the spawn point.
- `dig.js` — `digFreeCircle` frees material and emits `dig:yield`; granite refuses;
  `blast` scatters loose pixels.
- `dynamics.js` — loose pixels (PXS), the mass mover that levels liquids, unstable
  material collapsing and sliding, lava+water → rock.
- `lighting.js` — daylight from sky-backed pixels bleeding into shaft mouths, the
  head lamp cast as rays that stop at solid material, glow from lava and uranium,
  drawn as one smooth darkness overlay.
- `render_land.js` — per-pixel painting with grain, surface highlight, grass tint.

Twelve world checks and eight lighting checks are green.

---

## Task list

### M1 — the world you can survive in
- [x] **A big world, generated in chunks.** Decided 2026-08-27: target ~4000×2400
      pixels or more, streamed rather than held as one flat buffer. Do this first,
      while the landscape code is still small — it touches `landscape.js`,
      `generate.js` and the dirty-tile repainting, and every later feature assumes
      it. Keep `matAt`/`isSolid`/`setMat` signatures identical so no other lane
      notices the change. Test: generate, walk 3000 px, assert memory and tick
      cost stay flat.
      *Done.* 4096 x 2560 in 128 px chunks. `generate.js` splits into
      `planWorld(seed)` (ground line, water level, every ore body, pool, tree
      and blade of grass, bucketed by chunk) and `fillChunk()`, which rasterises
      one chunk from position alone. Unchanged chunks are thrown away and
      regenerated; changed ones are kept run-length encoded. See
      `config.js`, `chunks.js`.
- [x] Softness matters: digging speed should depend on the material and the tool.
      Publish `digSpeedFor(matIndex, toolId)` so lane B can use it; hands must be
      slow, a shovel fast in soil, a pickaxe the only thing that touches rock.
      *Done.* Pixels per second, 0 meaning "this tool cannot cut this". The tier
      table is lane F's `src/content/tools.js` and this lane only reads it; what
      is added here is the unit (`KIND_RATE` in `dig.js`) and a within-tier
      hardness dial in `materials.js`. The gate lives inside `digFreeCircle` and
      `anyDiggable` via an optional trailing `toolId`, so no caller can dig round
      it - but omitting that argument is still ungated, so it does nothing in
      play until lane B passes the tool (`docs/REQUESTS.md`).
- [ ] Ore visibility pass: make each ore readable at a glance underground, in lamp
      light, without looking like a different game. Screenshot every ore.
- [ ] Surface variety: barren stretches, rocky outcrops, a few clay banks and sand
      pits near water, so the surface reads as a place with regions.

### M2 — conservation of matter *(the big one, read GAME_DESIGN §2)*
- [ ] Every freed pixel produces spoil rather than vanishing. Emit
      `spoil:produced { matIndex, amount, x, y }`. Decided 2026-08-27: strict, with
      one concession — hand digging may scatter a small allowance at the tunnel
      mouth so the first hour is not pure hauling. Anything a machine moves is
      accounted for in full.
- [ ] `dumpMaterial(x, y, matIndex, amount)` — puts material back into the world as
      loose pixels that settle. This is how a cave gets emptied and a hollow gets
      filled.
- [ ] Spoil heaps behave: they slump, they block tunnels, they can be re-dug.
- [ ] Test: dig a 40×40 chamber, dump every unit of spoil elsewhere, and assert the
      total solid pixel count of the map is unchanged within tolerance.

### M3 — light as a system
- [ ] `addLightSource(id, { x, y, r, power, colour })` / `removeLightSource(id)` so
      torches, lamps, fires and later electric lights all light the world.
- [ ] Torch placement support: a light source that sticks to a wall pixel and dies
      if that pixel is dug away.
- [ ] Day/night cycle driving the daylight term (nights are dark outside too).

### M4+ — water that matters
- [ ] Aquifer pressure: cutting into a water body floods the shaft at a rate, not
      instantly, so pumping is a race worth having.
- [ ] `drain(x, y, amount)` / `flood(x, y, matIndex, amount)` for lane D's pumps.
- [ ] Cave-ins: unsupported spans of rock collapse; supports and beams prevent it.

---

## Rules for this lane

- Never import from `src/actor`, `src/items`, `src/build`, `src/industry`.
  The world does not know the player exists — it only publishes API and events.
- Determinism: all generation goes through `core/rng.js` seeded once. Same seed,
  same world, forever.
- Performance budget: the whole simulation tick must stay under ~6 ms at 36 Hz on
  a mid laptop. Landscape repaints are tile-based; keep them that way.
- Every ore that yields something must name an item id that lane C has registered,
  and the test `every ore maps to a registered item` proves it.

## Gotchas

- `bg` decides sky vs tunnel behind a removed pixel. Get it wrong and dug tunnels
  glow like open sky.
- The mass mover only moves a pixel downwards, and follows the surface sideways to
  find a higher column. That rule is what makes water settle instead of freezing
  into staircases — do not "simplify" it away.
- Lighting is computed for the visible rectangle only, at 4-pixel cells. Anything
  that needs light off-screen must not depend on `lightAt`.
