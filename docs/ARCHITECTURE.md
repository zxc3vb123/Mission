# Mission — Architecture

How the code is split so that six chats can work at once without colliding.
LANE E owns this document. If you need something it does not allow, write the
request in `docs/REQUESTS.md`; do not solve it by editing another lane's files.

## 1. Folder ownership

| Folder | Lane | Owner of |
| --- | --- | --- |
| `src/core/` | E | loop, state, event bus, input, camera, renderer, shape physics, fx |
| `src/world/` | A | landscape buffers, materials, generation, digging, liquids, spoil, lighting |
| `src/actor/` | B | the character: movement procedures, physics, survival stats, tool use |
| `src/items/` | C | item registry, inventory, dropped chunks, crafting logic |
| `src/build/` | C | placement of structures, structure behaviour |
| `src/industry/` | D | hauling machines, power, pumps, rails, production, the rocket |
| `src/content/` | F | data tables: items, recipes, buildings, progression, guidebook text |
| `src/ui/` | **H** | every player-facing screen: HUD, hotbar, load bar, crafting, inventory, the guidebook panel |
| `src/ui/sandbox.js`, `src/ui/whatsnew.js` | G | the test world and the what's-new panel |
| `src/ui/menu.js`, `src/ui/style.css` | H | shared surfaces - G and E may add one registration line each |
| `tools/tests/` | each lane owns its own test file | |

**A chat edits only its own folders.** No exceptions. Two chats editing one file
is the only thing that can actually break this project.

## 2. What a system looks like

```js
export function createThing(deps){
  return {
    name: "thing",
    init(){},                  // optional, called once
    tick(){},                  // 36 Hz simulation step
    renderItems(ctx){},        // any render hook (see below)
    serialise(){ return {} },  // optional: your state for the save file
    restore(data){},           // optional: put that state back
    api: { /* the ONLY things other lanes may call */ }
  };
}
```

### Saving: `serialise()` / `restore(data)`

A save is the world seed plus whatever each system chooses to write. Core does
not know what a landscape or an inventory is — it calls your two hooks and puts
the result under your system's `name`. Return anything JSON-able, or `undefined`
to save nothing.

Loading runs in this order: the world is regenerated from the saved seed, then
every system's `restore()` is called, then core puts back the inventory, the
player pose and the camera. So `restore()` can assume a freshly generated world
of the right seed and should apply only *changes* on top of it.

Until a lane implements these hooks, its state is not saved. Core saves the seed,
player pose, inventory and camera by itself, so a load already rebuilds the same
world and puts the player back — but dug tunnels, structures and machines return
only once lanes A, C and D write their hooks (see `docs/REQUESTS.md`).

Register it in `src/systems.js` — that file is lane E's, and it has marked slots
where lanes C, D and F plug in. Adding your line there is the one edit outside
your folder you are allowed to make.

## 3. Render hooks and their order

Implement any subset. `core/render.js` calls them in this order:

```
screen space : renderSky, renderParallax
world space  : renderBack, renderLandscape, renderScenery, renderBuild,
               renderItems, renderActor, renderLoose, renderFX, renderLight
screen space : renderOverlay
```

`renderLight` is last in world space on purpose: darkness is composited over
everything the player can see. If your machine should glow, publish a light
source (see §5), do not draw over the darkness yourself.

## 4. Shared state (`src/core/state.js`)

Everyone may read all of it. You may only write the branch your lane owns:

| Branch | Written by |
| --- | --- |
| `state.view`, `state.cam`, `state.tick`, `state.fps`, `state.debug` | E |
| `state.world` (size, seed, waterLevel, spawn) | A |
| `state.player` (x, y, dir, act, energy, breath, aim, lamp) | B |

New branches are a core change. Ask first.

## 4a. Input ownership

Two cross-lane collisions in one day came from two lanes binding the same
input without either knowing: a left click both placed a building and dug, and
right click both cancels an armed ghost and fires the blast tool. Neither shows
up as a failing test, because each lane's own behaviour is correct in isolation.

So inputs get an owner, the way state branches do in section 4. **Check here
before binding anything, and add your row in the same commit that binds it.**

