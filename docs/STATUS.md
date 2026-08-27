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
- [done] **The world is 4096 x 2560 and streamed in chunks.** `planWorld(seed)`
  lays out the whole map cheaply; `fillChunk()` rasterises one 128 px chunk from
  position alone, so chunks generate around the camera and are dropped behind it.
  An unchanged chunk is not stored at all - regenerating it is provably
  identical, which the suite checks byte for byte in two different generation
  orders. Walking 3000 px holds around 40 chunks and 2 MB, with tick cost flat.
  `matAt`/`isSolid`/`setMat` are unchanged, so no other lane sees any of it.
- [done] Landscape serialise/restore: a save carries the run-length encoded
  *difference* between each changed chunk and a freshly generated one, so a dug
  hole is a couple of hundred bytes. Closes core's request in `docs/REQUESTS.md`.
- [done] Digging earth yields `soil` (`docs/DECISIONS.md` 2026-08-27), so soil is
  no longer deleted when dug.
- [done] Landscape, materials, generation, digging, liquids, unstable material.
- [done] Darkness and the head lamp: daylight bleeding into shafts, lamp rays that
  stop at solid material, glow from lava and uranium.
- [done] Ore set expanded to clay, limestone, gravel, coal, iron, copper, tin,
  zinc, lead, nickel, bauxite, quartz, titanium, silver, gold, uranium, rare earth,
  plus oil pockets, all banded by depth.
- [next] Dig speed per material and tool (`digSpeedFor`, actor's request in
  `docs/REQUESTS.md`); then conservation of matter (spoil).
- [note] **Only loaded ground is simulated.** Liquids and collapses run in a band
  around the camera, not across the whole map. Anything another lane wants
  simulated far from the player needs a way to hold that ground loaded - ask in
  `docs/REQUESTS.md` and lane A will publish one.

## Lane B — Actor
- [done] Momentum: the clonk accelerates, coasts and skids instead of snapping to
  a target speed. Every rate scales with the friction of the material actually
  under the feet, so granite bites and sand slides — a standing start is a
  quarter of a second on rock and two thirds on sand. Turning at full speed
  brakes through zero first (about six ticks before the old direction is gone),
  and air steering can turn you but never adds speed you had not already earned.
  The curve lives in `src/actor/motion.js` as pure functions, so it can be
  measured without booting a game. 21 actor checks green, verified
  against a clean checkout as well as the working tree.
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
- [done] **Hotbar and the equipped item.** Eight slots, number keys 1-8, and
  `items.api.equipped()` -> `{ id, def, count }` or null, plus `item:equipped`.
  **Lane B: this unblocks your tool digging** (`docs/REQUESTS.md` closed). The
  bar is a view onto the pack rather than storage — what you acquire takes the
  first free slot, a slot whose item runs out is freed, and it goes null the
  moment the last one is used up, so a tool that is gone cannot dig. Slots swap
  rather than shuffle, and the arrangement survives a save.
- [done] **Surface gatherables — stage 0 is completable again.** Sticks, plant
  fibre and loose rock lie scattered along the surface and are picked up by
  walking over them. The guidebook's first instruction asked for all three and
  nothing in the world yielded any of them, so the first thing the game told a
  new player to do was impossible. Checked across eight seeds: the full stage 0
  chain (3 rock, 3 stick, 8 fibre — 17.4 kg, half a backpack) is gatherable
  within a short walk of the spawn, and a cleared surface grows back slowly and
  out of sight. **Wood is deliberately not scattered** — felling a tree is what
  the stone axe is for, and seeding wood would skip the whole stage 0 chain.
  Taken ahead of crafting at lane E's request: a crafting screen with nothing to
  craft from is still an empty screen.
- [next] Crafting from lane F's `RECIPES`, then `src/build/` placement and
  `build.api` for lane D.
- Two numbers are parked in `src/items/gatherables.js` that should be lane F's:
  scatter density and regrowth rate. Request filed; I read their table the day
  it exists.
