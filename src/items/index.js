/* The items system. LANE C (items).

   PUBLISHED API:
     inventory   add/take/has/count/all/carriedMass
     registerItem(id, def)   used by lane D for refined goods
     itemDef(id)
     spawnDrop(x, y, id)

   EVENTS emitted:
     "inv:changed"     { id, count }
     "item:collected"  { id, x, y } */

import { inventory } from "./inventory.js";
import { ITEMS, ITEM_ORDER, registerItem, itemDef } from "./itemdefs.js";
import { drops, spawnDrop, clearDrops, updateDrops, renderDrops, attachDropSpawning } from "./drops.js";

export function createItems(){
  attachDropSpawning();

  return {
    name: "items",
    tick(){ updateDrops(); },
    renderItems(ctx){ renderDrops(ctx); },
    api: {
      inventory,
      registerItem, itemDef,
      items: ITEMS, order: ITEM_ORDER,
      spawnDrop, clearDrops,
      dropCount: () => drops.length
    }
  };
}
