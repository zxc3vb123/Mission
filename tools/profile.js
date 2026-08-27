/* Where does the frame go? LANE E (core).

     node tools/profile.js [ticks]

   Boots the game headless and times every system's tick separately, so a
   lag report can name a system instead of a feeling. Rendering is not
   measured here - there is no canvas - so this answers "is the simulation
   too slow", and the browser's own fps answers the other half.

   The budget is 27.8 ms per tick at 36 Hz, and the simulation should be a
   small fraction of it, because drawing has to fit in the same frame. */

import { boot } from "./testkit.js";
import { state } from "../src/core/state.js";

const TICKS = Number(process.argv[2] || 300);
const g = boot(4242);

/* warm up: chunk paging and the first repaint are one-off costs */
g.tick(60);

const times = new Map();
const counts = new Map();

for(let i = 0; i < TICKS; i++){
  state.tick++;
  for(const s of g.systems){
    if(!s.tick) continue;
    const t0 = process.hrtime.bigint();
    s.tick();
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    times.set(s.name, (times.get(s.name) || 0) + dt);
    counts.set(s.name, (counts.get(s.name) || 0) + 1);
  }
}

const rows = [...times.entries()]
  .map(([name, total]) => ({ name, per: total / TICKS, total }))
  .sort((a, b) => b.per - a.per);

const sum = rows.reduce((a, r) => a + r.per, 0);

console.log("");
console.log("  " + TICKS + " ticks, simulation only (no drawing)");
console.log("  budget is 27.8 ms per tick at 36 Hz\n");
for(const r of rows){
  const bar = "#".repeat(Math.min(40, Math.round(r.per * 8)));
  console.log("  " + (r.name + "            ").slice(0,13) +
              r.per.toFixed(3).padStart(8) + " ms  " +
              ((r.per/sum)*100).toFixed(0).padStart(3) + "%  " + bar);
}
console.log("\n  " + "TOTAL".padEnd(13) + sum.toFixed(3).padStart(8) + " ms per tick  (" +
            ((sum/27.8)*100).toFixed(0) + "% of budget)\n");

/* what the world is holding on to, since that is the usual cause */
if(g.world.chunkStats){
  const c = g.world.chunkStats();
  console.log("  chunks resident: " + c.resident + (c.evictions !== undefined ? ", evictions: " + c.evictions : ""));
}
const counts2 = g.world.counts ? g.world.counts() : null;
if(counts2) console.log("  loose pixels: " + counts2.pxs + ", mass mover queue: " + counts2.mm +
                        ", unstable queue: " + counts2.ins);
console.log("");
