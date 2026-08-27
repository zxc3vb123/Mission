# LANE C — Items & Build

**You own:** `src/items/`, `src/build/`, `tools/tests/items.test.js`,
`tools/tests/build.test.js`

**Your job:** everything between the ground and the machines. What the player
carries, what they can make, and what they can put down in the world.

---

## What already works

- `itemdefs.js` — the item registry. All raw ores are registered with name,
  colour, mass and tier. `registerItem(id, def)` lets lane D add refined goods
  without touching this file.
- `inventory.js` — add / take / has / count / all / carriedMass, emitting
  `inv:changed`.
- `drops.js` — `dig:yield` becomes a physical chunk that falls, sinks in liquid,
  and is picked up when the player walks over it.

Seven item checks are green. `src/build/` does not exist yet — that is your first
real construction job.

---

## Task list

### M1 — a real inventory
- [ ] Mass-limited backpack: 35 kg to start, upgradeable to about 60 kg. Over the
      limit you cannot pick more up; near it you are slow (lane B reads
      `carriedMass()`).
- [ ] Hotbar plus backpack, keyboard selection, an equipped item that lane B uses
      as the active tool.
- [ ] Stacks with mass, not slot counts: 20 kg of iron ore is 20 kg whether it is
      one lump or forty.
- [ ] Dropping and throwing items back into the world.

### M2 — crafting
- [ ] Read `src/content/RECIPES` (lane F). Never hard-code a recipe here.
- [ ] Hand crafting anywhere for the tiny list marked `hand: true`: torch, rope,
      stone knife, stone axe, campfire, bandage.
- [ ] `canCraft(recipeId)` / `craft(recipeId, stationId)` with a clear failure
      reason ("missing 4 wood", "needs a workbench").
- [ ] Crafting screen: what you can make now, what you could make if you had one
      more thing, and where the missing thing comes from.

### M3 — placing things in the world
- [ ] `src/build/placement.js`: ghost preview, valid/invalid feedback, materials
      consumed on placement, build time rather than instant appearance.
- [ ] Structures need physical support: a foundation on solid ground, or beams.
      Dig away what holds a hut and the hut comes down.
- [ ] First set: campfire, workbench, chest, kiln, hut, then house.
- [ ] Storage: chests hold mass, can be opened, and lane D's machines can pull
      from them later. Publish `storageAt(x,y)`.
- [ ] Torches as placed light sources through lane A's `addLightSource`.

### M4+ — the settlement
- [ ] Doors, ladders, scaffolds, rope bridges — the things that make a mine
      liveable.
- [ ] Farm plots: till soil, plant, water, harvest, with growth over real time.
- [ ] Cooking at the campfire and later a stove.
- [ ] Deconstruction that returns most of the materials.

---

## Rules for this lane

- Recipes, item stats and building costs live in `src/content/` (lane F). You
  implement the mechanics that read them. If a number needs changing, ask lane F.
- You may call `world.api` (to test ground, place light sources, consume terrain)
  and read `state.player`. Do not import lane A or B internals.
- Publish `build.api` as soon as `src/build/` exists, and add it to
  `docs/ARCHITECTURE.md` §5 in the same commit — lane D is waiting on it.
- Everything placed is an object in the world, not a landscape pixel. The landscape
  belongs to lane A.

## Gotchas

- Mass, not slots, is the whole balance lever for hauling. Keep item masses honest
  and let lane F tune them.
- A structure standing on dug-away ground must fall or break — the world is
  allowed to destroy the player's work, and that tension is the point.
- Pickup radius is generous on purpose; do not make the player click chunks.
