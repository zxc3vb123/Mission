# Mission — Status board

**Current milestone: M1 — Bare hands** (see `docs/GAME_DESIGN.md` §8)

Every lane keeps its own section up to date, one line per finished thing, newest
at the top. Read this before you start work; write to it before you commit.

> **Lane sections have moved to `docs/status/<lane>.md`.** One file per lane,
> so two chats writing their status no longer collide. This happened three
> times: a lane would edit its own section here, another lane would commit the
> file a second later, and the history would say the wrong person wrote it.
> Pathspec cannot fix that - it protects other FILES, not other lanes' hunks
> inside a file you share. A file each does.
>
> Write your progress in your own file. This page keeps the milestone, the
> release log and anything that is genuinely project-wide.

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
- [done] **Liquid can be drawn out of the world and poured back**, which unblocks
  lane C's buckets and every part of lane D's oil. `liquidAt`, `drawLiquid` and
  `pourLiquid`, the shape both lanes asked for. The intake reaches a fixed 12 px
  and never walks the body, so a pump costs the same in an ocean as in a puddle
  (200 draws: 2.5 ms deep pool against 2.9 ms shallow), and a well that has run
  out reports empty because nothing was in reach rather than because a counter
  said so. Poured liquid falls and finds its own level. Nothing is created or
  destroyed at the boundary — including liquid poured into somewhere already
  full, which comes back to the queue rather than evaporating.
- [done] **A deposit is somewhere, not everywhere.** Ore was spread evenly, so
  about 70% of columns had iron somewhere beneath them and a 4096 px map was
  functionally a hundred px wide — everything under your feet, and no distance
  for the haulage ladder to answer. Each material now occupies two fields about
  180 px across: iron is under 20% of columns and several hundred px away. The
  materials the first hours need keep one field near the spawn, because a long
  game is the goal and a bad opening hour is not; copper and below are allowed to
  be a journey, and are also 200–2000 px down regardless. Entirely inside
  `planWorld` — chunk generation is untouched and still a pure function of
  position. Ore presence is now asked of the plan rather than of a map sample,
  which is both correct in a clustered world and free.
- [done] **Tunnels cave in, and a prop holds them up.** A span rule on the width
  of the void: loose ground holds about 48 px of unsupported roof, stone about
  96, granite forever. It warns for roughly two seconds with dust falling from
  the roof before anything moves, so a player paying attention can get out or
  prop it. Only ground the player has cut is watched — a cave that has been there
  since the map was generated has already found its shape — which also keeps the
  cost at the working face instead of sweeping the map. A collapse moves material
  and never destroys it; the rubble lands and blocks the tunnel it fell into.
  Live, and fair from the first tunnel: lane F's `timber_prop` is stage 0 and one
  log, and the world registers any `props: true` building as a support by itself
  off `structure:placed` — so no lane has to remember to call anything, and
  nothing in `src/world/` imports `src/build/`. Verified end to end: 258 px of
  roof falls with no prop, none with one placed, and it falls again when the prop
  is taken out. `addSupport` stays published for lane D's machinery.
- [done] **Material can be put back: conservation of matter closes.** `dumpItem`
  and `dumpMaterial` turn dug ground back into terrain — one item returns exactly
  the pixels it cost to dig, with the fraction carried rather than rounded, so a
  hundred items dug and dumped leave the map with the ground it started with. It
  is poured, not placed: loose pixels that fall and tumble, so sand slumps and
  earth holds and the heap is one the physics agrees with. A pour with nowhere to
  go holds its load and reports it stalled — it never destroys it. Proven in a
  sealed granite room: 1964 px dug, 1937 poured back, 27 px short, which is under
  one item's worth still held in the dig accumulator.
  **Needs lane C to route placement through `dumpItem`** (`docs/REQUESTS.md`) —
  the owner's "place dirt, build a small hill" does nothing until then.
- [done] **The cost of darkness no longer follows the size of the window.**
  Owner reported lag; core's profiler put 48% of all draw time in
  `renderLight`, whose grid was view-pixels/4 per axis — so a big monitor paid
  4x. The light field now picks the finest cell that keeps the whole view inside
  a fixed cell budget, and coarsens a pixel at a time above it, with one blur
  pass and half the rays once coarse. At 2560x1440 that is 1.58 ms -> 0.87, at
  3440x1440 2.70 -> 0.84. It also fixes a real bug: the old code clamped the grid
  size without touching the cell, so past its limit the darkness overlay covered
  less world than the view and simply stopped part way across the screen.
- [done] **Less is loaded from far away**, which is what the owner asked for.
  `KEEP_MARGIN` is one chunk past the view rather than two: 84 resident chunks
  down to 58 at 1920x1080, with the live canvases and blits that go with them.
  The simulated band is still wider than the visible one, deliberately — liquids
  that stopped settling just off screen would be a worse bug than the lag.
- [done] **Chunk painting no longer lands in one frame.** A chunk arriving off
  screen is queued for the repaint budget instead of having its 16 tiles painted
  at once; only a chunk already in view is painted immediately, because an
  unpainted chunk in view is a hole. Walking at 1920x1080: median frame 2.0 ms,
  p99 13.8, and zero frames over 33 ms across 900, where before there were 21.
  None of this touches gameplay.
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
- [done] Settled the place-and-dig fix on lane C's `build:ghost` claim rather
  than my own latch, after we both fixed it within minutes of each other. Theirs
  is the better contract: it is a named fact owned by the lane that knows the
  answer, it does not depend on `build:refused` continuing to fire, and it also
  covers arming a ghost while the button is already held, which mine did not.
  Lane C removes `claimingClicks()`'s only alternative; I consume the event.
