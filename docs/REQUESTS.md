# Cross-lane requests

You need something only another lane can build. Add an entry here instead of
editing their files. The owning lane picks it up and marks it done.

Format:

```
### <your lane> -> <their lane>: one line summary
Why: what it unblocks.
Proposed: the shape of the API or behaviour you want.
Status: one of - open / in progress / done (commit)
```

---

### actor -> items: expose the equipped tool
Why: digging speed and what can be dug must come from the tool, not from the
character being born with a shovel.
Proposed: `items.api.equipped()` returning `{ id, def }` or null, plus an
`item:equipped` event when it changes.
Status: done. `items.api.equipped()` returns `{ id, def, count }` or null -
`count` is a bonus, the shape you asked for is intact. `item:equipped { id }`
fires on every real change, with `id: null` when the hands are empty. It goes
null the moment the last one is used up, so a tool that is gone cannot dig.

### actor -> world: dig speed per material and tool
Why: hands must be slow in soil and useless against rock; a pickaxe is what opens
rock; that table belongs with the materials.
Proposed: `world.api.digSpeedFor(matIndex, toolId)` returning pixels per second,
0 meaning "this tool cannot dig this".
Status: done - `world.api.digSpeedFor(matIndex, toolId)` returns pixels per
second, 0 for "this tool cannot cut this". The tier table itself is lane F's
`src/content/tools.js`; this lane reads it and adds only the unit. Also published
`digTierFor(matIndex)`. Bare hands 90 px/s in earth, stone shovel 360, stone
pickaxe 110 in earth and 200 in rock, and 0 for every shovel against stone at
every tier. **The gate is not live in play until lane B passes the tool - see the
next entry.**

### world -> content: a wooden prop the player can make BEFORE stage 3
Why: tunnels now cave in. Loose ground holds about 48 px of unsupported roof
and then the roof comes down, and the counter to that is a prop. The cheapest
thing that currently props anything is `plank_beam` at stage 3, which needs a
sawmill — so between the first shovel and the sawmill there is a stretch where
the world punishes horizontal digging and offers nothing to answer it with.
The owner's words were "build support for my tunnels **with wood**", and wood is
stage 0 the moment lane B calls chopAt.
Proposed: a `pit_prop` at stage 0 or 1 — wood plus rope, made by hand, no
station. It only has to be placeable and to register a support rectangle; lane A
already takes any rectangle lane C hands it.
Until it exists, `world.api.caveConfig.enabled = false` turns cave-ins off, and
that may be the right call for a playtest.
Status: done - lane F added `timber_prop`, stage 0, one log, hand-built, and the
world registers it automatically (see the next entry). Cave-ins are live.

### world -> items: register placed props as supports
Status: withdrawn, nothing needed from lane C. Everything required was already
published: lane C emits `structure:placed` and `structure:collapsed`, and lane F
marks the defs that hold a roof up with `props: true`. The world listens to those
two events and registers the rectangle itself, so no lane has to remember to call
anything for cave-ins to work, and nothing in `src/world/` imports `src/build/`.

`addSupport(id, x, y, w, h)` / `removeSupport(id)` stay published for anything
that is not a placed building — lane D's machinery, later. Calling it as well is
harmless: two rectangles over one span hold it exactly once.

### world -> items: call dumpItem when the player puts ground down
Why: the owner asked to "place dirt, build a small hill with that, same with
sand". The world half is done — `dumpItem(x, y, itemId, count)` turns soil, sand,
clay, gravel and any ore back into real terrain that settles by the normal rules.
Nothing happens until lane C routes placement of those items through it.
Proposed: where an item is put down, ask the world first:

```js
if(world.materialForItem(id) >= 0){
  const r = world.dumpItem(x, y, id, n);      // n items to pour
  if(r.accepted > 0){ inventory.take(id, r.accepted); return; }
  // accepted 0 means there is nowhere to put it: keep the item, say so
}
// otherwise fall through to the normal "drop it on the floor" path
```

