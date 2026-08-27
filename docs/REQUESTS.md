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
Status: open

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
