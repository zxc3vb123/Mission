# Mission — Progression

The spine of the game: what the player can do, in what order, and what each step
physically requires. LANE F owns this document and the data tables that mirror it
in `src/content/`. Other lanes implement mechanics that read those tables — they
do not hard-code recipes.

Rule of thumb for every step: **a new capability must be unlocked by a physical
thing the player built, out of materials they actually hauled.**

---

## The data mirror

This document is the explanation; `src/content/` is the truth. They must not
drift, and `tools/tests/content.test.js` fails if they do.

| Table | File | State |
| --- | --- | --- |
| `ITEM_DATA` | `src/content/items.js` | done — 35 items |
| `RECIPES` | `src/content/recipes.js` | done — 12, stages 0–2, all three stations |
| `BUILDINGS` | `src/content/buildings.js` | done — 4, stages 0–2 |
| `STAGES` | `src/content/stages.js` | done — 8 stages, costed to 2 |
| `GUIDE` | `src/content/guide.js` | done — 8 stages, 25 actions, 22 hints |
| `REFERENCE` | `src/content/reference.js` | done — 21 searchable pages |
| `HARDNESS` / `TOOLS` | `src/content/tools.js` | done — 5 tiers, 9 tools |
| `HAULAGE` | `src/content/haulage.js` | done — 5 rungs, backpack to conveyor |

Three shape rules the tables obey, because all three are easy to get wrong twice:

- **Buildings are placed, never crafted.** A building's cost lives in
  `buildings.js` and nowhere else. There is no recipe that outputs a structure.
- **A recipe's `tool` is required but not consumed.** That is what makes the stone
  knife the first craft that matters: it is a capability, not an ingredient.
- **Stage state is capability, not knowledge.** You have reached stage 2 when a
  kiln physically exists, not when you are carrying enough to build one. The
  guidebook's "you are nearly at stage 2" is a *derived* view that does the
  subtraction itself. State is fact; guidance is opinion about that fact, and
  keeping both in one field is how progression systems rot
  (`docs/DECISIONS.md`, 2026-08-27).

A fourth rule, for the guidebook: **never write a shortfall down.** An entry says
"build a workbench" and points at it; the UI does the subtraction against what the
player is carrying. Numbers copied into prose go stale the moment a cost is tuned,
and tuning costs is this lane's whole job — so the test fails on *any* digit in
guidebook prose.

`stages.js` costs stages 0-2 and leaves 3-7 with `reachedWhen: null`, because
that is as far as this document costs things out. The test enforces that the
uncosted ones are a *suffix*, so progression fills in from the bottom and can
never have a hole in the middle.

### Depth is gated by tool tier

Every material has a hardness tier; every tool cuts up to a tier and never
above it. Depth becomes the progression: dig as deep as your tools allow, climb
out, smelt what you found, come back through ground that stopped you.

| Tier | Materials | Opened by |
| --- | --- | --- |
| 0 | soil, sand, clay, gravel | hands — a shovel is simply faster |
| 1 | rock, limestone, coal, **iron** | stone pickaxe |
| 2 | copper, tin, zinc, lead, bauxite, quartz | iron pickaxe |
| 3 | nickel, silver, gold, titanium | steel pickaxe |
| 4 | uranium, rare earths | titanium-tipped pickaxe |
| — | granite | nothing, ever |

**Two axes, and keeping them apart is the whole design.** A tool's *kind*
decides what class of material it touches at all; its *tier* decides how hard.
A shovel's ceiling is tier 0 forever — an iron shovel is a better shovel, not a
pickaxe. That is what stops upgrades collapsing the ladder into "the newest tool
does everything", and it is pinned by test.

**Iron is tier 1, and that correction matters.** The tier sketch as first
recorded put iron in tier 2 alongside copper and tin, while the tier 2 pickaxe
had to be made of metal — and tier 1 contained no metal at all. You would have
needed an iron pickaxe to mine the iron for an iron pickaxe. Iron sits in tier 1
here, which is also exactly where `GAME_DESIGN.md` §6 has always put it: the
shallow band, with coal, "fire, steel, tools".

