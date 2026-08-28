# Decisions log

Settled questions, so no lane re-opens them by accident. Add the date and a one
line reason. Open questions live at the bottom of `docs/STATUS.md`.

---

**2026-08-27 — Terrain is moved, never destroyed.**
Digging produces spoil that has to physically go somewhere. Blasting is the one
lossy exception, and it scatters material rather than deleting it. This is the
rule the whole industry chain hangs off: if dirt vanished, carts and rails would
have no purpose.

**2026-08-27 — Electricity arrives late, at stage 6.**
Muscle, then water and wind, then steam, then electricity. Each power source must
be a real machine with real inputs. No shortcut recipe may skip a stage.

**2026-08-27 — Carrying is mass-limited, human scale.**
About 35 kg at the start, roughly 60 kg with the best backpack. Not infinite, not
so small that the early game is walking. Hauling pressure is what makes machines
worth building.

**2026-08-27 — Everything obeys physics except backpack abstraction.**
Gravity, momentum, falling, liquids and structural support all apply to the
player, items, machines and terrain. The one accepted abstraction is that carried
items occupy no volume — only mass.

**2026-08-27 — ES modules, one folder per lane, no build step.**
The game is served as plain modules so any chat can edit a file and reload. Folder
ownership is what keeps six chats from colliding; there is no bundler to fight.

**2026-08-27 — Fixed 36 Hz simulation.**
Deterministic ticks, seeded RNG, no frame-time-scaled physics, so a seed always
reproduces a world and headless tests can step the game exactly.

**2026-08-27 — Data lives in `src/content/`, mechanics live in lanes.**
Recipes, masses, costs and stage gates are data owned by one lane, so balance
changes never mean touching five systems.

**2026-08-27 — The world is large, and generated in chunks.**
Target roughly 4000×2400 pixels or more, streamed rather than held as one buffer.
A mine network, distant oil fields and rail lines only mean something if the map
is bigger than a ten minute walk. Lane A does the streaming work now, while the
landscape code is still small.

**2026-08-27 — Spoil is strict, with a small hand allowance.**
Every dug pixel becomes spoil that has to go somewhere. The one concession: hand
digging may scatter a small amount at the tunnel mouth, so the first hour is not
pure hauling. Machines account for all of it — a wagon that fills must be emptied
somewhere real.

**2026-08-27 — Survival pressure is light; the world is the opponent.**
Hunger ticks slowly, hunting and crops solve it, and the real dangers are
darkness, falls, water and cave-ins. Wandering prey animals only — no predators
hunting the player. Nothing about survival should pull attention away from
digging and building.

**2026-08-28 — Loose ground must be timbered, and untimbered spans collapse.**
Owner: "I should have to build support for my tunnels with wood if it's a loose
ground tunnel. Add tunnel collapsing." Accepted, because it makes the ground
itself have a personality rather than being uniform stuff to be removed:

- Earth, sand, gravel and clay do not hold their own roof over a span. Rock does.
  So a tunnel through soil needs timbering and a tunnel through rock does not,
  and the player learns to read what they are cutting through.
- A collapse is never a silent instant kill. It warns first - dust trickling,
  a creak, loose pixels falling - long enough for an attentive player to prop it
  or get clear. Being crushed is then a consequence of ignoring the world, which
  is the kind of death this game should have.
- Timber supports are placed objects (lane C) that mark a span as held. They are
  destroyed with the ground they hold, so digging out a support brings the roof
  down, deliberately.
- This is what gives the wood chain a purpose past tools, and it is the first
  real reason to haul something INTO a mine rather than only out of it.

The mechanic is lane A's, built on the instable-material system that already
exists. It waits behind the dig-tier gate, which the owner is waiting on.

**2026-08-28 — Oil is a period technology, not a modern one.**
Owner: oil, oil pumps, "the things that were used in the actual first oil
things", derricks and ladders. The world already has crude oil pockets as a
liquid material. What is missing is everything that gets it out, and the era is
the frontier one the game is set in: a timber derrick, a walking beam, a hand or
steam pump, barrels, and a wagon to move them. Not modern pipelines.

That is lane D's work and lane D does not exist yet. Until it does, the honest
position is that oil is in the ground and cannot be extracted - which the
reference book should say plainly rather than implying a system that is not
built.

