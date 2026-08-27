/* LANE E owns this file: the engine plumbing - saving, loading, hooks. */

import { boot, suite } from "../testkit.js";
import { setStorage, saveGame, readSave, applySave, hasSave, clearSave,
         exportSaveText, importSaveText } from "../../src/core/persist.js";

function memoryStorage(){
  const mem = new Map();
  return {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k,v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k)
  };
}

export function run(){
  const t = suite("core");
  setStorage(memoryStorage());
  clearSave();

  const g = boot(555123);
  const ctx = { systems: g.systems, world: g.world, items: g.items,
                actor: g.actor, camera: g.camera };

  g.tick(60);

  /* a system that uses the serialise/restore hooks other lanes will implement */
  let restored = null;
  g.systems.push({
    name: "probe",
    serialise(){ return { note: "hello", n: 42 }; },
    restore(d){ restored = d; }
  });

  /* Set up a recognisable state. The backpack is mass-limited (lane C), and
     7 chunks of iron ore is 39 kg against a 35 kg pack, so the pack is
     enlarged first: this suite is about persistence, not about capacity.
     That capacity is itself saved, by lane C's own serialise hook. */
  g.items.inventory.setCapacity(500);
  const added = g.items.inventory.add("iron_ore", 7);
  g.items.inventory.add("coal", 3);
  t.check("the enlarged pack really took the load", added === 7,
          added + " of 7, " + g.items.inventory.carriedMass().toFixed(1) + " kg");
  const savedSeed = g.state.world.seed;
  const px = g.actor.clonk.x, py = g.actor.clonk.y;

  const res = saveGame(g.systems, g.items);
  t.check("saving succeeds", res.ok === true, res.error || "");
  t.check("a save is then present", hasSave() === true);

  const data = readSave();
  t.check("the save keeps the world seed", data && data.seed === savedSeed);
  t.check("the save keeps the inventory", data && data.inventory.iron_ore === 7);
  t.check("the save collects system hooks", data && data.systems.probe && data.systems.probe.n === 42);

  /* wreck the state: different world, different inventory, moved player */
  g.world.regenerate(999888);
  g.items.inventory.clear();
  g.actor.clonk.x = 50; g.actor.clonk.y = 50;
  t.check("the state really changed", g.state.world.seed !== savedSeed &&
          g.items.inventory.count("iron_ore") === 0);

  /* put it back */
  const load = applySave(readSave(), ctx);
  t.check("loading succeeds", load.ok === true, load.error || "");
  t.check("the world seed comes back", g.state.world.seed === savedSeed);
  t.check("the inventory comes back", g.items.inventory.count("iron_ore") === 7 &&
          g.items.inventory.count("coal") === 3);
  t.check("the player is put back", Math.abs(g.actor.clonk.x-px) < 0.51 &&
          Math.abs(g.actor.clonk.y-py) < 0.51,
          "was "+px.toFixed(1)+","+py.toFixed(1)+" now "+
          g.actor.clonk.x.toFixed(1)+","+g.actor.clonk.y.toFixed(1));
  t.check("system restore hooks are called", restored && restored.note === "hello");

  /* the loaded game keeps running */
  g.tick(40);
  t.check("the game runs on after loading", g.state.player.act.length > 0, g.state.player.act);

  /* text export and import round trip */
  {
    const text = exportSaveText(g.systems, g.items);
    g.items.inventory.clear();
    const r = importSaveText(text, ctx);
    t.check("save text imports", r.ok === true, r.error || "");
    t.check("imported inventory is right", g.items.inventory.count("iron_ore") === 7);
    t.check("bad save text is refused", importSaveText("{not a save}", ctx).ok === false);
  }

  /* a missing storage must not throw */
  clearSave();
  t.check("no save present after clearing", hasSave() === false);
  t.check("loading nothing is handled", applySave(null, ctx).ok === false);

  return t;
}
