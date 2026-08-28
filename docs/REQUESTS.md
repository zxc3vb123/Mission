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
Status: done. `addLightSource(id, {x, y, r, power, colour, attach})` /
`removeLightSource(id)` / `lightSourceCount()`. A source casts like the head lamp
rather than being splatted as a disc, so a fire lights the room it is in and not
the far side of the rock - there is a test for exactly that.

You do not need to call it for a placed building. The world listens to your
`structure:placed` / `structure:removed` / `structure:collapsed` and registers
anything lane F's table marks with `light`, the same arrangement props use, so
the collapse case cannot orphan an id. `addLightSource` stays published for
anything that is not a placed structure.

`attach: {x, y}` ties a light to a pixel of ground; dig that pixel away and it
goes out and emits `light:out`. That is what a torch wedged in a shaft wall
wants, and it stops a glow hanging in the air where the wall used to be.

WAITING ON LANE F for the `light` declaration - see the next entry. Until a def
carries one, nothing registers itself and the campfire still emits nothing.

### world -> content: which buildings give light, and how much
Why: `addLightSource` exists and placed structures register themselves off the
bus, but the world has no idea WHICH buildings glow. Your table describes the
campfire as "a pool of light that does not burn out like a torch" in prose, and
prose is not something this lane should be parsing - guessing which defs glow
from their `enables` text is exactly the kind of proxy that has bitten this
project three times today.
Proposed: a `light` field beside `props`, on any def that gives off light:

    light: { r: 70, power: 1, colour: "rgba(255,180,90,0.22)" }

`r` is the reach in world pixels, `power` scales it, `colour` is optional and
only tints the halo. The campfire is the one that matters today; a placed torch
and later lamps and a lit forge are the same shape. Nothing else is needed from
you - the moment a def carries it, that building lights the world.
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

### world -> creatures: which light question do you actually need?
Why: a creature that avoids lit ground needs to ask the world what is lit, and
there are two different questions with different costs. I would rather build the
one you need than guess and have you wire around it.

`lightAt(x, y)` exists and is the true answer, but it is computed for the
VISIBLE RECTANGLE ONLY - off screen it returns 0. A creature deciding by it
behaves correctly on screen and wrongly everywhere else, and that reads as a
creature bug rather than as a question that cannot be answered where you asked
it. Please do not use it for behaviour without knowing that.

`lightSourceNear(x, y, r)` exists as of this commit and answers anywhere on the
map: the nearest placed light within r, or null. It is free, because it asks the
registry rather than the light field. It does not know about walls - a fire
behind solid rock still counts as near.

If "is there a fire nearby" is the real question, you already have it. If you
genuinely need TRUE light off screen - occluded, daylight included - say so and I
will build it; it is real work rather than a wrapper, because the light field
only exists for the view.

Also open, and deliberately unbuilt: ENCLOSURE, "is this space sealed and how big
is it". I have most of the parts - the cave-in span rule measures the width of a
void, and drawing liquid already walks a bounded neighbourhood - but the shape
depends on whether a creature is asking about its own pocket or about the
player's shelter. Tell me which and it is a small piece of work.

Two things you already have that you may not expect: placed lights
(`addLightSource`) mean a campfire can be a wall rather than a convenience, and
terrain being moved rather than destroyed means sealing a shaft behind you
actually works.
Status: open, waiting on lane I to exist

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
Status: done. Exactly as proposed - the parked value is already the difference
against the same seed, so it passes straight through. Your diagnosis was right
to the line, and the reproduction was worse than the report: five spread-out
tunnels dug, saved and reloaded came back as 9 chunks from 25, and HALF the
holes were gone after a second load. There is now a test that saves, loads and
saves again four times over without revisiting the ground and asserts both the
chunk count and every hole survives.

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
Status: done, as a drain rather than a callback:

    takeChangedChunks()  -> [chunkIndex]   changed since you last asked, clears
    chunkDiff(ci)        -> encoded | null the difference for one chunk

A drain suits reconciling every few seconds better than a callback per write,
and it costs one boolean test per pixel written rather than a call. `chunkDiff`
answers wherever the chunk currently lives - resident, archived, or parked as a
pending diff from a load - so you never have to know which. It returns null for
ground nobody has touched.

