# Lane J — Farming, animals and food

You own everything the player grows, keeps and eats. You are a new lane. Nothing in the
project owns this yet.

Your folder is `src/farm/`. You own `tools/tests/farm.test.js` and
`docs/status/farm.md`. Do not edit another lane's files — ask in `docs/REQUESTS.md`.

**Read first, in this order:** `docs/WORKFLOW.md` (how we commit, test and ship — short,
and every rule in it was paid for), `docs/ARCHITECTURE.md` (the system contract, the
render order, who owns what state), `docs/GAME_DESIGN.md`, and `docs/DECISIONS.md` from
the bottom up.

## The decision that created this lane

The owner was asked whether hunger should exist and chose the strongest option: **the
full survival loop. Hunger, healing and rest all matter, and farming and animals are
CORE rather than a stage you pass through and forget.**

That changes the shape of the game in ways worth stating plainly, because they are your
whole brief:

- **The surface gets a permanent job.** Today it is a place you leave. A farm is the
  first reason to keep coming back to daylight and to care what the ground up there is
  like — which the world lane is making varied right now.
- **A trip underground gets a third budget.** Air and light already limit how long you
  can stay down. Food makes it a supply run, and that is what turns a deep shaft into
  an expedition you plan rather than a walk you take.
- **A base needs a food store, not only an ore store.**
- **Unattended automation matters more here than anywhere.** A farm that only grew while
  you stood and watched it would be the worst version of this. Stations already run
  when nobody is present (DECISIONS, and lane C's implementation ticks every structure
  near or far) — crops must work the same way.

## What is already true and yours to build on

- **The world is pixel material, not tiles.** Soil is a material with properties, and
  the world exposes what is at a point. A crop grows in real dirt that can be dug out
  from under it.
- **Water exists and can be drawn and poured** (`liquidAt` / `drawLiquid` /
  `pourLiquid`, in pixels of liquid). Irrigation is available to you if you want it.
- **Light is real** and the day is real. Whether crops need daylight is your call, but
  the machinery to ask is already there.
- **Buckets exist**, and the owner has just ruled that hand haulage should be tiring but
  not brutal — about half its current cost. Watering by hand should obey that.
- **The body's state — energy, breath, and now hunger — belongs to lane B (actor).**
  Hunger as a number on the player is theirs; food, what it restores and where it comes
  from is yours. Agree that interface in REQUESTS early.
- **Every number in the game lives in lane F's tables.** Crop yields, food values and
  growth times are theirs to write once you have the mechanism to cost them against.

## Where to start

1. **One crop, end to end.** Plant it in real soil, have it grow on the tick whether or
   not anybody is watching, harvest it, eat it. Everything else is a second instance of
   that.
2. **Hunger's other half**, with lane B: what eating does, and what happens when you do
   not.
3. **Animals**, once crops work — they are a harder problem (they move, they need
   feeding, they belong to lane I's creature machinery as much as yours, so talk to
   them before you build a second one).

## Constraints that are not negotiable

- **Deterministic and seeded.** No `Math.random`, no wall-clock. Multiplayer replicates
  through this. A crop that grows differently on two screens is a bug.
- **Conservation of matter.** WORKFLOW 5c, and read it before you write anything that
  makes food appear. A create must be paired with a CHECKED destroy: a seed that becomes
  a plant without the seed leaving your pack is the fifth instance of the bug that hit
  four lanes in one day. Growth takes water and soil, and both should be accounted.
- **It must run unattended.** See above. Test it with the player 600 px away.
- **Save and load.** `serialise()` / `restore()` from the start. A field that resets on
  load is worse than no field.
- **Cheap.** Fixed 36 Hz tick, 27.8 ms budget, currently under 2 ms used in total. A
  hundred plants must not cost what a hundred creatures would.

## How things ship here

`node tools/verify.js HEAD` before you push — it tests your commit ALONE, because the
shared working tree holds every lane's work in progress and is red for reasons that are
never yours. Commit by pathspec, never `git add` unless you commit in the same breath,
and **push**: the owner has ruled that every lane publishes its own work. `node
tools/tick.js` tells you whether anything you have done is stuck between you and the
player.

Talk to lane E (the coordinator) for anything cross-lane.