`accepted` is how many items were actually taken, so a refused pour costs the
player nothing. `materialForItem` returns -1 for anything that is not ground, so
tools and crafted goods fall through untouched. `pourStats().stalled` is material
that went in but has nowhere to land yet — worth surfacing if you want a "that
will not fit" message.
Status: done. `src/items/pour.js`, wired into the drop path: dropping soil,
sand, clay or gravel pours it, and `items.api.pour(id,n,x,y)` does it at a
chosen spot. It costs the pack.
ONE NARROWING, and it is deliberate: I pour only what HANDS CAN DIG BACK OUT,
which your `digSpeedFor(m, null) > 0` answers. Your `dumpItem` would happily
take ore, but turning a pack of iron ore into ore-bearing rock the player now
needs a pickaxe to recover is a trap — they drop ore to lighten their load, not
to bury it. So the line sits where recovery stops being free, and it draws
itself from your tier table rather than from a list somebody maintains.
On stalling: you almost never refuse — you take the load and queue it — so the
honest signal turned out to be "not yet" rather than "no". `pour:stalled`
carries your stalled count after a successful pour; `pour:refused` is kept for
a true zero.

### world -> actor: call chopAt, or wood stays unobtainable
(The digging half of this request is done — lane B landed the tool wiring and the
tier gate is live in play. What is left is the chopping half, below.)

### world -> actor: pass the equipped tool into digging, or the gate does nothing
Why: `digFreeCircle` and `anyDiggable` now take an optional trailing `toolId` and
enforce the tier gate themselves, so no caller can dig round it. Called WITHOUT
that argument they behave exactly as before - ungated - which is what keeps every
existing caller and test working. That means the owner's playtest complaint
("dig straight to uranium with a shovel") is still true in game until this lands.
Proposed: in `src/actor/clonk.js`, pass the equipped tool id to both calls:
`const toolId = items.equipped() ? items.equipped().id : null;`
`world.anyDiggable(x, y, DIG_RADIUS-1, toolId)` and
`world.digFreeCircle(x, y, DIG_RADIUS, true, toolId)`.
`null` means bare hands - it is a real tool id to this API, not "no gate"; only
omitting the argument entirely turns the gate off. Then use
`world.digSpeedFor(world.matAt(tx,ty), toolId) === 0` to stop the swing and play
the blocked cue, rather than grinding at a wall.

**Chopping wants the same edit, so please do both at once.** Wood has exactly
one source and the stage 0 chain dead-ends without it. In the same swing
handler, before the dig:

```js
const tree = world.treeAt(tx, ty, DIG_RADIUS);
if(tree){
  const r = world.chopAt(tx, ty, DIG_RADIUS, toolId);
  if(!r.canChop){ /* wrong tool: play the dull thud, do not dig the tree */ }
  break;                       // a swing is spent on the tree, not the ground
}
```

`chopAt` returns `{ hit, felled, progress, canChop }`. `canChop` is false for
anything that is not an axe, which is the cue to tell the player why nothing is
happening. `progress` is 0..1 if you want a chop meter. A stone axe fells an
average tree in about four seconds. Felling a tree emits its logs as `dig:yield`
with item `wood`, so lane C needs no change at all.
Status: done - both halves. The equipped tool goes into `anyDiggable` and
`digFreeCircle`, and `null` is passed for empty hands rather than the argument
being omitted, so hands are gated like any other tool. A face above the tool's
tier does not start the swing at all, which is what makes it read as a wall
rather than as slow going. The rate is read too: the body advances at
`digSpeedFor` relative to a stone shovel in earth, so a shovel is 4x hands in
soil. A tree in the swing takes the swing before the ground does, and without an
axe it thuds and nothing happens. `state.player.chop` is published 0..1 for a
meter if lane E wants one. The actor needed `items.api`, which is one line in
`src/systems.js` (the "pass what you need" slot). Proved in
`tools/tests/actor.test.js`: hands and shovels cannot touch coal, a pickaxe opens
it, granite stops everything, hands never fell a tree and a stone axe yields
logs.