**Hardness and depth are different axes.** Surface rock is tier 1, so the very
first thing you meet already needs a pickaxe. What must hold is that the ground
never gets *softer* as it gets deeper, and that is what the suite checks.

The suite also walks the entire game from bare hands — what can I dig, what can
I then build, what does that let me dig — and proves every tool, every material
and every station is reachable with no circular tier. The bottom rung leans on
something easy to miss: a stone pickaxe is made of rock, and rock is tier 1. It
only works because loose rock lies on the surface, which is why
`SURFACE_PICKUPS` exists and is tested.

### The reference book

`reference.js` is the guidebook's other half: `GUIDE` says what to do next,
`REFERENCE` says how anything works. Twenty-one searchable pages, one per real
mechanic, plus a forgiving search built for the words a stuck player actually
types — "cant dig", "its too dark", "sand fell on me".

**Every page carries a `status` of `live` or `planned`,** and this is the most
important field in the file. The owner's complaint was "I cannot tell what is in
the game". A reference book that quietly described unbuilt mechanics would answer
that question *wrongly*, which is worse than not answering it. Six pages are
currently marked planned: placement, tools and dig speed, spoil, hauling, hunger
and stages. A live page also out-ranks a planned one in search when both answer
the same question, because the player is holding the current build, not the
design document.

Numbers in the book are derived from the tables, never typed — the backpack page
pulls the real carry limit, the hauling page pulls the real ladder. Key bindings
are deliberately absent: the panel generates those from the real bindings so they
cannot go stale, and a test fails if a page names one.

**Stages 0 to 2 are fully costed and playable as data.** Every station has
recipes: five by hand, three at the workbench (shovel, pickaxe, wheelbarrow),
four at the kiln (charcoal, bricks, quicklime, glass). This matters more than it
sounds — until it was true, a player could haul 104 kg to build a workbench and
open an empty list, which is the worst possible reward for the game's first real
piece of work. A station with nothing in it is a broken promise, not a stub.

**Masses are kilograms**, and they are the main balance lever in the game. The
anchor is *one chunk of plain rock = 5 kg*; every other raw material is scaled
from that by how dense the ore-bearing rock really is. Against the 35 kg
starting backpack that means roughly:

| Load | Chunks per trip |
| --- | --- |
| Coal (3.6 kg), sand (3.2 kg) | 9–10 |
| Rock (5.0 kg), iron ore (5.6 kg) | 6–7 |
| Lead (7.0 kg), gold (7.2 kg), uranium (7.5 kg) | 4 |

Four chunks a trip out of a deep shaft is the pressure the whole industry lane
exists to relieve. Making ore lighter is the one balance change that would quietly
delete the reason for carts, rails and conveyors.

Each item also carries a **band** (where it is found: surface, shallow, middle,
deep, verydeep — `docs/GAME_DESIGN.md` §6) and a **stage** (the first stage at
which it has a real use). Those are different questions: coal sits in the shallow
band from the first hour, but it is worth nothing until there is a kiln at stage 2.

---

## The haulage ladder

Moving material is the game, so this is the curve everything else is tuned
against. Quoted as multiples of one person with a full backpack.

| Rung | Stage | Load | Throughput | What stops it replacing the rung below |
| --- | --- | --- | --- | --- |
| Backpack | 0 | 35 kg | ×1 | — it is the bottom, and it goes anywhere |
| Wheelbarrow | 1 | 150 kg | ×3.6 | needs level, clear ground; no ladders, no steep slopes |
| Mine wagon | 4 | 1500 kg | ×43 | runs only where rails are laid and kept |
| Locomotive and rake | 5 | 6000 kg | ×377 | needs fuel, water and a graded route |
| Conveyor | 6 | continuous | ×120 | fixed to one route, and stops dead without power |

**The ladder is not one rising line, and that was a surprise worth recording.**
The lane brief lists the curve as backpack → wheelbarrow → wagon → rail →
conveyor, which reads as a single climb in tonnage. It is not one. A locomotive
hauling a rake genuinely moves more per hour than a belt does — real mines run
both for exactly that reason.

