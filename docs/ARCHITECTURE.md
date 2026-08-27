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
| `src/ui/` | E | HUD, menus, crafting screen, guidebook rendering |
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
digFreeCircle(x,y,r,collect) -> { freed, blocked }
anyDiggable(x,y,r) -> bool
blast(x,y,r)
setMat(x,y,m)
lightAt(x,y) -> 0..1        lightConfig
surfaceAt(x) size() counts() regenerate(seed)
```
*planned:* `dumpMaterial(x,y,matIndex,amount)`, `addLightSource(id,{x,y,r,power})`,
`removeLightSource(id)` — lane A, milestone M2/M3.

**actor.api** (lane B)
```
pos() respawn() setLamp({on,radius,cone,power}) clonk
```
*planned:* `carry()`, `setCarryLimit(kg)`, `useTool(id)`.

**items.api** (lane C)
```
inventory { add take has count all carriedMass clear }
registerItem(id, def) itemDef(id) items order
spawnDrop(x,y,id) clearDrops() dropCount()
```
*planned:* `canCraft(recipeId)`, `craft(recipeId, stationId)`, `nearbyStations()`.

**build.api** (lane C, not built yet) — `place(defId,x,y)`, `structuresNear(x,y,r)`,
`storageAt(x,y)`.

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
| `inv:changed` | `{ id, count }` | C |
| `item:collected` | `{ id, x, y }` | C |
| `player:died` | `{ x, y }` | B |
| `input:key` | `{ key, down }` | E |
| `input:mouse` | `{ button, down }` | E |
| `game:saved` | `{ ok, error }` | E |
| `game:loaded` | `{ seed }` | E |

*planned:* `spoil:produced { matIndex, amount, x, y }` (A), `structure:built
{ defId, x, y }` (C), `craft:done { recipeId }` (C), `power:changed { netId, watts }` (D),
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
