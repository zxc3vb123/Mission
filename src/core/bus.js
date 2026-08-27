/* The event bus. LANE E (core).
   This is the ONLY way one lane talks to another lane it does not own.
   Event names are documented in docs/ARCHITECTURE.md - add yours there
   when you introduce one, so other lanes can listen for it. */

const handlers = new Map();

export const bus = {
  on(name, fn){
    if(!handlers.has(name)) handlers.set(name, []);
    handlers.get(name).push(fn);
    return () => bus.off(name, fn);
  },
  off(name, fn){
    const list = handlers.get(name);
    if(!list) return;
    const i = list.indexOf(fn);
    if(i>=0) list.splice(i,1);
  },
  emit(name, payload){
    const list = handlers.get(name);
    if(!list) return;
    for(let i=0;i<list.length;i++) list[i](payload);
  },
  clear(){ handlers.clear(); }
};
