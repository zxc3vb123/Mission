/* Is it actually in the player's hands? LANE E (core).

     node tools/shipped.js

   Every recurring failure on this project has been the same one: a lane
   finishes something, the tests pass, the lane reports it done - and the
   owner cannot see it, because between "green on my machine" and "in the
   game" there are four separate steps and any one of them silently holds
   the work back:

     working tree  ->  commit  ->  push  ->  CI  ->  deployed

   A lane that commits and waits for permission to push has done nothing,
   from the player's point of view. A file that exists in the tree but was
   never committed is invisible. Neither shows up as a failing test, which
   is why this kept happening and kept surprising everyone.

   This answers the only question that matters - what does the player
   actually have - by comparing all four. */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LIVE = "https://zxc3vb123.github.io/Mission";

const sh = c => { try { return execSync(c, { encoding:"utf8" }).trim(); } catch { return ""; } };

function walk(dir, out = []){
  for(const e of fs.readdirSync(dir, { withFileTypes:true })){
    const p = path.join(dir, e.name);
    if(e.isDirectory()) walk(p, out);
    else if(e.name.endsWith(".js")) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

const report = [];
const problems = [];

/* ---- 1. is what is pushed what is deployed? ---- */
sh("git fetch -q origin");
const head    = sh("git rev-parse HEAD").slice(0,7);
const origin  = sh("git rev-parse origin/main").slice(0,7);

let liveSha = "?", liveSubject = "";
try {
  const r = await fetch(LIVE + "/build.json", { cache:"no-store" });
  if(r.ok){ const b = await r.json(); liveSha = b.short || "?"; liveSubject = b.subject || ""; }
} catch { /* offline: say so rather than guess */ }

report.push(["local HEAD", head]);
report.push(["origin/main", origin]);
report.push(["deployed", liveSha + (liveSubject ? "  " + liveSubject.slice(0,52) : "")]);

if(head !== origin) problems.push(
  "COMMITTED BUT NOT PUSHED: " + sh("git log --oneline origin/main..HEAD | wc -l").trim() +
  " commit(s) exist locally that the player cannot have.\n     " +
  sh("git log --oneline origin/main..HEAD").split("\n").join("\n     "));

if(liveSha !== "?" && liveSha !== origin) problems.push(
  "PUSHED BUT NOT DEPLOYED: origin/main is " + origin + ", the live build is " + liveSha +
  ".\n     Either CI is still running, or it failed and the deploy was gated.");

/* ---- 2. work parked in the tree, committed by nobody ---- */
const dirty = sh("git status --porcelain -- src index.html").split("\n").filter(Boolean);
const untracked = dirty.filter(l => l.startsWith("??")).map(l => l.slice(3));
const modified  = dirty.filter(l => !l.startsWith("??")).map(l => l.slice(3));
if(untracked.length) problems.push(
  "NEVER COMMITTED: " + untracked.length + " file(s) exist only in the working tree.\n     " +
  untracked.join("\n     "));
if(modified.length) report.push(["modified in tree", modified.length + " file(s) - work in progress"]);

/* ---- 3. does every shipped module actually load? ---- */
/* A module that 404s breaks the import graph, so the whole game can fail
   from one missing file - the failure mode that hid the guidebook. */
const tracked = walk("src");
const missing = [];
for(const f of tracked){
  if(!sh('git ls-tree origin/main -- "' + f + '"')) continue;   /* not on main yet */
  try {
    const r = await fetch(LIVE + "/" + f, { method:"HEAD" });
    if(!r.ok) missing.push(f + "  (" + r.status + ")");
  } catch { /* offline */ }
}
if(missing.length) problems.push(
  "IN main BUT NOT SERVED: " + missing.length + " file(s).\n     " + missing.join("\n     "));

/* ---------------------------------------------------------------- print --- */
const pad = s => (s + "                ").slice(0,16);
console.log("");
for(const [k,v] of report) console.log("  " + pad(k) + v);
console.log("");
if(!problems.length){
  console.log("  EVERYTHING COMMITTED IS PUSHED, DEPLOYED AND SERVED.");
  console.log("  What the player has is what main says.\n");
  process.exit(0);
}
for(const p of problems) console.log("  !! " + p + "\n");
console.log("  Work that is not deployed does not exist, whatever the tests say.\n");
process.exit(1);