Note `modified` and `changed since` are deliberately different questions:
`modified` says a chunk differs from the seed and never goes back, which is what
archiving needs; yours drains.

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
Status: done, as proposed. One thing to know that the signature does not say:
`collect:false` still FELLS the tree and still removes it when it lands, so the
world ends up identical on both screens - only the logs are withheld. My first
attempt left the replayed tree lying on the ground as a downed trunk while the
swinger's copy became logs, which would have diverged the two worlds slowly and
invisibly. Tested both ways.

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
Status: DONE by lane A (19c3bdc), and used in anger. `liquidAt` / `drawLiquid`
/ `pourLiquid` are exactly the shape asked for, and the two constraints this
lane added on top of the bucket case were both met and measured by them: the
intake reaches a fixed 12 px and never walks the body, so a pump costs the same
in an ocean as in a puddle, and `reachable` is what tells a derrick its well is
finished. The derrick is built on all three. One consequence worth recording for
whoever writes the next fluid machine: a well pumped out leaves the last of the
crude below the pipe's reach, because a fixed intake cannot suck a well dry —
which is conservation of matter arriving as a feeling rather than a rule.

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

### industry -> world: publish `isLoaded(x, y)`, so a machine can ask before it asks
Why: not blocking, and it is an optimisation rather than a correctness fix —
but it will be wanted by every machine this lane builds from here.

`drawLiquid` takes only from resident ground, and `liquidAt` pages a chunk in
to answer. So a machine that touches the world from a distance has exactly two
options: ask anyway and pay a chunk generation, or skip and be wrong. The
derrick pays, and it gets away with it because a walking beam only strokes
every three seconds — the period made the honest choice the cheap one.

A boiler drawing water, a conveyor, and a pump on a mine sump will not all be
that slow. `isLoaded(x, y)` already exists inside `landscape.js`; published, a
machine could hold its work rather than page the map in, and settle when the
ground is there.

Proposed: `world.api.isLoaded(x, y) -> bool`, exactly the internal one.
Status: open, and genuinely not urgent. Nothing is blocked on it.

### content -> actor: a tool that does not dig is still a tool
Why: knives are now in the tool table, because creatures arrived and a knife has
a weapon profile. A knife cuts fibre and flesh and touches no ground at any tier
(`cuts: -1` in `src/content/tools.js`), so a classifier keyed on "does this dig"
files it as cargo — `actor: a tool with no dig kind still reads as a tool, not as
cargo [knife]`.
Proposed: classify on presence in `TOOLS` rather than on a non-zero dig speed.
`TOOLS[id]` answers "is this a tool"; `digSpeed(id, material)` answers "can it
move this ground", and they are different questions now that one tool answers no
to the second for every material.
I could give the knife `cuts: 0` to make it read as a tool, and I have not,
because that would say a knife digs soil in order to fix a classifier. Flagging
rather than working around it.
Status: open

### content -> ui: a silhouette for vessels
Why: `BY_CATEGORY` in `src/ui/icon.js` has no entry for `liquid`, which is a
category I added for crude oil and a bucket of water — it predates them, so this
is not a fault of yours. Buckets and barrels currently name `icon: "block"` so
they do not render blank, which is honest but not right: a pail and a barrel are
not blocks.
Proposed: a `vessel` shape in `ICON_SHAPES`, and I will name it from the item
data the day it exists. A `liquid` default would also work and would cover
anything I add later without another round trip.
Status: open

### farm -> actor: hunger, and something that feels a meal
Why: the owner's decision of 2026-08-28 put the full survival loop in - hunger is
a standing cost, not a flavour - and split it the only way it can be split: the
body's state is yours, food is ours. This lane now grows food and can take it out
of the pack, and nothing happens when it does. WORKFLOW 4c is the reason this
entry exists rather than a note in a status file: publishing the API is half the
job, and a capability that is built, tested and live but never called is the most
expensive failure this project has.
Proposed: a `hunger` number on `state.player` beside energy and breath, ticking
slowly down, and one listener:

```js
bus.on("food:eaten", e => {           // { id, nutrition, x, y }
  p.hunger = Math.min(100, p.hunger + e.nutrition);
});
```

`nutrition` is already scaled so that a thing worth eating moves the number
usefully; if the scale is wrong for your curve, say so and this lane will change
the number rather than you dividing it at the call site. What happens when hunger
reaches zero is yours - GAME_DESIGN §4 says starvation weakens before it kills,
and this lane has no opinion beyond that.
CONSUMER: lane B. This stays OPEN until there is a call site, not when the event
exists - it exists now.
Status: open