| Input | Owner | What it does |
| --- | --- | --- |
| A D W S, arrows, space | actor | movement |
| shift | actor | dig with the keyboard |
| left mouse | actor + build | dig; and places when a ghost is armed. The actor latches on `structure:placed` / `build:refused` so one click never does both |
| right mouse | ui | RESOLVED. One handler, in `src/ui/hud.js`, and the suite fails if a second file in `src/ui` binds button 2. It cancels an armed ghost; failing that it fires the blast tool, which is now **off** unless switched on in Settings. Cancelling wins because it is a real player action and the blast is an engine test tool. `src/ui/build.js` publishes `ghostArmed()` / `cancelGhost()` rather than listening itself — two handlers checking each other would only have made the outcome depend on bus order |
| 1-8 | items | hotbar selection |
| x | items | drop the held item |
| b | ui | build menu |
| c | ui | crafting |
| i | ui | pack |
| g | ui | guidebook |
| n | ui | what's new |
| l | ui | lamp |
| m | core | mute |
| f v r | ui | free camera, show vertices, new world |
| esc | core | menu, and closes any open screen |
| arrows, enter | ui | only while a screen is open, for navigating it |

A screen that swallows a key while it is open is fine and expected - the
guidebook takes the arrows and enter for its search. What is not fine is two
systems acting on the same input in the same frame with neither aware of the
other.

## 5. Published APIs

Only these may be called across lanes. Everything else in a folder is private.

**world.api** (lane A)
```
matAt(x,y) isSolid(x,y) isLiquid(x,y) isFree(x,y) matInfo(x,y)
digSpeedFor(matIndex,toolId) -> pixels/second, 0 = this tool cannot cut it
digTierFor(matIndex) -> 0..4, or null if nothing ever cuts it
digFreeCircle(x,y,r,collect,toolId) -> { freed, blocked }
anyDiggable(x,y,r,toolId) -> bool
chopAt(x,y,r,toolId) -> { hit, felled, progress, canChop }
dumpMaterial(x,y,matIndex,pixels) -> { accepted }
dumpItem(x,y,itemId,count) -> { accepted, pixels }
pixelsPerItem(matIndex) materialForItem(itemId) canDump(matIndex) pourStats()
addSupport(id,x,y,w,h) removeSupport(id) caveConfig caveStats() clearLoose()
treeAt(x,y,r) -> { x, y, standing, progress } | null    chopSpeedFor(toolId)
blast(x,y,r)
setMat(x,y,m)
lightAt(x,y) -> 0..1        lightConfig
surfaceAt(x) size() counts() chunkStats() regenerate(seed)
```
The map is 4096 x 2560 and is streamed in 128 px chunks around the camera, but
that is invisible from here: `matAt` answers for any pixel on the map and pages
the ground in if it has to. Two consequences other lanes do need to know:
**only loaded ground is simulated** (liquids and collapses run in a band around
the camera, not across the whole map), and a read far from the camera costs a
chunk generation, so do not sweep the map pixel by pixel. `chunkStats()` reports
what is resident, for tests and the HUD.

Digging is gated by tool tier (`docs/DECISIONS.md` 2026-08-28) and the gate is
inside digging, so no caller can bypass it. The trailing `toolId` is optional:
pass it (`null` means bare hands) and material above the tool's tier behaves
exactly like granite; omit it entirely and there is no gate, which is what tests
and machines with their own rules use. The tier table is lane F's
`src/content/tools.js`.

Material goes back into the world through `dumpItem`, which is the other half of
conservation of matter: one item returns exactly the pixels it cost to dig. It is
poured rather than placed — a few loose pixels a tick that fall and settle by the
existing rules — so a heap somebody pours is a heap the world agrees with. A pour
that runs out of room holds its load and reports it through `pourStats().stalled`;
it never destroys material.

Felling a tree emits its logs as `dig:yield` with item `wood` — that event means
"the world yielded an item at this point", not "someone dug". `tree:felled` is a
notification alongside it (for sound, the guidebook, statistics); anything that
listens to both must not spawn the logs twice.
*planned:* `addLightSource(id,{x,y,r,power})`, `removeLightSource(id)` — lane A, M3.

**actor.api** (lane B)
```
pos() respawn() setLamp({on,radius,cone,power}) tool() clonk
```
*planned:* `carry()`, `setCarryLimit(kg)`, `useTool(id)`.

