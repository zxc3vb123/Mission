# Lane I — Creatures and fighting

Everything alive that is not the player, and hitting things with whatever is
already in your hands. `src/life/`, `tools/tests/life.test.js`.

Newest at the top.

---

- [done] **The swing, and one creature that reacts to light, sound and walls.**
  The lane exists. `src/life/` boots as the `life` system, 50 headless checks.

  **The swing.** No weapon slot and no weapon class - whatever is in your hands
  swings, and the tool decides what it is worth (the owner: "i should be able
  to hit using everything. axes. shovels etc."). Two things settled first
  because they are the expensive ones to change later:

  - **A swing costs time.** Every tool has a cadence, taken from lane F's
    `swing` in `KIND_COMBAT`, and the swing refuses with `reason:"recovering"`
    until it has recovered. A pickaxe is 65 ticks and a knife is 21, so "heavy
    and slow" is a thing you feel rather than a line in a table.
  - **Hitting a creature and hitting rock are not the same click.** Digging is
    the mouse; the swing is `h`, its own key, registered in ARCHITECTURE 4a.
    There is a check that six swings at a rock face move not one pixel, so a
    player surprised in a tunnel can never dig their own roof out by reflex.

  Damage comes from lane F's table and nothing here copies a number: an axe is
  the best weapon over a fight, a pickaxe lands the heaviest single blow and is
  still third best, and bare hands are worth about a fourteenth of an axe -
  which is the whole argument for carrying a tool you were not going to dig
  with. A steel axe beats a stone one for the same reason it fells a tree
  faster, because it is the same `speed` number.

  **The crawler.** One creature, and depth is what makes it worse: three bands
  by how far below the surface it spawned, tougher and faster and harder
  hitting the deeper it came from. Every defence the player already owns is a
  real answer, and each one has a check:

  - **Light.** It will not walk into lit ground and bright ground drives it
    back. THE HEAD LAMP IS THE BEAM AND NOT THE HALO - if the 62 px glow round
    your feet counted, the lamp would be a force field and nothing could ever
    reach you. So: point your light at it and it holds off at about 43 px,
    turn away and it comes from behind, and the answer to being surrounded is
    to put a fire DOWN, because a fire is not a cone. That is the first time a
    lamp and a campfire have differed in a way anybody can feel.
  - **Walls.** It cannot dig one pixel. Terrain here is moved and never
    destroyed, so a shaft sealed behind you is sealed - measured, with the
    crawler close enough to know you are there and still unable to pass.
  - **Quiet.** Digging is heard from 240 px, walking from 130, standing still
    from 36. Stopping is a tactic.
  - **Absence.** With no player within 340 px it has nothing to hunt and holds
    still. That is a rule keyed on the distance to a PLAYER - a fact every
    client agrees about - and never on the distance to a camera, which they do
    not. So distance changes how a crawler is computed and never what it comes
    to, and there is a check that moving the camera a thousand pixels away
    changes nothing.

  Saving works from the first commit: a crawler that forgot it was wounded
  across a save would be worse than no crawler.

  **What it does NOT do yet, and both are deliberate:**

  - **A bite does not hurt you.** `creature:attack` carries the damage and this
    lane does not apply it - `state.player.energy` is lane B's branch
    (ARCHITECTURE 4). The request is open with a named consumer and stays open
    until there is a CALL SITE, per WORKFLOW 4c. Until then a crawler is
    frightening and harmless.
  - **A kill drops nothing.** A drop is matter appearing, and matter comes from
    somewhere or it does not come at all (WORKFLOW 5c). Meat and hide belong
    with lane J's food items; there is a check that a kill leaves the drop
    count and the pixel count exactly where they were.

- [done] **The line with lane J, answered: they own husbandry, this lane owns
  the animal.** `life.api.creaturesNear(x, y, r)` is published for them, and
  every row carries `tame` and `fed` from today - false and 0 until there is
  something to be true about - so nothing on their side changes shape the day
  the first stock animal exists. Agreed with them that an animal's yield must
  come out of what it ate, which is conservation of matter made structural
  rather than remembered: milk from an empty trough is the kiln printing
  charcoal with a nicer face on it. Not building the tame side yet - there is
  no animal, and the milestone is M1 - but the shape is settled in REQUESTS.

- [done] **Drawing opened in a browser and made to draw** (WORKFLOW 5d: no
  headless suite executes one line of a render file). Two crawlers and a swing,
  counted through an instrumented context: 8 leg segments, 2 bodies, 4 eyes, 2
  bars on the wounded one and 1 swing arc, with no error and a full
  `renderer.draw` completing. The pane was not displayed while this ran, so
  `state.view.w` was 0 - which is the trap 5d names, and the reason
  `drawCrawlers` floors its cull half-width instead of dividing whatever the
  window happens to be.

- [note] **Not mine, but found here and now closed: `actor: a tool with no dig
  kind still reads as a tool, not as cargo` was red on `origin/main`**
  (verified at 23683c4, 1 of 931). Lane F added the knives to `TOOLS` with
  `kind: "knife"` - they were not on that table until creatures arrived - and
  lane B's `heldLook` returns a tool's kind whenever it has one, so a stone
  knife answered `"knife"` where their check expected `"blade"`. Routed to
  **lane B** with lane F copied, per WORKFLOW 4a. They had already found the
  larger version of it (`bc46cec`): the fix was not to special-case the knife
  but to stop an unmapped kind reading as bare hands at all. Green now, 1033
  checks. Worth keeping because of the shape - two correct changes in two
  lanes composing into a third thing, with both suites green until they met.

- [note] **`t` was taken while this was being written.** The obvious letter for
  a swing was `t`, and lane J had already put `t` in the ARCHITECTURE 4a table
  for tending crops - on disk, uncommitted, which is precisely the case that
  table exists to catch and precisely the case `git log` would not have
  answered. Took `h` instead. Nothing was lost; it cost one edit, which is what
  reading the table before binding is worth.

- [open] **Two questions for the owner, at the bottom of `docs/STATUS.md`**:
  whether the swing wants a mouse button rather than a letter, and whether a
  crawler should ever be worth killing.
