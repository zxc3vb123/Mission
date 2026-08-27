# Status - lane industry

Your section, and nobody else writes here. One line per finished thing,
newest at the top. Read the others before you start; write here before you
commit.

- [done] **Rail haulage, and a loaded cart that arrives.** The first milestone
  of this lane: track laid a length at a time along the ground, a wagon built
  on it out of steel and plank, loaded from the pack, pushed by walking into
  it, coasting three hundred and fifty pixels of line, and emptying itself
  into a chest at the railhead — through lane C's own `storageAt()`, a few
  kilos a tick. 54 checks in `tools/tests/industry.test.js`.

  **The check that matters is not that it arrived, it is that it never
  duplicated.** "The ore arrives as real material and not teleporting" is
  measured as an invariant rather than an outcome: the total count of ore
  across the pack, the ground, every container and every wagon is taken on
  every one of the four thousand ticks of the journey, and it may not move.
  Every transfer in the lane is written add-to-the-destination-first, so a
  full chest leaves the load in the wagon rather than swallowing it.

  Also live: track loses its ballast when you dig under it and falls in,
  handing the steel back; a wagon that then finds nothing under it derails,
  stops where it stands and **keeps its load**; a wagon of spoil tips out
  through lane A's `dumpItem` and becomes landscape again; and both track and
  wagons save and restore.

- **Two keys, `q` and `e`, are bound in this lane** rather than left for a
  screen — `docs/WORKFLOW.md` 4c, and lane C's precedent. `q` lays a rail or
  takes one up; `e` builds a wagon, loads it from your pack, or tips it out
  when your hands are empty. Rows added to ARCHITECTURE 4a in the same commit.
  Offered to the UI lane in `docs/REQUESTS.md`.

- **Pushing has no key at all.** You lean on a cart by walking into it, which
  is what a person does to a cart. It costs no input another lane might have
  wanted, and nobody has to be told.

## What is honest about this, and what is not yet

- **Rail is stage 4 content and it is reachable.** A length costs a steel bar
  and a plank; a wagon costs six bars, four planks and four wood. Both come
  from the forge and the sawmill, which are live. No recipe and no new item
  was invented to get there — a wagon is assembled where it will run, out of
  materials hauled to it, the same as a building.
- **The last two feet are still walked.** A cart can deliver ore into a forge,
  and the forge cannot use it: `craft()` takes its inputs from the player's
  pack. Filed as `industry -> items/build` in REQUESTS. Until it lands, a
  railway shortens the haul rather than removing the person from it.
- **One wagon-load is seven chests.** 1500 kg against 200. That falls out of
  lane F's ladder rather than from anything here, and it means the building the
  game is now missing is a stockpile. Flagged to lane F.
- **Lane E's warning about distance stands and is not compensated for.** The
  haulage capacities are priced for a world where things are far apart, and
  lane F measured that this one has everything under every column. If rails
  feel pointless in play, that is the world, and no number in
  `src/industry/spec.js` has been bent to hide it.
- **Nothing generates power.** `powerAt()` returns nought everywhere and says
  so rather than pretending.
- **Oil is not started.** It needs one thing only lane A can write — taking
  liquid out at a point — and that is filed. It is the same call lane C asked
  for to make buckets work, so it now has two consumers.

## The three coop rules, checked against this lane

Lane E flagged these as load-bearing now that multiplayer replays world
operations. Nothing here breaks them, and it is worth recording why:

- **No wall clock, no unseeded random in a tick.** Rail and wagon physics are
  integer-ish arithmetic over `state.tick`; the ballast check is scheduled by
  `(rail.id + tick) % 12`, so it is deterministic and staggered rather than
  timed.
- **Every landscape change goes through a published mutator.** A wagon tipping
  spoil calls `world.dumpItem`. This lane writes no pixels.
- **No per-player state in a module singleton.** `rails` and `wagons` are world
  state, which is what they should be. The only per-player thing is the one
  variable that remembers where the player was last tick, in order to know they
  walked into a cart, and it lives in the system closure. It reads
  `state.player`, so in coop a remote player would not push a cart until bodies
  replicate — worth knowing, not worth solving before there is anything to test
  it against.