- [was] One click, one action. A left click both placed a building and dug,
  so putting a campfire down took a bite out of the ground under it — and a
  building needs solid footing, so it could knock out the support of the thing
  you had just placed. The swing is now suppressed for any click that placed or
  was refused a building, until the button comes up. Note for anyone tempted by
  the obvious version: checking `ghostDef()` does **not** work, because placing
  clears the ghost in the input event, before this lane ticks — by the time the
  swing is chosen there is no ghost left to see. The latch is on the placement,
  which is what is still true afterwards. The keyboard dig is untouched, since
  it never places anything. Fixed entirely on the bus; no new cross-lane wiring.
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
- [done] **Deconstruction — a misplaced building is no longer a trap.** Take one
  down on purpose in half its build time, change your mind partway, and get the
  materials back as chunks on the ground (not into the pack: a workbench is
  104 kg and the pack holds 35, so hauling pressure survives).
  - **How much comes back is per-material, not a flat fraction**, and that is
    the lever lane F is handed: `recover: 0..1` on an item, defaulting to 1.
    The shape encodes *why* something is lost instead of taxing the player — a
    fired brick prised out of a wall is still a brick, while quicklime slaked
    into mortar is chemically part of that wall. Nothing sets it yet, so
    deconstruction returns everything today.
  - Anything a building is merely *holding* comes back whole regardless — a
    job's inputs, an uncollected output, and the share of a half-built structure
    that was never worked in. None of it was ever built into the walls.
  - `wouldReturn(x, y)` answers "what do I get back" before the player commits.
- [done] **Ladders — you can get out of the hole you dug.** The owner asked for
  climbing infrastructure by name, and the problem arrives in the first ten
  minutes: you dig straight down and are stuck. Climbing a wall is a skill;
  climbing a shaft you dug yourself is something you build.
  - **Support now has kinds.** A ladder is fixed to the *wall* of the shaft, not
    stood on the floor, so `support.wall` joins `support.ground`, and
    `support.anchor: "above"` hangs a rope ladder from something solid overhead
    or from another section it extends. Wall-fixed and hanging things are placed
    **where you point**, because a ladder dropped to the bottom of the shaft
    would be at exactly the wrong end of it.
  - Dig the wall out from behind one and it comes down like anything else, and
    its wood comes back.
  - **Lane B: `build.api.climbableAt(x, y)`** returns the ladder or null. That is
    the whole contact test; nothing else is needed from me.
  - No building data was invented here — lane F named both entries from the
    shape I asked for, and acted on the balance flag I raised: a section is one
    body height at wood 1 + rope 1, where my own suggested wood 2 would have
    made climbing out of a shaft cost four backpack trips.
  - `canCraft` also returns `overBy` in kg on a mass refusal now, so the UI can
    say "0.3 kg too heavy" in its own words. Asked for by the UI lane.
- **Lane F: the sawmill CAN be `processing: true` whenever you want it.** You
  reverted it believing my code did not drive that path; it does — `isTimed()`
  reads your flag and I moved the plank flow onto the job path the same hour it
  first landed. Nothing here blocks it, and the suite is green either way.
- [done] Work in flight survives a save. Three kinds of structure state arrived
  after the save hook was written — a station's job, a deconstruction under way,
  and a ladder held up by a wall rather than the ground. A save that quietly
  forgot any of them would eat the player's materials, so each is now pinned,
  including that a restored job actually *finishes* rather than merely looking
  right. It already worked; now it cannot stop working unnoticed.
- [done] Both parked numbers handed over and now read from lane F. The scatter
  (density, per-kind weights and clumps, regrowth) lives in
  `src/content/scatter.js`, and deconstruction time comes from
  `deconstructTime(id)` — a fraction of the build rather than a number per
  building, so it stays right while they tune. There is no second copy of
  either left in this lane, in the code or in the tests.
- [fixed] **A click is either the build menu's or the shovel's, never both.**
  Reported by lane E: with a ghost armed, one press both placed a building and
  dug — lane B swings while the mouse is held and cannot see the ghost. Worse
  than it sounds, because a building needs its footing and could lose it to the
  very click that placed it.
  The fix is a fact announced rather than a lane reaching into another: I emit
  `build:ghost { active }`, and lane B skips its swing while it is true. **The
  part that matters is that the claim OUTLIVES the ghost** — the ghost is spent
  on the click, so a flag that cleared with it would let the still-held button
  dig on the very next tick. It stays true until the button is released.
  `build.api.claimingClicks()` for anyone who would rather poll.
