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