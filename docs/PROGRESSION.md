# Mission — Progression

The spine of the game: what the player can do, in what order, and what each step
physically requires. LANE F owns this document and the data tables that mirror it
in `src/content/`. Other lanes implement mechanics that read those tables — they
do not hard-code recipes.

Rule of thumb for every step: **a new capability must be unlocked by a physical
thing the player built, out of materials they actually hauled.**

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
| Sawmill (water-driven) | placed on flowing water or with a water wheel | planks, stone, iron fittings |
| Planks, beams, scaffold, ladder, rope bridge | sawmill / workbench | logs |
| Water wheel, shaft-and-belt line | placed | beams, iron |
| Farm plot, seeds, cooking pot | placed | soil, water access |

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

## Guidebook rules (for the UI lane)

The in-game guidebook is generated from this file's data mirror, never written by
hand twice. For the player's current stage it shows:

1. **What you are trying to do** — one sentence.
2. **What you have** — the relevant items in inventory and storage.
3. **What is missing** — the exact shortfall, and where that material is found.
4. **Where it is made** — the station, and what that station costs if unbuilt.

It never says "go to coordinates". It says what to look for: "iron shows as rusty
red flecks in rock, common below the first rock layer".