- [done] **Building out of pieces — a house is the player's shape, not mine.**
  Owner: "build planks, solid straight objects, place them on a brick
  foundation, to make a house." Prefabs are untouched; a forge should never be
  something you assemble plank by plank.
  - **The span rule, which is the whole design question.** Something directly
    beneath you — ground or another structure — is span 0; held only from the
    side you are your neighbour's span **+1**; past `MAX_SPAN` nothing holds you.
    So a column is free and an overhang is a ledge (3 planks, 72px at lane F's
    number) rather than a floating platform, and a long floor has to be propped.
    **"Put a post there" is something a player works out by building.** Lane E
    asked me to set this deliberately rather than let it fall out of whichever
    rule made a test pass; this is that decision.
  - Pieces rotate 90°, so one plank def is both a beam and a post — lane F's
    call, and right: two ids for one object is drift waiting to happen.
  - Pull the post out and the whole deck comes down, and **every plank comes
    back** — five of five in the test, none deleted.
  - A wall-fixed thing is the deliberate exception: only a wall holds a ladder,
    never the section below it, or digging out the rock behind a run would leave
    them hanging in the shaft.
- [done] **Pieces snap flush, so a house is forty rough aims rather than forty
  careful ones.** Lane F costed a house at 148 kg and rightly pointed out that
  the figure prices the materials and says nothing about the aiming — a real
  cost in nobody's table. This is that cost, removed rather than repriced:
  making planks cheaper would never have made aiming easier.
  A piece lines up with a neighbour's edges within 8px, on each axis
  independently. Two rules keep it honest: a snap is discarded if it would
  overlap or bury the piece, so it can never move you somewhere you could not
  build; and **aligning beats being near**, or the untouched cursor position
  wins at distance zero and nothing ever snaps. Away from everything the aim is
  obeyed exactly.
- [fixed] **Recovery could silently destroy a house.** Found by lane F: I floored
  the recovered amount, so any single-unit piece priced below 1 returned
  *nothing* — and a house is hundreds of one-plank pieces, so dismantling one
  handed back an empty pack and looked exactly like a physics bug. They repriced
  plank to 1, which fixed the case; I fixed the shape, so a rate above 0 now
  always returns at least one. Only a rate of exactly 0 means gone.
- [done] **You can put the ground back.** The owner asked to "place dirt, build
  a small hill with that, same with sand". Lane A's `dumpItem` was finished,
  tested and live, and nothing called it — so the feature existed and could not
  be seen. It is called now: dropping soil, sand, clay or gravel pours it into
  the world as real terrain that settles by the normal rules, and
  `items.api.pour(id,n,x,y)` puts it at a chosen spot.
  - **Only what hands can dig back out is poured.** Ore and rock are thrown as
    chunks instead. Not squeamishness — lane A's call would take them happily —
    but turning a pack of iron ore into ore-bearing rock that now needs a
    pickaxe would be a trap, and a player drops ore to lighten their load, not
    to bury it. The line sits where recovery stops being free, and it draws
    itself from the tier table rather than from a list somebody maintains.
  - A pour costs the pack, or the backpack is an infinite quarry and carts have
    no reason to exist.
  - Lane A almost never refuses — they take the load and queue it — so the
    honest signal is "not yet", not "no": `pour:stalled` carries their stalled
    count, which is what a heap grown into a ceiling looks like.
- [fixed] **Three finished features no player could reach — found by auditing my
  own APIs against the new call-site rule.** `grep` for every name this lane
  publishes, outside my own folders, and the zeroes told the story:
  - **`deconstruct` had no caller**, so a misplaced building was still permanent
    in play — which is the entire thing deconstruction was built to fix.
  - **`rotateGhost` had no caller**, so a beam could never stand on end, which is
    half the house feature.
  - **`storageAt` has no caller**, so a chest still cannot be opened. That one
    needs a screen and is the UI lane's; told them with the exact call.
  Rotation and deconstruction are world actions on state this lane owns, so
  they are bound here rather than waiting: `t` turns the armed piece, `delete`
  takes down what the cursor is on and calls it off if pressed again. The UI
  lane may move either into a screen and I will drop the bindings.
  Also found while wiring it: **deconstruct had no reach check**, so a building
  could be taken apart from across the map. It now uses the same reach that
  governs putting one up.
- [done] **A station eats its own pile — the seam lane D plugs into.** A cart
  could already unload ore into a forge and the forge could not use it, because
  crafting took from the player's back. A delivered heap was scenery, which is
  the difference between automation and a shorter walk.
  - **The store is preferred, deliberately.** The other way round is backwards:
    a player standing at a forge with two iron in hand would burn their own
    while forty sat in the hopper, so automation would only ever engage when
    nobody was there to benefit from it. A smith feeds the fire from the pile
    beside them. Mixed draws are honest — one off the heap and three off your
    back is what happens when the heap runs short, and the verdict reports the
    split as `fromStore` / `fromPack`.
  - A shortfall counts hopper and pack **together**, so "missing 4 wood" is true
    of the situation rather than of one container.
  - **A station still does not start work on its own**, and that is a decision
    rather than an omission. A forge that keeps smelting while carts arrive is a
    production line — a far larger design step, and it should be chosen rather
    than arrive by accident. There is a test asserting a full hopper sits there.
- [fixed] **My rotate key collided with the sandbox's, and neither of my keys
  was discoverable.** Found by re-running the API audit. Two faults, one mine:
  `t` was already `KEY_MASTER` in the test world — the one place somebody is
  most likely to be testing building — so a press did two things at once. It is
  `z` now. And `src/ui/keys.js` says plainly that a key bound where the book
  cannot print it is a key no player will ever find; mine were on `build.api`,
  which that table does not read. Both are published as `rotateKey`/`removeKey`
  so it can, the same way it already reads `dropKey` and `grabKey`.
  The audit's own blind spot is worth recording: `deconstruct` and `rotateGhost`
  read as zero-consumer because the callers are my own key handlers, inside my
  folder. "No other lane calls it" and "no player can reach it" are different
  questions and the grep only answers the first.
