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
- [done] **Trees can be chopped.** An axe fells a tree in about four seconds and
  the logs arrive as `dig:yield { item: "wood" }`, so lane C needed no change.
  Bare hands and a shovel do nothing to a trunk at all. Undermining a tree still
  topples it, but it lies there as a downed trunk that an axe must still cut up —
  otherwise digging would be a way past the axe, and the axe is the only source
  of wood. Felling and bucking are the same verb. Also emits `tree:felled`
  (notification only — the logs come as `dig:yield`, so do not spawn them twice).
- [done] **Digging is gated by tool tier.** `digSpeedFor(matIndex, toolId)` returns
  pixels per second, 0 meaning "this tool cannot cut this", and the gate lives
  inside `digFreeCircle`/`anyDiggable` so no caller can go round it. The tier
  table is lane F's `src/content/tools.js` — this lane reads it and adds only the
  unit, plus a within-tier hardness dial so coal crumbles and quartz fights back.
  Hands 90 px/s in earth, stone shovel 360, stone pickaxe 110 in earth and 200 in
  rock; no shovel cuts stone at any tier; granite never yields to anything.
  **Not live in play yet** — see the request to lane B below.
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
- [next] Timbering and cave-ins (owner playtest), then buckets, then conservation
  of matter (spoil).
- [blocked] **Chopping does nothing in play until lane B calls `chopAt`.** The
  tier gate is live (lane B landed the swing wiring), but the axe swing is not
  hooked up yet, so wood is still unobtainable and the stage 0 chain still
  dead-ends. A few lines in the same swing handler, written out in
  `docs/REQUESTS.md`.
- [note] **Only loaded ground is simulated.** Liquids and collapses run in a band
  around the camera, not across the whole map. Anything another lane wants
  simulated far from the player needs a way to hold that ground loaded - ask in
  `docs/REQUESTS.md` and lane A will publish one.

## Lane B — Actor
- [done] The character holds what you gave it. Owner's report: only one thing
  ever appeared in its hand. Each tool now has its own silhouette rather than a
  recoloured rectangle — a shovel is a broad flat blade, a pickaxe a narrow head
  across the top, an axe a wedge on one side, a knife an edge with no shaft —
  and bare hands are a fist, because empty-handed is the normal state in stage 0
  and "why can I not dig this rock" should be answerable by looking. Anything
  that is not a tool is carried in its own colour. Tier shows in the colour, not
  the shape, so an iron pickaxe reads as a pickaxe. Chopping swings a wider arc
  than digging. `heldLook()` is exported so the silhouettes can be checked
  without a canvas. 51 actor checks green.
- [done] You can get onto a ledge. Owner's report: climb a straight wall, stick
  at the top, press jump, get thrown off it. The cause was arithmetic, not
  tuning — the wall grip dies once the body's centre is 2px above the lip, but
  the old ledge-hop waited until it was 5px above, so on a square top it could
  never fire, and jump was the only thing left to press. There is now a real
  mantle: it looks *up* for the lip rather than waiting to be above it, checks
  the body fits standing there, and carries on past the point where the wall is
  still there to hold. Pressing jump at a lip pulls you up; the wall jump still
  answers when there is no lip in reach, which is how you come down on purpose.
- [done] Digging is gated by what is in your hands. The actor passes the
  equipped tool into `anyDiggable` and `digFreeCircle`, so lane A's tier gate is
  live in play: bare hands and shovels move loose ground, a stone pickaxe opens
  coal and iron, granite stops everything. Ground above your tool's tier reads as
  a wall — the swing does not start — rather than as slow going. The dig *rate*
  is data too: the body advances at `digSpeedFor` relative to a stone shovel in
  earth, so a shovel is 4x bare hands in the same soil. `null` is passed for
  empty hands, which is a real tool id to that API; only omitting the argument
  turns the gate off, and the actor never omits it. **This is what fixes "dig
  straight to uranium with a shovel".** New: `actor.api.tool()`.
- [done] Chopping, from the same swing: a tree in front takes the swing before
  the ground behind it does, and only an axe does anything to it — bare hands
  thud and the tree is untouched. Felling yields `wood` as `dig:yield`, which is
  stage 0's only source of it. `state.player.chop` is published 0..1 for a HUD
  meter. 36 actor checks green.
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
- [done] **Dropping and throwing.** `items.api.drop(id, n)` and `dropEquipped(n)`;
  `x` throws what is in your hands. Thrown items land clear of the player and
  cannot be snatched straight back. From owner feedback: with a mass-limited
  pack and no way to put anything down, filling up on the wrong thing was
  unrecoverable.
