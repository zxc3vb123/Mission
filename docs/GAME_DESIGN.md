# Mission — Game Design

The single source of truth for *what the game is*. If a lane brief and this
document disagree, this document wins, and the brief gets fixed.

## 1. The pitch

A frontier world, empty of people. You arrive with nothing. You dig, you build,
you industrialise, you leave. The whole arc is one continuous chain of physical
causes: a rock you picked up by hand ends up as part of a rocket.

Two influences, deliberately kept separate:

- **The world** is a pixel-material landscape: every pixel is a material with
  density, friction and diggability. Digging, collapsing, flooding and pumping
  are all real operations on that pixel grid.
- **The player layer** is inventory-and-workbench crafting: you carry things,
  you stand at stations to make better things, and each tier of tools opens the
  next tier of the world.

## 2. Laws the world obeys

These are not flavour. Every lane enforces them.

1. **Matter is conserved.** Terrain is *moved*, never deleted. Digging a tunnel
   produces spoil — loose material that exists as items or as loose pixels. To
   make a cave you must physically take the material somewhere: carry it, tip it
   down a shaft, load it in a bucket, a cart, a lorry, a rail wagon. Dumping
   spoil creates real landscape pixels again.
   *Exception, deliberate:* material destroyed by explosives is scattered as loose
   pixels, some of which fall out of reach. Blasting is fast and lossy; digging is
   slow and lossless.
2. **Gravity applies to everything.** The player, dropped items, carts, spoil,
   liquids, buildings without a foundation. Nothing floats. Nothing hovers.
3. **Movement is human.** No double jumps, no air control that beats momentum, no
   climbing a smooth wall. You climb where there are holds: ledges, ladders,
   ropes, scaffolds you built. You fall, and falling hurts.
4. **You are weak and slow, and machines are not.** A human moves a few dozen kilos
   and digs a few pixels a second. That is the whole reason to build machines.
5. **Liquids find their level.** Water floods a shaft you dug into an aquifer. Oil
   sits where it was. Lava kills. Pumps and pipes are the only way to move fluid
   uphill.
6. **Carrying has a limit.** Backpack capacity is human-scale: roughly 35 kg to
   start, up to ~60 kg with a better pack. Not infinite, not so small that the
   early game is a walking simulator. Hauling capacity is the pressure that makes
   carts, rails and elevators worth building.

## 3. The player layer

- **Inventory:** a hotbar plus a backpack grid, mass-limited rather than
  slot-limited. Ore is heavy, torches are not.
- **Hand crafting anywhere:** a small set of things you can make with no station —
  torch, rope, crude stone tools, a campfire, plant fibre bandage. Enough to
  survive the first night and dig the first hole.
- **Stations gate everything else:** a workbench makes wooden and simple metal
  goods; a kiln makes bricks, lime and charcoal; a forge and later a foundry make
  metal; a machine shop makes gears, pipes and rails; a chemical works makes fuel
  and explosives; an assembly hall makes rocket sections.
- **The recipe list is the tech tree.** Each station's recipes are the visible
  form of progression. You unlock a station, and a page of new possibilities opens.
- **A guidebook** in the UI reads the player's actual state and says what the next
  useful step is — never a wall of text, always "you have X, you are missing Y,
  it is made at Z".

## 4. Survival pressure (light, not punishing)

- **Hunger** ticks slowly. Food comes from hunted animals, foraged plants, and
  later crops and cooking. Starvation weakens you before it kills you.
- **Injury** from falls, lava, drowning, cave-ins. Healing needs food and rest, later
  bandages and medicine.
- **Darkness** is the real early antagonist: underground is black, your lamp is
  weak, and light is a resource chain of its own (torch → oil lamp → carbide →
  electric).
- No combat-focused enemies at first. Wildlife is food and occasional danger. The
  world itself is the opponent.

## 5. The industrial arc

Power is earned in this order, and each step is a real machine with real inputs:

1. **Muscle** — your arms, a shovel, a bucket, a wheelbarrow.
2. **Gravity and water** — chutes, tipping spoil down a shaft, a water wheel driving
   a shaft-and-belt line.
3. **Animal and wind** — a windmill for grinding and sawing, draft animals for haulage.
4. **Steam** — a coal boiler, pistons, mechanical power distributed by belts; steam
   pumps that finally beat groundwater; rail haulage.
5. **Electricity** — generators, cables, motors, electric lighting, electric smelting.
   Deliberately late: it arrives only once coal, iron, copper and steam are routine.
6. **Chemistry and precision** — refined fuels, alloys, electronics, avionics.
7. **The rocket** — assembled in sections, fuelled, launched.

## 6. Ore and mineral coverage

The world contains everything the chain above needs, banded by depth so that
progress downward is progress technologically:

| Band | Materials | What they are for |
| --- | --- | --- |
| Surface | wood, stone, clay, sand, limestone, gravel, water, plants, animals | huts, bricks, glass, lime, food |
| Shallow | coal, iron | fire, steel, tools, rails, boilers |
| Middle | copper, tin, zinc, lead, bauxite, quartz, oil | wiring, bronze, brass, shielding, aluminium, glass, fuel |
| Deep | nickel, silver, gold, titanium | alloys, contacts, engine parts |
| Very deep | uranium, rare earths | late power, avionics |

Depth costs: heat, water inflow, lava, unstable ground, and the sheer distance
spoil and ore have to travel back up. That is what makes automation necessary
rather than optional.

## 7. What this game is not

- Not a combat game. Fighting is incidental.
- Not a voxel sandbox with instant block placement. Building takes materials,
  time, and a place that can physically hold the structure.
- Not an infinite-inventory game. If you want to move a hillside, build something
  that moves hillsides.
- Not a tutorial-on-rails. The guidebook suggests; the player chooses.

## 8. Milestones

Each milestone is playable on its own, and every lane knows which one is current.
Current milestone is recorded at the top of `docs/STATUS.md`.

- **M1 Bare hands** *(the world exists and can be dug)* — landscape, digging,
  darkness and lamp, ores, dropped chunks, inventory, hunger, first tools.
- **M2 Spoil and hauling** — conservation of matter, dumping, buckets, wheelbarrow,
  chutes, the first shafts that need somewhere to put the dirt.
- **M3 Shelter and workbench** — placeable structures, campfire, hut, workbench,
  kiln, charcoal, torches, storage chests.
- **M4 Water and wood** — sawmill, planks, scaffolds, ladders, water wheels,
  simple mechanical power, farming and cooking.
- **M5 Iron and steam** — forge, foundry, steel, boiler and piston, steam pumps,
  rails and wagons, elevators.
- **M6 Electricity and chemistry** — generators, cables, motors, electric light,
  refinery, explosives, advanced alloys.
- **M7 The rocket** — assembly hall, rocket sections, fuel production, launch pad,
  launch and ending.