The conveyor wins on a *different axis*: it is the only rung that does not cost
the player's own time. A train has to be driven, loaded and turned round; a belt
is fed at one end and simply runs. So the table climbs in throughput up to the
train, and the conveyor is a **choice against** rail rather than a rung above it:
less tonnage, no attention.

The tests check those as two separate properties. Asserting one rising line
would have forced the belt's numbers to be inflated into a lie, which is the
kind of small dishonesty that makes a whole economy feel wrong later.

Every rung above the backpack carries a `constraint` — the physical thing it
cannot do — and a `keepsAlive` line naming which rung still does that job. That
is the structural guarantee that the ladder does not eat itself: the barrow
still does the face-to-railhead leg, because the railhead is never at the face.

---

## Stage 0 — Bare hands

*You have nothing. It is getting dark.*

| You can | Because |
| --- | --- |
| Dig soft ground (earth, sand, clay) slowly | hands, ~1 pixel-cluster/second |
| Pick loose rocks, sticks, plant fibre | lying on the surface |
| Craft **anywhere**: torch, rope, stone knife, stone axe, campfire, bandage | hand recipes, no station |
| Drink from water, eat foraged plants and raw meat | hunger exists but is slow |

**Blocked by:** you cannot dig rock, you cannot see underground, you cannot carry
much (35 kg), and spoil piles up at the tunnel mouth.

**Goal:** make a stone axe and a torch, fell a tree, get to Stage 1.

---

## Stage 1 — Tools and light

| Unlock | Station | Needs |
| --- | --- | --- |
| Workbench | placed, hand-built | 12 wood, 4 stone |
| Shovel, pickaxe (stone) | workbench | wood + stone |
| Wheelbarrow | workbench | wood + rope |
| Chest | workbench | wood |
| Torch bundle, oil lamp (later) | workbench / campfire | fibre, fat, wood |

Pickaxe opens **rock**. Shovel triples digging speed in soft ground. Wheelbarrow
raises haulage from 35 kg carried to ~150 kg pushed on level ground — the first
time the world stops fighting you.

**Goal:** a shaft into rock, coal and iron found, spoil dumped somewhere sensible.

---

## Stage 2 — Fire and clay

| Unlock | Station | Needs |
| --- | --- | --- |
| Kiln | placed | 20 clay, 10 stone |
| Charcoal, bricks, quicklime, glass | kiln | wood / clay / limestone / sand |
| Hut → house | placed | bricks, planks |
| Storage yard | placed | planks |

Charcoal is the first fuel hot enough for metal. Bricks make structures that
survive weather and cave-ins. Glass makes lamps and later instruments.

---

## Stage 3 — Wood at scale, water power

| Unlock | Station | Needs |
| --- | --- | --- |
| Sawmill (water-driven) | placed on flowing water or with a water wheel | planks, stone, rope |
| Planks, beams, scaffold, ladder, rope bridge | sawmill / workbench | logs |
| Water wheel, shaft-and-belt line | placed | beams, iron |
| Farm plot, seeds, cooking pot | placed | soil, water access |

The sawmill is built from wood, stone and rope, so **water power is reachable on
wood alone** — no metal is needed to get here. Iron fittings are a later upgrade
that raises its throughput, not an entry cost (`docs/DECISIONS.md`, 2026-08-27).

Water power is the first machine that works while you sleep. Farming ends the
food problem and frees you to be underground for longer.

---

## Stage 4 — Iron and steam

| Unlock | Station | Needs |
| --- | --- | --- |
| Forge | placed | bricks, charcoal |
| Foundry | placed | bricks, iron fittings, water wheel or steam power |
| Iron, steel, bronze, brass | forge / foundry | ore + fuel + flux (lime) |
| Boiler and piston (steam engine) | machine shop | steel, copper pipe, brick |
| Steam pump + pipes | machine shop | steel, copper, leather seals |
| Rails, wagons, points | machine shop | steel, wood |
| Elevator, winch, hoist | machine shop | steel, rope, gears |

