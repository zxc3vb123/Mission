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