- [blocked] **Placed light sources — the last unchecked item in my M3 brief.**
  A campfire is described in lane F's own table as "a pool of light that does
  not burn out like a torch", and it emits nothing. Needs lane A's planned
  `addLightSource(id, {x,y,r,power})`; requested, not urgent, and I pick it up
  the day it exists. A lamp you can put *down* is the difference between
  exploring a shaft and holding a torch in the hand you wanted to dig with.
- [blocked] Buckets need `drawLiquid` / `pourLiquid` from lane A. Requested as a
  placeholder rather than a nudge — lane E asked me not to push it ahead of
  timbering and cave-ins, which the owner asked for by name.
- [next] Open. Everything on the M1–M3 brief is done except the two blocked
  items above; ask if something has become more urgent.
- Rock must never stop being gatherable by hand: a stone pickaxe is made of
  rock and rock needs a pickaxe to dig, so loose surface rock is the only thing
  breaking that deadlock. Now pinned by a named check in the items suite, since
  nothing else in the codebase would notice if it stopped.
- 186 items checks and 45 build checks green; 532 in the runner.

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
- [done] **Took the measurement I said was blocking my own conclusion, and it
  discharged my own caveat against me.** I claimed the 13-minute time-to-tier
  model was missing "finding and descending", plausibly the bulk of real play.
  Measured across five seeds from the real spawn: clay is 22 px away and 249 px
  down, iron 115 px and 356 px. Round trips are 14-22 s against the 8 s I
  assumed. **Travel is not the missing time. The early game genuinely is thin.**
- **THE FINDING, and it is bigger than pacing.** Sampling columns across the
  whole map: 87% have clay beneath them, 82% coal, 77% iron, 64% copper. **You
  can dig straight down almost anywhere and hit everything.** The ore bands are
  uniform horizontally, so a 4096 px world is functionally about a hundred
  pixels wide, and there is never a reason to go anywhere.
- **Consequence for this lane: my haulage ladder is priced for distances the
  world never asks for.** Wheelbarrow, wagon, rail and conveyor all answer "this
  is far away", and nothing is far away. `GAME_DESIGN.md` says rails and distant
  oil fields "only mean something if the map is bigger than a ten minute walk" —
  by that test the map is not one, whatever its pixel count.
- **And it kills the obvious pacing lever:** with deposits this close, four more
  backpack trips costs about eighty seconds, so raising material costs cannot
  slow the early game. The lever is horizontal scarcity in generation — lane A's,
  not a number I own. A deposit should be *somewhere*, not everywhere.
- [done] **Documented the systems that landed while the book was not looking.**
  The owner's most repeated complaint all session has been not knowing what the
  game contains, and three things were already built and undescribed. Book is
  now **22 live, 2 planned** (hauling, survival — both genuinely unbuilt).
  - `spoil` rewritten and flipped live: material is **poured**, not placed —
    it falls as loose grains and tumbles, so a heap is one the world agrees
    with. Backfill a shaft, ramp a slope, bury a lava pool, raise new ground.
  - `house` flipped live — felling has been wired all along.
  - New `cave-ins` page: what the dust means, and that you have seconds.
- **My probes were testing NAMES, not outcomes, and one was a name I guessed
  at.** `house` probed `typeof actor.chop === "function"` — an API that never
  existed — so it reported "planned" while chopping worked perfectly. `spoil`
  probed that `dumpMaterial` exists, which it did long before it did anything.
  Both are outcomes now: fell a tree and see whether wood appears; pour earth
  and count whether the ground gained it. **A name probe fails silently when
  the name is wrong; an outcome probe cannot.**
- [done] **`timber_prop`** — stage 0, one log, hand-built. Cave-ins are live
  and loose ground holds only 26 px of unsupported roof, but until now the
  earliest thing that could prop one was the plank beam, **three stages after
  the first tunnel**. A hazard the player cannot answer is not difficulty, it
  is a wall. `plank_beam` is flagged `props` too — the sawn timber is the
  later, better prop. New guard: something to prop with must exist at stage 0.
- [done] Search handles plurals. "how do i stop collapses" returned the **lava**
  page, because the plural matched no keyword and lava's body contains the word
  "stop". Singular and plural now match both ways.
- Content suite is **145 checks**.
- [done] **Time-to-tier, the last unstarted item in my brief.** Modelled from
  the tables: **~13 minutes from bare hands to a standing forge**, of which only
  17% is hauling. That is too fast for the thing PROGRESSION calls the hinge of
  the game, and station waits rather than movement are the largest line.
  **I have not retuned on it**, because the model excludes finding deposits and
  descending to them — climbing is half walk speed and shafts are deep — and
  those are plausibly the bulk of real play. They are lane A's world size and
  lane B's climb speed. Retuning against a model missing its largest terms is
  the mistake I keep warning other people about.
- **Measured, and it surprised me: a tree falls in 4.6 s and yields ~50 logs.**
  Wood is not scarce at the stump — only expensive to move. That is the design
  working, but it means "gather wood" is never the bottleneck the stage 0 chain
  implies, and it is worth knowing before anyone prices a wood sink.
