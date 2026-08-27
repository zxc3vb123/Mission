/* Putting ground back. LANE C (items).

   The owner asked to "place dirt, build a small hill with that, same with
   sand". Lane A built the world half - dumpItem turns carried material back
   into real terrain that settles by the normal rules, so a poured heap of
   sand slumps and a poured heap of earth holds. Nothing happened until this
   lane called it, which is the mirror of picking a chunk up.

   WHICH ITEMS POUR, and the rule answers itself: ANYTHING YOU COULD DIG BACK
   OUT BY HAND. Soil, sand, clay and gravel are tier 0, so a heap you poured
   is a heap you can undo with nothing but your arms.

   Rock and every ore are tier 1 and above, and they throw as chunks instead.
   That is not squeamishness about conservation - lane A's dumpItem would take
   them happily - it is that turning a backpack of iron ore into iron-bearing
   rock you now need a pickaxe to recover would be a trap. The player drops
   ore to lighten their load, not to bury it. So the line is drawn where
   recovery stops being free, and it draws itself from the tier table rather
   than from a list somebody has to maintain.

   CONSERVATION IS THE POINT. A pour costs the carried item, or the backpack
   becomes an infinite quarry and carts have no reason to exist.

   Lane A does not usually refuse: it takes the load and queues the pixels,
   placing them as room appears. So the signal worth surfacing is not "no" but
   "not yet" - pourStats().stalled is material that went in and has nowhere to
   land, which is what a heap grown into a ceiling looks like. If they do
   refuse outright, the player keeps every bit of what they were carrying. */

import { bus } from "../core/bus.js";

let world = null;

/* Wired in the lane C slot of systems.js, where world.api is in scope. */
export function setPourWorld(api){ world = api || null; }

/* Is this item ground the player could put down and dig back by hand? */
export function isPourable(id){
  if(!world || typeof world.materialForItem !== "function") return false;
  const m = world.materialForItem(id);
  if(m < 0) return false;
  /* hands, no tool: tier 0 only */
  return typeof world.digSpeedFor === "function"
    ? world.digSpeedFor(m, null) > 0
    : false;
}

/* Pour n of `id` into the world at (x, y). Returns how many were actually
   taken - 0 means there was nowhere for it to go and the player still has
   it. The caller removes what was accepted from the pack. */
export function pourInto(id, n, x, y){
  if(!world || typeof world.dumpItem !== "function") return 0;
  const r = world.dumpItem(x, y, id, n);
  const accepted = (r && r.accepted) || 0;
  if(accepted > 0){
    bus.emit("ground:poured", { id, n: accepted, x, y,
                                pixels: (r && r.pixels) || 0 });
    /* Lane A takes the load and queues it rather than refusing, so the
       honest signal is not "no" but "not yet": material that went in and has
       nowhere to land is STALLED. A heap grown into a ceiling looks like a
       click that did nothing unless somebody says so. */
    const stalled = (world.pourStats && world.pourStats().stalled) || 0;
    if(stalled > 0) bus.emit("pour:stalled", { id, x, y, stalled });
  } else {
    /* A heap that has grown into a ceiling stalls rather than eating the
       load. Say so, instead of a click that silently does nothing. */
    const stalled = (world.pourStats && world.pourStats().stalled) || 0;
    bus.emit("pour:refused", { id, x, y, stalled });
  }
  return accepted;
}
