# Mission — Status board

**Current milestone: M1 — Bare hands** (see `docs/GAME_DESIGN.md` §8)

Every lane keeps its own section up to date, one line per finished thing, newest
at the top. Read this before you start work; write to it before you commit.

---

## Release log

- **0.2.0** — saving and loading with per-system `serialise()` / `restore()` hooks,
  autosave every 50 seconds, start screen and pause menu (esc), settings for
  darkness and zoom. 51 headless checks green.
- **0.1.1** — daylight reads correctly on the terrain surface; darkness confined to
  caves and dug shafts. Verified live on GitHub Pages.
- **0.1.0** — first playable build. Modular engine, pixel landscape with 26
  materials and every ore band, digging, liquids, collapsing sand, darkness with a
  head lamp, dropped chunks and an inventory. 34 headless checks green.

---

## Lane A — World
- [done] Landscape, materials, generation, digging, liquids, unstable material.
- [done] Darkness and the head lamp: daylight bleeding into shafts, lamp rays that
  stop at solid material, glow from lava and uranium.
- [done] Ore set expanded to clay, limestone, gravel, coal, iron, copper, tin,
  zinc, lead, nickel, bauxite, quartz, titanium, silver, gold, uranium, rare earth,
  plus oil pockets, all banded by depth.
- [next] Dig speed per material and tool; conservation of matter (spoil).

## Lane B — Actor
- [done] Walk, fall, wall-scale, ceiling-hangle, swim, dig; vertex collision;
  breath, drowning, lava and fall damage; the published pose in `state.player`.
- [next] Momentum and honest jumping; climbing that needs holds; carry weight
  affecting movement.

## Lane C — Items & Build
- [done] Item registry with every raw ore, mass-aware inventory, dropped chunks
  with physics and pickup.
- [next] Mass-limited backpack and hotbar; crafting from lane F's recipe data;
  `src/build/` placement.

## Lane D — Industry
- [not started] Waiting on lane C's `build.api`. Can begin with the wheelbarrow,
  buckets and chutes, which stand alone.

## Lane E — Core & UI
- [done] Save/load: `core/persist.js` with `serialise()` / `restore()` hooks per
  system, autosave, text export/import. Core saves seed, player, inventory and
  camera on its own — **lanes A, C and D each need to add their own hooks** for
  terrain, drops/containers and machines (see `docs/REQUESTS.md`).
- [done] Start screen and pause menu (esc), settings for darkness, zoom and shape
  vertices; the simulation pauses while a menu is open.
- [done] Test isolation: `boot()` now resets shared singletons, so suites cannot
  pollute each other.
- [done] Fixed-tick loop, shared state, event bus, input, camera, renderer with a
  fixed layer order, vertex physics helper, particles, HUD, headless test kit and
  runner.
- [next] Inventory and crafting UI once lane C publishes its data; guidebook panel
  once lane F lands `src/content/`.

## Lane F — Content
- [not started] `docs/PROGRESSION.md` is written as prose. First job is turning it
  into `src/content/` data tables, which lanes C and D are waiting on.

---

## Answered by the project owner (2026-08-27)

All settled, with reasons, in `docs/DECISIONS.md`:

- **World size:** much bigger — target ~4000×2400+, generated in chunks. Lane A
  does this before the landscape code grows.
- **Spoil:** strict conservation, with a small hand-digging allowance at the
  tunnel mouth. Machines account for everything they move.
- **Survival:** light. Slow hunger, prey animals only, no predators. Darkness,
  falls, water and cave-ins are the real dangers.
- **Death:** respawn at your shelter, carried load drops where you fell.

## Open questions

None right now. Add yours here rather than guessing, and the owner answers in
`docs/DECISIONS.md`.