**2026-08-28 — The sawmill is timed too, and batch size is the real lever.**
Lane F asked whether the sawmill should be timed, having marked it instant
because the owner's answer named only the kiln and the forge. Timed, and
briefly - the principle the owner gave was making versus processing, and a
water-driven machine that converts logs into planks while you are elsewhere is
processing by every test the kiln passes. It was the odd one out as written.
Reversible in a word if the owner disagrees when they feel it.

THE MORE IMPORTANT FINDING, from lane F measuring before tuning: the chain was
already priced badly and nobody had noticed, because the times had never been
used. A steel pickaxe cost 880 seconds of station time and 177 kg of hauled ore
- fifteen minutes and five backpack trips for a mid-game tool.

The lever that fixed it was NOT the clock. It was batch size: bars now come out
two at a time and charcoal six. Cutting times alone would have fixed the wait
and left the hauling exactly as punishing, because the ore cost compounds
through the INTERMEDIATES rather than through the recipe you are looking at.
Steel now costs 67 kg against iron's 56 for a whole tier of new ground - a
milestone rather than a tax.

Two things follow for anyone pricing a chain later, lane D especially:
- price the whole tree from raw material, not the recipe in front of you
- when a cost feels wrong, check how many of the thing a batch yields before
  touching any duration

Ceilings lane F pinned, with reasoning worth keeping: MAX_CRAFT_SECONDS = 120,
because a timed station is a SCHEDULING cost - start it, go and dig, come back -
and that holds only until the wait is long enough that the player stops planning
around it and starts treating the station as somewhere to visit tomorrow. And
MAX_STATION_TIME_RATIO = 5, because if a station's cheapest recipe is trivial
beside its dearest, queueing the cheap one stops feeling worth the walk.

**2026-08-28 — Multiplayer coop is being built, and here is what it constrains.**
Owner wants coop: create a room, others join with a code, everyone sees
everyone, and everyone's changes persist on everyone's screen. A new lane owns
it (`src/net/`). The MODEL is theirs to choose and write up; these are the facts
they do not get to choose, recorded here so no lane has to rediscover them:

- **There is no backend.** The game is static files on GitHub Pages. Browser
  peer-to-peer means WebRTC, and WebRTC still needs a rendezvous to exchange
  connection details, so a room code implies some third-party signalling
  service. "No server" is never literally true; the honest question is whose
  server does the introductions.
- **The simulation is already deterministic, and that is worth real money
  here.** Fixed 36 Hz, seeded RNG, no frame-time scaling, no `Math.random()` in
  simulation. Those rules were written for reproducible worlds and headless
  tests; they are also exactly what makes networked simulation tractable. THEY
  ARE NOW LOAD-BEARING FOR MULTIPLAYER - a lane that sneaks wall-clock time or
  an unseeded random into the tick breaks coop, not just a test.
- **The landscape is the hard part, and half the work exists.** It is megabytes
  of mutable pixels. Lane A already serialises changed chunks as a run-length
  diff against a seeded regeneration, for saves. That is precisely what a
  joining player needs: send the seed and the diff, not the world.
- **The bus is the natural network boundary.** `dig:yield`, `inv:changed`,
  `structure:built`, `craft:done` and the rest already describe every meaningful
  change as a small message. What crosses the wire should be close to what
  already crosses the bus.
- **Scope honestly.** "Fully working coop" is not one task. Two players seeing
  each other move, in the same world, with the terrain agreeing, is the
  milestone that proves the model. Everything else follows it.

**2026-08-28 — Coop is host-authoritative over the WORLD, client-owned over
BODIES, and what crosses the wire is an OPERATION, not a pixel.**
Lane net, choosing the model the entry above left open. Five parts, and what
every other lane has to guarantee for it to keep working.

**1. Not lockstep — and the reason is specific, not a preference.** Determinism
is necessary for lockstep but it is not sufficient: lockstep also needs every
peer to be simulating THE SAME THING, and this game deliberately does not.
`src/world/index.js` focuses the chunk streamer on `state.cam`, and the box it
focuses on is `state.view.w/h` divided by `state.cam.zoom`. So *which ground is
resident* — and therefore which liquids settle, which loose ground collapses,
which pours run — is a function of where a player is standing and how big their
window is. Two players a screen apart do not simulate the same chunks. Neither
do two players standing in the same place on different monitors. Lockstep would
mean either simulating all 4096x2560 pixels on every client, which is precisely
what lane A's streaming work exists to avoid, or making the resident set a
synchronised quantity, which is undoing that work. It would also tie every
player's next tick to the slowest peer's next packet, which for four friends on
home connections is a worse game than an occasional correction. Rejected on the
first ground alone; the other two are why nobody should re-open it.