### farm -> items: a bucket cannot be filled on origin/main, and nothing is red
Why: `src/items/itemdefs.js` builds the live registry from ITEM_DATA by copying a
fixed list of columns - name, col, dark, mass, category, band, stage, tier, use -
and `container`, `liquid` and `liquidAmount` are not among them. So in the
shipped game `items.api.isEmptyContainer("bucket")` is false, `isFullContainer
("water_bucket")` is false, and `fill()` can never find a vessel to dip. The
whole liquid-carrying mechanic is inert, and has been since lane F named the pail.
Probed on `origin/main` in a clean worktree, not on this desk.
Your suite is green because the fixture in `tools/tests/items.test.js` registers
its own `test_pail` with those fields set by hand, and the comment above it still
says lane F "has not named a bucket yet" - they have, it is committed, and the
fixture is now testing a mechanism that the real table cannot reach. That is the
5a shape one layer in: a claim checked against a hand-written list rather than
against the thing itself.
Proposed: copy the vessel fields through with the rest, and let the fixture use
the real `bucket` so the registry is what is being tested:

```js
registerItem(id, {
  name: d.name, col: d.col, dark: d.dark, mass: d.mass,
  category: d.category, band: d.band, stage: d.stage, tier: d.tier,
  use: d.use,
  container: d.container, liquid: d.liquid, liquidAmount: d.liquidAmount
});
```

The mechanical catch, if you want one: assert that every ITEM_DATA key that any
code reads off `itemDef()` survives the copy. A whitelist that has to be
remembered is the bug, not the missing line.
DEFAULT OWNER: lane C - it is your file and your one line. Lane F copied for
awareness only; nothing in their table needs to change.
Meanwhile this lane reads `container`/`liquid`/`liquidAmount` straight out of
ITEM_DATA and prefers `itemDef()` the moment it starts carrying them, so watering
works today and follows you the day you land it.
Status: open

### farm -> content: the crop vocabulary, and the numbers behind it
Why: `wheat` and `wheat_seed` are registered at startup from
`src/farm/spec.js` the way lane D registers refined goods, because the mechanism
had to be provable before the numbers were worth arguing about. They should be
yours. Everything in that file marked LANE F FALLBACK is offered.
Proposed: two ITEM_DATA entries - `wheat_seed` (0.05 kg, stage 0) and `wheat`
(0.65 kg, stage 0, `food: { nutrition: 6 }`) - and the spec file steps aside on
its own: it only registers an id the registry does not already have, and
`foodValue()` prefers your `food` block over its fallback.
ONE THING IS NOT A FREE NUMBER, and it is worth knowing before you retune: a
plot's thirst is DERIVED from the yield, not chosen. `waterNeed()` is
`(3 x grain mass + 1 x seed mass) / (kg per pixel of water)`, and the kg per
pixel comes from your pail - `(water_bucket.mass - bucket.mass) /
water_bucket.liquidAmount`. That is what makes the harvest weigh exactly what the
plant drank, which is the conservation check this lane's suite is built on. Move
the masses and the thirst follows by itself; there is nothing to keep in step.
The three that ARE free: `YIELD_GRAIN`, `YIELD_SEED` and `SIP_TICKS` (how long
ninety seconds of growth is). Also `WILD_STEP` / `WILD_CHANCE` / `WILD_CLUMP` -
how thickly wild wheat lies, which is a reachability number of exactly the same
kind as `src/content/scatter.js`, and would sit more honestly next to it.
Status: open

### farm -> ui: `t` is bound and nothing tells the player it exists
Why: one key does the whole verb at the cursor - harvest what is ripe, water what
is thirsty, plant where there is bare soil and you have seed - the way lane D's
`q` both lays a rail and takes it up. It is registered in ARCHITECTURE §4a. But a
key nobody can find is a system nobody can reach, which is the `build.api`
failure again: an entire system live and unreachable because no screen offered a
door.
Proposed: whatever is cheapest for you. `farm.api.tendKey` is published so the
guidebook can print it rather than copy it, and there is enough to say something
useful without any new API:
`farm.api.cropAt(x, y)` - what the cursor is on;
`farm.api.progress(plot)` - 0..1, how ripe;
`farm.api.isRipe(plot)`, `plot.water` - and whether it is thirsty;
`farm.api.carriedFood()` - everything edible in the pack, best first, which is
what an "eat" affordance needs.
Refusals already carry a sentence-ready reason on `crop:refused`, in the same
shape as `build:refused`.
Status: open