- [done] **The pack no longer fills while you walk.** Two causes, both mine.
  Auto-pickup was unconditional, so crossing the scattered surface loaded you up
  with things you never chose; it now stops at the burden line, and `control`
  held takes things deliberately. And rock was scattered in clumps of two — 10 kg,
  29% of a starting pack, from one step. Rock is now one at a time and simply
  more frequent: the heaviest single pickup fell from 29% to 14% of a pack, and
  the stage 0 chain got *easier* to find, not harder (all eight test seeds now
  satisfy the guidebook's opening ask within 600px, where one used to fail).
  Lane F was right that this was not a mass problem — no content number changed.
- [fixed] Bus listeners were re-registered on every `boot()`, so a second boot
  left the first game's listeners running: two chunks per dug pixel, two items
  thrown per keypress. Only ever visible in multi-suite test runs, but the tests
  are the contract, so attachment now detaches first.
- [done] **`src/build/` and `build.api` — placement is live. Lane D is unblocked.**
  Shape published in `docs/ARCHITECTURE.md` §5; the `industry -> items` request
  is closed. Campfire, workbench, chest, kiln, sawmill and forge all place from
  lane F's `BUILDINGS` with no per-building code — a machine is data plus a
  footprint, and `place()` will raise it, hold it up, drop it and save it.
  - **Nothing floats.** Support is checked at placement and again while a
    building stands, so digging out a hut's footing brings the hut down.
  - **Matter is conserved.** A collapse returns everything it was made of as
    real chunks, rather than deleting it.
  - **One verdict function** serves the ghost preview, the build menu and the
    placement, so the preview can never promise what placement then refuses.
    Every refusal carries a reason worth reading — "needs solid ground under
    it", "needs a Workbench" — and `missing` when it is materials.
  - **A building is not finished when it appears.** `def.time` seconds of work
    stand between a heap of materials and a working station, and it visibly
    rises as the work is done.
  - Buildings rest on the *highest* ground under their footprint and tolerate a
    few pixels of hollow, because a pixel landscape is never laser-flat and
    demanding one perfect row would make most of the real surface unbuildable.
  - Storage: chests are mass-limited in the same way and for the same reason as
    the backpack, and `storageAt(x,y)` hands out the same add/take/mass
    vocabulary, so lane D's machines can pull from a chest exactly as they would
    from a pack.
  - 37 checks in `tools/tests/build.test.js`. **Lane E: it is not in the runner
    yet** — `tools/run-tests.js` is yours, one line, request filed. The 262 the
    runner reports do not include my 37.
- [done] **Crafting.** `canCraft` / `craft` / `nearbyStations` / `craftable` on
  `items.api`, reading lane F's `RECIPES` and hard-coding nothing. Both UI
  sessions can drop their `typeof` guards.
  - **Stage 0 is now provably completable end to end**, and there is a test that
    walks it: gather 3 rock, 3 stick and 8 fibre — 17.4 kg, half a starting pack,
    and exactly what the surface yields — and out of it come the knife, the rope
    the knife makes possible, the axe that is the only source of wood, and a
    torch before the light goes.
  - A verdict is structured, never a sentence: `{ ok, reason, missing:[{id,
    need, have}], needsStation, needsTool }`. The UI writes the copy, so the
    crafting screen and the guidebook say the same fact in two voices from one
    source.
  - A recipe's `tool` is a capability — required in the pack, never consumed —
    so one stone knife carries the whole opening chain.
  - Your hands are always a station; anything else needs a *finished* building
    of that id within 40px, matching `build.api.stationsNear`.
  - A craft whose result you could not carry is refused with a reason rather
    than quietly overfilling the pack. Rope is the real case: 0.6 kg of fibre
    becomes 0.9 kg of rope.
  - **Known gap, deliberate:** crafting completes immediately and lane F's
    `time` is not spent yet. `src/ui/craft.js` says "made X" the instant
    `craft()` returns, so timed crafting would have made the live screen lie on
    every craft. Written up in `docs/REQUESTS.md` with the shape to move to, and
    it needs one design answer that is not mine: what happens when a player
    walks away mid-craft.
- [done] **THE GAME IS WALKABLE FROM BARE HANDS TO AN IRON PICKAXE, and there is
  now a test that walks it.** Lane F proved the data has no circular tier; the
  stage 0 check proves the opening; this proves the middle, in the running game
  rather than on paper. In order, all of it real: bare hands cannot fell a tree
  → an axe can → the trunk yields wood → a workbench is raised on it → it makes
  a stone pickaxe → hands take *not one pixel* of solid rock while the pickaxe
  opens it → the pickaxe reaches the coal and the iron the forge will need →
  but leaves a copper seam untouched → kiln and sawmill go up → charcoal, brick,
  quicklime and planks come out → the forge is raised from exactly those →
  it smelts ore, fuel and flux into iron bars → the bars become an iron pickaxe
  → **and it opens the very copper seam that stopped the stone one.**
  If any lane breaks a link, this goes red and names which one.
  - Hauling *volume* is deliberately not simulated here (bulk clay and limestone
    are granted): mass and trips are proven by the backpack checks, and
    re-proving them would only make this slow. Every *link* is real.
  - Construction is fast-forwarded by ticking the build system alone, because
    `build.test.js` already proves build timing under the real loop and doing it
    again here would cost nine seconds of CI to learn nothing.
  - Three checks failed on the first run and all three were my assertions, not
    the code: a dig circle straddles softer ground at its edges, so "hands freed
    25 pixels" was hands correctly digging the *earth* around the rock while the
    rock itself was refused. The gate is stated as a property of the material
    now (`digSpeedFor(rock, hands) === 0`) and the dig is done on a disc that is
    purely the gated material.
- [done] **Timed processing — the first thing in the game that works without
  you.** Per the owner's decision: making stays instant (a torch is in your hands
  at once), while the kiln and the forge take a job. The inputs leave your pack
  when the job starts, **the station keeps working while you are somewhere else
  entirely** — proved with the player 900px away — and the output waits inside
  the station until you walk back in and it hands it over.
  - That last part is the point. A station is now a machine rather than a menu,
    and it is the shape every machine after it takes; lane D plugs in here.
  - The output sits in the station's own store, reachable through the **same**
    `storageAt()` container a chest answers to, so lane D can pull a finished bar
    out of a forge with nothing new from me.
  - **A station destroyed mid-job gives the inputs back** as real chunks, along
    with any uncollected output. Conservation of matter does not get an exception
    for being mid-smelt, and a game that silently eats a player's iron is a game
    they stop trusting. `structure:collapsed` names what it held and what job it
    interrupted, so a UI can say "your wood came back".
  - One job at a time, refused as `busy` rather than as a missing station — the
    difference between telling a player to wait and telling them to build another.
  - Chests are deliberately excluded from walk-in collection: a chest is where you
    *put* things, and one that emptied itself into your pack as you passed would
    be worse than useless. A kiln is where things *appear*.
  - Which stations process, and how much they hold, are marked for lane F.
