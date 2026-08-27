/* LANE C owns this file: dug material becoming items, inventory. */

import { boot, suite, findMaterial } from "../testkit.js";
import { MATS, M_COAL, M_IRON } from "../../src/world/materials.js";

export function run(){
  const t = suite("items");
  const g = boot(31415);
  const W = g.world;

  /* digging a coal seam has to yield coal */
  const coal = findMaterial(W, M_COAL, 10);
  if(coal){
    const before = g.items.dropCount();
    for(let k=0;k<12;k++) W.digFreeCircle(coal.x+k, coal.y, 6, true);
    t.check("digging coal drops coal chunks", g.items.dropCount() > before,
            before+" -> "+g.items.dropCount());
  } else t.check("found a coal seam", false);

  /* a chunk lying next to the clonk is picked up */
  {
    const p = g.state.player;
    g.items.spawnDrop(p.x, p.y-6, "iron_ore");
    const had = g.items.inventory.count("iron_ore");
    g.tick(40);
    t.check("chunks are picked up when walked over",
            g.items.inventory.count("iron_ore") > had,
            "iron_ore "+had+" -> "+g.items.inventory.count("iron_ore"));
  }

  /* inventory bookkeeping */
  g.items.inventory.add("copper_ore", 3);
  t.check("inventory adds", g.items.inventory.count("copper_ore")===3);
  t.check("inventory refuses to overdraw", g.items.inventory.take("copper_ore", 9)===false);
  t.check("inventory takes what is there", g.items.inventory.take("copper_ore", 3)===true &&
          g.items.inventory.count("copper_ore")===0);
  t.check("carried mass is tracked", g.items.inventory.carriedMass() >= 0);

  /* every material that yields something must name a registered item */
  {
    const bad = [];
    for(const M of MATS){
      if(!M.dig2) continue;
      if(!g.items.items[M.dig2]) bad.push(M.name+" -> "+M.dig2);
    }
    t.check("every ore maps to a registered item", bad.length===0, bad.join(", ") || "all resolve");
  }

  return t;
}
