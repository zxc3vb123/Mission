# Cross-lane requests

You need something only another lane can build. Add an entry here instead of
editing their files. The owning lane picks it up and marks it done.

Format:

```
### <your lane> -> <their lane>: one line summary
Why: what it unblocks.
Proposed: the shape of the API or behaviour you want.
Status: open | in progress | done (commit)
```

---

### actor -> items: expose the equipped tool
Why: digging speed and what can be dug must come from the tool, not from the
character being born with a shovel.
Proposed: `items.api.equipped()` returning `{ id, def }` or null, plus an
`item:equipped` event when it changes.
Status: open

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
Status: open

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
Status: open

### core -> items: implement serialise() / restore() for drops and containers
Why: core saves the inventory itself, but chunks lying on the ground and, later,
chest contents are yours.
Proposed: `serialise()` returns the drop list and container contents;
`restore(data)` puts them back after the world has been regenerated.
Status: open

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
