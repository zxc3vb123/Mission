# Status - lane farm (J)

Farming, animals and food. Your section, and nobody else writes here. One
line per finished thing, newest at the top.

- [fixed] **My cost check gated the whole project, and it was measuring the
  wrong thing.** It timed `g.tick()`, which steps EVERY system, and printed
  the result under the words "a farm costs". Alone it read 1.3 ms; after the
  other suites it read 31 ms and went red on main, holding four lanes'
  finished work behind it. The farm's own tick in that scenario did not reach
  0.01 ms - and it could not have, because the only plots standing were the
  five WILD ones, which return on the first line of the loop. So the check
  had never once measured a farm, and the first time it failed it named the
  wrong lane.

  Fixed by measuring the thing the name claims, not by moving the number:
  the block now plants a real field of 60, walks the player 800 px off so the
  slow beats pay full price for being far from the camera, and times
  `farmSys.tick()` alone. That reads **0.010 ms** and the threshold came DOWN
  from 6 ms to 3 ms. The whole-tick figure is still measured and printed with
  `world.counts()` beside it, but it is REPORTED rather than failed on -
  WORKFLOW 5a, the rule that another lane shipping something must never
  redden main for you. A number nobody owns should nag, not gate.

  Worth keeping: a wall-clock check is only as good as its scenario, and a
  cost check built out of objects that exit on their first line measures
  nothing while looking exactly like a passing test. Lane E caught it and
  measured it independently with `tools/profile.js`, which is the tool I
  should have used before writing my own timer.

- [done] **One crop, end to end, and it grows when nobody is looking.** Wheat:
  find it wild, plant a seed in real soil, water it from a real bucket or dig
  a channel to it, harvest it, eat it. `src/farm/`, `farm.api`, 38 checks in
  `tools/tests/farm.test.js`, and the whole loop walked through in the live
  game in a browser rather than only in the suite.

  **The harvest weighs exactly what the plot drank, and that is not a number
  anybody chose.** A plant is a machine for turning water into food, so the
  yield is set (3 grain and 2 seed) and the THIRST IS DERIVED from it -
  2.00 kg of food, through the one pixels-to-kilograms bridge this game has,
  which is lane F's pail: a bucket of water weighs its empty plus its
  contents and says how many pixels those contents are. That comes out at 24
  px a plant, so one bucket is five plants. Nothing in `src/farm/spec.js`
  had to notice when lane F doubled the pail from 60 to 120 px this morning,
  and nothing will next time. The suite asserts the identity in kilograms
  rather than asserting that grain appeared.

  Every other place matter moves is a checked destroy: the seed leaves the
  pack through `take()` and the return value decides whether a plot exists;
  the full pail leaves and the empty comes back, and if the empty will not
  fit the full one goes back untouched; a harvest that overflows the pack
  falls at the plant's feet as real chunks, because `add()` reports what it
  actually took. **A plot HOLDS its water** rather than spending it, so a
  plant you pull up hands back its seed and every pixel that went into it -
  there is a check that the total is identical across an uproot. Water with
  nowhere to go is queued and poured back through lane A a bit at a time,
  never discarded: `pourLiquid` refusing is a "not yet", and treating it as
  a "no" would destroy matter in the one system whose whole premise is that
  it does not.

- [done] **Irrigation, which is the only thing on the surface that produces
  anything with nobody there.** A plot beside standing water lifts it through
  lane A's `drawLiquid` on a slow staggered beat and tops itself up faster
  than it drinks, so a ditch dug from a pond to a row is a farm that runs
  itself. The check that matters is not that the plot gained water: it is
  that **the world lost exactly that much**, measured pixel by pixel in a box
  around the field, with the player 600 px away.

  Every plot ticks every tick, exactly like lane C's structures, so distance
  cannot change the result by construction - no catch-up model and nothing
  that has to happen on load. What distance does cost is that a plot far from
  the camera pages a chunk in when its beat comes round. That is the same
  bargain lane D took for the derrick, deliberately, and the beat is slow
  enough (three seconds) that it is not a cost worth avoiding.