**2. So determinism buys REPLAY instead, which is the better prize.** Lane A's
published mutators — `digFreeCircle`, `chopAt`, `blast`, `dumpMaterial`,
`dumpItem`, `setMat` — are the complete list of ways the landscape can change,
and every one of them is a handful of numbers. Generation is positional and
pure, so a peer that replays the same operation over ground grown from the same
seed gets the same pixels. A dig is about twenty bytes on the wire rather than a
chunk. This is what "no `Math.random()` in the tick" was actually worth, and it
is now load-bearing in the way the entry above warned.

**3. Host-authoritative over terrain, client-authoritative over your own body.**
Saying only "host-authoritative" would overpromise, so both halves are named:

- **Terrain.** The host is the sequencer. A guest's dig is applied locally at
  once, so the shovel stays connected to the hand, and is sent to the host,
  which applies it and relays it to everyone else. The host's landscape is the
  definition of the truth, and it settles disagreements by sending ground rather
  than by arguing about it (part 4).
- **Bodies.** Each client runs its own actor and broadcasts its pose; remote
  players are drawn as interpolated ghosts and are never simulated by anyone but
  their owner. Coop has no adversary, so authority over a body buys nothing and
  costs a rubber band on every jump.

**4. Joining, and correcting drift, are the same mechanism.** A joiner gets the
seed and lane A's run-length chunk diff — `world.serialise()`, already written
for saves — and rebuilds the world from it. Thereafter the host periodically
re-sends only those chunk diffs that have CHANGED since it last sent them, which
converges everything replay cannot: liquids that found a different level, ground
that collapsed on one screen and not another, an operation lost to a dropped
channel. Ops are for immediacy; ground is for truth. Nothing new was invented
for either — the join payload IS the save file.

**5. Signalling: PeerJS's public broker, and the honest reasons.** There is no
backend, so peers meet over WebRTC, and WebRTC cannot introduce two browsers by
itself. Somebody's server does the introductions and the only real question is
whose. The broker at `0.peerjs.com` is chosen because a room code maps onto its
native primitive with no protocol of our own: the host registers the peer id
`mission-<CODE>` and a joiner connects to that id. No account, no key, no room
directory to invent, and it is fetched lazily only when a player actually opens
a room, so a single-player game never touches the network and the headless suite
never sees it. What we are accepting, written down so nobody is surprised: it is
a free shared service with no uptime promise; the room code lives in a GLOBAL
namespace, so codes must be long enough that two rooms cannot collide and that
nobody walks into yours by guessing; and it can disappear. The library itself is
a second third party and is named rather than glossed - `peerjs@1.5.4`, pinned,
from jsdelivr with unpkg as a fallback, because "latest" is a live dependency on
somebody else's release process. That last risk is bounded to one file — everything above the wire speaks `src/net/transport.js`, a
small interface the tests drive with an in-process loopback, so replacing the
broker is replacing one file and no protocol.

**WHAT OTHER LANES MUST GUARANTEE.** None of it is new work; these are rules
already written down, which now have teeth:

- **Nothing in a `tick()` may read wall-clock time or call `Math.random()`.** A
  seeded `rnd()` from `core/rng.js` is fine. This was a testing rule; it is now
  the reason a dug tunnel looks the same on two screens.
- **Every way the landscape changes must go through a published `world.api`
  mutator.** Net taps exactly that list. A lane that reaches past it — writing
  pixels through an internal import — changes the terrain on one screen only,
  and nothing anywhere will go red.
- **A change worth another player seeing should be announced on the bus,** in
  the small-message shape the bus already uses. What crosses the wire is meant
  to look like what already crosses the bus.
- **State belonging to one player must live on `state.player` or in that lane's
  own store,** never in a module singleton that a second body would share.

**SCOPE, honestly.** This buys the milestone the entry above named and no more:
two players in one world, seeing each other move, with the terrain agreeing
after a dig. Inventories, dropped chunks, structures and crafting are NOT
replicated yet — a remote player's spoil goes into their own pack and lands on
nobody else's ground. Those are the next ops, and they plug into this envelope
rather than needing another one.

**2026-08-28 — Crafting is instant; smelting takes time, and better takes longer.**
Owner, answering the question lane C raised: "crafting, make it instant.
Smelting stuff takes small time. Better, more time."

So the line is not between cheap and expensive recipes, it is between MAKING
and PROCESSING:

- **Hand and workbench crafting completes instantly.** Tying a rope or fitting
  a handle is something you do; it should not put a progress bar between the
  player and the thing they decided to make. This is what already happens, so
  nothing changes.
- **Stations that transform material take time** - the kiln and the forge.
  Charcoal, brick, quicklime, glass, iron and steel bars are conversions that a
  fire does, not that a person does.
- **Time scales with the quality of the output.** An iron bar is quick, a steel
  bar is slower, and whatever tops the chain is slower still. That makes the
  wait itself part of what a better material costs, rather than an arbitrary
  tax.
- **A station keeps working while the player is elsewhere.** You load it, walk
  away, and come back to the output waiting - which is also what makes a
  station different in kind from a workbench, and the first step towards
  machines that work without you.

Lane C owns the mechanic and the progress it publishes; lane F owns the times
and how they scale; the UI lane shows the station's progress and what is
waiting in it. `time` already exists on every recipe, so no data is invented.

**2026-08-28 — Ore sits in fields, not everywhere. Distance becomes real.**
Owner's call, from lane F's measurement and lane A's prototype. Today a player
can dig straight down almost anywhere and hit everything: clay is under 65% of
map columns, coal 64%, iron 52%, and the nearest iron to spawn is THREE PIXELS
away. A 4096 px world is functionally about a hundred wide, which fails the test
GAME_DESIGN sets for itself - that a mine network, distant oil fields and rail
lines "only mean something if the map is bigger than a ten minute walk".

CHOSEN: two fields per material, roughly 180 px across. Measured over three
seeds that puts iron under about 18% of columns with the nearest some 758 px
from spawn. Prospecting becomes a real activity, hauling costs distance, and
every rung of lane F's haulage ladder - which was priced for distances this
world never asked for - earns its place.

Note the cliff lane A found: at four fields the map is still effectively
everywhere. Half measures buy nothing, which is why the strong option was taken
rather than the middle one.

TWO GUARANTEES THAT SHIP WITH IT:
- A REACHABILITY FLOOR. One field of the earliest materials stays within a few
  hundred px of spawn, so a bad seed cannot put the first coal 1500 px away
  before the player owns a wheelbarrow. A long game is the goal; a bad opening
  is not.
- Copper and everything below it is allowed to be genuinely far. That is where
  the distance is supposed to live.

Costs lane A one test rework: "every ore type is present in the map" samples a
1024 px band, and in a clustered world a band legitimately contains no gold. It
must sample the whole map or assert against the plan rather than the raster.
Lane F to confirm their reachability proof still holds - it should, being about
the crafting graph rather than distance.

**2026-08-28 — You can put material back, and you can build out of pieces.**
Owner: "I should be able to place dirt, build a small hill with that. Same with
sand. And I should be able to build planks, solid straight objects, place them
on a brick foundation, to make a house."

Two things, and they are the two halves the game has been missing.

**1. PLACING MATERIAL (lane A).** This is conservation of matter arriving at
last. Dug material becomes something you carry and can put down again: fill a
hole, raise a hill, ramp a slope, bury a lava pool, backfill a shaft behind you.
`dumpMaterial(x, y, matIndex, amount)` is already named in lane A's brief and
still unbuilt, and it is now the owner's direct request rather than a design
intention. Loose material must settle by the rules that already exist - sand
slumps, earth holds - so a hill you pour is a hill the world agrees with.

**2. BUILDING OUT OF PIECES (lanes C and F).** Today a building is a whole
prefab: pick a sawmill, place a sawmill. That is right for machines and wrong
for a house. The owner wants planks as *structural pieces* - straight solid
objects placed one at a time, resting on a foundation they also built - so the
shape of a house is theirs rather than ours.

So building gets a second mode alongside prefabs, not instead of them:
- a foundation (brick, stone) that gives a flat, supported base
- pieces placed on it: planks as beams, floors and walls
- the same support rules as everything else, so dig out what holds it and it
  comes down, and the pieces come back as items

The prefab stations stay exactly as they are. A forge is a machine with a
defined shape; a house is whatever the player makes. Both are legitimate and
they do not compete.

WHAT BLOCKS BOTH RIGHT NOW: wood. `chopAt` is published by lane A and not yet
wired by lane B, so a tree cannot be felled, so there are no planks to place.
That is a few lines in one handler and it gates this entire request.

