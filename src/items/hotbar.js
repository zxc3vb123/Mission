/* The hotbar and the equipped item. LANE C (items).

   The backpack is mass-limited and keyed by item id, so the hotbar is not
   storage: it is an ordered view onto what you are already carrying, plus a
   cursor saying which of it is in your hands. Nothing lives on the bar that
   is not in the pack, and nothing in the pack is unreachable.

   That is why the bar is derived rather than hand-managed: an item you pick
   up takes the first free slot, and a slot whose item runs out is freed.
   Slots can be swapped, so the player's arrangement survives; they cannot be
   emptied while the item is still carried, because the pack still has it.

   PUBLISHED API (through items.api):
     equipped()  -> { id, def, count } | null   what is in the clonk's hands
     hotbar { slots selected select next prev assign size }

   EVENTS:
     "item:equipped"  { id }   id is null when the hands are empty */

import { bus } from "../core/bus.js";
import { inventory } from "./inventory.js";
import { itemDef } from "./itemdefs.js";

export const HOTBAR_SIZE = 8;

const slots = new Array(HOTBAR_SIZE).fill(null);
let sel = 0;
let lastEquipped = null;

function firstFree(){
  for(let i=0;i<HOTBAR_SIZE;i++) if(slots[i]===null) return i;
  return -1;
}

/* The bar is a view onto the pack, so it is rebuilt from the pack rather
   than patched: drop what is gone, place what is new. Cheap enough to run on
   every inventory change, and it cannot drift out of step this way. */
function resync(){
  for(let i=0;i<HOTBAR_SIZE;i++){
    if(slots[i] !== null && inventory.count(slots[i]) <= 0) slots[i] = null;
  }
  const carried = inventory.all();
  for(const id in carried){
    if(carried[id] <= 0 || slots.includes(id)) continue;
    const free = firstFree();
    if(free < 0) break;              /* a full bar simply stops taking more */
    slots[free] = id;
  }
  syncEquipped();
}

function syncEquipped(){
  const now = hotbar.equipped();
  const id = now ? now.id : null;
  if(id === lastEquipped) return;
  lastEquipped = id;
  bus.emit("item:equipped", { id });
}

export const hotbar = {
  size: HOTBAR_SIZE,
  slots(){ return slots.slice(); },
  selected(){ return sel; },

  select(i){
    if(!(i >= 0 && i < HOTBAR_SIZE)) return sel;
    sel = i|0;
    syncEquipped();
    return sel;
  },
  next(){ return hotbar.select((sel+1) % HOTBAR_SIZE); },
  prev(){ return hotbar.select((sel+HOTBAR_SIZE-1) % HOTBAR_SIZE); },

  /* Swap two slots, so rearranging the bar never loses an item off it. */
  assign(i, id){
    if(!(i >= 0 && i < HOTBAR_SIZE)) return false;
    const from = slots.indexOf(id);
    if(id !== null && from < 0) return false;
    if(from >= 0) slots[from] = slots[i];
    slots[i] = id;
    syncEquipped();
    return true;
  },

  /* What lane B asks for when it wants to know what it is digging with.
     Null once the last one is used up, so a tool that is gone cannot dig. */
  equipped(){
    const id = slots[sel];
    if(id === null) return null;
    const count = inventory.count(id);
    if(count <= 0) return null;
    return { id, def: itemDef(id), count };
  },

  reset(){
    slots.fill(null);
    sel = 0;
    lastEquipped = null;
  },

  /* number keys pick a slot; the bar is small enough that this is all it needs */
  handleKey(k){
    if(k.length !== 1) return false;
    const n = "12345678".indexOf(k);
    if(n < 0) return false;
    hotbar.select(n);
    return true;
  },

  serialise(){ return { slots: slots.slice(), sel }; },
  restore(data){
    if(!data) return;
    if(Array.isArray(data.slots)){
      for(let i=0;i<HOTBAR_SIZE;i++){
        const id = data.slots[i];
        slots[i] = (typeof id === "string") ? id : null;
      }
    }
    if(data.sel >= 0 && data.sel < HOTBAR_SIZE) sel = data.sel|0;
    resync();
  }
};

/* Detach before re-attaching: a second boot against the same bus would
   otherwise leave the previous game's listeners running too. */
let detach = [];
export function attachHotbar(){
  for(const off of detach) off();
  detach = [
    bus.on("inv:changed", resync),
    bus.on("input:key", e => { if(e.down) hotbar.handleKey(e.key); })
  ];
}
