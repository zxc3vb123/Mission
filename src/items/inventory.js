/* What the player is carrying. LANE C (items).

   PUBLISHED API:
     add(id, n)  take(id, n)  has(id, n)  count(id)  all()  clear()
   EVENTS:
     "inv:changed"  { id, count }   after any change */

import { bus } from "../core/bus.js";
import { itemDef } from "./itemdefs.js";

const counts = Object.create(null);

export const inventory = {
  add(id, n=1){
    counts[id] = (counts[id]||0) + n;
    bus.emit("inv:changed", { id, count: counts[id] });
    return counts[id];
  },
  take(id, n=1){
    if((counts[id]||0) < n) return false;
    counts[id] -= n;
    bus.emit("inv:changed", { id, count: counts[id] });
    return true;
  },
  has(id, n=1){ return (counts[id]||0) >= n; },
  count(id){ return counts[id]||0; },
  all(){ return Object.assign({}, counts); },
  carriedMass(){
    let m = 0;
    for(const id in counts) m += counts[id]*itemDef(id).mass;
    return m;
  },
  clear(){
    for(const k in counts) delete counts[k];
    bus.emit("inv:changed", { id:null, count:0 });
  }
};
