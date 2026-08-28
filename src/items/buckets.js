/* Carrying liquid. LANE C (items).

   Lane A moves water; this lane carries it. The owner asked for buckets by
   name, and the whole reason a bucket is worth having is that it is HEAVY -
   a pail of water is most of what a person can comfortably carry, which is
   what makes a pipe and a pump worth building later.

   A FULL BUCKET IS A DIFFERENT ITEM, not a bucket with a flag on it. The
   inventory is id -> count with one mass per id, so a bucket that changed
   weight without changing id would have no honest mass, and the cost of
   carrying water would quietly vanish. Two ids also make the rest fall out:
   a full bucket weighs more, so water competes with ore for the same back.

   The two halves mirror the ground rules exactly:

     - WALKING INTO WATER WITH AN EMPTY BUCKET FILLS IT, the same way walking
       over a chunk picks it up. No key to discover, and the carry limit
       still applies - a full pack will not fill one, because the water has
       to weigh something.
     - DROPPING A FULL BUCKET POURS IT, the same way dropping soil puts
       ground back. You keep the bucket: using it is not spending it, so the
       recipe is a one-off rather than a consumable.

   LANE F owns the vocabulary. The fields this reads:
     container: true        an empty vessel, waiting to be filled
     container: "bucket"    what a FULL one becomes when emptied
     liquid: "Water"        the material it holds, by the name in
                            src/world/materials.js - the same convention
                            HARDNESS already uses to key materials
     liquidAmount: n        how much of that material one holds */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { ITEMS } from "./itemdefs.js";
import { inventory } from "./inventory.js";

let world = null;
export function setBucketWorld(api){ world = api || null; }

/* How much a vessel holds if lane F has not said. Marked because it is
   theirs: it decides how many trips a flooded shaft takes to bail out. */
const DEFAULT_AMOUNT = 60;

/* How far lane A's liquidAt is allowed to have REACHED for the answer to
   count as "you are standing in it".

   Their call searches up to 12 px before giving up, so a truthy answer means
   "there is water within reach", not "you are in water" - an intake just
   above a pool still finds it, which is right for a pump and wrong for a
   pail. `dist` is how far it had to look. Zero is the honest test for wading
   in; a couple of pixels of slack keeps a bucket fillable at the water's
   edge rather than only when fully submerged. */
export const DIP_DIST = 2;

export function isEmptyContainer(id){
  const d = ITEMS[id];
  return !!(d && d.container === true);
}
export function isFullContainer(id){
  const d = ITEMS[id];
  return !!(d && typeof d.container === "string");
}
export function emptiesTo(id){
  const d = ITEMS[id];
  return d && typeof d.container === "string" ? d.container : null;
}
export function holdsAmount(id){
  const d = ITEMS[id];
  return (d && d.liquidAmount > 0) ? d.liquidAmount : DEFAULT_AMOUNT;
}

/* The filled item for a material, by lane A's name for it. */
export function filledFor(matName){
  for(const id in ITEMS){
    const d = ITEMS[id];
    if(typeof d.container === "string" && d.liquid === matName) return id;
  }
  return null;
}

/* Every empty vessel the player is ACTUALLY carrying.

   The count matters: inventory.all() keeps a key once it has been seen, at
   zero, so "is this a container" and "do I have one" are different
   questions. Conflating them minted a full bucket every tick out of a pail
   that was no longer there - matter from nothing, in the one game whose
   first law forbids it, and the second time this lane has produced it by
   starting a transaction without checking what it took. */
function carriedEmpties(){
  const out = [];
  const all = inventory.all();
  for(const id in all) if(all[id] > 0 && isEmptyContainer(id)) out.push(id);
  return out;
}

/* Fill one empty vessel from the liquid at (x, y). Returns the item id it
   became, or null if there was nothing to dip into, nothing to dip with, or
   no room on the player's back for the difference in weight. */
export function fillFrom(x, y){
  if(!world || typeof world.liquidAt !== "function") return null;
  const empties = carriedEmpties();
  if(!empties.length) return null;

  const at = world.liquidAt(x, y);
  if(!at) return null;
  /* older worlds did not report dist; treat its absence as "close enough" */
  if(typeof at.dist === "number" && at.dist > DIP_DIST) return null;
  const info = world.matInfo(at.x, at.y);
  const matName = info && info.name;
  learnMaterial(matName, at.matIndex);
  const filled = filledFor(matName);
  if(!filled) return null;                 /* nothing carries this liquid */

  const empty = empties[0];
  const want = holdsAmount(filled);
  if(at.reachable < want) return null;     /* a puddle is not a bucketful */

  /* The swap has to fit: a full bucket is heavier than an empty one, and a
     pack at its limit cannot take the difference. take() reports whether it
     actually got one, and the answer is not decoration - ignoring it is how
     the bucket came out of nothing. */
  if(!inventory.take(empty, 1)) return null;
  if(inventory.add(filled, 1) < 1){
    inventory.add(empty, 1);               /* put it back, unchanged */
    bus.emit("bucket:refused", { id: empty, reason: "no room in your pack" });
    return null;
  }

  const got = world.drawLiquid(at.x, at.y, want);
  if(!got || !got.taken){
    inventory.take(filled, 1);
    inventory.add(empty, 1);
    return null;
  }
  bus.emit("bucket:filled", { id: filled, from: empty, x: at.x, y: at.y });
  return filled;
}

/* Pour a full vessel out at (x, y). The liquid goes back into the world and
   the player keeps the empty. */
export function emptyInto(id, x, y){
  if(!world || typeof world.pourLiquid !== "function") return false;
  if(!isFullContainer(id) || !inventory.has(id, 1)) return false;
  const d = ITEMS[id];
  const mat = matIndexFor(d.liquid);
  if(mat < 0) return false;

  if(!inventory.take(id, 1)) return false;
  const back = emptiesTo(id);
  if(back) inventory.add(back, 1);
  const r = world.pourLiquid(x, y, mat, holdsAmount(id));
  bus.emit("bucket:emptied", { id, into: back, x, y,
                               accepted: (r && r.accepted) || 0 });
  return true;
}

/* LANE A KEYS MATERIALS BY INDEX; LANE F NAMES THEM, and there is no
   published way to get from one to the other. Requested - it is a one-liner
   for lane A and generally useful, since HARDNESS is already keyed by name.

   Until it exists this learns the mapping honestly rather than importing
   lane A's table: liquidAt() hands back both the index and, through
   matInfo, the name, so filling a bucket teaches us what to pour. The pairs
   learned are saved, so a bucket carried across a save can still be emptied
   by a player who has not dipped one since loading. */
let matByName = Object.create(null);
export function learnMaterial(name, index){
  if(name && index >= 0) matByName[name] = index;
}
export function learnedMaterials(){ return Object.assign({}, matByName); }
export function restoreMaterials(m){
  if(m) for(const k in m) learnMaterial(k, m[k]);
}
function matIndexFor(name){
  if(world && typeof world.matIndexByName === "function"){
    const i = world.matIndexByName(name);
    if(i >= 0) return i;
  }
  return name in matByName ? matByName[name] : -1;
}

/* Walking into water with an empty bucket fills it, like walking over a
   chunk picks it up. Called once a tick by the items system. */
export function updateBuckets(){
  if(!world) return;
  if(!carriedEmpties().length) return;
  const p = state.player;
  fillFrom(p.x, p.y + 4);
}
