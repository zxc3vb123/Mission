# Mission — Lanes

Six chats. Each one opens in this folder, reads its brief, and works only in the
folders that brief lists.

| Lane | Brief | Folders it owns | In one line |
| --- | --- | --- | --- |
| A world | [lanes/world.md](lanes/world.md) | `src/world/` | The ground: what it is made of, how it is dug, how it collapses, floods and is lit |
| B actor | [lanes/actor.md](lanes/actor.md) | `src/actor/` | The body: how it moves, climbs, tires, drowns, and swings a tool |
| C items & build | [lanes/items-build.md](lanes/items-build.md) | `src/items/`, `src/build/` | What you carry, what you craft, what you place |
| D industry | [lanes/industry.md](lanes/industry.md) | `src/industry/` | Machines that do the work for you, up to the rocket |
| E core & UI | [lanes/core.md](lanes/core.md) | `src/core/`, `src/ui/`, `tools/`, `docs/` | The engine, the screen, the integration, the releases |
| F content | [lanes/content.md](lanes/content.md) | `src/content/`, `docs/PROGRESSION.md` | The numbers and the tech tree; the guidebook the player reads |

## Kickoff prompt

Paste this into a fresh chat opened in `C:\Users\newga\Desktop\Mission`, with the
lane filled in:

```
You are LANE <A/B/C/D/E/F> on this project.

Read, in order:
  docs/GAME_DESIGN.md
  docs/ARCHITECTURE.md
  docs/WORKFLOW.md
  docs/STATUS.md
  docs/lanes/<world|actor|items-build|industry|core|content>.md

Then work the first unchecked task in your brief. Rules: edit only the folders
your lane owns, cross-lane calls go through published APIs or the event bus,
keep `node tools/run-tests.js` green, and update docs/STATUS.md before you
commit. Work on branch lane/<name>.
```

## Dependency order

Lanes A, B, E are independent and can run at any time.
Lane C needs A and B's published APIs — both exist today.
Lane D needs C's `build.api` — so D starts with self-contained machines (hauling
carts, water wheels) and joins the rest once C lands placement.
Lane F is pure data and can start immediately; everyone else reads its tables.

If two lanes both want the same feature, it belongs to whoever owns the folder it
lives in, and the other lane files it in `docs/REQUESTS.md`.