### world -> items: the coal test will need a pickaxe once digging is gated
Why: `tools/tests/items.test.js` digs a coal seam to prove coal drops. Coal is
tier 1, so once lane B passes the equipped tool, digging it bare-handed yields
nothing and that check goes red. It is green today only because the test calls
`digFreeCircle` without a tool, which is ungated.
Proposed: pass a pickaxe when lane B lands the change:
`W.digFreeCircle(coal.x+k, coal.y, 6, true, "stone_pickaxe")`. Your test, your
call - flagging it so it does not surprise you.
Status: open

### items -> content: recipe and item data tables
Why: crafting cannot be implemented against hard-coded numbers.
Proposed: `src/content/items.js`, `recipes.js`, `buildings.js` as described in
`docs/lanes/content.md`.
Status: done - items, recipes, buildings, stages, guide, haulage and reference
all exist in `src/content/`, and the crafting screen renders straight off them.

### content -> world: earth must yield an item when dug
Why: `M_EARTH` has `dig2: null`, so digging soil deletes matter. That breaks the
one hard rule in GAME_DESIGN §2, and it is worth fixing before the chunking work
settles rather than after.
Decided: the id is `soil` (docs/DECISIONS.md). Suggested `dig2ratio` around 500 —
soil is bulky and low value, so a shovelful should be common but not free.
Lane F adds the `ITEM_DATA` entry as soon as the material names it.
Status: open

### core -> world: implement serialise() / restore() for the landscape
Why: a save currently rebuilds the world from its seed, so every tunnel the
player dug is gone when they load. Terrain changes are the one thing a mining
game must not forget.
Proposed: `serialise()` returns the diff against a freshly generated world of the
same seed (changed pixels, run-length encoded is fine), `restore(data)` applies
it. Best done as part of the chunked-world task, since chunks already give you a
natural unit to diff and store.
Status: done - `world.serialise()` returns the run-length encoded difference
between each changed chunk and a freshly generated one, so a dug hole costs a
couple of hundred bytes and an untouched map costs nothing. `restore(data)`
applies a chunk's difference when that chunk is next generated, so loading does
not have to fault in half the map.

### core -> items: implement serialise() / restore() for drops and containers
Why: core saves the inventory itself, but chunks lying on the ground and, later,
chest contents are yours.
Proposed: `serialise()` returns the drop list and container contents;
`restore(data)` puts them back after the world has been regenerated.
Status: in progress - drops and the backpack capacity are saved and restored
now. Container contents follow when chests exist (lane C, M3).

Note for lane E while you are in `persist.js`: `applySave()` empties the
inventory *after* the system `restore()` hooks run, so anything a lane restores
about the pack itself has to survive that call. `inventory.clear()` now empties
only the contents and leaves the capacity alone, which makes that order safe -
worth knowing before the order is changed.

### core -> actor: implement serialise() / restore() for anything beyond the pose
Why: core already saves position, direction, energy, breath and lamp. When you
add stamina, hunger, injuries, equipped tools, they need a hook.
Proposed: the standard `serialise()` / `restore(data)` pair on your system object.
Status: open

### industry -> items: structure placement API
Why: machines are placed objects; lane D should not write its own placement.
Proposed: `build.api.place(defId, x, y)`, `structuresNear(x, y, r)`,
`storageAt(x, y)`.
Status: done. All three are live, plus `canPlace` (the same verdict without
building anything), `stationsNear`, `has`, `all` and the ghost-preview calls.
Shape and rules are in `docs/ARCHITECTURE.md` section 5. Lane D: a machine is
an entry in lane F's `BUILDINGS` with a footprint, materials, a build time and
a support rule — add the data and `place()` will raise it, hold it up, drop it
when its footing goes, and save it, with nothing new needed from this lane.

### items -> content: scatter density for surface gatherables
Why: sticks, plant fibre and loose rock are now scattered along the surface,
because stage 0 asks the player to gather all three and nothing in the world
yielded any of them. The mechanics are mine, but how thickly each lies and how
fast it grows back are balance, and balance is yours.
Proposed: a table in `src/content/items.js` (or its own module) along the lines
of `GATHERABLES = { stick: { weight, clump }, ... }` plus a scatter step and a
regrowth interval. Tuned so the stage 0 chain - 3 rock, 3 stick, 8 fibre - is
reachable within a short walk of any spawn. Today those numbers sit at the top
of `src/items/gatherables.js`, clearly marked, and I will read yours the day it
exists. Rock is the one to watch: hands cannot dig it, so it is the only hard
floor.
Status: open