- [done] **`iron_axe`.** The axe line dead-ended at stone while every shovel and
  pickaxe tiered up — not a decision, just a line nobody revisited. It was
  invisible because lane A's `chopSpeedFor` silently returns 0 for a tool id
  that does not exist, so an iron axe simply could not chop. Defining it made it
  work immediately: **4.6 s → 2.4 s per tree.** New guard: no tool line may
  dead-end at its first tier, and every upgrade must genuinely be faster.
- Content suite is **142 checks**.
- [done] The rounding trap **generalised beyond pieces**, on lane E's point that
  anything placed in quantity is made of one-unit costs. It immediately found a
  live case I had shipped: **the ladder lost all its rope** (1 rope at 0.75
  floors to nothing), so moving a ladder run silently destroyed every rope in
  it. `rope.recover` is now 1 — a lashing is untied, not cut. The guard now
  covers everything `piece` or `climb`, and separately *reports* deliberate
  total losses on one-off stations so the forge's quicklime stays a choice
  somebody made rather than one nobody noticed.
- [done] Reference page **`house`**, with the keywords I owed lane C for
  discoverability — "post", "wall", "beam", "rotate" all land on it now. Marked
  planned, and the probe is precise about why: lane C's placement already
  handles pieces and rotation, but `chopAt` is published and unwired, so there
  is no wood, so there are no planks. The probe tests both halves of felling
  and will report the moment lane B connects it.
- **Fixing that page's keywords tripped my own search guard**, correctly:
  "wall" was ranking by badge rather than by writing. Removed the bare "wall"
  from `digging` — an obstacle is already found by "cant dig", "rock", "hard",
  "blocked" — so "wall" now means the thing you build, on merit either way.
- Content suite is **140 checks**; green on a clean tree via `tools/verify.js`.
- [done] **Building pieces** for lane C's house mode: `brick_foundation`
  (stage 2), `plank_beam` and `plank_floor` (stage 3), all `piece: true` and
  hand-built on site. **`MAX_SPAN = 3`** — an overhang reaches 72 px, a floor
  posted at both ends spans 168 px. That gap is the whole lesson and it is what
  a player infers from the world rather than reads in a table.
- **A station's cost is a decision; a piece's cost is a multiplier.** Nobody
  agonises over one workbench, but a house is forty-odd pieces, so a per-piece
  price is a per-house price with a factor of forty on it. Priced deliberately
  cheap per unit: a modest house is 148 kg to site and 36 planks, which is
  about one kiln — a project, not a chore, and not so dear nobody builds one.
- **The trap this found, and it would have shipped invisibly:** recovery uses
  `Math.floor`, so a piece costing ONE unit of anything with a rate below 1
  returns **nothing**. A house is hundreds of one-plank pieces, so dismantling
  one would have evaporated it entirely. `plank.recover` is now 1 — sawn timber
  is nailed rather than mortared, which is why old barns get dismantled and
  re-erected. There is a test that every piece returns every material it cost.
- One entry for beam-and-post rather than two, because they are mechanically
  one rotated rectangle and two ids for one object is drift waiting to happen.
- Content suite is **138 checks**.
- [done] **Fuel economy.** Measured first, and the measurement found two holes
  rather than a tuning job.
  - **Firing cost nothing.** Every kiln recipe consumed clay, limestone or sand
    and no fuel whatsoever — bricks came out of a fire that burned nothing. They
    take wood now, which is a real change to stage 2 haulage.
  - **Coal had exactly one sink in the entire game** (`steel_bar`), three stages
    after it is first dug — while my own item table claimed it was "kiln and
    forge fuel". A coal-fired iron bar now exists: one coal does the work of two
    charcoal and skips the kiln, cutting an iron bar from 56 kg to 31 kg, two
    backpack trips to one. Coal's `stage` corrected 2 → 4 to match when it
    actually starts mattering.
- **`FUELS` table** with `heat`, `smelting` and `clean`. `smelting` matters more
  than `heat`: no quantity of wood melts iron, so charcoal is a step rather than
  a nicety. `clean` is what stops coal retiring the kiln — steel needs clean
  heat, so charcoal stays required for the rest of the game.
- **For lane D:** an iron smelt is four heat over thirty seconds, so a machine
  burning one coal every thirty seconds is one forge's load. Price the boiler
  from that anchor and stage 5 inherits numbers rather than inventing them —
  same bet as the haulage ladder.
- Fuel is now **34–79% of the raw mass** behind a finished tool, which is what
  "a logistics problem rather than a formality" has to mean in practice.
- Content suite is **131 checks**; 548 green overall.
- [done] **`src/content/scatter.js`** — the surface scatter numbers taken over
  from lane C's `gatherables.js`, at their request. **This closes a real split,
  not a tidiness one:** `items.js` declares `SURFACE_PICKUPS` and my
  reachability proof leans on it — a stone pickaxe is made of rock, rock is
  tier 1, tier 1 needs a stone pickaxe, and the only thing saving that from
  deadlock is loose rock on the ground. The number making that true lived in a
  mechanics file, so the proof asserted something another lane could falsify by
  tuning a weight to zero, with nothing to catch it. Declaration and number now
  live together and the suite checks they agree.
  **LANE C: import from here and the two can never drift again.**
