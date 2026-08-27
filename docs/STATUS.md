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
- [done] `src/content/recipes.js` — `RECIPES`, the five stage 0 hand crafts:
  torch, rope, stone knife, stone axe, bandage. A recipe's `tool` is **required
  but not consumed**, which makes the stone knife the first craft that matters —
  it is a capability, not an ingredient. Chain is knife → rope → axe → wood →
  workbench, so stage 1 hangs off one hand-made blade.
- [done] `src/content/buildings.js` — `BUILDINGS`: campfire, workbench, chest,
  kiln (stages 0–2, as far as `PROGRESSION.md` actually costs things out).
  **Buildings are placed, never crafted** — a building's cost lives here and
  nowhere else, so there is no recipe that outputs a structure. `buildMass()`
  quotes the haulage: a workbench is 104 kg, which is three backpack trips.
- [done] `soil` added to `ITEM_DATA` per the owner's decision. Lane A still has
  to set `dig2: "soil"` on `M_EARTH`; until they do, `soil` sits in the exported
  `PENDING_YIELD` list. That list is self-cleaning — the content suite fails both
  if an unknown raw item has no source *and* if a `PENDING_YIELD` id has since
  got one, so it cannot quietly become permanent.
- [done] `src/content/items.js` — `ITEM_DATA`, 28 entries: every one of the 19
  materials the landscape yields, `soil`, the three stage 0 surface pickups and
  the five stage 0 hand crafts. Each carries mass, category, band, stage, colours
  and a one-line "what is this for". Closes the `items -> content` request.
- [done] `tools/tests/content.test.js` — now 27 checks, wired into the runner by
  lane E in e9133cf. The ones other lanes should care about: every material
  `dig2` has an item entry; `ITEM_DATA` has not drifted from lane C's live
  registry; no recipe needs an item that does not exist; every recipe station
  exists as a building; nothing is reachable before its ingredients or its
  station; and **every item is obtainable from a bare-hands start** — that last
  one walks the whole tree from raw and gathered items and would catch a dead
  entry the moment one appears.
- **Balance change other lanes must know about: masses are now kilograms.**
  Lane C's `src/items/itemdefs.js` used unscaled numbers (rock 40); `ITEM_DATA`
  uses real kg anchored at *one chunk of rock = 5 kg*, so a 35 kg backpack holds
  6–7 rocks and only 4 chunks of deep ore. Relative ordering is unchanged, and
  names/colours/tiers are byte-identical, so lane C can swap its table for this
  one with no visual change — but anything that compares a mass to a number needs
  re-reading. Only `inventory.carriedMass()` does today.
- [next] `src/content/stages.js` — the eight stages, what counts as reaching each
  and what it unlocks, written on the settled stage 3 basis. Then the M2
  guidebook.
- **Note for lane A, not mine to fix:** `world: water spreads across a cavern`
  is red in the working tree (24 of 96 columns), mid-chunking refactor. It is the
  only failure in the runner's 78; all 27 content checks pass.

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

Both of lane F's are now settled in `docs/DECISIONS.md` (2026-08-27): the sawmill
is wood, stone and rope with iron fittings as an upgrade, and dug earth yields
`soil`. Nothing open from content right now.

Add yours here rather than guessing, and the owner answers in `docs/DECISIONS.md`.
