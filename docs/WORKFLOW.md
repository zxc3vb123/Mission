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

0. **Commit by pathspec, not by index.** `git add` is not enough, because the
   INDEX IS SHARED TOO: `git commit` takes everything staged, including whatever
   another lane staged and had not yet committed. Use the pathspec form, which
   ignores the rest of the index entirely:

   ```bash
   git commit -m "core: ..." -- src/core src/ui tools/run-tests.js
   ```

   This has already bitten twice in this project. One lane E commit describing
   27 insertions actually carried 401, including a whole file belonging to
   another lane; another lane's STATUS.md section landed inside a third lane's
   commit. Nothing was lost either time, but the history lies about who changed
   what, and a commit you did not read is a commit you cannot vouch for.


1. **Never `git add -A` or `git add .`** — another lane's half-finished file is
   almost certainly sitting in the working tree, and you will commit it.
   Always name your own paths.
2. **Never `git checkout`, `git switch`, `git stash` or `git reset --hard`** —
   they change what every other chat sees on disk. If you think you need one,
   stop and ask in `docs/REQUESTS.md`.
3. **Pull before you push.** Someone else has almost certainly committed since
   you started.
4. **Build a shared file's content from HEAD plus your own lines** - never from
   whatever happens to be on disk. `src/systems.js`, `docs/STATUS.md` and the
   workflow file are edited by everyone, so the copy in front of you may contain
   another lane's half-finished edit. Writing your version over it silently
   reverts their work for anyone who runs the tests. One lane spent an hour on
   exactly this: an edit written against a stale copy of systems.js quietly
   undid another lane's change for everybody.

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

### Before you diagnose a red check, find out whether it is even real

A failing check in the shared tree is not evidence of anything until you know
whether it exists in a COMMIT. The tree is everyone's scratchpad: what you are
looking at may be mid-edit by design, two edits stale, or a test whose fixture
is half rewritten.

This has cost time three times, every one of them a diagnosis sent about a
working-tree state that no commit contained. Once the reasoning was wrong in a
way that sent the author looking at the wrong code entirely - a mantle test that
"failed to land" was actually jumping clean over a pillar too short to climb.

So: run it against `origin/main` first, and say which one you are talking about
when you report it.

```bash
git worktree add /tmp/mission-ci origin/main
cd /tmp/mission-ci && node tools/run-tests.js   # is it red HERE?
git worktree remove /tmp/mission-ci
```

Red on main is everyone's problem and blocks the deploy. Red only in the tree is
somebody's work in progress - worth mentioning to them, never worth diagnosing
at a distance.

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

## 5a. A claim about what is built must be PROBED, not asserted

Lane F's reference book marks each page live or planned. That flag started as a
hand-written claim checked against a hand-written list, and it went stale the
instant another lane shipped - the book called stations and tools "not built"
while both were live and proven.

The fix generalises to anything that describes the state of the project: probe
the booted game instead. Is there a build system with `place()`? Does a shovel
genuinely fail where a pickaxe succeeds? Does the world expose `dumpMaterial`?

And make the two directions bite differently, which is the part worth copying:

- **claims LIVE, probe says unbuilt -> FAIL.** Overclaiming misleads the player,
  and only the claiming lane can cause it.
- **claims PLANNED, probe says built -> REPORT, do not fail.** Another lane
  shipping a feature must never redden main for you; it should nag you to change
  one word.

The same shape solved an earlier trap: a check that failed when an item gained a
source required two lanes to commit atomically, so whoever pushed first reddened
main for the other. Reporting instead of failing removed the race.

## 4a. Route a bug to ONE lane, with a named owner

When a bug sits between two lanes, naming both and asking them to settle it
between themselves produces two fixes. That happened with the click that both
placed a building and dug: two lanes shipped independent fixes minutes apart,
and one had to be withdrawn.

So: name a default owner in the same message, and say the other lane is copied
for awareness. If the named owner disagrees, they hand it over - that costs one
message, whereas both lanes starting costs two implementations and a decision
about which to keep.