- [next] Deconstruction: taking a building down on purpose and getting most of
  it back, now that a collapse already returns all of it.
- Two numbers are parked in `src/items/gatherables.js` that should be lane F's:
  scatter density and regrowth rate. Request filed; I read their table the day
  it exists.
- Rock must never stop being gatherable by hand: a stone pickaxe is made of
  rock and rock needs a pickaxe to dig, so loose surface rock is the only thing
  breaking that deadlock. Now pinned by a named check in the items suite, since
  nothing else in the codebase would notice if it stopped.
- 150 items checks and 37 build checks green; 471 in the runner.

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
- [done] Craft times re-read against the new rule: hand and workbench instant,
  kiln and forge timed, time rising with the tier of the output. Stations now
  declare `timed` themselves, timed recipes carry a `tier`, and the suite pins
  both the monotonic curve and a ceiling.
- **Making time real re-priced the metal chain, and it was worse than it
  looked.** Those times were written when time was free. The moment they
  counted, a steel pickaxe was **880 s of station time and 177 kg of hauled
  ore** — slow, expensive and heavy at once, exactly the triple punishment. It
  is now **225 s and 67 kg**. The lever was batch sizes, not the clock: bars
  come out two at a time and charcoal six, which cuts time and ore together.
- **The ceiling, and the reasoning, since it is a judgement call:** nothing may
  exceed 120 s and no station may span more than a fivefold range. A timed
  station works while the player is elsewhere, so the wait is a *scheduling*
  cost — right up until it is long enough that they stop planning around it and
  start treating the station as somewhere to visit tomorrow. That is where the
  loop breaks, and it is around two minutes.
- **Open question for the owner:** the sawmill is marked instant, because the
  decision named only the kiln and the forge. But it is a water-driven machine
  that transforms material and works while you are away — every argument for
  timing the kiln applies to it. One word to change if the answer is yes.
- Content suite is **109 checks**; 406 green overall.
- [done] `src/content/tools.js` — `HARDNESS` per material and `TOOLS` with
  kind/tier/speed, plus `canCut`, `digSpeed` and `toolsThatCut`. This is what
  lane A was blocked on; their `digSpeedFor` reads it directly and the whole
  runner is green at 262.
- **I changed the recorded tier sketch, and it needed changing: it was
  circular.** It put iron in tier 2 with copper and tin, while the tier 2
  pickaxe had to be metal and tier 1 held no metal at all — you would have
  needed an iron pickaxe to mine the iron for an iron pickaxe. Iron is tier 1
  here, which is where `GAME_DESIGN.md` §6 always had it: the shallow band with
  coal, "fire, steel, tools". Everything else in the sketch stands.