- [done] Tests that came with it: no single pickup may take a fifth of the pack
  in one step (the rock-clump bug, pinned), and the whole stage 0 chain must be
  gatherable in a walk — currently ~873 px, dominated by sticks.
- [done] `deconstructTime()` — lane C's outstanding request. **60% of build
  time**, as a fraction rather than a number per building so it stays right as
  I tune. Prying apart is quicker than seating and mortaring; not instant,
  because a free undo deletes the decision placement is meant to be; and not
  longer, because the real cost of moving a building is already the material it
  does not return. The mass is the cost, the time is the friction — charging
  both heavily is the trap the metal chain fell into.
- **Verified lane C's pack fix rather than assuming:** rock is clump 1 at 5.0 kg
  = 14% of a pack, down from 29%. My diagnosis held and no content number moved.
- [done] `processing: true` restored on the sawmill, so the owner's "sawmill is
  timed" ruling is now actually implemented rather than only recorded. Lane C
  corrected me: their `isTimed()` reads the flag and nothing else, and the
  comment I had reasoned from was describing a fallback list from before the
  field existed. Verified against the full suite rather than taken on trust —
  514 green. Planks are now work the mill does while you are elsewhere, and its
  output waits inside it until you walk in, which is what `storage` is for.
- [fixed] I broke lane C's suite with the ladder commit and put it back the
  same pass. Two causes, both the same mistake — **overriding another lane's
  spec on a field that belongs to their mechanic, not my balance**:
  - `processing: true` on the sawmill turned planks from player work into
    station work, and lane C's production flow does not drive that path yet.
    The owner's ruling does imply the flag, so the reasoning is recorded in
    `buildings.js` and it lands the day lane C is ready — half-implementing a
    ruling is worse than recording it.
  - ladder `h: 16` where lane C asked for `h: 12`. Height is stacking geometry
    and theirs; cost and stage are mine. Their spec restored, my numbers kept.
- Boundary worth holding to: when another lane specifies a field their code
  reads, follow it. My authority is what things cost and when they arrive.
- [done] **Ladders**, to lane C's requested shape rather than mine. `ladder`
  (wall-fixed, stage 0, hand-built) and `rope_ladder` (hangs from above, stage
  1). New fields they asked for: `support.wall`, `support.anchor`, `climb`,
  `processing`, `storage`.
- **Lane C flagged wood 2 per section as possibly miserable and they were
  right.** At two logs a rung, climbing out of an ordinary shaft cost four
  backpack trips — the fix for being stuck was more expensive than the mistake.
  It is `wood 1 + rope 1`, one section per body height, so **one backpack is
  four body-heights of ladder**. Stage 0 and hand-built on purpose: the problem
  arrives in the first ten minutes, and gating it behind a workbench would be
  answering a question the player has already given up on.
- [done] `recover: 0..1` per item, lane C's other outstanding request.
  The principle is **you recover the bulk and lose the worked value**: stacked
  stone and untouched timber come back whole, mortar is simply gone. That
  produces the right curve on its own — campfire, workbench, kiln and sawmill
  ~100%, the forge 50%. Early mistakes are free while you are learning where
  things go; the one real commitment costs materials to move.
- [done] "Nothing floats" now means *declares some support*, not *stands on
  ground*. A ladder is held by the wall and a rope ladder hangs from above;
  both are supported, neither stands on anything. Climbable things must be
  wall-fixed or hung, or they are furniture rather than a way up.
- [done] Reference book: the `stations` page rewritten to teach **raising** a
  building — you place it, it rises over time, its recipes unlock when it is
  finished — because the owner did not know placement existed. New
  `deconstruct` page, also live and undiscovered, quoting real recovery rates.
- Content suite is **114 checks**.
- [done] Search ranking settled: **"cant dig rock" returns the digging page**,
  with tools right behind it. The fix was content, not weighting — the digging
  page stated the problem ("rock does not yield, and no patience changes that")
  and never said what *does* open it, so ranking it first would have sent a
  stuck player to a page that confirms they are stuck. It now names the pickaxe.
- **A test of mine had been passing for the wrong reason.** I pinned that query
  after catching it pre-ship, but the pin only held because `tools` was marked
  planned and demoted; when tools went live the order inverted and the guard
  never noticed. `searchReference(q, {ignoreStatus:true})` now exists so the
  suite can check every ranking on the merits of the writing alone, and the
  guard scans **every keyword in the book** (199 queries) rather than a chosen
  handful — a sample would have missed the one query that broke. Verified by
  recreating the original bug: it fails.
- Content suite is **113 checks**; 473 green overall.
- [done] The reference book's `status` field is now **probed against the running
  game** instead of hand-maintained. `stations`, `tools` and `stages` had all
  quietly come true — placement, the tier gate and stage tracking shipped while
  the book still said they were missing. The book was telling players that
  mechanics in their hands did not exist, which is the failure the field exists
  to prevent, pointed the other way and harder to spot. Now **18 live, 3
  planned** (spoil, hauling, survival), and all six probeable pages are probed.
- **The asymmetry is deliberate:** claiming live when the probe says unbuilt
  FAILS (only I can cause that, and it misleads the player); claiming planned
  when the probe says built REPORTS (another lane shipping must not redden main
  for me). Same reasoning as `PENDING_YIELD`, applied properly this time.
- [done] Sawmill is **timed**, per the owner's ruling, and briefly — sawing is a
  quick conversion, so planks are the fastest timed recipe in the game.
