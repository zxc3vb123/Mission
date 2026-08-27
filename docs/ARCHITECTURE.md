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

Felling a tree emits its logs as `dig:yield` with item `wood` — that event means
"the world yielded an item at this point", not "someone dug". `tree:felled` is a
notification alongside it (for sound, the guidebook, statistics); anything that
listens to both must not spawn the logs twice.
*planned:* `dumpMaterial(x,y,matIndex,amount)`, `addLightSource(id,{x,y,r,power})`,
`removeLightSource(id)` — lane A, milestone M2/M3.

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

`drop(id, n)` throws items out of the pack and returns how many went; `x`
(`dropKey`) throws what is in your hands. Auto-pickup stops once the pack is
past the burden line, so walking across a scattered surface no longer loads
you up with things you did not choose — hold `control` (`grabKey`) to take
things anyway. `pickup:refused` carries `reason: "full" | "burdened"` so the
HUD can say which.

**gatherables.api** (lane C) — `wildCount()`, `seedSurface()`. Sticks, plant
fibre and loose rock lying on the surface: the only source of the three things
stage 0 is made of. Registered in the lane C slot of `src/systems.js`.

*planned:* `canCraft(recipeId)`, `craft(recipeId, stationId)`,
`nearbyStations()`.

**build.api** (lane C)
```
place(defId,x,y)     -> { ok, reason?, missing?, structure? }
canPlace(defId,x,y)  -> the same verdict, without building anything
structuresNear(x,y,r) -> [structure]
stationsNear(x,y,r)  -> Set of built station ids
storageAt(x,y)       -> container { capacity mass free count all fits add take }
has(defId) all()
ghost(defId) clearGhost() ghostDef() ghostVerdict()
reach
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
| `inv:changed` | `{ id, count, mass }` | C |
| `item:collected` | `{ id, x, y }` | C |
| `pickup:refused` | `{ id, x, y, reason }` | C |
| `item:equipped` | `{ id }` | C |
| `item:dropped` | `{ id, n, x, y }` | C |
| `structure:placed` | `{ defId, x, y }` | C |
| `structure:built` | `{ defId, x, y }` | C |
| `structure:collapsed` | `{ defId, x, y, why, dropped }` | C |
| `build:refused` | `{ defId, reason, missing }` | C |
| `storage:changed` | `{ id, count, x, y }` | C |
| `player:died` | `{ x, y }` | B |
| `input:key` | `{ key, down }` | E |
| `input:mouse` | `{ button, down }` | E |
| `game:saved` | `{ ok, error }` | E |
| `game:loaded` | `{ seed }` | E |

*planned:* `spoil:produced { matIndex, amount, x, y }` (A),
`craft:done { recipeId }` (C), `power:changed { netId, watts }` (D),
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
6. Every lane keeps its tests green: `node tools/run-tests.js`.
7. Conservation of matter is a hard rule, not a feature (see GAME_DESIGN §2).
8. When you finish something, update `docs/STATUS.md` and, if you added an API or
   event, this file — in the same commit.