- [done] The suite now **walks the entire game from bare hands** — what the
  tools reach, what that lets you build, what that lets you dig — and proves
  every tool, material and station is reachable with no circular tier. It is
  the one test that can catch this design being quietly broken.
- [done] `SURFACE_PICKUPS` in `items.js`. The bottom rung leans on something
  easy to miss: a stone pickaxe is made of rock, and rock is tier 1, so it
  works only because loose rock lies on the surface. **Lane C: if
  `gatherables.js` ever stops yielding rock the game is uncompletable in its
  first minute** — the reachability proof is what would catch it.
- [done] Stages 3 and 4 costed, because my own suffix rule refused to let the
  forge exist above an uncosted stage 3: sawmill and planks (stage 3), forge,
  iron and steel bars and the metal tool line (stage 4). The forge is built of
  planks, so stage 4 physically rests on stage 3.
- **The rule other lanes must not soften:** a better tool of a kind is FASTER,
  never DEEPER. A shovel's ceiling is tier 0 forever; an iron shovel is a better
  shovel, not a pickaxe. Three tests pin it.
- Content suite is **98 checks**; 262 green overall.
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

## Lane G — Testbed
- [done] **A test world, on the menu.** "Test world" builds a flat arena with
  every feature laid out along it: a block of all twenty diggable materials
  (granite in front of them as the one that never gives), a water pool and a
  lava pool in granite basins, a sand column on an earth plug that comes down
  when you undermine it, a dark tunnel to try the lamp in, a wall to scale with
  an overhang to hangle along, and a pile of chunks heavier than the pack.
  **It is not a mock**: the arena is written into the real landscape through
  `world.api.setMat` and hollowed out with `world.api.digFreeCircle`, and the
  pile is `items.api.spawnDrop`, so anything that behaves there behaves in the
  main world. The main world is untouched — nothing runs unless it is asked for.
- [done] **Entering it cannot cost you your save.** Core's save storage is
  wrapped while the arena is up: reads pass through, so "Continue" still finds
  the real game, and writes are refused, so autosave cannot overwrite a real run
  with an arena. A refused save reports the refusal rather than reporting
  success — verified live in the browser: `saveGame` returns the error, the
  stored bytes are unchanged, and `readSave` still returns the real save.
  Leaving is "Continue" or "New world", which regenerate the landscape and take
  the arena with it.
- **Two things the arena taught us, both worth other lanes' attention.**
  *An earth plug thinner than the dig radius is load-bearing design.* A thicker
  one gets hollowed through the middle and leaves an earth lintel — earth is not
  unstable, so it hangs there holding the sand up forever and the collapse
  silently never happens. *And darkness is a property of the ground line, not of
  depth*: a pixel is lit when it is above its column's surface, so the arena is
  built just above the highest ground in its span to be daylit throughout, and
  the one dark place had to be dug down below the natural ground to be dark at
  all. Anything built above the surface is unavoidably daylit.
- [done] **What's new (n, and a menu button), generated from git.** The deploy
  writes `changes.json` from the last 40 commit subjects; the panel renders them
  newest first, tagged by lane, and marks everything since the last look, with a
  count in the corner. **Never a hand-maintained list** — six chats commit all
  day and a hand-kept changelog is stale within the hour. Running locally there
  is no `changes.json` and the panel says "not a published build" rather than
  showing a stale copy. A first-ever look marks nothing new.
- [note] **`fetch-depth: 60` on the publish checkout matters.** The default
  checkout is one commit deep, so the changelog would have been a single line.
- [note for lane A] `src/ui/sandbox.js` is the one place outside `src/world/`
  that imports `materials.js`. `setMat(x,y,m)` is published but the material
  indices it takes are not, so there is no other way to place a named material.
  A `world.api.materials()` would close that gap; the import is read-only and
  leans only on the index constants that file already promises never to shift.
- [note] `tools/run-tests.js` is **263/263 green** with all of this applied, on
  top of lane C's `build.api` and lane A's tool gating.
- [note] The Lane G section above landed inside lane C's `3878020` rather than
  in one of my own commits — I had written it to `docs/STATUS.md` and they
  staged the file before I committed. Nobody's fault and nothing is lost, but it
  is worth knowing that `docs/STATUS.md` is the one file every lane writes, so
  whoever commits next carries everyone else's pending status text. The same
  race put a stale `src/systems.js` on disk under lane B for a few minutes: my
  edit had been written against a copy that predated their
  `createActor(world.api, items.api)`, so the working tree was quietly reverting
  it. **Build a shared file's commit content from `HEAD` plus your own lines,
  never from what happens to be on disk.**
- [next] A headless suite of its own (`tools/tests/sandbox.test.js`) if lane E
  will have one: the arena is currently proved by a scratch harness across five
  seeds rather than by anything in the runner.

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
