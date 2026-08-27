# LANE D — Industry

**You own:** `src/industry/`, `tools/tests/industry.test.js`

**Your job:** everything that does work so the player does not have to. Hauling,
lifting, pumping, powering, refining — and at the end of the chain, the rocket.

---

## What already works

Nothing yet. You are building this lane from scratch, and you are the lane that
turns a survival game into an industry game.

You depend on lane C's `build.api` for placement. Until that lands, build the
machines that stand alone and can be dropped in by a debug call: a wheelbarrow, a
water wheel, a hand winch.

---

## Design rules for machines

1. **Every machine is physical.** It occupies space, needs a place that can hold
   it, can be dug out from under, and can break.
2. **Every machine has honest inputs.** Fuel, water, ore, power, and a person to
   start it. Nothing runs on nothing.
3. **Machines beat muscle by an order of magnitude, not by infinity.** A
   wheelbarrow is 4× a backpack. A rail wagon is 10× a wheelbarrow. A steam hoist
   is tireless where a hand winch is not.
4. **Power arrives in the order of history** — muscle, water, wind, steam, then
   electricity. See `docs/PROGRESSION.md`; electricity does not appear before
   stage 6, by explicit design decision.

---

## Task list

### M2 — hauling by hand
- [ ] Wheelbarrow: a pushed object with mass and inertia, loaded from a chest or
      by shovelling spoil, tipped out where you want the material to go.
- [ ] Buckets: carry water or spoil in small amounts; the first way to move liquid.
- [ ] Chutes and tipping: gravity does the hauling when you dig downhill.

### M3 — lifting and tracks
- [ ] Hand winch and rope hoist over a shaft: raise a bucket of ore or spoil.
- [ ] Rails: placed track segments, junctions, slopes. A wagon that rolls, brakes,
      derails if you are careless.
- [ ] Wagon loading/unloading at chests and tip points.
- [ ] Elevator platform in a shaft: hand-cranked first, powered later.

### M4 — mechanical power
- [ ] Water wheel on flowing or falling water; wind mill above ground.
- [ ] Shaft-and-belt transmission: power travels along a line of gears/belts and is
      consumed at the end. Distance and bends cost efficiency.
- [ ] Powered sawmill and grinder as the first consumers.
- [ ] `powerAt(x,y)` published so lane C's structures can ask if they are driven.

### M5 — steam and fluids
- [ ] Boiler + piston: burns coal or charcoal, needs water, produces mechanical
      power, and explodes if run dry.
- [ ] Pipes and pumps: move water and oil against gravity, with a real head limit.
      Use lane A's `drain`/`flood`.
- [ ] Mine drainage as a proper problem: a deep shaft floods, a pump keeps it
      workable, the pump needs fuel someone has to deliver.
- [ ] Steam hoist and steam-driven rail haulage.

### M6 — electricity and refining
- [ ] Generator driven by steam or water; cables as a network with a `netId`;
      consumers that brown out when demand exceeds supply.
- [ ] Electric lamps (through lane A's light sources), motors, conveyors, cutters.
- [ ] Refinery and chemical works: crude oil to kerosene, lubricant, tar.
- [ ] Electric furnace and electrolysis for aluminium and hydrogen.

### M7 — the rocket
- [ ] Assembly hall: rocket sections built from refined parts, one at a time,
      each taking real inputs and time.
- [ ] Launch pad: sections stacked, tanks fuelled, systems checked.
- [ ] Launch sequence and the ending.
- [ ] `rocketProgress()` published for the guidebook.

---

## Rules for this lane

- Machines are objects, never landscape pixels. To change terrain, call lane A's
  API — including `dumpMaterial` when a wagon tips its load.
- Conservation of matter applies to machines too: a wagon of spoil that gets
  emptied puts that material into the world somewhere.
- Costs, rates and efficiencies live in `src/content/` (lane F). You implement
  behaviour, lane F tunes numbers.
- Power networks must be tested headlessly: build a network in a test, run it,
  assert the consumer got what the producer made.

## Gotchas

- Do not let a machine teleport material. If a conveyor moves ore, the ore exists
  in exactly one place at every tick.
- Rails and wagons must survive the ground under them being dug away — that is a
  feature, and it should look like a derailment, not a crash.
- Keep the simulation cheap: hundreds of machines will exist late game. Tick
  machines on a schedule (not all every tick) where the fidelity allows.