**items.api** (lane C)
```
inventory { add take has count all clear reset
            carriedMass() capacity() setCapacity(kg) freeMass()
            fits(id,n) canAccept(id,n) isFull() load() encumbrance()
            restoreCounts(counts) }
carryStart carryBest
equipped() -> { id, def, count } | null
hotbar { slots() selected() select(i) next() prev() assign(i,id) size }
registerItem(id, def) itemDef(id) items order
spawnDrop(x,y,id,opts) clearDrops() dropCount()
drop(id,n) dropEquipped(n) grabKey dropKey
pour(id,n,x,y) isPourable(id)
```
The backpack is mass-limited in kilograms, `carryStart` (35) to `carryBest` (60).
`add(id,n)` returns **how many it actually took**, 0 when the pack is full, and
fills partially rather than refusing a whole stack. `clear()` empties the
contents; `reset()` also puts the pack size back. Lane B reads `encumbrance()`
(0 below 65% of capacity, ramping to 1 when full) to slow the walk.

The hotbar is a view onto the pack, not storage: an item you acquire takes the
first free slot, a slot whose item runs out is freed, and number keys 1-8 pick
the slot in the clonk's hands. `equipped()` is what lane B digs with, and it is
null once the last one is used up.

`spawnDrop`'s `opts.wild` marks something that grew where it lies rather than
being dug, which is how the scatter knows how much of itself to regrow.

**Ground goes back to being ground.** Dropping soil, sand, clay or gravel
*pours* it into the world through lane A's `dumpItem`, so a player can build a
small hill out of what they dug; `pour(id,n,x,y)` does it at a chosen spot. The
line is drawn by the tier table rather than a list: **only what hands can dig
back out is poured**, so ore and rock are thrown as chunks instead — turning a
pack of iron ore into ore-bearing rock that now needs a pickaxe would be a trap.
A pour costs the carried item, or the backpack is an infinite quarry.
`ground:poured` reports it; `pour:stalled` carries lane A's stalled count, which
is what a heap grown into a ceiling looks like.

`drop(id, n)` throws items out of the pack and returns how many went; `x`
(`dropKey`) throws what is in your hands. Auto-pickup stops once the pack is
past the burden line, so walking across a scattered surface no longer loads
you up with things you did not choose — hold `control` (`grabKey`) to take
things anyway. `pickup:refused` carries `reason: "full" | "burdened"` so the
HUD can say which.

**gatherables.api** (lane C) — `wildCount()`, `seedSurface()`. Sticks, plant
fibre and loose rock lying on the surface: the only source of the three things
stage 0 is made of. Registered in the lane C slot of `src/systems.js`.

**crafting** (lane C, on `items.api`)
```
canCraft(recipeId)          -> { ok, reason, missing:[{id,need,have}],
                                 needsStation, needsTool, busy, overBy, recipe }
craft(recipeId, stationId)  -> { ok, reason?, outputs?, started?, timed?, ticks? }
nearbyStations()            -> Set of station ids you may work at
craftable()                 -> every recipe possible right now
craftProgress()             -> [{ defId, recipeId, progress, ticksLeft, x, y }]
```
Recipes come from lane F's `RECIPES` and are never hard-coded here. A verdict
is structured, never a sentence — the UI writes the copy, so the crafting
screen and the guidebook can say the same fact in different voices from the
same data. `station: "hand"` needs nothing built and `nearbyStations()` always
contains `hand`; anything else needs a **finished** building of that id within
40px. A recipe's `tool` is a capability: required in the pack, never consumed.
**Making is instant; processing takes time** (`docs/DECISIONS.md`). A hand or
workbench recipe returns `timed:false` with the goods in `outputs`. A recipe at
a *processing* station — the kiln and the forge — returns `{ ok:true,
started:true, timed:true, ticks }`: the inputs leave the pack at once, the
station works **whether or not the player is anywhere near it**, and the output
waits inside the station until collected. `craft:done` carries `x, y, station`
for those. A station takes one job at a time and reports `busy:true` rather than
`needsStation` while it is working.

Two consequences worth knowing across lanes. A finished bar in a forge is
reachable through the same `storageAt()` container a chest answers to, so lane D
can pull from a station with nothing new. And a station destroyed mid-job
returns its inputs *and* its uncollected output as real chunks — conservation of
matter does not get an exception for being mid-smelt — with
`structure:collapsed` naming them in `held` and `interrupted`.