This is the hinge of the game. Steam pumps beat groundwater, so deep mines become
possible. Rails and wagons move spoil and ore in tonnes rather than kilos.
Elevators remove the climb.

---

## Stage 5 — Oil and chemistry

| Unlock | Station | Needs |
| --- | --- | --- |
| Derrick and oil pump | placed over an oil deposit | steel, pipe, steam power |
| Refinery | placed | steel, brick, pipes |
| Kerosene, lubricant, tar, plastics | refinery | crude oil |
| Explosives shed | placed | chemical works |
| Blasting charges | explosives shed | nitrates, charcoal, sulfur |

Explosives break rock fast — at the cost of scattering spoil, which the
conservation rule makes messy. A deliberate trade, not a free win.

---

## Stage 6 — Electricity

*Only reachable once coal, iron, copper and steam are routine.*

| Unlock | Station | Needs |
| --- | --- | --- |
| Dynamo / generator | machine shop | copper wire, steel, steam or water drive |
| Cables, switchboard | machine shop | copper, rubber/tar insulation |
| Electric lamp, floodlight | workbench | glass, wire, filament |
| Electric motor, conveyor, cutter | machine shop | copper, steel |
| Electric furnace, electrolysis | foundry / chemical works | power, lime, bauxite |

Electricity is not a new resource: it is a *distribution* technology. It lets one
engine drive machines that are nowhere near it, and it makes aluminium and
refined alloys possible.

---

## Stage 7 — The rocket

| Section | Made at | Key inputs |
| --- | --- | --- |
| Structure and tanks | assembly hall | aluminium, steel, titanium |
| Engine | assembly hall | titanium, nickel alloy, copper cooling lines |
| Avionics | electronics shop | silicon, gold contacts, rare earths, glass |
| Propellant | chemical works | kerosene + liquid oxygen, or hydrogen from electrolysis |
| Launch pad | placed | concrete (lime + gravel + sand), steel |

Launch requires: all sections assembled on the pad, tanks filled, power online,
and the player aboard. Then the ending.

---

## Settled, and where the answer lives

- ~~Stage 3's sawmill asks for iron fittings the stage 4 forge first makes.~~
  **Settled 2026-08-27:** the sawmill is wood, stone and rope; iron fittings are a
  throughput upgrade. Stage 3 above is updated, and `stages.js` is written on this
  basis. Reason in `docs/DECISIONS.md`.
- ~~Digging earth yields nothing, which breaks conservation of matter.~~
  **Settled 2026-08-27:** the yield is `soil`. `ITEM_DATA` has the entry; lane A
  still has to set `dig2: "soil"` on `M_EARTH`, so `soil` sits in `PENDING_YIELD`
  until they do. The content test fails the moment that list is either wrong or
  no longer needed.

## Still open

- **`campfire` is a placeable, not a carried item**, so it lives in `BUILDINGS`
  with its cost, and is *not* a recipe. Buildings are placed, never crafted — one
  number, one home. This is settled as a data-shape rule, noted here because it is
  the kind of thing that gets re-litigated.
- **Food is deliberately absent from `ITEM_DATA`.** Stage 0 talks about foraged
  plants and raw meat, but no lane consumes food yet and hunger is not implemented.
  Adding those items now would break the lane rule against inventing an item that
  no chain uses. They land with lane B's hunger work.
- **Stages 4–7 have no costed tables yet.** `buildings.js` deliberately stops at
  the kiln, which is as far as this document actually costs things out. Inventing
  forge and foundry costs before the mechanics exist would be guessing.

---

## Guidebook rules (for the UI lane)

The in-game guidebook is generated from this file's data mirror, never written by
hand twice. For the player's current stage it shows:

1. **What you are trying to do** — one sentence.
2. **What you have** — the relevant items in inventory and storage.
3. **What is missing** — the exact shortfall, and where that material is found.
4. **Where it is made** — the station, and what that station costs if unbuilt.

It never says "go to coordinates". It says what to look for: "iron shows as rusty
red flecks in rock, common below the first rock layer".
