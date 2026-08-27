/* Containers. LANE C (build).

   A chest is the first answer to a 35 kg back, so it is mass-limited in the
   same way and for the same reason: it holds far more than you do, but not
   everything. Lane D's machines will pull from these later, which is why the
   interface is deliberately the same shape as the backpack's. */

import { bus } from "../core/bus.js";
import { structures } from "./structures.js";

export function containerAt(x, y){
  for(const s of structures){
    if(!s.store || !s.built) continue;
    if(x >= s.x && x < s.x+s.w && y >= s.y && y < s.y+s.h) return s;
  }
  return null;
}

/* Wraps a structure's raw store in the same add/take/mass vocabulary the
   backpack uses, so anything that can talk to one can talk to the other. */
export function storageApi(s, itemDef){
  if(!s || !s.store) return null;
  const store = s.store;

  const mass = () => {
    let m = 0;
    for(const id in store.items) m += store.items[id] * itemDef(id).mass;
    return m;
  };

  const fits = (id, n) => {
    const m = itemDef(id).mass;
    if(m <= 0) return n;
    return Math.max(0, Math.min(n, Math.floor((store.cap - mass() + 1e-9)/m)));
  };

  return {
    structure: s,
    capacity: () => store.cap,
    mass,
    free: () => Math.max(0, store.cap - mass()),
    count: id => store.items[id] || 0,
    all: () => Object.assign({}, store.items),
    fits,
    add(id, n=1){
      const room = fits(id, n);
      if(room <= 0) return 0;
      store.items[id] = (store.items[id]||0) + room;
      bus.emit("storage:changed", { id, count: store.items[id], x:s.x, y:s.y });
      return room;
    },
    take(id, n=1){
      const have = store.items[id] || 0;
      const many = Math.min(n, have);
      if(many <= 0) return 0;
      store.items[id] = have - many;
      if(store.items[id] === 0) delete store.items[id];
      bus.emit("storage:changed", { id, count: store.items[id]||0, x:s.x, y:s.y });
      return many;
    }
  };
}