**build.api** (lane C)
```
place(defId,x,y)     -> { ok, reason?, missing?, structure? }
canPlace(defId,x,y)  -> the same verdict, without building anything
structuresNear(x,y,r) -> [structure]
stationsNear(x,y,r)  -> Set of built station ids
storageAt(x,y)       -> container { capacity mass free count all fits add take }
jobAt(structure)     -> 0..1 progress, or null
isProcessingStation(defId)
structureAt(x,y)     -> the structure under a point, or null
climbableAt(x,y)     -> a finished ladder at this point, or null
deconstruct(x,y)     -> start taking one apart, { ok, returns, ticks }
cancelDeconstruct(x,y)  deconstructProgress(x,y)
wouldReturn(x,y)     -> what taking it apart would give back
recoverFraction(itemId)
has(defId) all()
ghost(defId, opts) clearGhost() ghostDef() ghostVerdict()
rotateGhost() ghostRot()   `t` turns the armed piece
deconstruct/cancel is also bound to `delete` at the cursor
claimingClicks()     -> is this click the build menu's rather than the shovel's
                        (the `build:ghost` event is the same fact; lane B's
                        dig suppression listens for it — see clonk.js)
reach stationRadius
```
A structure is an object standing ON the world, never a landscape pixel — the
landscape stays lane A's. Costs, footprints and support come from lane F's
`BUILDINGS`; this lane implements the mechanics that read them.

Two laws are enforced here rather than assumed. **Nothing floats:** support is
checked at placement and again while a building stands, so digging out its
footing brings it down. **Matter is conserved:** a collapse returns everything
it was made of as real chunks. A refusal always carries a `reason` the UI can
show, and `missing` when it is materials — one verdict function serves the
ghost preview, the build menu and the placement itself, so the preview can
never promise what placement then refuses.

A building is not finished when it appears: `def.time` seconds of work stand
between a heap of materials and a working station, and `has(defId)` is false
until then.

**Two modes of building, one support model.** A *prefab* is a whole thing —
pick a sawmill, place a sawmill — which is right for a machine with a defined
shape and job. A *piece* (`piece: true`, `support: { piece: true }`) is a plank:
the player decides the shape, one rectangle at a time, and pieces hold each
other up. Pieces rotate 90° — `place(defId, x, y, { rot })`, `rotateGhost()` —
so one plank def is both a beam and a post.

Pieces **snap flush** to what is already there: each axis lines up with a
nearby piece's edges within `SNAP` px, so a rough aim past the end of a deck
lands level and touching. Candidates that would overlap or bury the piece are
discarded, so snapping never moves it somewhere you could not build — aim at a
gap and you keep the gap. Aligning beats being near, or the untouched cursor
position always wins and nothing ever snaps.

