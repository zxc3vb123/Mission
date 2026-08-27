/* The items system. LANE C (items).

   PUBLISHED API:
     inventory   add/take/has/count/all/clear, and the backpack limit:
                 carriedMass/capacity/setCapacity/freeMass/fits/canAccept/
                 isFull/load/encumbrance/restoreCounts/reset
     carryStart, carryBest      the two capacities lane F tunes
     registerItem(id, def)      used by lane D for refined goods
     itemDef(id)
     spawnDrop(x, y, id)  clearDrops()  dropCount()

   EVENTS emitted:
     "inv:changed"      { id, count, mass }
     "item:collected"   { id, x, y }
     "pickup:refused"   { id, x, y }   pack full, the chunk stays put */

import { inventory } from "./inventory.js";
import { ITEMS, ITEM_ORDER, registerItem, itemDef } from "./itemdefs.js";
import { drops, spawnDrop, clearDrops, updateDrops, renderDrops,
         attachDropSpawning, serialiseDrops, restoreDrops } from "./drops.js";
import { CARRY_START, CARRY_BEST } from "../content/items.js";

export function createItems(){
  attachDropSpawning();
  /* The inventory is a module singleton and outlives a boot, so a new game
     starts from a plain pack rather than inheriting the last one's. */
  inventory.reset();

  return {
    name: "items",
    tick(){ updateDrops(); },
    renderItems(ctx){ renderDrops(ctx); },

    /* Core saves the inventory counts itself; the pack's capacity and the
       chunks lying on the ground are ours (docs/REQUESTS.md, core -> items).
       Capacity is restored before core puts the items back, so an upgraded
       pack does not shed its load on load. */
    serialise(){
      return { capacity: inventory.capacity(), drops: serialiseDrops() };
    },
    restore(data){
      if(!data) return;
      if(data.capacity > 0) inventory.setCapacity(data.capacity);
      restoreDrops(data.drops);
    },

    api: {
      inventory,
      carryStart: CARRY_START, carryBest: CARRY_BEST,
      registerItem, itemDef,
      items: ITEMS, order: ITEM_ORDER,
      spawnDrop, clearDrops,
      dropCount: () => drops.length
    }
  };
}