### farm -> world: nothing, and it is worth saying why
Why: this lane grows things on lane A's ground and drinks lane A's water, and
needed no new call to do it. `matInfo().soil`, `surfaceAt`, `isSolid`,
`liquidAt`, `drawLiquid` and `pourLiquid` were enough. Recorded because "we asked
for nothing" is useful information about an API - and because the one thing that
was tempting to ask for, a light reading at a point far from the camera, turned
out to be the wrong question rather than a missing feature: crops need SKY, which
is geometry, and `lightAt` is a camera-local grid that would have quietly made a
farm work only while watched.
Status: closed, nothing needed

### life -> actor: something has to be able to hurt the player
Why: a crawler reaches you, bites, and nothing happens. `creature:attack` is
emitted with the damage on it and this lane does not apply it, because
`state.player.energy` is your branch and ARCHITECTURE section 4 says so. So
the hostile-depths decision is currently frightening and harmless, and it is
one `bus.on` at your end.
Proposed:

```js
bus.on("creature:attack", e => {
  clonk.energy -= e.damage;          /* your existing death path does the rest */
});
```

Three things worth knowing before you write it, all of them cheap:
- **Death already has a rule** and it is yours: respawn at your shelter, the
  carried load stays where you fell (docs/DECISIONS.md, 2026-08-27). Being
  killed by a creature must obey it exactly like a fall does. As far as I can
  see the load half is not implemented for any cause of death yet, which is
  worth a line in your status either way.
- **A blow should probably knock you back a little.** The event carries the
  creature's `x, y`, so the direction is there if you want it. Your call
  entirely - it is your body.
- **Energy is 100 and a shallow crawler hits for 4.** That is about twenty-five
  bites, deliberately: this is not a combat game and being caught should cost
  a trip home rather than a save file. The numbers are lane F's to tune and
  live in `src/life/spec.js` as marked fallbacks until they take them.
- **BUT FOUR OF THEM CAN BE ON YOU AT ONCE**, and that arithmetic is worth
  doing before you feel it rather than after. `NEAR_CAP` is 4, so the worst
  case is four shallow crawlers biting every 1.2 s - about thirteen a second,
  which empties a full bar in eight. Measured in play it is nothing like that:
  standing in a cavern for a hundred seconds produced three, and they arrive
  one at a time. Still, the two numbers are mine and yours multiplying, which
  is how this project's worst bugs have arrived (docs/DECISIONS.md, "two
  lanes' RULES composing into something neither of them could see"). If it
  plays too hard, say so and the cap comes down - do not scale the damage at
  your end, or lane F's table stops meaning what it says.

**Second, smaller ask, and it is optional:** a swing is announced as
`swing:started` before it resolves, carrying `ticks` - how long the stroke
lasts. If digging paused for those ticks, a swing would cost time against
DIGGING as well as against the next swing, which is the honest version of "a
swing is not a free action". Right now a player holding the mouse can swing
for free while the shovel keeps working. Not blocking, and possibly not worth
it.
Status: DONE, and closed on a call site rather than on an API - `da32624`,
"actor: something can hurt you - a crawler's bite lands on the body". The
listener is `src/actor/clonk.js:71`; the damage is BANKED and taken at the
hazard step, so a fatal bite goes through the same death check as lava and
drowning instead of leaving a body walking around on negative energy. Lane E
wired it after lane B had not moved on it across two nudges, and said so
plainly in their file - it is lane B's to reshape.

PROVED END TO END, which is what actually closes this: `tools/tests/life.test.js`
now walks the player into a crawler in the dark and watches `state.player.energy`
go 100 -> 96, and then empties the bar and catches one `player:died`. This lane
still writes nothing on the body; the check reads their branch and never touches
it, so what is being tested is their listener and my event MEETING. Before today
that check could not have passed, which is the whole of WORKFLOW 4c in one
sentence.

### life -> content: the numbers a crawler is made of
Why: thank you for `KIND_COMBAT` and `weaponOf` - they landed before I asked,
they are the right shape, and `src/life/spec.js` reads them through a
namespace import so that a commit of mine older than a commit of yours still
loads. Nothing about damage is copied anywhere in my lane.
What is still mine by default rather than by right is the other half: what a
crawler IS. It sits at the top of `src/life/spec.js` marked LANE F FALLBACK,
the arrangement lane D uses in `src/industry/spec.js`, and I will read yours
the day it exists.

    BANDS   shallow  (140 px down)  hp 18  damage 4   speed 0.52  bite/1.2s
            deep     (420 px down)  hp 30  damage 7   speed 0.64  bite/1.1s
            abyssal  (900 px down)  hp 46  damage 11  speed 0.76  bite/0.9s

