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

## 2. Git: everyone works on `main`, and commits only their own paths

**Do not create or switch branches.** Every chat shares one working directory, so
a branch checkout by one lane moves the ground under all the others. This was
tried and it broke immediately.

Instead:

```bash
git pull --no-rebase                 # before you start, and before you push
git add src/world tools/tests/world.test.js docs/STATUS.md   # YOUR paths only
git commit -m "world: ..."
git push
```

Use `--no-rebase` (a merge), not `--rebase`: rebase refuses to run while *any*
file in the tree is dirty, and another lane's work-in-progress usually is. Never
`git stash` to get around that - you would be pocketing someone else's work.

Three rules that make this safe:

1. **Never `git add -A` or `git add .`** — another lane's half-finished file is
   almost certainly sitting in the working tree, and you will commit it.
   Always name your own paths.
2. **Never `git checkout`, `git switch`, `git stash` or `git reset --hard`** —
   they change what every other chat sees on disk. If you think you need one,
   stop and ask in `docs/REQUESTS.md`.
3. **Pull before you push.** Someone else has almost certainly committed since
   you started.

Because folders do not overlap, commits from different lanes never conflict.
Conflicts mean somebody edited outside their lane.

### Local green is not main green, and neither is one suite passing

Two different traps, both of which have already bitten. When CI is red and your
local run is green, work out which one you are in before you change anything.

**1. The shared working directory.** All six chats share one checkout, so **you
see every other lane's uncommitted work as though it had landed** — and they see
yours. Lane F once removed a pending-yield entry because the material named it on
disk; the material was not committed, and main went red. Another lane saw
`inventory.setCapacity is not a function` from code that existed on disk and not
in git. So: **before you rely on another lane's change, check `git log` for it,
not the file on disk.**

**2. Suites are not isolated from each other through the world.** `boot()` resets
the inventory, the drops, the particles and the tick counter, but the landscape
is a module singleton and carries whatever earlier suites did to it. Any test
that mutates terrain and then measures something — a corridor, a cavern, a
collapse — is exposed to this. Lane B's coast measurement passed alone and failed
in the full run because sand collapsed into its corridor from ground an earlier
suite had disturbed.

Two rules follow:

- **`node tools/run-tests.js` is the only run that proves anything.** One suite
  passing alone is not evidence.
- **A test that shapes terrain must guarantee its own ground** — roof it, cap it,
  and re-cut it immediately before each measurement — and assert the precondition
  it depends on, so an obstruction fails as itself rather than as a strange
  number.

### Your push is not only yours

We share one `.git`, so **any lane's `git push` carries up every lane's
committed work**, ready or not. A lane that commits a half-finished step meaning
to amend it before pushing will find the next lane's push has already published
it — and CI has already run it.

So: **commit only what you would be content to see deployed.** The timing of the
push is not yours to control. If something genuinely must not ship yet, leave it
uncommitted, or commit it somewhere that is not main.

### Reproducing CI without disturbing anyone

Never `checkout`, `switch` or `stash` in the shared tree. To run exactly what CI
runs:

```bash
git worktree add /tmp/mission-ci origin/main
cd /tmp/mission-ci && node tools/run-tests.js
git worktree remove /tmp/mission-ci
```

That is a separate directory. It does not move a single file under anybody else.

Commit message style:

```
world: spoil is produced when digging and can be dumped
actor: ledge grab and ladder climbing
content: stage 2 kiln recipes
```

## 3. The loop every lane repeats

1. `git pull --no-rebase` — pick up other lanes' work.
2. Read `docs/STATUS.md` — what is done, what changed, what is blocked.
3. Do the next unchecked task in your brief.
4. `node tools/run-tests.js` — all green, including other lanes' suites. If a
   failure is in someone else's suite and you did not cause it, say so in
   `docs/STATUS.md` rather than fixing their code.
5. Update `docs/STATUS.md`: your section, one line per finished thing.
6. If you added or changed a published API or event, update `docs/ARCHITECTURE.md`
   in the same commit.
7. `git add` your paths, commit, `git pull --no-rebase`, push.

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
