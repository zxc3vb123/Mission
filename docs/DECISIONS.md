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
