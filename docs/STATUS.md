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
- [done] `src/content/items.js` — `ITEM_DATA`, 27 entries: every one of the 19
  materials the landscape yields, the three stage 0 surface pickups (wood, stick,
  plant fibre) and the five stage 0 hand crafts. Each carries mass, category,
  band, stage, colours and a one-line "what is this for". Fulfils the open
  `items -> content` request in `docs/REQUESTS.md` for the item half.
- [done] `tools/tests/content.test.js` — 14 checks. The two that matter to other
  lanes: **every material `dig2` has an item entry**, and **ITEM_DATA has not
  drifted from lane C's registry** (names, colours and tiers compared live).
- **Balance change other lanes must know about: masses are now kilograms.**
  Lane C's `src/items/itemdefs.js` used unscaled numbers (rock 40); `ITEM_DATA`
  uses real kg anchored at *one chunk of rock = 5 kg*, so a 35 kg backpack holds
  6–7 rocks and only 4 chunks of deep ore. Relative ordering is unchanged, and
  names/colours/tiers are byte-identical, so lane C can swap its table for this
  one with no visual change — but anything that compares a mass to a number needs
  re-reading. Only `inventory.carriedMass()` does today.
- [blocked, one line] `tools/run-tests.js` is lane E's file, so the content suite
  is **not yet in the runner** — the 51 it reports do not include my 14. Lane E:
  `import { run as runContent } from "./tests/content.test.js";` plus
  `content: runContent` in `SUITES`. Verified green by running the suite directly
  in the meantime.
- [next] `src/content/recipes.js` (hand list first), then `buildings.js` and
  `stages.js`. `docs/PROGRESSION.md` now has a "Known drift" section listing the
  four things those tables have to settle.
- **Note for lane A, not mine to fix:** at the time of this commit the whole
  runner throws before any suite executes — `src/world/dynamics.js` imports `bg`
  from `landscape.js`, which no longer exports it, mid-chunking refactor. Every
  lane's tests are down until that lands, including the boot-dependent check in
  mine. My data tables were verified green against `materials.js` directly, and
  the full 51 + 14 were green immediately before the refactor appeared on disk.

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

- **content → owner: stage 3 cannot currently be completed.** The sawmill is
  listed at stage 3 and needs iron fittings, but the forge that makes iron is
  stage 4. Either a small bloomery ends stage 2, or the sawmill is wood, stone and
  rope with iron fittings as a later upgrade. I have left the data honest
  (`iron_ore` is stage 4) rather than picking one; it needs deciding before
  `stages.js` is written. Detail in `docs/PROGRESSION.md`, "Known drift".
- **content → world: digging soil yields no item.** `M_EARTH` has `dig2: null`, so
  earth currently vanishes when dug, which conservation of matter forbids. Lane A
  names the yield; I will give it an `ITEM_DATA` entry the same day.

Add yours here rather than guessing, and the owner answers in `docs/DECISIONS.md`.
