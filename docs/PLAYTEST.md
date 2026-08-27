# Playtest log

The owner plays the live build at **https://zxc3vb123.github.io/Mission/** and
reports what they find. Lane E logs each report here, routes it to the lane that
owns it, and records what happened. This file is the memory of what was asked for
and whether it landed — lanes should read it, because it is the only place the
player's own words are kept.

## How a report is handled

1. The report arrives (any wording; no format required).
2. Lane E adds a row below, decides which lane owns it, and messages that lane.
3. The owning lane fixes it, commits, and CI publishes to the live build.
4. Lane E marks the row done with the commit.

## Which lane owns what a player is likely to notice

| What it feels like | Lane |
| --- | --- |
| Ground, ore, caves, water, darkness, digging feel | A world |
| Jumping, climbing, walking, falling, swimming, getting stuck | B actor |
| Carrying, picking up, hotbar, crafting, placing buildings | C items & build |
| Machines, carts, rails, pumps, power, the rocket | D industry (not started) |
| Menus, HUD, saving, camera, performance, the guidebook panel | E core & ui |
| Costs, recipe balance, how long a stage takes, stage order | F content |

Anything that is "the game does not do X yet" is usually a milestone question,
not a bug — those go to `docs/IDEAS.md` or a lane's task list rather than here.

## Reports

| # | Build | What was reported | Lane | Outcome |
| --- | --- | --- | --- | --- |
| — | — | *(none yet — the loop starts with the first playable build)* | — | — |
