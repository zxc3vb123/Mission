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
- [done] Momentum: the clonk accelerates, coasts and skids instead of snapping to
  a target speed. Every rate scales with the friction of the material actually
  under the feet, so granite bites and sand slides — a standing start is a
  quarter of a second on rock and two thirds on sand. Turning at full speed
  brakes through zero first (about six ticks before the old direction is gone),
  and air steering can turn you but never adds speed you had not already earned.
  The curve lives in `src/actor/motion.js` as pure functions, so it can be
  measured without booting a game. 20 actor checks green.
- [done] Walk, fall, wall-scale, ceiling-hangle, swim, dig; vertex collision;
  breath, drowning, lava and fall damage; the published pose in `state.player`.
- [next] Honest jumping (arc set at takeoff, height scaled by carried mass), then
  climbing that needs holds, then carry weight affecting movement.

## Lane C — Items & Build
- [done] **Mass-limited backpack.** 35 kg to start, 60 kg with the best pack, in
  real kilograms: seven rocks a trip, four chunks of deep ore. Over the limit
  nothing more goes in, and a full pack leaves the chunk lying on the ground
  rather than swallowing it (`pickup:refused`). `add()` now returns how many it
  actually took and fills partially. Lane B: read `inventory.encumbrance()`,
  0 below 65% of capacity and ramping to 1 when full.
- [done] The item registry is built from lane F's `ITEM_DATA` instead of a second
  copy of the same table, so masses are kilograms everywhere and cannot drift.
  `registerItem()` is unchanged for lane D.
- [done] `serialise()` / `restore()` for the pack's capacity and the chunks on the
  ground — half of the open `core -> items` request; containers follow with chests.
  Note: `inventory.clear()` empties the contents only, `reset()` also restores the
  pack size. Core's load path clears the inventory after our restore hook runs, so
  an upgraded pack would otherwise shed its load on every load.
- [next] Hotbar and `equipped()` for lane B's tool digging, then crafting from
  lane F's `RECIPES`, then `src/build/` placement and `build.api` for lane D.
- 33 items checks green; 142 across all lanes.

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
- [done] `src/content/stages.js` — `STAGES`, the eight stages. **Stage state is
  capability, not knowledge:** you have reached stage 2 when a kiln physically
  exists, not when you are carrying enough to build one (`docs/DECISIONS.md`).
  `highestStageReached()` walks the ladder from 0 and stops at the first unmet
  rung, so owning a kiln without ever having built a workbench does *not* read as
  stage 2 — there is a test for exactly that. Stages 3–7 carry
  `reachedWhen: null` because `PROGRESSION.md` does not cost them out yet, and
  the suite enforces that the uncosted ones are a **suffix**, so progression can
  never have a hole in the middle.
- [done] `soil` dropped from `PENDING_YIELD` now that lane A has set
  `dig2: "soil"` on `M_EARTH` (ratio 500). The self-cleaning list worked as
  intended: it sat there one commit, lane A landed the yield, and the suite
  immediately failed telling me to remove it. Empty is its resting state.
- [done] Content suite is now **38 checks**, all green.
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
- **Note for lane E, not mine to fix:** three `core` save/load checks are red.
  `tools/tests/core.test.js` loads 7 iron ore + 3 coal, which is 50 kg into a
  35 kg pack, so lane C's new mass limit correctly refuses part of it. The test
  predates the limit — it wants a smaller load, or a `setCapacity()` first. This
  is downstream of my kilogram masses becoming load-bearing, so flagging it
  rather than leaving it to be found.

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
