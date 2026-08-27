# Mission — Status board

**Current milestone: M1 — Bare hands** (see `docs/GAME_DESIGN.md` §8)

Every lane keeps its own section up to date, one line per finished thing, newest
at the top. Read this before you start work; write to it before you commit.

---

## Release log

- **0.1.1** — daylight reads correctly on the terrain surface; darkness confined to
  caves and dug shafts. Verified live on GitHub Pages.
- **0.1.0** — first playable build. Modular engine, pixel landscape with 26
  materials and every ore band, digging, liquids, collapsing sand, darkness with a
  head lamp, dropped chunks and an inventory. 34 headless checks green.

---

## Lane A — World
- [done] Landscape, materials, generation, digging, liquids, unstable material.
- [done] Darkness and the head lamp: daylight bleeding into shafts, lamp rays that
  stop at solid material, glow from lava and uranium.
- [done] Ore set expanded to clay, limestone, gravel, coal, iron, copper, tin,
  zinc, lead, nickel, bauxite, quartz, titanium, silver, gold, uranium, rare earth,
  plus oil pockets, all banded by depth.
- [next] Dig speed per material and tool; conservation of matter (spoil).

## Lane B — Actor
- [done] Walk, fall, wall-scale, ceiling-hangle, swim, dig; vertex collision;
  breath, drowning, lava and fall damage; the published pose in `state.player`.
- [next] Momentum and honest jumping; climbing that needs holds; carry weight
  affecting movement.

## Lane C — Items & Build
- [done] Item registry with every raw ore, mass-aware inventory, dropped chunks
  with physics and pickup.
- [next] Mass-limited backpack and hotbar; crafting from lane F's recipe data;
  `src/build/` placement.

## Lane D — Industry
- [not started] Waiting on lane C's `build.api`. Can begin with the wheelbarrow,
  buckets and chutes, which stand alone.

## Lane E — Core & UI
- [done] Fixed-tick loop, shared state, event bus, input, camera, renderer with a
  fixed layer order, vertex physics helper, particles, HUD, headless test kit and
  runner.
- [next] Save/load with per-system hooks; start screen; inventory and crafting UI.

## Lane F — Content
- [not started] `docs/PROGRESSION.md` is written as prose. First job is turning it
  into `src/content/` data tables, which lanes C and D are waiting on.

---

## Open questions for the project owner

Answers go in `docs/DECISIONS.md` once settled.

1. **World size.** Currently 1600×1000 pixels — about a ten minute walk end to end.
   A full progression game probably wants 4000×2400 or larger, which needs chunked
   generation and streaming. Bigger world, or keep it tight?
2. **Spoil strictness.** Should every dug pixel have to be physically dumped
   somewhere, or may a fraction be "compacted away" so early hand-digging is not
   pure logistics?
3. **Death.** Respawn at a shelter with your carried load dropped where you died,
   or something harsher?
4. **Night length and hunger rate** — how much survival pressure do you actually
   want? Current lean: light pressure, the world is the opponent.
5. **Animals.** Simple wandering prey only, or predators that make the surface
   dangerous at night?