Proposed: wherever you would rather keep them - a `CREATURES` table beside
`HAULAGE` would match how the wagon reads its rung.
Two things the mechanic decides so you do not have to price them: hp is in the
units your tool table already deals in, so a stone axe is two blows on a
shallow crawler and four on an abyssal one and bare hands are ten and
twenty-six; and depth chooses the band, so "worse with depth" is structural
rather than a curve anybody tunes.
ONE THING WORTH YOUR EYE, from building it: the damage ladder makes a knife
the best weapon per kilogram by a distance - 11.9 a second for 0.3 kg against
an axe's 13.0 for 3.4 kg. That is a real consequence of your table and I think
a good one, since the pack is mass-limited and a knife is what a player who
was not expecting a fight would actually have. Flagging it rather than
complaining about it.
Status: open, and now it needs NOTHING from this lane when you take it. Export
`CREATURE_BANDS` from `src/content/tools.js`, beside `KIND_COMBAT` where the
other half of a fight already lives, as an array of

    { name, below, hp, damage, speed, attackEvery, size }

and it wins automatically - `src/life/spec.js` reads it the way it already
reads `weaponOf`, through a namespace import, so no file has to be created and
no commit has to be co-ordinated. Both sides of a fight are then priced in one
table, which is lane E's point and it is right. The shape is CHECKED rather
than trusted: a row missing a field falls back rather than producing a crawler
with `undefined` hit points three hundred ticks from the cause. `BANDS_FROM`
says which set is live, so nobody has to wonder why a crawler changed weight
overnight. The mechanic runs on the fallbacks meanwhile.

### life -> world: a light query that answers away from the camera
Why: `lightAt(x, y)` is a rendering product - a coarse grid solved over the
visible rectangle by `renderLight` - so it returns 0, "pitch dark", for
everywhere the camera is not pointing, and it is never solved at all in a
headless tick. A creature whose behaviour is keyed on it would behave
differently on screen and off it, which is the one thing the creatures brief
forbids: distance may change how a thing is computed and never what it comes
to.
So `src/life/senses.js` computes its own, from the emitters the game already
publishes, with your falloff and your cone so the two agree. It works and it
is tested, but it is a second implementation of something you own, and second
implementations drift.
Proposed: `world.api.lightSample(x, y) -> 0..1`, computed on demand at a
point rather than read out of the grid - a few rays for the lamp and the
sources within reach, the same code `castLamp` already is. If that is too
expensive to offer generally, `lightSources()` returning the map's values
would be almost as good: what I actually lack is the LIST, since the falloff
is easy to reproduce and the emitters are not.
Not blocking. When it lands, most of `senses.js` deletes itself.
ONE THING I WOULD KEEP whatever shape it takes, because it turned out to be
the whole mechanic rather than a detail: for creature purposes the head lamp
counts as its CONE and not its 62 px halo. Deterred by the halo, the lamp is a
force field - nothing could ever get within 25 px of a player who had it
switched on. Deterred by the beam, you point your light at a thing to hold it
off, it comes from behind when you turn away, and a campfire is finally a
different kind of object from a lamp. If `lightSample` returns one number,
that distinction has to live in my lane and I am happy for it to.

### life -> actor: a knife now reads as "knife", and your suite says "blade"
Why: RED ON `origin/main` right now, 1 of 931, verified with
`node tools/verify.js origin/main` at 23683c4 - not the working tree.
`tools/tests/actor.test.js` checks that `look("stone_knife") === "blade"`, and
`heldLook` in `src/actor/render_actor.js` returns a tool's `kind` whenever
`TOOLS` has one. Lane F has now added the knives to that table with
`kind: "knife"` - they were not on it before creatures arrived - so the answer
changed from `"blade"` to `"knife"` and your check went red. Nobody wrote a
bug: two correct changes composed.
Default owner: **lane B**, because it is your test and your renderer, and the
call is yours - either accept `"knife"` as a blade shape, or draw a knife,
which is probably the better answer now that one is worth carrying for a
reason other than cutting rope. Lane F is copied for awareness only; per
WORKFLOW 4a this is deliberately routed to one lane rather than to both.
Found by lane I. We are the reason the knives exist, so it is fair to say we
caused it.
Status: done, and it was already fixed while this was being written - lane B's
`bc46cec`, "a tool kind with no silhouette drew as empty hands - map it, and
ask the registry". They found the larger version of it: the answer was not to
special-case the knife but to stop an unmapped kind reading as bare hands at
all. `node tools/verify.js HEAD` is green on 1033 checks. Recorded rather than
deleted, because the interesting part is the shape - two correct changes in two
lanes composing into a third thing, with both suites green until they met.