**2026-08-28 — Digging is a face being worked, not a disc being stamped.**
Owner: "now it's currently a small flicker in a circle, a small dirt circle
gone." Correct, and it is literally what the code does: every tick clears a
whole disc at a point ahead of the body, so the eye sees discrete stamps
appearing and disappearing rather than material being removed.

What it should read as, in five parts. None of these change what digging
*costs* - the tier gate and the rates stay exactly as they are:

1. **Work the face, not the volume.** Remove pixels that are adjacent to open
   space first, so a tunnel is eaten INTO from its end. Punching a hole in the
   middle of solid rock is what makes it look like a stamp.
2. **Carve the swept path.** Between two ticks the character has moved; clear
   the capsule between where the tool was and where it is now, not a disc at
   the new spot. A moving dig then leaves one continuous tunnel instead of a
   chain of overlapping circles.
3. **Material leaves visibly.** Removed pixels become loose pixels that fly
   out and settle rather than vanishing. The engine already has loose pixels
   and settling; digging simply is not using them. This is also the first half
   of conservation of matter, so it is work that counts twice.
4. **Bites, not a beam.** Material comes away in strokes timed to the swing,
   with the tool at the face on each stroke. A steady stream of removal at 36
   Hz is what makes it feel like a laser rather than a shovel.
5. **Show where the next bite lands.** The aim indicator should sit on the
   face the tool will actually hit, so a player can place a tunnel deliberately
   rather than discovering where it went.

Split: 1-3 are lane A (`src/world/dig.js`), 4-5 are lane B and the UI lane
(swing timing and the aim indicator). They have to land together to be felt.

**2026-08-28 — Depth is gated by tool tier, not by time.**
Owner playtest: "now I can just dig straight through with my shovel, go to the
uranium/lava level in thirty seconds. No progression, no nothing." True, and it
is the whole game's spine missing: `digFreeCircle` asks only whether a material
is diggable, never what is doing the digging.

The fix is not to slow digging down. It is that **every material has a hardness
tier, every tool cuts up to a tier, and a tool never cuts above it.** Depth then
*is* the progression: you dig as deep as your current tools allow, climb back up,
smelt what you found, and come down again through ground that stopped you last
time. Roughly:

| Tier | Cuts | Needs |
| --- | --- | --- |
| 0 | soil, sand, clay, gravel | bare hands, faster with a shovel |
| 1 | rock, coal, limestone, **iron** | stone pickaxe |
| 2 | copper, tin, zinc, bauxite, quartz | iron pickaxe, made from tier 1 iron |
| 3 | nickel, silver, gold, titanium | steel, which needs coal and iron together |
| 4 | uranium, rare earths | the best gear the tech tree can make |

Granite stays uncuttable at every tier: it is the wall the map is built against.

**Corrected 2026-08-28, by lane F.** The first version of this table put every
metal in tier 2, which cannot work: a tier 2 pickaxe is made of metal, so you
would need an iron pickaxe to mine the iron for an iron pickaxe. Iron is tier 1,
which is also where GAME_DESIGN section 6 always had it - the shallow band, with
coal. Steel (iron + coal, both tier 1) opens tier 3; titanium from tier 3 tips
the pickaxe that opens tier 4.

A second, quieter dependency falls out of the same walk: a stone pickaxe is made
of rock, and rock is tier 1, which needs a stone pickaxe. The only thing that
breaks that deadlock is **loose rock lying on the surface**. Lane C's gatherables
must never stop yielding rock, or the game becomes uncompletable in its first
minute and nothing else in the codebase would notice. It is pinned by lane F's
reachability proof, which walks the whole game from bare hands and converges in
seven rounds.

Hardness and depth are also different axes: surface rock is tier 1, so the very
first material a player meets already needs a pickaxe. The invariant that holds
is that ground never gets softer with depth.

A better tool of the same tier digs FASTER; only a higher tier digs DEEPER. Iron
does not let a shovel cut rock — it makes the shovel quick. That rule is what
stops upgrades collapsing the ladder into "the newest tool does everything".

Tiers are lane F's data. The gate is lane A's, inside digging itself, so no
caller can bypass it. Lane B reads the equipped tool and stops the swing when
the answer is "this cannot cut that", rather than grinding uselessly.

Hazards are the second half and come later: water inflow, cave-ins, heat and the
sheer length of the haul back up. Tool tiers make depth *earned*; hazards make it
*interesting*. Tiers first.