- [done] **Daylight is geometry here, not the light grid, and that is
  load-bearing.** A crop needs open sky, and the obvious way to ask - lane
  A's `lightAt` - is the wrong one: the light grid is computed around the
  CAMERA and reads 0 for a field the player has walked away from. Gating
  growth on it would have made a farm work only while watched, which is the
  exact thing the owner's unattended-automation decision forbids, and it
  would have looked completely reasonable in review. A bounded look upward
  for solid material is the same fact and does not care where anybody is.

- [done] **Where the first seed comes from.** Wild wheat, thinly scattered
  over the surface from the world seed through `hash2`, one meal and one seed
  a plant, regrowing slowly and out of sight up to the count the world
  started with. This is the same shape as lane C's loose surface rock
  breaking the stone-pickaxe deadlock: a field needs seed and seed comes from
  a field, and without a wild source the entire lane is unreachable and
  nothing anywhere would have gone red.

- [done] **Save and load from the first commit.** Plots, what each has drunk,
  and any water still queued to go back into the world. The wild scatter is a
  fact about the seed and is re-derived. A field that reset on load would be
  worse than no field.

- **Cost:** 0.010 ms a tick for a field of sixty, this system alone, against
  the 27.8 ms budget - and `tools/profile.js` puts the farm at 0% of a fresh
  frame. The per-tick work per plant is an integer add; everything that
  touches the world is on one of two staggered slow beats. (The "about 1 ms"
  that stood here before was the whole simulation, not this lane. See the
  fixed entry at the top.)

## Open, and honestly open

- **Eating is inert until lane B listens.** Hunger is a number on the body
  and the body is theirs (ARCHITECTURE §4). `farm.api.eat()` takes the food
  out of the pack and emits `food:eaten { id, nutrition, x, y }`; nothing
  feels it yet. WORKFLOW 4c is explicit that publishing the API is half the
  job, so the request names lane B as the consumer and **stays open until
  there is a call site**. Said here rather than left to be discovered.

- **`t` is bound but no screen mentions it.** One key does the whole verb -
  pick what is ripe, water what is thirsty, plant what is bare - the way lane
  D's `q` both lays a rail and takes one up. Until the HUD or the guidebook
  says so, a player has no way to find it. Request filed against lane H.

- **The crop items are registered at runtime, not named in ITEM_DATA.**
  `wheat` and `wheat_seed` are registered at startup the way lane D registers
  refined goods, and `src/farm/spec.js` steps aside the moment lane F names
  them. Their masses are the only reason the conservation identity comes out
  exactly, so they are the first thing to hand over.

- **Coop: growth replicates, watering does not.** Growth is deterministic
  from the tick and needs nothing on the wire. Watering and planting are
  player actions on an inventory, and inventories do not replicate yet
  (ARCHITECTURE, net) - so this is behind the same door as everything else
  lane NET has open, not a separate problem.

- **Animals are not started**, deliberately. They move, they need feeding and
  they are as much lane I's creature machinery as this lane's - the brief
  says talk to them before building a second one, and lane I is mid-flight in
  the tree right now.

## Things found while doing this that are not mine to fix

- **A BUCKET CANNOT BE FILLED ON `origin/main`.** `src/items/itemdefs.js`
  builds the live registry from ITEM_DATA by copying a fixed list of columns,
  and `container`, `liquid` and `liquidAmount` are not among them - so
  `items.api.isEmptyContainer("bucket")` is false in the shipped game and the
  whole liquid-carrying mechanic is inert. Lane C's suite is green because
  its fixture registers a test pail with the fields set by hand, and a
  comment there still says lane F "has not named a bucket yet" - they have,
  and it is committed. Routed to lane C in REQUESTS with lane F copied. It is
  a one-line fix in a file that is not mine. This lane reads the fields
  straight out of lane F's table meanwhile, and prefers the registry the day
  it starts carrying them.

- **`origin/main` is red**, and it is not this lane: `actor: a tool with no
  dig kind still reads as a tool, not as cargo [knife]`. Lane F gave
  `stone_knife` a `kind: "knife"` in the tools table, and lane B's
  `heldLook()` returns that kind while lane B's own test expects `"blade"`.
  Confirmed with `node tools/verify.js origin/main` - red on the commit
  itself, not somebody's desk. Already routed by lane F (`content -> actor`
  in REQUESTS), so this lane has added nothing and is only noting that the
  red line every lane will see on their next run belongs to that entry.
