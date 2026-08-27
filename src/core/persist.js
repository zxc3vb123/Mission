/* Saving and loading. LANE E (core).

   A save is the world seed plus whatever each system chooses to write. Core
   does not know what a landscape or an inventory is - it asks:

     system.serialise()        -> any JSON-able value, or undefined
     system.restore(data)      -> put that value back

   Until a lane implements those hooks, core still saves what it can see
   through published APIs: the seed, the player pose, the inventory and the
   camera. That means a loaded game rebuilds the same world and puts you
   back where you were, but terrain you changed returns only once lane A
   writes its own hook (see docs/REQUESTS.md).

   Storage is injectable so the headless tests can save without a browser. */

import { state, VERSION } from "./state.js";

export const SAVE_KEY = "mission.save";
export const SAVE_FORMAT = 1;

function memoryStorage(){
  const mem = new Map();
  return {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k,v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k)
  };
}
let storage = null;
export function setStorage(s){ storage = s; }
function store(){
  if(storage) return storage;
  try {
    if(typeof localStorage !== "undefined"){
      localStorage.setItem("mission.probe","1");
      localStorage.removeItem("mission.probe");
      storage = localStorage;
      return storage;
    }
  } catch(e){ /* private mode, file://, tests */ }
  storage = memoryStorage();
  return storage;
}

/* ---------------------------------------------------------------- save --- */
export function snapshot(systems, items){
  const data = {
    format: SAVE_FORMAT,
    version: VERSION,
    stamp: new Date().toISOString(),
    seed: state.world.seed,
    tick: state.tick,
    player: {
      x: state.player.x, y: state.player.y, dir: state.player.dir,
      energy: state.player.energy, breath: state.player.breath,
      lamp: Object.assign({}, state.player.lamp)
    },
    inventory: items ? items.inventory.all() : {},
    cam: { x: state.cam.x, y: state.cam.y, zoom: state.cam.zoom },
    systems: {}
  };
  for(const s of systems){
    if(typeof s.serialise !== "function") continue;
    const d = s.serialise();
    if(d !== undefined) data.systems[s.name] = d;
  }
  return data;
}

export function saveGame(systems, items){
  const data = snapshot(systems, items);
  try {
    store().setItem(SAVE_KEY, JSON.stringify(data));
    return { ok:true, data };
  } catch(err){
    return { ok:false, error: String(err) };
  }
}

export function hasSave(){
  try { return !!store().getItem(SAVE_KEY); } catch(e){ return false; }
}
export function readSave(){
  try {
    const raw = store().getItem(SAVE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || data.format !== SAVE_FORMAT) return null;
    return data;
  } catch(e){ return null; }
}
export function clearSave(){
  try { store().removeItem(SAVE_KEY); } catch(e){}
}

/* ---------------------------------------------------------------- load --- */
export function applySave(data, { systems, world, items, actor, camera }){
  if(!data) return { ok:false, error:"no save" };

  /* the world is rebuilt from its seed, then each lane puts its own
     changes back on top */
  world.regenerate(data.seed);

  for(const s of systems){
    if(typeof s.restore !== "function") continue;
    const d = data.systems ? data.systems[s.name] : undefined;
    if(d !== undefined) s.restore(d);
  }

  /* A save is a fact about what the player had, not a pickup to be refused.
     Lane C's restoreCounts() puts the load back whatever the pack limit is;
     clear()-then-add() would reset the capacity their restore hook just
     put back, and then silently drop everything that no longer fitted. */
  if(items && data.inventory){
    if(typeof items.inventory.restoreCounts === "function"){
      items.inventory.restoreCounts(data.inventory);
    } else {
      items.inventory.clear();
      for(const id in data.inventory) items.inventory.add(id, data.inventory[id]);
    }
  }

  if(actor && data.player){
    const c = actor.clonk;
    c.x = data.player.x; c.y = data.player.y;
    c.vx = 0; c.vy = 0;
    c.dir = data.player.dir || 1;
    c.energy = data.player.energy;
    c.breath = data.player.breath;
    if(data.player.lamp) Object.assign(state.player.lamp, data.player.lamp);
  }

  state.tick = data.tick || 0;
  if(data.cam){
    state.cam.x = data.cam.x; state.cam.y = data.cam.y;
    state.cam.zoom = data.cam.zoom || state.cam.zoom;
  } else if(camera){
    camera.snap();
  }

  return { ok:true };
}

/* --------------------------------------------------------- file export --- */
export function exportSaveText(systems, items){
  return JSON.stringify(snapshot(systems, items));
}
export function importSaveText(text, ctx){
  let data;
  try { data = JSON.parse(text); } catch(e){ return { ok:false, error:"not a save file" }; }
  if(!data || data.format !== SAVE_FORMAT) return { ok:false, error:"unsupported save format" };
  return applySave(data, ctx);
}