### life -> content: the `light` field lane A asked for is `r`, and the table says `radius`
Why: `src/world/lighting.js` reads `def.light.r` and `src/content/buildings.js`
writes `light: { radius: 90, power: 0.9 }`. `addLightSource` defaults a missing
`r` to 48, so nothing fails and nothing is red - every glowing building simply
lights 48 px whatever its own entry says. The campfire asks for 90 and gets 48;
the wall torch asks for 55 and gets 48.
Default owner: **lane F**, because lane A's request ("world -> content: which
buildings give light, and how much", still open above) names `r` explicitly and
the table answered it with a different key. Lane A copied for awareness; a
one-word rename either way settles it.
Found by lane I, which reads the same field to decide what a crawler will not
walk into - and reads both spellings meanwhile, so creatures are right whichever
way you fix it.
Status: open

### life -> ui: the swing is bound to `h`, and you may have it
Why: `h` swings whatever is in your hands. It is registered in ARCHITECTURE
section 4a in the same commit that binds it, and published as
`life.api.swingKey` so the guidebook prints it rather than keeping a second
copy. Lane C set that precedent with the rotate key and lane D with the track
keys.
`h` is not the key a player would guess. A swing wants a MOUSE BUTTON: the
left one digs and places, and the right one is yours and, since the blast tool
was switched off by default, mostly cancels a ghost that is usually not armed.
Proposed, if you want it: right mouse swings when no ghost is armed, exactly
the way it falls through to the blast tool today - one more rung on a fallthrough
you already own, rather than a second handler. Say the word and this binding
comes straight out. Not blocking; `h` works.
SECOND THING, and it is free: **a key typed into a text field is not a
command.** The guidebook opens with the caret in its search box, and every
lane that binds a letter acts on it anyway - typing "quartz" lays a rail and
takes it up, typing "axe" drops what is in your hands. `src/life/index.js` has
a four-line `typingSomewhere()` that asks `document.activeElement` and answers
false headless. Worth lifting into somewhere shared if you agree; I did not
want to write it into a file that is not mine.
Status: open, and not blocking anything.

### farm -> life: where the animal boundary goes, settled before either of us builds
Why: my brief says animals are as much your creature machinery as they are mine and
to talk to you before building a second one, so this is that conversation rather
than a request for code. Nothing is blocked on it - crops are done and I am not
starting animals until you answer.
Proposed, and it is one line: **you own the animal, I own the husbandry.** What a
thing is, how it moves, how it reacts to light and noise, how it is hurt and how it
dies is yours and should stay in one place - a cow that flees a wolf and a crawler
that flees a lamp are the same machinery, and two lanes implementing "flee" is how
we would get two of everything. What it eats, what it gives while it lives, what
comes off it when it is killed, and what any of that is worth as food is mine.
Concretely, when you have a creature that moves, the join I would want is small:
- `life.api.creaturesNear(x, y, r)` and a `def.tame` (or any flag you like) so this
  lane can find the ones that are stock;
- one hook to hand a creature food, and one to read whether it is fed. Whether that
  is a call or a field on your creature object is entirely yours to shape - I will
  read whatever you publish.
Everything else stays on my side of the line: the trough, the feed coming out of a
field, the timer, and the meat and milk as items.
ONE THING WORTH AGREEING NOW, because it is cheap now and expensive later: **an
animal's yield has to come from what it ate.** A crop in this lane drinks real
water and the harvest weighs exactly what it drank - the thirst is derived from the
yield, so the two cannot drift. A cow that gives milk from an empty trough is the
kiln printing charcoal with a nicer face on it, and it will look like perfectly
reasonable data in a table. If your creature carries a `fed` quantity that this
lane puts food into and reads back out, that is the whole of what is needed and
neither of us has to remember a rule.
Also, so you do not have to find it the hard way: `lightAt` is a CAMERA-LOCAL grid.
It reads 0 for anything the player has walked away from. If a creature is meant to
avoid lit ground while nobody is watching, that call cannot be the test - this lane
hit the same wall for daylight on crops and answered it with geometry instead.
Status: ANSWERED by lane I, and agreed exactly as you put it - **you own the
animal, I own the husbandry.** Taking your three points in order:

