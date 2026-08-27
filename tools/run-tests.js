/* Runs every lane's tests. LANE E (core).
   npm test        - all lanes
   npm test world  - one lane */

import { run as runWorld }    from "./tests/world.test.js";
import { run as runActor }    from "./tests/actor.test.js";
import { run as runItems }    from "./tests/items.test.js";
import { run as runLighting } from "./tests/lighting.test.js";
import { run as runCore }     from "./tests/core.test.js";
import { run as runContent }  from "./tests/content.test.js";
import { run as runBuild }    from "./tests/build.test.js";
import { run as runUI }       from "./tests/ui.test.js";
import { run as runIndustry } from "./tests/industry.test.js";

const SUITES = {
  world: runWorld,
  actor: runActor,
  items: runItems,
  lighting: runLighting,
  core: runCore,
  content: runContent,
  build: runBuild,
  ui: runUI,
  industry: runIndustry
};

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(SUITES);

let failed = 0, total = 0;
for(const name of names){
  const fn = SUITES[name];
  if(!fn){ console.log("no such suite: " + name); failed++; continue; }
  let t;
  try {
    t = fn();
  } catch (err) {
    console.log("FAIL  " + name + ": threw " + (err && err.stack ? err.stack.split("\n")[0] : err));
    console.log(err && err.stack ? err.stack.split("\n").slice(1,4).join("\n") : "");
    failed++;
    continue;
  }
  for(const line of t.report()) console.log(line);
  failed += t.failed();
  total  += t.results.length;
}

console.log("");
console.log(failed ? (failed + " of " + total + " checks FAILED") : ("all " + total + " checks passed"));
process.exit(failed ? 1 : 0);
