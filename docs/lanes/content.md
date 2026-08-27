# LANE F — Content & Balance

**You own:** `src/content/`, `docs/PROGRESSION.md`, `tools/tests/content.test.js`

**Your job:** the numbers and the tech tree. Every other lane writes mechanics;
you decide what things cost, how long they take, what unlocks what, and what the
guidebook tells the player. You are the only lane that can change balance, and the
only one who sees the whole progression at once.

---

## What already works

`docs/PROGRESSION.md` exists as prose: eight stages from bare hands to launch.
`src/content/` does not exist yet — turning that prose into data is your first job,
because lanes C and D are waiting to read it.

Item stats currently live in `src/items/itemdefs.js` (lane C). Moving those numbers
into `src/content/items.js` is part of task one; keep the ids identical so nothing
breaks.

---

## Task list

### M1 — the data layer
- [ ] `src/content/items.js` — `ITEM_DATA`: id, display name, mass in kg, category,
      stage, colours, what it is used for. Every ore in `src/world/materials.js`
      must have an entry, and the world test proves it.
- [ ] `src/content/recipes.js` — `RECIPES`: id, station (`hand` for anywhere),
      inputs, outputs, time, stage. Start with the hand list: torch, rope, stone
      knife, stone axe, campfire, bandage.
- [ ] `src/content/buildings.js` — `BUILDINGS`: id, size, materials, build time,
      what it enables, support requirements.
- [ ] `src/content/stages.js` — `STAGES`: the eight stages, what each requires to be
      considered reached, and what it unlocks.
- [ ] `tools/tests/content.test.js`: no recipe may need an item that does not exist;
      no stage may require something unreachable from the stage before it; every
      station in a recipe must exist as a building.

### M2 — the guidebook
- [ ] `src/content/guide.js` — for each stage: a one-line goal, what to look for in
      the world, and the two or three next useful actions. Lane E renders it; you
      write it.
- [ ] Guidebook entries must be generated against the player's real inventory:
      write them as templates with slots for "you have / you need", never as fixed
      paragraphs.
- [ ] Material identification hints: how iron looks in rock, where clay sits, what
      a lava glow through a wall means.

### M3+ — balance passes
*Context from 2026-08-27: the world is large (~4000×2400+), spoil is strictly
conserved, and survival pressure is deliberately light. Tune hunger slow enough
that food is a chore solved once, and distances long enough that haulage is the
real cost.*
- [ ] Time-to-tier targets: roughly how long each stage should take a player who
      knows what they are doing, and tuning to hit it.
- [ ] The haulage curve: backpack → wheelbarrow → wagon → rail → conveyor, each a
      real multiple of the last, none of them trivialising the previous step.
- [ ] Fuel economy: how much coal a boiler eats, how much a smelt costs, so that
      supplying fuel stays a logistics problem rather than a formality.
- [ ] Depth pressure: water inflow, heat and travel time tuned so going deeper is
      a decision, not a formality.

---

## Rules for this lane

- Data only. No systems, no rendering, no simulation code in `src/content/`.
- Never invent an item that no chain uses, and never invent a chain step that has
  no purpose. Every entry answers "what is this for?" in one line.
- Any change that makes an earlier stage harder or a later stage cheaper goes in
  `docs/STATUS.md` so the other lanes notice.
- Keep `docs/PROGRESSION.md` and the data in step: the document is the explanation,
  the data is the truth, and they must not drift.

## Gotchas

- Masses are the main balance lever in this game, because hauling is the core
  problem. Getting ore too light removes the reason for the entire industry lane.
- Electricity must not be reachable before stage 6, no matter how tempting a
  shortcut recipe looks. That ordering is a design decision, not an accident.
- Recipes that produce tools must respect what lane B's tool code understands —
  coordinate through `docs/REQUESTS.md` before adding a tool with new behaviour.
