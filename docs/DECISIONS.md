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
