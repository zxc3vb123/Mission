# Mission

You wake up on a desolate world with nothing. You dig with your hands, then with
tools you made, then with machines you built. Ore becomes metal, metal becomes
rails and pumps and engines, and eventually a rocket that gets you off this rock.

A pixel-material landscape where **terrain is moved, never destroyed**, wired to a
Terraria-style crafting and inventory game, industrialised the way a frontier gets
industrialised: by hand first, then by animal and water power, then steam, then
electricity.

**Play:** https://zxc3vb123.github.io/Mission/

## Running it locally

The game is ES modules, so it needs to be served over http, not opened as a file:

```bash
python -m http.server 8123
```

Then open http://localhost:8123/ . Tests run without a browser:

```bash
node tools/run-tests.js
```

## If you are a Claude chat working on this project

Read these, in this order, before touching anything:

1. `docs/GAME_DESIGN.md` — what the game is and the rules the world obeys
2. `docs/ARCHITECTURE.md` — how the code is split and how systems talk
3. `docs/WORKFLOW.md` — branches, commits, tests, how to hand work over
4. `docs/lanes/<your-lane>.md` — your mission, your files, your task list
5. `docs/STATUS.md` — what every other lane has finished so far

Then work **only inside the folders your lane owns**. Everything you need from
another lane is in its published API, listed in `docs/ARCHITECTURE.md`.

## Layout

```
index.html          the page
src/core/           loop, state, events, input, camera, physics helpers   [lane E]
src/world/          landscape, materials, digging, liquids, lighting      [lane A]
src/actor/          the character and how it moves                        [lane B]
src/items/          items, inventory, dropped chunks                      [lane C]
src/build/          placeable structures and machines                     [lane C]
src/industry/       production chains, power, the rocket                  [lane D]
src/ui/             HUD, menus, the in-game guidebook                     [lane E]
tools/              headless test runner, one test file per lane
docs/               design, architecture, lane briefs, status board
```