### items -> world: harvestable scenery
Why: lane E suggested, and I agree, that gathering should eventually come from
the grass tufts and trees you can see rather than from items scattered near
them. Seeding the surface unblocks stage 0 today; harvesting is the honest
version, and it is the difference between "walk until you find a stick" and
"see a bush, take from the bush".
Proposed: expose which scenery is harvestable and let it be consumed - roughly
`world.api.harvestAt(x, y, r) -> { item, x, y } | null`, removing or thinning
the tuft it came from so a picked bush looks picked. Trees stay yours; felling
one is the stone axe's job and belongs with whatever you do for wood.
No rush - stage 0 is unblocked either way.
Status: open

### build -> content: a chest's capacity in kg
Why: a chest is the first answer to a 35 kg back, so how much it holds is a
balance number of the same kind as the backpack's, and it belongs beside the
chest's cost rather than in my file.
Proposed: a `storage` field on the entries in `buildings.js` that have one -
`storage: 200` on the chest. I default to 200 kg today, marked in
`src/build/structures.js`, and will read yours instead the day it exists.
Status: open

### build -> core: add the build suite to the test runner
Why: `tools/tests/build.test.js` exists with 37 checks and passes, but
`tools/run-tests.js` is lane E's file, so CI does not run it - same situation
lane F had with the content suite.
Proposed: `import { run as runBuild } from "./tests/build.test.js";` plus
`build: runBuild` in `SUITES`. Verified green by running the suite directly in
the meantime.
Status: open

### items -> content: which stations process, and how much they hold
Why: timed processing is live, and two things it needs are data rather than
mechanics. Which stations do work over time (the owner named the kiln and the
forge), and how much output a station or a chest can hold.
Proposed: `processing: true` and `storage: <kg>` on the entries in
`buildings.js`. Today `src/build/production.js` falls back to `["kiln",
"forge"]` and 120 kg for those two, 200 kg for a chest, all clearly marked. I
read yours the day the fields exist.
One judgement call worth your eye: the rule is per-STATION, so an iron pickaxe
forged at a forge is timed like a smelt is. That reads right to me - the fire is
doing the work either way - but if you want per-recipe control, an `instant:
true` on a recipe is the smallest thing that would give it to you.
Status: open

### items -> ui: crafting is instant, and lane F's `time` is not spent yet
Why: every recipe carries a `time` in seconds, and lane F wrote real notes
justifying specific durations - a stone axe is 20 seconds of work, charcoal is
90. `craft()` currently completes immediately and ignores that field.
The reason: `src/ui/craft.js` says "made X" the moment `craft()` returns true,
so shipping timed crafting today would have made the existing screen lie for
several seconds on every craft. The smallest thing that is actually playable
won (docs/WORKFLOW.md section 7), and the return shape does not have to change
to add time later.
Proposed, when the screen can show it: `craft()` starts a job and returns
`{ ok:true, started:true, time }`, outputs arrive on `craft:done`, and I
publish `craftProgress()` for a bar. It also needs one design answer that is
not mine - what happens when the player walks away from the station or is
interrupted mid-craft.
Status: DONE for processing, and the owner answered the design question
(docs/DECISIONS.md): making stays instant, the kiln and the forge take time,
and a station keeps working while the player is away. `craftProgress()` is
published for the bar. Hand and workbench crafting remains instant BY DECISION
rather than by omission.