**2026-08-28 — The conveyor is a choice against rail, not a rung above it.**
From lane F's haulage ladder (backpack 35 kg, wheelbarrow 150, mine wagon 1500,
loco and rake 6000, conveyor continuous). The brief described one rising line of
tonnage; that line is not real. A locomotive genuinely out-hauls a belt, which is
why real mines run both. Lane F's test caught the conveyor failing "each rung
beats the one below" and they refused to inflate the belt to make the curve look
tidy — correctly, because that kind of small dishonesty is what makes an economy
feel wrong three stages later.

So the belt wins on a different axis: it is the only rung that does not cost the
player's own attention. A train is driven, loaded and turned round; a belt is fed
and runs. Rungs carry an `attended` field, and the rules are: attended rungs must
climb in throughput, and the conveyor must be unattended, must beat the wagon it
replaces, and must honestly fall short of the train.

Every rung above the backpack also carries a `constraint` (the physical thing it
cannot do) and a `keepsAlive` naming the rung that still does that job — a barrow
that could climb a ladder would delete the backpack. What keeps each rung alive
is a physical limit, never a number. **Lane D: read this before building the
belt.** Rung ids match machine ids: backpack, wheelbarrow, mine_wagon,
rail_train, conveyor.

**2026-08-27 — A stage is reached when the thing physically exists.**
Raised by lane F. Stage state is capability, not knowledge: you are at stage 2
when a kiln exists in the world, not when you could afford one. It is the only
reading consistent with "a new capability must be unlocked by a physical thing
the player built", and it makes `stage:advanced` an event with a real cause. The
guidebook's "you are nearly at stage 2" is a derived view that does its own
subtraction from ITEM_DATA and BUILDINGS. State is fact; guidance is opinion
about that fact, and merging the two is how progression systems rot. The ladder
is walked from 0 and stops at the first unmet rung, so a kiln without a workbench
does not read as stage 2.

**2026-08-27 — Buildings are placed, never crafted.**
From lane F. A structure's cost lives only in `buildings.js`; no recipe outputs a
building. One number, one home — and it matches the world model, where a
structure needs a physical site that can hold it.

**2026-08-27 — A recipe's `tool` is a capability, not an ingredient.**
From lane F. Required but not consumed, and honouring it is a crafting-side gate
(is the item carried), so it implies no tool-durability system and needs nothing
from lane B. The whole stage 0 chain hangs off one hand-made blade:
knife -> rope -> axe -> wood -> workbench.

**2026-08-27 — The sawmill is wood, stone and rope; iron fittings are an upgrade.**
Raised by lane F: stage 3 was uncompletable, because the sawmill asked for iron
that only the stage 4 forge can make. Of the two fixes, we take the one that
changes no stage ordering: the sawmill is built from wood, stone and rope, and
iron fittings become a later upgrade that raises its throughput. Water power is
therefore reachable on wood alone, and the rule that no recipe may skip a stage
stays intact. The rejected alternative — a small bloomery ending stage 2 — would
have put metal before fire is properly established. Lane F updates
`docs/PROGRESSION.md` stage 3 and writes `stages.js` on this basis.

**2026-08-27 — Dug earth yields `soil`.**
Raised by lane F: earth had no `dig2`, so digging it deleted matter, which the
conservation rule forbids. The item id is `soil`. When lane A's spoil work lands,
every diggable material yields something; `soil` is simply the first and by far
the most common of them, and it is what gets tipped, carted and used to fill a
hollow back in.

**2026-08-27 — Death: respawn at your shelter, load stays where you fell.**
Your carried items drop at the place of death and can be recovered. Provisional —
tighten it if death stops mattering.

**2026-08-28 — Automation runs unattended. The owner's call, and it overrides ours.**
A station with its inputs present and its power satisfied works whether or not
anybody is standing there. We had shipped the opposite: lane C reasoned that a
self-starting station makes the world feel like it is playing itself, and pinned
it with a test that a full hopper sits untouched with the player 600 px away.
The owner's answer was flat: "all automation systems should run when im not
present." That is the whole point of building one - a machine you have to
babysit is a slower pair of hands, not a factory.

What this does NOT mean: everything runs everywhere for ever. A station still
needs its inputs delivered, its power supplied and its output taken away, and it
still stops when any of those runs out. Distance must not change the *result* of
a running station, only how it is computed - a far-away forge that catches up in
one lump when you return is fine; a far-away forge that produces more or less
than a near one is a bug. Whether a station keeps ticking while its chunk is
unloaded is lane C's and lane D's to settle on that constraint.
