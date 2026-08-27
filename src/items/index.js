/* The items system. LANE C (items).

   PUBLISHED API:
     inventory   add/take/has/count/all/clear, and the backpack limit:
                 carriedMass/capacity/setCapacity/freeMass/fits/canAccept/
                 isFull/load/encumbrance/restoreCounts/reset
     carryStart, carryBest      the two capacities lane F tunes
     equipped()                 { id, def, count } or null - lane B's tool
     hotbar { slots selected select next prev assign size }
     registerItem(id, def)      used by lane D for refined goods
     itemDef(id)
     spawnDrop(x, y, id)  clearDrops()  dropCount()

   EVENTS emitted:
     "inv:changed"      { id, count, mass }
     "item:collected"   { id, x, y }
     "pickup:refused"   { id, x, y }   pack full, the chunk stays put
     "item:equipped"    { id }          id null when the hands are empty */

import { inventory } from "./inventory.js";
import { ITEMS, ITEM_ORDER, registerItem, itemDef } from "./itemdefs.js";
import { drops, spawnDrop, clearDrops, updateDrops, renderDrops,
         attachDropSpawning, serialiseDrops, restoreDrops } from "./drops.js";
import { hotbar, attachHotbar } from "./hotbar.js";
import { CARRY_START, CARRY_BEST } from "../content/items.js";

export function createItems(){
  attachDropSpawning();
  attachHotbar();
  /* These are module singletons and outlive a boot, so a new game starts
     from a plain pack and an empty bar rather than inheriting the last. */
  inventory.reset();
  hotbar.reset();

  return {
    name: "items",
    tick(){ updateDrops(); },
    renderItems(ctx){ renderDrops(ctx); },

    /* Core saves the inventory counts itself; the pack's capacity and the
       chunks lying on the ground are ours (docs/REQUESTS.md, core -> items).
       Capacity is restored before core puts the items back, so an upgraded
       pack does not shed its load on load. */
    serialise(){
      return { capacity: inventory.capacity(), drops: serialiseDrops(),
               hotbar: hotbar.serialise() };
    },
    restore(data){
      if(!data) return;
      if(data.capacity > 0) inventory.setCapacity(data.capacity);
      restoreDrops(data.drops);
      /* The bar is restored last and resyncs itself: core puts the carried
         items back after this hook, and every add() resyncs the bar again,
         so the arrangement here is what survives. */
      hotbar.restore(data.hotbar);
    },

    api: {
      inventory,
      carryStart: CARRY_START, carryBest: CARRY_BEST,
      equipped: () => hotbar.equipped(),
      hotbar,
      registerItem, itemDef,
      items: ITEMS, order: ITEM_ORDER,
      spawnDrop, clearDrops,
      dropCount: () => drops.length
    }
  };
}