### build -> content: how much of a building comes back when it is taken apart
Why: deconstruction is live and a player gets their materials back. How much is
balance, and it is yours. Lane E asked me to own the SHAPE and hand you a lever
with a clear meaning, so here it is.
Proposed: `recover: 0..1` on an entry in `src/content/items.js`, read
per-material. It defaults to 1 (full recovery) and today nothing sets it, so
deconstruction currently returns everything.
WHY PER-MATERIAL RATHER THAN A FLAT FRACTION: it encodes why something is lost
instead of taxing the player. A fired brick prised out of a wall is still a
brick and should come back at 1. Quicklime slaked into mortar is chemically
part of that wall and should be near 0 - it was transformed, not confiscated,
which is the difference between conservation of matter and an arbitrary
penalty. Rope and planks probably sit in between: you can pull them out, but
not all of them survive the crowbar.
Two things the mechanic already handles, so you do not need to price them:
anything a building is merely HOLDING (a job's inputs, uncollected output)
comes back whole, and a half-built structure returns the share that was never
worked in.
Status: open

### build -> content: how long taking a building apart should take
Why: it is half the build time today, in `src/build/structures.js`, marked.
Proposed: if you want it as data, a `deconstructTime` on the building or a
project-wide fraction. Half reads right - pulling a thing apart is quicker than
putting it up - but it is a number and numbers are yours.
Status: open

### build -> world: placed light sources
Why: the last unchecked item in my M3 brief. A campfire is described in lane F's
own table as "a pool of light that does not burn out like a torch", and a placed
torch is the whole answer to a dark shaft. Both are placed structures and work
today - they simply emit nothing, because a structure has no way to light the
world. Darkness is the early antagonist (GAME_DESIGN section 4), so a lamp you
can put DOWN rather than carry is a real step, and it is the difference between
exploring a shaft and holding a torch in the hand you wanted to dig with.
Proposed: the `addLightSource(id, {x, y, r, power})` / `removeLightSource(id)`
already listed as planned in ARCHITECTURE section 5. I would register one per
built structure that declares light and drop it when the structure goes,
including when it collapses. A stable string id per structure is all I need.
Not blocking anything else; I will pick it up the day it exists.
Status: open

### build -> world: buckets need something to fill them from
Why: buckets are on my brief and the owner asked for them. Carrying water is
mine - it is an item with a mass that changes when full - but filling and
emptying are operations on your liquids, and I will not reach into them.
Proposed: `world.api.liquidAt(x, y)` returning the material and whether there is
enough to draw from, `drawLiquid(x, y, amount) -> matIndex | null` removing it,
and `pourLiquid(x, y, matIndex, amount)` putting it back. Pouring matters as
much as drawing: water carried uphill and tipped out has to actually flow, or a
bucket is a prop.
Lane E has asked me not to push this ahead of your timbering and cave-in work,
so this is a placeholder rather than a nudge. I will build the carrying half
whenever you get there.
Status: done - `liquidAt(x,y)` -> `{ matIndex, depth, reachable }` or null,
`drawLiquid(x,y,amount)` -> `{ matIndex, taken }`, `pourLiquid(x,y,matIndex,
amount)` -> `{ matIndex, accepted }`. Units are pixels of liquid.
The intake reaches a fixed 12 px and never walks the body, so a pump costs the
same in an ocean as in a puddle - measured at 200 draws, 2.5 ms from a deep
pool against 2.9 ms from a shallow one. A well that has run out returns
`taken: 0` because there was nothing within reach, not because a counter said
so. `reachable` is what tells a derrick the well is finished.
Nothing is created or destroyed at the boundary: what `drawLiquid` reports is
exactly what leaves the world, and poured liquid that lands somewhere already
full comes back to the queue rather than evaporating.

### build -> world: a deconstructed prop still holds the roof up
Why: verified, not suspected. Place a timber prop, take it down deliberately,
and `caveStats().supports` stays at 1 with no prop in the world. The roof it
was holding is propped by nothing, for the rest of the game.
Your listeners in `cavein.js` cover `structure:placed` and
`structure:collapsed`, and a deliberate takedown is neither: it is
`structure:removed`. A collapse is the world knocking something over; removal
is the player choosing to. Both need to drop the support.
Proposed, one line beside the one you have, and your existing `propKey(e)`
works unchanged because the event carries the same `defId`, `x` and `y`:

```js
bus.on("structure:removed", e => removeSupport(propKey(e)));
```

Your decision to have the world LISTEN rather than have this lane call
addSupport is the right one and I am not asking you to change it - it is why
nothing had to remember, and it is why this is one line rather than a
negotiation. I have pinned the event shape from my side (`tools/tests/
build.test.js`, "the events another lane keys off") so a rename here cannot
silently stop tunnels being propped.
One thing that is a choice rather than a bug, so you know I saw it: you
register on `structure:placed`, which fires when a prop is PUT DOWN, not when
it has finished being raised. A half-built prop therefore holds the roof. That
reads fine to me - the timber is on site - but if you would rather it waited,
`structure:built` carries the same fields.
Status: open

### net -> world: a restored chunk nobody has visited is not reported as changed
Why: measured, not suspected, and it costs YOU before it costs me. Dig twelve
bites, `serialise()`, `regenerate(seed)`, `restore()` - and `serialise()` now
returns 6 chunks where it returned 10. The four missing ones are the chunks
that were not resident at restore time: `restoreChanges` parks their diff in
`diffs[ci]` to be applied lazily when the chunk loads, which is the right
design, but `serialiseChanges` only walks `resident` and `archive`, so a
pending diff is invisible to it. **Save, load, and save again without walking
back to your tunnel, and the tunnel is gone from the second save file.** The
pixels are fine either way - reading them pages the chunk in and applies the
diff - so my suite measures pixels and is green, and this is your bug rather
than mine.
Proposed: `serialiseChanges()` also emits an entry for any `ci` with a pending
`diffs[ci]` that is neither resident nor archived - it already has the encoded
value, so it can be passed straight through.
Status: open

### net -> world: a cheap "what changed since?" for chunk diffs
Why: the host reconciles the ground every few seconds by sending guests the
chunk diffs that changed since the last time it sent them. Today the only way
to ask is `serialise()`, which packs and re-diffs EVERY modified chunk, and I
then throw most of it away by comparing against what I sent last. That is fine
for one tunnel and will not be fine for an hour-old mine.
Proposed: either a monotonically increasing token - `serialiseChanges({ since })`
returning only chunks modified after it, plus the new token - or, just as
useful and probably smaller, a `onChunkChanged(fn)` hook giving me chunk indices
as they are dirtied so I can ask for those alone. Either shape works; the
second is closer to what you already track.
Status: open

### net -> world: `chopAt` needs the `collect` flag that `digFreeCircle` has
Why: replaying a remote player's dig is clean because `digFreeCircle(x, y, r,
collect, toolId)` lets me pass `collect:false`: the pixels go, the spoil does
not, and their soil does not fall out of the ground on my screen as well as
theirs. `chopAt` has no such flag, so to replay a remote chop I currently have
to silence `dig:yield` and `tree:felled` around the call - which works, is
contained to one function in `src/net/tap.js`, and is the ugliest thing in this
lane.
Proposed: `chopAt(x, y, r, toolId, collect = true)`, with `collect:false`
suppressing the log yield exactly as digging does. Four characters of signature
and I delete the hack.
Status: open

### net -> world: trees are not in the save at all, so a joiner re-grows them
Why: `serialise()` carries the landscape but not the scenery, so a tree that was
felled stands up again for anyone who loads the save - or, in my case, for
anyone who joins the room. It is not a multiplayer bug; it is visible in single
player the same way, and the wood is already in the player's pack.
Proposed: `serialise()` includes the trees that differ from the generated set
(felled ones, and the hp of any part-chopped trunk). Small - it is a list of
indices, not pixels.
Status: open

### net -> actor: publish something that draws a clonk from a pose
Why: a remote player is a pose off the wire, not a simulated body, so this lane
has to draw it. `drawClonk` is in `src/actor/render_actor.js`, which is your
internal file, so I draw my own silhouette instead: right proportions, right
facing, wrong everything else. Two players in one world currently look like two
different kinds of creature, and every tool silhouette and animation you build
is invisible on anyone else's screen.
Proposed: `actor.api.drawPose(ctx, { x, y, dir, act, aim, held })` - the same
drawing you already do, taking its pose as an argument instead of reading the
local clonk. `heldLook()` is already exported for exactly this kind of reason,
so the shape is familiar. I will delete `src/net/ghosts.js`'s drawing half the
day it lands.
Status: open

### net -> ui: a screen for opening and joining a room
Why: coop works and there is no way to reach it except a URL. `net.api` has
`host()`, `join(code)`, `leave()`, `status()` and `peers()`, and this lane draws
exactly one line of overlay - the room code, because a code nobody can read is a
room nobody can join. That line is a stopgap in your folder's job, and I would
rather hand it over than grow it.
Proposed: a screen (a menu entry, and a key of your choosing) with: **open a
room** -> shows the six-letter code big enough to read out; **join a room** ->
one text field, `net.api.join()` already normalises what the player types and
refuses what is not a code; and a list of who is in the room from
`net.api.status().peers`, each in their own colour (`net.api.peers()` carries
the same colour the ghost is drawn in). Errors arrive as `net:error` on the bus
and as `status().phase`. Delete my overlay when yours lands.
Status: open

### net -> core: while a room is open, autosave overwrites the player's own world
Why: joining somebody else's room regenerates the world from THEIR seed, which
is correct. What is not correct is that `main.js` then autosaves every fifty
seconds into `mission.save` - so a player who joins a friend for ten minutes
comes back to find their own world replaced by their friend's.
Proposed: the save key depends on the session, so a guest never writes over
the world they were playing.
Status: done (54379e3). Lane E fixed it rather than filing it, the same hour:
`setSaveSlot(name)` picks the key and `setSaveSlot(null)` goes back to solo.
This lane calls it with `room:<code>` when a room opens and null when it
closes, and the stash it replaced is deleted rather than left standing beside
it.

### net -> items & build: a placement and a pickup that do not charge THIS pack
Why: this is what stands between the current milestone (bodies and terrain) and
the next one (everything else people do to a shared world). Terrain replicates
because lane A's mutators are pure operations on pixels; a structure does not,
because `place(defId, x, y)` also takes the materials out of the placing
player's inventory. Replaying it on my screen would charge ME for the campfire
my friend built. So for now a guest's buildings arrive only when somebody joins
(`build.serialise()` is in the join payload) and never afterwards.
Proposed, and it is small because the verdict function already exists:
`place(defId, x, y, { charge: false })` - build it, skip the inventory step -
and the same for a picked-up chunk: `spawnDrop` and the auto-pickup need a way
to say "this one is somebody else's, do not put it in my pack". Given those,
`structure:built`, `structure:removed` and `item:collected` become three more
operation kinds in `src/net/protocol.js` and coop covers building and items too.
Status: open

### industry -> world: draw and pour liquid at a point, or oil stays in the ground
Why: the owner asked for oil the way it was actually got — a timber derrick, a
walking beam, a pump, barrels (`docs/DECISIONS.md`, 2026-08-28). Crude oil
already exists in the world as a liquid material, and the whole of that chain
needs exactly one thing this lane may not write: taking liquid out at a point
and putting it back at another.
Proposed: **this is the same call lane C already asked for** under "build ->
world: buckets need something to fill them from", and it now has two consumers
rather than one, which is the only new information in this entry:

```
liquidAt(x, y)                   -> { matIndex, depth } | null
drawLiquid(x, y, amount)         -> { matIndex, taken }   removes it
pourLiquid(x, y, matIndex, amount) -> { accepted }        puts it back
```

What this lane needs on top of the bucket case: `drawLiquid` must be able to
run every tick at a fixed small rate without walking the pool, because a pump
is a machine that lifts a little continuously rather than a person filling a
pail. A depth or a "how much is reachable here" in `liquidAt` is what tells a
derrick its well has run dry, which is the thing that makes an oil field a
place rather than a resource bar.
Pouring matters as much as drawing, and for the same reason it does for
buckets: oil raised up a shaft and tipped out has to flow, or the derrick is a
prop.
Status: done - `liquidAt(x,y)` -> `{ matIndex, depth, reachable }` or null,
`drawLiquid(x,y,amount)` -> `{ matIndex, taken }`, `pourLiquid(x,y,matIndex,
amount)` -> `{ matIndex, accepted }`. Units are pixels of liquid.
The intake reaches a fixed 12 px and never walks the body, so a pump costs the
same in an ocean as in a puddle - measured at 200 draws, 2.5 ms from a deep
pool against 2.9 ms from a shallow one. A well that has run out returns
`taken: 0` because there was nothing within reach, not because a counter said
so. `reachable` is what tells a derrick the well is finished.
Nothing is created or destroyed at the boundary: what `drawLiquid` reports is
exactly what leaves the world, and poured liquid that lands somewhere already
full comes back to the queue rather than evaporating.
One thing worth knowing before you test a pump: call `world.clearLoose()` first.
The map is never still - sand is slumping somewhere every tick - so a flow
measurement that does not clear loose pixels measures the world settling and
calls it flow. It cost this lane an afternoon on a different test.

### industry -> content: rail and wagon costs, and the wagon's tare
Why: rail haulage is live and three of its numbers are mine by default rather
than by right. They sit at the top of `src/industry/spec.js`, each marked LANE
F FALLBACK, and I will read yours the day they exist — the same arrangement
lane C had for `processing` and `storage`.

    RAIL_COST   { steel_bar: 1, plank: 1 }   per 24 px length
    WAGON_COST  { steel_bar: 6, plank: 4, wood: 4 }
    WAGON_TARE  300 kg empty

Proposed: wherever you would rather keep them. A `haulage` entry could carry a
`cost`, or they could be `BUILDINGS` entries — I have deliberately not asked
for the latter, because a wagon is not placed by lane C's `place()` and a
`BUILDINGS` row that nothing raises would be a lie in your table.

TWO THINGS THE MECHANIC ALREADY DECIDES, so you do not have to price them.
Capacity and speed are read straight off your `HAULAGE.mine_wagon`, never
copied. And the tare is not decoration: a shove is a force, `dv = force /
mass`, so the empty weight is exactly what makes a full wagon need a gradient
and an empty one need only a push. Raising it makes hand-pushing harder and
gravity more attractive, which is the lever you would actually want.

ONE THING WORTH YOUR EYE, from building it: a chest holds 200 kg and a wagon
holds 1500, so **one wagon-load is seven chests**. That is a real consequence
of your ladder rather than a complaint about it — but it means the first thing
a player wants after a railway is somewhere bigger to put the ore, and there is
no such building. A stockpile or a bunker, sized in wagon-loads, is the entry I
would write if it were mine.
Status: open. The mechanic runs on the fallbacks meanwhile.

### industry -> items/build: let a station draw its inputs from its own store
Why: a cart now delivers ore into a container at the railhead, and if that
container is a forge the ore is sitting inside the forge — and the forge cannot
use it. `craft()` takes its inputs from the player's pack, so the last two feet
of the journey are still walked by a person carrying twenty kilos at a time.
That is the difference between automation and a shorter walk.
Proposed: when a recipe is started at a processing station, satisfy each input
from the station's own `store` first and the pack second. Everything needed
already exists — the store is there, `storageAt()` reads it, and a destroyed
station already returns what it was holding. The verdict shape does not have to
change; `canCraft` would simply count what is in reach rather than only what is
carried.
The follow-on, when you want it, is a station that starts its own repeat job
while the materials keep arriving. That is properly mine to drive and I will ask
again when the boiler exists; this entry is only the input half.
Status: open. Nothing is blocked — the delivery works, the smelt is manual.

### industry -> ui: two keys are bound in my lane, and you may have them
Why: `q` lays and takes up track, `e` builds, loads and tips a wagon. They are
bound in `src/industry/index.js` and registered in ARCHITECTURE section 4a in
the same commit, for the reason section 4c gives: an API with no call site is
this project's most expensive failure and it has happened three times. Lane C
set the precedent with their rotate and remove keys.
Proposed: nothing, unless you want it. If a build-menu style screen is the
right home for laying track — it probably is, since a rail run is a drag rather
than a keypress — take both, and these two bindings come straight out. Say the
word rather than working around them.
Status: open, and not blocking anything.
