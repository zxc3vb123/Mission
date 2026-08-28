/* The farm system. LANE J (farming, animals and food).

   PUBLISHED API - other lanes may use exactly these:
     canPlant(x,y) -> { ok, reason?, missing? }     plant(x,y)
     water(x,y)    -> { ok, reason?, px, spilled }
     harvest(x,y)  -> { ok, reason?, outputs? }     uproot(x,y)
     cropAt(x,y,r) -> plot | null                   crops()
     isRipe(plot)  progress(plot) -> 0..1
     eat(id?)      -> { ok, reason?, id, nutrition }
     isFood(id)    foodValue(id)   carriedFood()
     seedId  grainId  waterNeed()  reach  tendKey
     stats() -> { plots, wild, ripe, heldWater, spill, kgHeld }
     wildCount()

   EVENTS emitted:
     "crop:planted"   { id, x, y }
     "crop:watered"   { x, y, px, spilled, plants }
     "crop:soaked"    { x, y, px }        roots lifted water out of a ditch
     "crop:ripe"      { id, x, y }
     "crop:harvested" { id, x, y, outputs, wild }
     "crop:lost"      { id, x, y, why, returns }
     "crop:shaded"    { x, y, ok }        it was roofed over, or opened up
     "crop:refused"   { reason, missing }
     "food:eaten"     { id, nutrition, x, y }   LANE B: hunger is yours

   INPUT: `t` tends the ground under the cursor - one key for the whole verb,
   the way lane D's `q` both lays a rail and takes one up. Ripe, so pick it;
   thirsty and you are carrying water, so water it; bare soil and you have
   seed, so plant it. A mis-press costs nothing.

   WHAT MAKES THIS RUN UNATTENDED, which is the point of the lane
   (docs/DECISIONS.md 2026-08-28, the owner: "all automation systems should
   run when im not present"): every plot ticks every tick, exactly like lane
   C's structures. There is no catch-up model, nothing that must happen on
   load, and the suite grows a field with the player 600 px away. Irrigation
   - a plot drinking from a channel dug to it - is the only part of the game
   outside a station that produces anything with nobody there.

   Everything else in src/farm/ is internal to this lane. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { mouse } from "../core/input.js";
import {
  plots, attachWorld, attachItems as attachCropItems, clearCrops,
  canPlant, plant, water, harvest, uproot, nearestPlot, isRipe, progress,
  tickCrops, tickWild, seedWild, wildCount, wildTargetCount, setWildTarget,
  serialiseCrops, restoreCrops, farmStats, heldWater, forgetWaterIndex
} from "./crops.js";
import { attachItems as attachFoodItems, eat, isFood, foodValue, carriedFood } from "./food.js";
import { renderCrops } from "./render.js";
import { SEED_ID, SEED_DEF, GRAIN_ID, GRAIN_DEF, PICK_R, REACH, TEND_KEY,
         waterNeed, plotCapacity } from "./spec.js";

let detach = [];

/* Lane F owns the vocabulary. Until they name these two, register them the
   way lane D registers refined goods - and step aside the moment they do,
   because a second quiet copy of an item's mass is how a table stops being
   the single home for a number. */
function registerCropItems(items){
  if(!items.items[SEED_ID])  items.registerItem(SEED_ID, SEED_DEF);
  if(!items.items[GRAIN_ID]) items.registerItem(GRAIN_ID, GRAIN_DEF);
}

export function createFarm(world, items){
  attachWorld(world);
  attachCropItems(items);
  attachFoodItems(items);
  registerCropItems(items);

  /* -1 means "seed the wild wheat on the next tick". The world is generated
     inside buildSystems() before this system exists to hear world:generated,
     and it goes back to -1 whenever a new world arrives. The same one-tick
     delay lane C's gatherables use, for the same reason. */
  let seedAt = -1;

  for(const off of detach) off();
  detach = [
    bus.on("world:generated", () => { clearCrops(); forgetWaterIndex(); seedAt = -1; }),

    bus.on("input:key", e => {
      if(!e.down || state.paused) return;
      if(e.key !== TEND_KEY) return;
      tend(mouse.wx, mouse.wy);
    })
  ];

  /* ONE KEY, THE WHOLE VERB. The order is the order a farmer would use: take
     what is ready, water what is thirsty, plant what is bare. Each step
     refuses with a reason rather than falling through silently, so the HUD
     has something to say and a mis-press never costs the player anything. */
  function tend(x, y){
    const p = nearestPlot(Math.round(x), Math.round(y), PICK_R);
    if(p && (p.wild || isRipe(p))) return harvest(x, y);
    if(p){
      const w = water(x, y);
      if(w.ok) return w;
      bus.emit("crop:refused", { reason: w.reason });
      return w;
    }
    const w = water(x, y);           /* a bucket over a row you are not on */
    if(w.ok) return w;
    const r = plant(x, y);
    if(!r.ok && w.reason && w.reason !== "nothing here needs watering")
      bus.emit("crop:refused", { reason: r.reason });
    return r;
  }

  return {
    name: "farm",

    tick(){
      if(seedAt === -1){ seedWild(state.world.seed); seedAt = 0; return; }
      tickCrops();
      tickWild(state.tick);
    },

    /* Crops are drawn after lane A's grass and clutter because this system
       ticks after the world, and the render order walks the systems in the
       same order. A crop standing in grass should be in front of it. */
    renderScenery(ctx){ renderCrops(ctx); },

    /* A field that reset on load would be worse than no field at all. The
       wild scatter is a fact about the seed and is re-derived; what is saved
       is what the PLAYER did - every plot, what it has drunk, and any water
       still queued to go back into the world. */
    serialise(){
      const d = serialiseCrops();
      return d.plots.length || d.spill.length ? d : undefined;
    },
    restore(data){
      if(!data){ clearCrops(); seedAt = -1; return; }
      restoreCrops(data);
      seedAt = 0;                    /* the save carries the wild plants too */
    },

    api: {
      canPlant, plant, water, harvest,
      uproot: (x, y) => {
        const p = nearestPlot(Math.round(x), Math.round(y), PICK_R);
        return p ? uproot(p, "pulled up") : { ok:false, reason:"nothing growing here" };
      },
      cropAt: (x, y, r) => nearestPlot(Math.round(x), Math.round(y), r === undefined ? PICK_R : r),
      crops: () => plots,
      isRipe, progress,
      eat, isFood, foodValue, carriedFood,
      seedId: SEED_ID, grainId: GRAIN_ID,
      waterNeed, plotCapacity,
      reach: REACH, tendKey: TEND_KEY,
      wildCount, wildTargetCount, setWildTarget,
      heldWater,
      stats: farmStats
    }
  };
}