- **Search follows status**, so flipping `tools` to live changed what wins
  "cant dig rock" — it is now the tools page, which is the actionable answer.
- **Lane E / UI:** `tools/tests/ui.test.js:268` still asserts that query returns
  `digging` first. That expectation is now stale for the same reason mine were.
  It is one word and it is yours; I have not touched it.
- Content suite is **111 checks**; 470 of 471 green (the one red is the UI
  assertion above).
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
- [done] **MASTER MODE (T), and the arena now has everything in it.** From the
  owner's playtest: "all items available, ladders and sawmills pre-made, see
  how they function".
  - **Master mode** is a flat searchable list of every item and building, and
    a click puts one in the pack. **Every row comes out of a registry** —
    `ITEM_IDS`, `BUILDING_IDS`, `TOOL_IDS` — so the 43 items and 8 buildings
    are whatever the lanes have landed today, not a list I typed. It uses
    `inventory.add()`, so a full pack refuses and says so, and the carry limit
    is overridden by a button labelled as an override rather than being
    quietly absent. It is a debug tool and looks like one: the real pack
    screen is lane H's and is not reimplemented here.
  - **Scoped to the test world on purpose.** Handing out a titanium pickaxe in
    a real save is a cheat that autosave then makes permanent. In here the
    save is already protected, so it cannot cost anything. It registers as a
    screen while the arena is up, so the menu bar offers it like any other.
  - **Every station stands, built and finished**: campfire, workbench, chest,
    kiln, sawmill, forge — all through the real `build.api.place()`, so they
    cost real materials and obey real support and `buildsAt` rules. The
    workbench goes up first because four of the others refuse without one
    within `STATION_R`. The rise is skipped and a label says so, since the
    timing is worth watching somewhere that is not a fixture.
  - **Ladders, on walls, where the cursor points.** The tower has a wall
    laddered top to bottom with eight rigid sections, a rope ladder hung from
    a beam, and **one wall left bare** to place your own. Verified live: the
    bare wall accepts a ladder, and mid-air refuses with "needs a wall to fix
    it to".
  - **The material row is in tool-tier order**, tier gap and label per tier,
    read from lane F's table keyed by lane A's material names. Walk it left to
    right with a shovel, a stone pickaxe and an iron pickaxe out of master
    mode and the tools run out under you. Granite last, as the one that never
    yields. Oil joins water and lava, all three contained in granite basins.
- **The ladder tower is above the surface, and that is not laziness.** A real
  dug shaft is the honest fixture and you cannot see a thing in it: below the
  natural ground line everything is dark, which is exactly why the dark tunnel
  works. The tower is a slot in a raised granite block instead — two vertical
  walls, a floor, and lit, so the ladders are visible while you climb them.
- [note] `place()` measures reach from `state.player`, which lane B publishes
  from the clonk once a tick. Moving the clonk and placing in the same frame
  judges every placement against where the player *used to be*. The arena
  moves the clonk and then lets the actor system publish the move before
  placing. Worth knowing for anyone else scripting placement.
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

## Lane H — UI

- [done] **Cancelling a ghost no longer craters the ground you were about to
  build on.** Right mouse was bound in two of this lane's files at once —
  `hud.js` fired the blast tool, `build.js` put the ghost away — so taking back
  a misplaced building also blew a hole in the site. Neither file was wrong on
  its own, which is exactly why no test caught it. The fix is not "each handler
  checks the other", because then the outcome depends on which listener the bus
  happens to call first: there is now **one** right-button handler in `src/ui`,
  it asks `build.js` through `ghostArmed()` / `cancelGhost()`, and the suite
  fails if a second file in this folder ever binds button 2. Cancelling beats
  blasting, because a real player action beats an engine test tool.
  **And the blast is now off unless you switch it on in Settings** — it craters
  the world permanently on one click, which was harmless while right mouse
  meant nothing else and is a trap now that it is the universal "no". Verified
  in the running game by counting solid pixels: with the tool switched on and a
  ghost armed, a right click cancels and the ground is untouched.
  `docs/ARCHITECTURE.md` §4a updated from CONTENDED to resolved.

- [done] **A menu bar, and placement finally has a way in.** Owner: "make a menu
  bar, see all keybinds clearly, can open all windows, full managing page with
  mouseclick to open things." Every window is now a button along the top with
  its key printed beside it, so the mouse opens everything and the keyboard is
  taught by using it. **The bar is drawn from the screen registry, not from a
  list in the bar.** That is the whole design: twice this project shipped a
  finished system no player could reach — the guidebook, and then placement,
  which had a working ghost, reach, rising build, refusal reasons and
  deconstruction and *no key at all*. A hand-written row of buttons would have
  had the same hole, because somebody has to remember to add to it. Registering
  a screen is what puts it on the bar, and the suite fails if a screen
  registers without the label and key the bar needs.
- [done] **The build menu (`b`).** Every building, what it costs against what
  you are carrying, the kilograms and how many backpack trips that is, and what
  it unlocks. Clicking a row arms lane C's ghost and closes the menu so you can
  click the world. This screen places nothing itself — the click, the verdict
  and the materials were all already lane C's and already worked. Four things
  that only make sense if somebody tells you, so it tells you: the ghost's
  refusal reason is printed **at the cursor** (a red box with no words is a
  mystery that gets reported as a bug), anything mid-build shows a named
  progress bar saying **"not usable until it is finished"** (place a workbench,
  open crafting, be told you have no workbench — the likeliest false bug report
  in the game), the header states the reach in pixels because "too far away"
  reads as broken otherwise, and ladders say they go **where the cursor points**
  rather than dropping to the floor.