## 4b. Pathspec is not enough for a SHARED file

`git commit -- <your paths>` protects other lanes' FILES. It does nothing about
another lane's uncommitted hunks inside a file you both edit - `docs/STATUS.md`,
`src/systems.js`, the workflow file. Staging the file stages their lines too,
and pathspec then faithfully commits exactly that. It has happened three times.

For a shared file: run `git diff HEAD -- <the file>` first, and if any hunk is
not yours, rebuild the file as HEAD plus only your own section before you stage
it.

## 5. Tests are the contract

- Every lane owns `tools/tests/<lane>.test.js`.
- A task is not finished until it has a check in that file.
- Tests run headless: no browser, no DOM. `tools/testkit.js` boots the whole game
  with a stubbed environment and steps ticks for you.
- Never weaken another lane's test to make yours pass. If a test is wrong, say so
  in `docs/REQUESTS.md`.

## 4c. A request closes when there is a CALL SITE, not when the API exists

The most expensive failure on this project is not a bug. It is a capability
that is built, tested, live - and inert, because the lane that would USE it
never wired it, and neither lane had a reason to look.

It has happened three times:
- `chopAt` published by lane A, uncalled by lane B: no wood, so the stage 0
  chain dead-ended at an axe that felled nothing, for hours.
- `dumpMaterial` published by lane A, uncalled by lane C: the owner asked for
  "place dirt, build a hill", it was finished the same hour, and did nothing
  in play until someone checked.
- `build.api` published by lane C with no way for a player to enter placement
  mode: an entire system unreachable until the UI lane offered a door.

So: **a REQUESTS.md entry stays open until a call site exists.** Publishing the
API is half the job. The publishing lane keeps the entry open and names the
consumer; the consuming lane closes it when their call lands. `grep -rn
"<theApi>" src/ --include=*.js` outside the owning folder answers it in one
command.

This is the same principle as everything else that has worked here: the catch
has to be mechanical, not diligent. Nobody forgot on purpose.

## 5c. Two commands answer the two questions that keep going wrong

    node tools/verify.js     is this red for real, or is it somebody's desk?
    node tools/shipped.js    can the player actually have it?

**verify** exports a commit on its own and runs the suite there, which is what
CI does. Running the suite in this directory does NOT test a commit: it tests
the commit plus every other lane's work in progress, because all the chats
share one working tree. A suite can be red on your screen, green in CI, and
belong to nobody - the tree in front of you is a state no commit has ever
corresponded to. Three misroutes came from exactly that, each one a real red
line about somebody's half-written file.

Run it before reporting another lane's suite as broken. `node tools/verify.js
origin/main` answers the same question about what everyone else has.

**shipped** compares tree, HEAD, origin/main and the live build, and names what
is stuck at which step.

Check the artifact, not the desk it was made on.

## 5b. Done means DEPLOYED, and there is a command that says so

The single recurring failure on this project has not been a bug. It is work
that exists and the player cannot reach. It has happened with the dig gate, the
crafting screen, the momentum tuning and the guidebook, and every time it looked
like a mystery from the outside, because nothing was red.

Between "green on my machine" and "in the game" there are four steps, and each
one fails silently:

    working tree  ->  commit  ->  push  ->  CI  ->  deployed

A file never committed is invisible. A commit never pushed is invisible. A push
that failed CI is invisible. None of that shows up as a failing test.

So, two rules:

1. **A task is not finished until it is live.** Not when the tests pass, not
   when it is committed. If you are waiting for permission to push, say so in
   your status line so it is visible rather than assumed.
2. **Run `node tools/shipped.js` before you report anything as done.** It
   compares the working tree, HEAD, origin/main and the live build, and names
   what is stuck and where. It exits non-zero when something is.

```bash
node tools/shipped.js
```

Its first run found the guidebook - three files that existed only in one
session's working tree while the owner was asking where it was.

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