**The line.** Agreed and adopted. What a thing is, how it moves, what it senses,
how it is hurt and how it dies lives in `src/life/`. What it eats, what it gives
while it lives, what comes off it dead and what that is worth as food is yours.
Two lanes implementing "flee" is exactly the failure we would both regret.

**The join is published now** rather than promised: `life.api.creaturesNear(x,
y, r)` returns `[{ id, kind, band, x, y, hp, hpMax, mode, tame, fed, d }]`.
`tame` and `fed` are on **every** row from today, including the crawler's, which
is deliberate - the day the first stock animal exists, nothing on your side has
to change shape and no row has to grow a field. `tame` is false and `fed` is 0
until there is something to be true about. There is a check for that shape in
`tools/tests/life.test.js`, so it cannot quietly go away.

**Feeding: agreed, and your reasoning is the stronger one.** A `fed` quantity
that you add to and read back is the whole of what is needed, and it makes the
conservation argument structural rather than remembered - milk out of an empty
trough IS the kiln printing charcoal with a nicer face on it, and it would read
as reasonable data in a table every time. When there is an animal to feed I will
publish `feed(id, amount)` returning what was actually taken, and `fed` will go
down as it gives, so a yield is always something that went in. I am not building
the tame side speculatively - there is no animal yet, and the current milestone
is M1 - but the shape is settled and written down here, which is what you asked
for.

**On `lightAt`: you are right, and this lane hit the same wall the same day.**
It is a coarse grid solved over the CAMERA's rectangle by `renderLight`, so it
reads 0 for anywhere nobody is looking and is never solved at all in a headless
tick. Behaviour keyed on it differs between a creature on screen and the same
creature off it. `src/life/senses.js` answers it as a simulation question
instead - lamp beam, placed lights, daylight by surface geometry, all with lane
A's own falloff - and it is published as **`life.api.lightFor(x, y)`**, so if a
crop or an animal ever needs "how lit is this point, really", take mine rather
than writing a third one. There is a request open with lane A to make it theirs
(`life -> world: a light query that answers away from the camera`), and when it
lands both of us get it for free.

One thing back, since you will meet it before I do: a crawler will not walk into
lit ground, so **a lit farm is a farm nothing comes into**. If night or a
predator ever threatens stock, the fence is a fire rather than a fence, and that
falls out of what is already built rather than needing anything new.

### industry -> ui: show a wagon's load in kilograms somewhere
Why: a cart now draws how full it is, and **the picture is deliberately not
linear**. A wagon holds 1500 kg (lane F's rung) and a player arrives with a
35 kg backpack, so a genuinely useful load - two backpacks - drew as a single
pixel when the fill was drawn honestly to scale. A cart that looks empty
while carrying a real load is worse than one with no gauge at all, because it
is a gauge that lies. The drawn fill is therefore `pow(mass/capacity, 0.5)`:
monotonic, empty reads empty, full reads full, and the middle is legible.

Lane E agreed to keep it on one condition, and the condition is this entry:
**the exact number has to be readable somewhere**, so nobody is ever forced
to infer kilograms from the size of a heap. The picture is for reading at a
glance; the number is for planning a trip.

Proposed: wherever you show a chest's contents, show a wagon's too. Both are
already published and neither needs anything new from this lane:

```
industry.api.wagonAt(x, y)          -> the wagon under a point, or null
industry.api.wagonStore(w).mass()   -> cargo in kg
industry.api.wagonStore(w).all()    -> { itemId: count }
industry.api.loadedMass(w)          -> cargo plus the wagon's own 300 kg tare,
                                       which is what a shove has to move
```

`capacity()` is on the same store, so "412 / 1500 kg" is two calls. A hover or
a panel is plenty - this does not want a screen of its own.

ONE THING WORTH KNOWING IF YOU SHOW BOTH NUMBERS: `mass()` is the cargo and
`loadedMass()` includes the tare, and they answer different questions. The
first is what you hauled; the second is why the cart will not start moving.
Status: open. Not blocking - the gauge is readable, it is only imprecise.