- [done] **The book stopped telling you to stand a ladder on the floor.** Lane F
  added `ladder` and `rope_ladder`, which carry `support.wall` and
  `support.anchor` instead of `support.ground`; the building page had been
  printing "and it needs solid ground under it" for everything, which would have
  been wrong in the most misleading possible place. `supportLine()` branches on
  what the support record actually says, states the real fraction where there is
  one ("solid ground under at least 80% of its width"), and falls through to a
  truthful "nothing underneath it" for a support shape nobody has anticipated,
  rather than to a confident wrong answer. Climbable buildings say so. Checked
  against every building in the table, so the next unusual one fails here
  instead of misinforming a player.
- [done] A "no room in your pack" refusal names the number: lane C publishes
  `overBy` in kilograms, so the row says "0.3 kg too heavy - drop something
  first" rather than a mood. Nothing parses anyone's prose.

- [done] **A searchable guidebook that says what is real (`g`).** Replaces the
  stage-guide panel and the hand-written key list. One screen holding all 21 of
  lane F's reference pages, every recipe, every building, the "what to do next"
  guide read against your actual pockets, and every key. Search is forgiving on
  purpose — `searchReference()` ranks the pages (that ranking is lane F's and
  this side does not re-sort it), and recipes, buildings and the keys page are
  ranked here because they are rendered from the tables rather than written as
  pages. **Every entry carries a state and the not-live ones are greyed and
  badged** wherever they appear: `live`, `planned` (lane F's own flag, or a
  system that does not exist), and `locked` — built, but nothing in the game can
  supply what it needs. `locked` is computed, not declared: `reachability()`
  seeds from what the world yields and closes over recipes and buildings until
  nothing new becomes makeable, so it moves on its own as lanes land things and
  nobody has to remember to update it. A header line counts it up, which is the
  literal answer to "I cannot tell what is in the game".
- [done] **The pack and crafting in one screen (`i`, or `c` for the craft
  side).** The hotbar shows eight slots and a pack holds more kinds than that,
  so the owner could not see what they were carrying. Left: every stack, its
  mass, what one weighs, its share of the load, and the total against capacity.
  Right: the crafting list, so you can see what you have while choosing what to
  make. **Throwing things out** is on every row (`drop 1 / 10 / all`) and goes
  through lane C's `items.drop(id, n)` — this screen never calls
  `inventory.take()` itself, because taking without spawning a chunk destroys
  matter, and it reports drop()'s return rather than the number it asked for.
- [done] **Key bindings are generated, not written down.** `src/ui/keys.js` is
  the one table; the screens here bind from its constants, lane C's drop/grab
  keys and hotbar size are read off `items.api` at run time, and lane A's and
  lane B's keys — which live inside their own loops and are not importable —
  are checked against their source files by the test suite, so a rename over
  there fails here instead of quietly making the book lie. A second check goes
  the other way: a key bound on a screen but missing from the table fails,
  because the book is now the only place keys are written down.
- [done] **The screens react instead of polling.** The owner's word was
  "laggy": the hotbar, the load bar and the crafting list all redrew on
  `state.tick % 6`, which at a fixed 36 Hz left an input unacknowledged for a
  sixth of a second. They now redraw on `inv:changed`, `item:equipped`,
  `item:dropped`, `craft:done`, `job:started` and key presses. The slow sweep
  that remains is a backstop for the one thing nobody announces — a lane moving
  the pack's capacity directly — and nothing the player *did* waits for it.
- [done] **The screen in front of you closes first.** `src/ui/screens.js` is a
  small stack the menu asks before pausing, so escape shuts the book rather
  than shutting the book *and* opening the pause menu. The guidebook also eats
  the movement keys while it is open, or searching for "sand" walks the clonk
  off whatever it is standing on.
- [done] **Timed stations do not get a false "made X".** A kiln or a forge
  returns started-not-finished with an empty output, so the row shows a
  progress bar and the seconds left, and the real "made X" comes from
  `craft:done` whenever that arrives. A busy station is reported as busy rather
  than as a missing station — telling a player standing at their kiln to go and
  build a kiln is the wrong advice. A station buried mid-job now says what fell
  out of it, so nobody re-mines iron they still have.
- [done] `tools/tests/ui.test.js` registered in the runner — 45 checks over the
  key table, the pack lines and the book's index, search and live/planned
  split. The screens need a DOM and there is none headless, so every one of
  those is exported as a plain function from the module that draws it: the
  thing under test is the thing that ships.
- [done] **Every screen has a close X.** A screen that can only be shut by
  remembering which key opened it is a trap. The key still works and the footer
  still names it; the X is for everyone who never learned it.
- [next] A menu bar so every screen is reachable by mouse without knowing a key,
  and the crafting screen rebuilt as slots and direct manipulation rather than a
  list of rows (owner playtest, routed through lane E). The drag-to-craft rule
  is settled before it starts: recipes are ingredient lists, so the crafting
  area matches on WHAT is in it and never on WHERE, and nothing of lane F's is
  invalidated.

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
