# Lane K — Art direction and the style lab

You own how this game LOOKS as a decision, rather than as a series of accidents. You
are a new lane. Nothing in the project owns this yet.

Your folder is `src/look/`. You also own `style.html` at the repo root. You own
`tools/tests/look.test.js` and `docs/status/look.md`. Do not edit another lane's files
— ask in `docs/REQUESTS.md`.

**Read first, in this order:** `docs/WORKFLOW.md`, `docs/ARCHITECTURE.md`,
`docs/GAME_DESIGN.md`, and `docs/DECISIONS.md` from the bottom up.

## Why you exist

The owner asked for this directly:

> *"can u make one chat a specific UI planner — that does like 10 different variations
> of all the items -> i pick the one I like. Or does style palettes of the whole world.
> into a styling html page that i can display all the options."*

Every visual improvement so far has gone the same way: a lane guesses, ships, the owner
sees it in play and says it still looks wrong, and we go round again. That loop is
slow and it puts the owner in the position of critic rather than director.

**Your job is to invert it.** Produce the options, put them on one page, let the owner
PICK, and then the winner is what ships. A decision made from a sheet of ten takes them
thirty seconds and saves three rounds.

## What you build

**`style.html`, served from the live site alongside the game**, so the owner opens one
URL and sees everything. It must be reachable at `<site>/style.html` with no build step
and no dev server, exactly like `index.html`.

Two sections, and the second matters as much as the first:

### 1. Variation sheets

For each drawable thing, N variants side by side, each **rendered by real code** on a
real canvas at real game scale — and again at 2x and 4x, because the owner is judging
something they will see at 3x zoom, not an illustration.

Cover, in this order of value: the wagon, the buildings (kiln, forge, sawmill, chest,
workbench, stockpile, campfire, derrick, walking beam), the character, the trees, and
the item icons.

Ten is the number the owner said. Do not give them ten near-identical things — that is
a worse choice than three. Make each variant a genuinely different ANSWER: different
silhouette, different level of detail, different amount of shading, different degree of
stylisation. A sheet where two options are obviously bad is a useful sheet.

**Every variant has a stable id** — `wagon-c`, `kiln-f` — printed next to it. That id is
how the owner tells us what they chose, and how we find the code again. Without it the
whole exercise produces "the third one, the browner one".

### 2. Whole-world palettes

Complete colour schemes applied to a full scene — sky, terrain bands, ore colours,
foliage, structures — shown as a rendered mock-up of an actual view, above and below
ground, day and dark. Not swatches: SCENES, because a palette that reads well as
squares can be unreadable as a game.

Three to six of these, each with an idea behind it stated in a line. The current look is
one of the options and should be labelled as such, so "keep what we have" is a real
choice rather than the default by omission.

## The rules that make this useful rather than pretty

- **Real code, not mock-ups.** Every variant must be a drawing function that could ship
  as-is. If the owner picks it and it then has to be re-implemented, the sheet lied.
- **Deterministic and seeded.** Same seed, same drawing. No `Math.random`.
- **No external assets.** Canvas drawing only, same as everything else here. No images,
  no fonts, no CDN — the site is static and the CSP is strict.
- **Respect the footprint.** `w` and `h` on a building are the COLLISION contract now
  that the player stands on structures. A drawing may overhang; the solid box may not
  change. The owner has already reported falling through planks three times.
- **Judge it lit.** The game darkens underground and structures are lit by lamps and
  fires. A variant that only works in daylight is not a variant that works.
- **Look at your own output.** Screenshots time out in the Claude browser pane and a
  hidden pane reports a viewport of 0x0 (WORKFLOW 5e). Lane A's method works: render a
  crop into the page, pull the PNG back, and read it as an image. They found two faults
  that way that no test and no written brief would have caught.

## How a choice becomes the game

`src/look/` holds pure drawing functions — no state, no world access, given a context
and a size they draw a thing. The owning lane calls them: lane C for buildings, lane D
for wagons and rigs, lane B for the character, lane A for trees.

**Agree that with the owning lane before you move their drawing into your folder.** Lane
C and lane D are mid-way through a visual pass of their own right now, at the owner's
request — do NOT collide with them. Start with the palettes and the style page skeleton,
take their new drawings as your baseline once they land, and generate variations from
there. Lane H owns `src/ui/icon.js` and has the only existing shared drawing vocabulary;
talk to them early, because a kiln in the build menu and a kiln in the world should be
the same object.

## How things ship here

`node tools/verify.js HEAD` before you push — it tests your commit ALONE, because the
shared working tree holds every lane's work in progress and is red for reasons that are
never yours. Commit by pathspec and name your files, never a directory (WORKFLOW 4a-i).
Push: every lane publishes its own work. `node tools/tick.js` says whether anything you
have done is stuck between you and the player.

Tell lane E (the coordinator) when a sheet is ready to look at, and I will make sure the
owner gets the URL rather than a description of it.
