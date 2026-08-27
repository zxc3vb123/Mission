# Mission — How the team works

Six chats, one repo, no collisions. LANE E owns this document.

## 1. One chat, one lane

| Lane | Chat name to use | Owns |
| --- | --- | --- |
| A | `mission-world` | terrain, digging, liquids, spoil, lighting |
| B | `mission-actor` | character movement and physics, survival stats |
| C | `mission-items-build` | inventory, crafting, structures |
| D | `mission-industry` | hauling, power, machines, rocket |
| E | `mission-core` | engine, UI, integration, releases |
| F | `mission-content` | data tables, balance, guidebook |

Open a chat per lane in this folder and start it with exactly:

```
Read docs/ARCHITECTURE.md, docs/WORKFLOW.md, docs/STATUS.md and
docs/lanes/<lane>.md. You are that lane. Work only in the folders it owns.
Start with the first unchecked task in your brief.
```

The lane brief tells that chat everything else.

## 2. Branches

```bash
git checkout -b lane/world      # or lane/actor, lane/items, lane/industry, lane/content
```

- Work on your branch. Commit often, in small steps.
- Merge `main` into your branch before you open a merge — never the other way.
- When your task is done and tests pass, merge to `main` and push.
- Because folders do not overlap, merges are almost always clean. If you hit a
  conflict outside your folder, you edited something you should not have.

Commit message style:

```
world: spoil is produced when digging and can be dumped
actor: ledge grab and ladder climbing
content: stage 2 kiln recipes
```

## 3. The loop every lane repeats

1. `git pull` (or merge `main`) — pick up other lanes' work.
2. Read `docs/STATUS.md` — what is done, what changed, what is blocked.
3. Do the next unchecked task in your brief.
4. `node tools/run-tests.js` — all green, including other lanes' suites.
5. Update `docs/STATUS.md`: your section, one line per finished thing.
6. If you added or changed a published API or event, update `docs/ARCHITECTURE.md`
   in the same commit.
7. Commit, merge to `main`, push.

## 4. Asking another lane for something

You need a function only another lane can write. Do **not** write it yourself.

Add an entry to `docs/REQUESTS.md`:

```
### world -> actor: need carry weight to slow the walk speed
Why: hauling has to feel heavy, or carts are pointless.
Proposed: actor reads items.inventory.carriedMass() and scales WALK_SPEED.
Status: open
```

The owning lane picks it up, implements it, and marks it done. If you are blocked
meanwhile, work on the next task instead.

## 5. Tests are the contract

- Every lane owns `tools/tests/<lane>.test.js`.
- A task is not finished until it has a check in that file.
- Tests run headless: no browser, no DOM. `tools/testkit.js` boots the whole game
  with a stubbed environment and steps ticks for you.
- Never weaken another lane's test to make yours pass. If a test is wrong, say so
  in `docs/REQUESTS.md`.

## 6. Releases

Lane E cuts them:

1. Bump `VERSION` in `src/core/state.js` and `version` in `package.json`.
2. Note the changes at the top of `docs/STATUS.md`.
3. Merge to `main` and push — GitHub Pages publishes automatically.
4. Live at **https://zxc3vb123.github.io/Mission/** (add `?v=x.y.z` to bust caches).

## 7. Scope discipline

- Build the current milestone only (top of `docs/STATUS.md`). Ideas for later go
  in `docs/IDEAS.md`, not into the code.
- Prefer the smallest thing that is actually playable. A wheelbarrow that works
  beats a rail network that half-works.
- If a task turns out to need something from another milestone, say so in STATUS
  and pick the next task.