**The span rule** is what stops that being an infinite floating scaffold.
Something directly beneath a structure — terrain *or* another structure — makes
it span 0. Held only from the side, it is its neighbour's span **+1**. Past
`MAX_SPAN` (lane F's number) nothing holds it and it falls. So a column is free,
because each piece has one under it; a floor reaching out from a post gains a
span per plank and must be propped before it runs out. "Put a post there" is a
rule the player infers by building rather than by reading. Spans propagate
outward *from the ground*, so two pieces leaning on each other with nothing
beneath both fall.

A **wall-fixed** thing is the exception: only a wall holds it, never a
neighbour, or digging the rock out behind a run of ladders would leave them
hanging in the shaft.

**Support has kinds, because not everything stands on the ground.** A building
says which it needs: `support.ground` (a fraction of the footprint over solid
ground, the default), `support.wall: true` (fixed to solid material beside it
over at least half its height — a ladder in a shaft), or `support.anchor:
"above"` (hung from something solid overhead, or from another climbable section
it extends). Wall-fixed and hanging things are placed **where the cursor
points** rather than dropped to the floor: a ladder that fell to the bottom of
the shaft would be at exactly the wrong end of it. Every kind is re-checked
while the building stands, so digging the wall out from behind a ladder brings
it down.

`climb: true` makes a building climbable, and **lane B reads
`build.api.climbableAt(x, y)`** — the structure, or null. That is the whole
contact test.

**Deconstruction** takes a building down on purpose: it takes half the build
time, can be cancelled, and returns its materials as chunks on the ground
rather than into the pack — a workbench is 104 kg and the pack holds 35. How
much comes back is **per-material, not a flat fraction**: `recover: 0..1` on an
entry in lane F's `items.js`, defaulting to 1. The lever means something rather
than taxing the player — a fired brick prised out of a wall is still a brick,
while quicklime slaked into mortar is chemically part of that wall. Anything a
building is merely *holding* (a job's inputs, an uncollected output, the
unworked share of a half-built structure) comes back whole regardless, because
none of it was ever built in.

**industry.api** (lane D, not built yet) — `powerAt(x,y)`, `registerMachine(def)`,
`rocketProgress()`.

**content** (lane F) — plain data modules, imported directly by anyone:
`ITEM_DATA`, `RECIPES`, `BUILDINGS`, `STAGES`, `GUIDE`.

## 6. Events (`src/core/bus.js`)

Emit and listen; never reach into another lane to make something happen.

| Event | Payload | Emitted by |
| --- | --- | --- |
| `world:generated` | `{ seed }` | A |
| `dig:yield` | `{ item, x, y }` | A |
| `tree:felled` | `{ x, y, wood }` | A |
| `cave:warning` | `{ x, y, span }` | A |
| `cave:in` | `{ x, y, amount, mat }` | A |
| `cave:safe` | `{ x, y }` | A |

Lane A listens to lane C's `structure:placed` / `structure:collapsed` and treats
any building lane F marks `props: true` as holding the roof above it up, so
cave-in support needs no call from anyone.
| `inv:changed` | `{ id, count, mass }` | C |
| `item:collected` | `{ id, x, y }` | C |
| `pickup:refused` | `{ id, x, y, reason }` | C |
| `item:equipped` | `{ id }` | C |
| `item:dropped` | `{ id, n, x, y }` | C |
| `ground:poured` | `{ id, n, x, y, pixels }` | C |
| `pour:stalled` | `{ id, x, y, stalled }` | C |
| `pour:refused` | `{ id, x, y, stalled }` | C |
| `structure:placed` | `{ defId, x, y }` | C |
| `structure:built` | `{ defId, x, y }` | C |
| `structure:collapsed` | `{ defId, x, y, why, dropped, held, interrupted }` | C |
| `structure:deconstructing` | `{ defId, x, y, need, returns }` | C |
| `structure:removed` | `{ defId, x, y, why, returned, dropped }` | C |
| `build:refused` | `{ defId, reason, missing }` | C |
| `build:ghost` | `{ active, defId }` | C, consumed by B |
| `storage:changed` | `{ id, count, x, y }` | C |
| `craft:done` | `{ recipeId, outputs, x?, y?, station? }` | C |
| `job:started` | `{ defId, recipeId, x, y, need }` | C |
| `player:died` | `{ x, y }` | B |
| `input:key` | `{ key, down }` | E |
| `input:mouse` | `{ button, down }` | E |
| `game:saved` | `{ ok, error }` | E |
| `game:loaded` | `{ seed }` | E |

*planned:* `spoil:produced { matIndex, amount, x, y }` (A),
`power:changed { netId, watts }` (D),
`stage:advanced { stage }` (F).

Add a row here in the same commit that adds the event.

## 7. Rules that keep this working

1. Edit only your folders (plus your marked slot in `src/systems.js`).
2. Cross-lane calls go through published APIs or the bus. Never import another
   lane's internal file.
3. Simulation is deterministic: use `core/rng.js`, never `Math.random()` in
   simulation code, so a seed reproduces a world.
4. Simulation runs at a fixed 36 Hz. Never tie physics to frame time.
5. Rendering never mutates simulation state.
6. Every lane keeps its tests green: `node tools/run-tests.js` - check the
   EXIT CODE, not the last line of output.
   A lane owns `tools/tests/<its>.test.js` and may add its own two lines to
   `tools/run-tests.js` (the import and the SUITES entry) without asking.
   That is a registration line like the one in `src/systems.js`, not a core
   change - waiting on lane E for it has been a bottleneck three times.
7. Conservation of matter is a hard rule, not a feature (see GAME_DESIGN §2).
8. When you finish something, update `docs/STATUS.md` and, if you added an API or
   event, this file — in the same commit.
