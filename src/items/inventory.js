/* What the player is carrying. LANE C (items).

   The backpack is MASS-limited, not slot-limited (docs/DECISIONS.md,
   2026-08-27 "Carrying is mass-limited, human scale"). Twenty kilograms of
   iron ore is twenty kilograms whether it arrives as one lump or forty, and
   when the pack is full the next chunk stays on the ground.

   Hauling pressure is the entire reason carts, rails and elevators are worth
   building, so this limit is a mechanic and not a nicety: relaxing it would
   quietly delete the point of lane D.

   PUBLISHED API:
     add(id, n)      -> how many were actually taken (0 when the pack is full)
     take(id, n)     -> bool
     has(id, n)  count(id)  all()  clear()
     carriedMass()   -> kg carried
     capacity()      -> kg the pack holds        setCapacity(kg)
     freeMass()      -> kg still spare
     fits(id, n)     -> how many of n would fit
     canAccept(id,n) -> bool
     isFull()        -> nothing at all fits any more
     load()          -> carried / capacity, 0..1 (may exceed 1, see below)
     encumbrance()   -> 0..1 how burdened, for lane B's walk speed
     restoreCounts(counts) -> put a save back, limit and all

   Refusal is silent here on purpose: add() is called once per tick while the
   player stands on a chunk, so the noise belongs to the caller. drops.js
   emits "pickup:refused" once per approach instead.

   EVENTS:
     "inv:changed"  { id, count, mass }  after any change */

import { bus } from "../core/bus.js";
import { itemDef } from "./itemdefs.js";
import { CARRY_START, CARRY_BEST } from "../content/items.js";

/* Below this fraction of the pack you move freely; from here to full the
   penalty ramps in. A mechanic's shape, not a balance number - if the ramp
   wants tuning it becomes lane F's, like the capacities either side of it. */
const BURDEN_AT = 0.65;

/* Masses are fractional kilograms, so every comparison against the limit
   needs a hair of slack or a pack filled exactly to 35 kg reads as over. */
const EPS = 1e-9;

const counts = Object.create(null);
let capacity = CARRY_START;

function massOf(id){ return itemDef(id).mass; }

function changed(id){
  bus.emit("inv:changed", { id, count: id==null ? 0 : (counts[id]||0),
                            mass: inventory.carriedMass() });
}

export const inventory = {
  /* Takes as much as the pack will hold and reports what it managed. A
     caller that must not split a stack should ask canAccept() first. */
  add(id, n=1){
    if(n <= 0) return 0;
    const room = inventory.fits(id, n);
    if(room <= 0) return 0;
    counts[id] = (counts[id]||0) + room;
    changed(id);
    return room;
  },
  take(id, n=1){
    if((counts[id]||0) < n) return false;
    counts[id] -= n;
    changed(id);
    return true;
  },
  has(id, n=1){ return (counts[id]||0) >= n; },
  count(id){ return counts[id]||0; },
  /* CAREFUL: a key survives at zero once it has been seen. take() does not
     delete it, so `id in all()` answers "has this ever been carried", not
     "is one here now" - and reading the first as the second is how a bucket
     got minted every tick out of a pail that was no longer there. Filter on
     the count, or ask count(id)/has(id) instead. */
  all(){ return Object.assign({}, counts); },
  carriedMass(){
    let m = 0;
    for(const id in counts) m += counts[id]*massOf(id);
    return m;
  },

  capacity(){ return capacity; },
  /* Upgrades raise this - CARRY_START to about CARRY_BEST. Not clamped at
     CARRY_BEST: the ceiling is lane F's number to move, not ours to enforce. */
  setCapacity(kg){
    if(!(kg > 0)) return capacity;
    capacity = kg;
    changed(null);
    return capacity;
  },
  freeMass(){ return Math.max(0, capacity - inventory.carriedMass()); },

  /* How many of n would fit. Zero-mass items are not a licence to carry
     infinity, but nothing in ITEM_DATA is weightless, so n passes through. */
  fits(id, n=1){
    const m = massOf(id);
    if(m <= 0) return n;
    const room = Math.floor((capacity - inventory.carriedMass() + EPS) / m);
    return Math.max(0, Math.min(n, room));
  },
  canAccept(id, n=1){ return inventory.fits(id, n) >= n; },
  isFull(){
    let lightest = Infinity;
    for(const id in counts) lightest = Math.min(lightest, massOf(id));
    return inventory.freeMass() < (isFinite(lightest) ? lightest : 0.1) - EPS;
  },

  /* Can exceed 1: a pack downgraded while loaded leaves you over the limit
     rather than throwing your ore away. You simply cannot add to it. */
  load(){ return capacity > 0 ? inventory.carriedMass()/capacity : 0; },
  encumbrance(){
    const l = Math.min(1, inventory.load());
    if(l <= BURDEN_AT) return 0;
    return (l - BURDEN_AT) / (1 - BURDEN_AT);
  },

  /* Loading a save: put back exactly what was carried, over the limit or not.
     A save is a fact about what the player had, not a pickup to be refused. */
  restoreCounts(src){
    for(const k in counts) delete counts[k];
    for(const id in src) if(src[id] > 0) counts[id] = src[id];
    changed(null);
  },

  /* Empties the contents and nothing else. A pack that is tipped out is
     still the same pack - and core's load path clears the inventory AFTER
     our restore() hook has set the capacity, so resetting the size here
     would shed an upgraded pack's load every time a save was loaded. */
  clear(){
    for(const k in counts) delete counts[k];
    changed(null);
  },

  /* The pack as it comes at the start of a game. createItems() calls this
     on every boot, which is what keeps one test suite's upgraded pack out
     of the next one. */
  reset(){
    for(const k in counts) delete counts[k];
    capacity = CARRY_START;
    changed(null);
  }
};

export { CARRY_START, CARRY_BEST, BURDEN_AT };