- 61 items checks green; 199 across all lanes.

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
- [done] `src/content/reference.js` — `REFERENCE`, the guidebook's reference
  half: 21 searchable pages, one per real mechanic, with a forgiving search
  tuned for what a stuck player types ("cant dig", "its too dark", "sand fell on
  me"). `GUIDE` still says what to do next; this says how anything works.
- **Every page says whether it is true yet.** `status` is `live` or `planned`,
  and 6 pages are planned: placement, tools/dig-speed, spoil, hauling, hunger,
  stages — all data I have written that has no system behind it. The owner's
  complaint is "I cannot tell what is in the game", and a book that quietly
  described unbuilt mechanics would answer that *wrongly*. Search also ranks a
  live page above a planned one when both answer the same question.
- **Lane E, for the panel:** `searchReference(q)` returns pages best-first;
  `LIVE_IDS` and `PLANNED_IDS` split the book. Please render planned pages
  visibly differently — that distinction is the whole point. Numbers come from
  `page.figures`, derived from the tables, so never print a number out of
  `page.body`; there are none. Key bindings are deliberately absent and a test
  fails if a page names one — they are yours to generate.
- Content suite is **82 checks**; 215 green overall.
- [done] **Stages 0-2 are now fully costed, so they are playable as data.**
  Every station has recipes: five by hand, three at the workbench (stone shovel,
  stone pickaxe, wheelbarrow), four at the kiln (charcoal, bricks, quicklime,
  glass). Seven new items to match. Content suite 66 checks; 187 green overall.
- **This was the real gap for playtesting, not guidebook wording.** Before this
  commit `recipesAt("workbench")` and `recipesAt("kiln")` both returned nothing:
  a player could haul 104 kg to raise a workbench and open an empty list. No
  amount of guidebook copy fixes a station with nothing in it — that is a broken
  promise rather than a stub. The guidebook's stage 1 and 2 actions now point at
  real recipes instead of prose, so the panel can show a live shortfall for
  every step from bare hands to a fired brick.
- **LANE B, via lane E:** `stone_shovel` and `stone_pickaxe` are new tools with
  dig behaviour — shovel is several times faster in soft ground and does nothing
  to rock; the pickaxe is the only thing that opens rock at all. That matches the
  two open requests in `docs/REQUESTS.md` (`equipped()` and
  `digSpeedFor(matIndex, toolId)`). The ids and the intent are settled; the
  behaviour is yours. Per my brief I am flagging rather than inventing it.
- [done] `src/content/haulage.js` — the haulage curve, five rungs from a 35 kg
  backpack to a conveyor, quoted as multiples of one loaded person. Capacities
  climb 35 → 150 → 1500 → 6000 kg, which is the brief's "barrow about four times
  the pack, wagon ten times the barrow". **Lane D: these are your numbers, and
  the rung ids are meant to match your machine ids.**
- **Finding worth other lanes' attention: the haulage ladder is not one rising
  line.** The brief lists backpack → barrow → wagon → rail → conveyor as a
  single climb in tonnage; it is not one. A locomotive out-hauls a belt, and
  real mines run both. The conveyor wins on a different axis — it is the only
  rung that does not cost the player's own time. So it is a *choice against*
  rail, not a rung above it, and the suite checks the two axes separately.
  Forcing one line would have meant inflating the belt's numbers into a lie.
- [done] Every rung carries a `constraint` (the physical thing it cannot do)
  and a `keepsAlive` line naming which rung still does that job — the structural
  guarantee that the ladder never eats itself. A barrow that could climb a
  ladder would delete the backpack.
- [fixed] `PENDING_YIELD`'s stale-entry check no longer *fails*, it reports.
  As written it could only be green if lanes A and F committed atomically —
  whoever pushed first would redden main for the other. In a repo where six
  chats share one working directory that is a trap, not a safety net. A cap on
  the list length is what stops it rotting instead.
- [done] Content suite is **66 checks**, all green.
- [done] `src/content/guide.js` — `GUIDE`, 8 stages x 2-4 ordered actions, plus
  `MATERIAL_HINTS` (how each findable thing looks in the world — "rusty red
  flecks in grey rock", never coordinates) and `HAZARD_HINTS` (what an orange
  glow through a wall means before it kills you). **No entry writes a shortfall
  down:** each action carries a `needs` spec (`{build}`, `{craft}` or `{items}`)
  and lane E's panel does the subtraction against the real inventory. The suite
  fails on *any* digit in guidebook prose, because a number copied out of a table
  goes stale the moment I tune that table — which caught two of my own lines.
- [done] Content suite is **50 checks**, all green. M1 data layer and the M2
  guidebook are both complete.
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
- [next] M3 balance passes: time-to-tier targets, the haulage curve
  (backpack -> wheelbarrow -> wagon -> rail), fuel economy and depth pressure.
  Worth doing once stage 0-2 is actually playable and can be timed, which needs
  lane C's placement — until then I would be tuning against a guess.
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
