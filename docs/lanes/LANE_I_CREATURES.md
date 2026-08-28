# Lane I — Creatures

You own everything alive that is not the player: what it is, how it behaves, how it
hurts you and how you deal with it. You are a new lane. Nothing in the project owns
this yet.

Your folder is `src/life/`. You own `tools/tests/life.test.js` and
`docs/status/life.md`. Do not edit another lane's files — ask in `docs/REQUESTS.md`.

**Read first, in this order:** `docs/WORKFLOW.md` (how we commit, test and ship — it
is short and every rule in it was paid for), `docs/ARCHITECTURE.md` (the system
contract, the render order, who owns what state), `docs/GAME_DESIGN.md`, and
`docs/DECISIONS.md` from the bottom up.

## The decision that created this lane

The owner was asked whether anything in this world is hostile, and chose: **something
underground that gets worse with depth.** Descending is now a risk, not only a time
cost.

**But this is not a combat game.** The rocket is the goal and engineering is the verb.
Fighting should be something the player PREPARES for and usually AVOIDS — by lighting
a shaft, by sealing it, by choosing not to be there — rather than the main loop. If the
fastest route through a stage turns out to be killing things, we have gone wrong, and
you should say so rather than balance around it.

## What that implies, and it is the interesting part

Every defence the player already has should become a real answer:

- **Light is a defence.** Placed light sources exist (`world.addLightSource`) and
  darkness is already the early antagonist. A thing that avoids lit ground makes the
  player's lamp, torches and campfires into tactics rather than convenience.
- **Walls are a defence.** Terrain here is moved, never destroyed, and can be put back.
  Sealing a shaft behind you should work.
- **Not being there is a defence.** Noise, digging, and standing still should matter.
- **Weight is the cost.** The pack is mass-limited on purpose. A weapon competes with
  ore for the same kilograms, and that is a real decision rather than a menu.

## You also own fighting, and the owner has set its shape

Their words: *"create a fighting system. i should be able to hit using everything. axes.
shovels etc. they do different dmg, but still."*

So there is **no weapon slot and no dedicated weapon class**. Whatever is in your hands
swings, and the tool you were already carrying decides what the swing is worth. That is
the right shape for this game: it costs the player no extra kilograms, it makes the
choice of what to carry down a shaft a real one, and it means a player who is caught
unprepared is never empty-handed — only badly armed.

- An **axe** should be the good one. It is made to bite.
- A **pickaxe** is a heavy point: slower, and it hits hard.
- A **shovel** is a broad clumsy thing that will do in a pinch.
- **Bare hands** should be almost useless, and that is the whole argument for carrying
  a tool you were not going to dig with.
- Tier matters. A steel axe beats a stone one, the same way it does against rock.

Damage numbers are lane F's to write (they own the item table and every other number
in the game); the swing, its timing, its reach and what it connects with are yours; the
animation is lane B's. Agree the three interfaces in `docs/REQUESTS.md` early rather
than each guessing.

Two things to get right from the start: a swing must not be a free action — it costs
time, and being wrong about that turns every encounter into spam — and hitting a
creature and hitting rock must not be the same click, or players will destroy their own
tunnel every time something surprises them.

## Where to start

1. **The swing first, against nothing.** A tool that hits, with cost and reach, before
   there is anything to hit. It is testable, it is lane B's animation hook, and it makes
   the creature work easier when it lands.
2. **One creature, deep, that reacts to light and sound.** Not a bestiary. Get one
   thing right and the second is cheap.
3. **Damage to the player.** `state.player.energy` exists and lane B owns the body —
   agree the interface with them in REQUESTS rather than writing to it directly.
4. **Death already has a rule** (DECISIONS: respawn at your shelter, your load stays
   where you fell). Make sure being killed by something obeys it.

## Constraints that are not negotiable

- **Deterministic and seeded.** No `Math.random`, no wall-clock. Multiplayer replicates
  through this and two clients must agree. Use the project's seeded RNG.
- **Fixed 36 Hz tick**, and your system must be cheap. The simulation budget is 27.8 ms
  and the whole thing currently uses under 2. Creatures far from any player must not
  cost what near ones do — but see the next point.
- **Distance must not change the RESULT, only how it is computed.** Lane C found the
  better version of this: they made every structure tick always, so there is no
  catch-up model to get wrong. Prefer that shape if you can afford it.
- **Conservation of matter.** WORKFLOW 5c. If a creature drops something, it came from
  somewhere. A create must be paired with a CHECKED destroy — four bugs in one day came
  from ignoring a return value.
- **Save and load.** Implement `serialise()` / `restore()` from the start. A creature
  that forgets it was wounded across a save is worse than no creature.

## How things ship here

`node tools/verify.js HEAD` before you push — it tests your commit ALONE, because the
shared working tree contains every lane's work in progress and is red for reasons that
are never yours. Commit by pathspec, never `git add` unless you commit in the same
breath, and **push**: the owner has ruled that every lane publishes its own work.
`node tools/tick.js` tells you whether anything you have done is stuck.

Talk to lane E (the coordinator) for anything cross-lane.
