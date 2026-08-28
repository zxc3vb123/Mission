/* The coordinator's whole check, in one command. LANE E (core).

     node tools/tick.js

   WHY THIS EXISTS. The coordinator used to run three tools and read their
   output charitably, and twice in one afternoon that turned a stopped deploy
   into a shrug. Five lanes reported work as shipped; the owner played the
   same build for an hour; every individual tool was telling the truth. What
   was missing was the one question none of them asked:

     IS THERE ANYTHING BETWEEN A LANE FINISHING AND THE OWNER PLAYING IT?

   So this walks the whole pipe in order and names everything that is stuck,
   with the next action attached. A clog is always invisible from inside the
   lane that caused it, and usually invisible from inside the lane it blocks,
   which is why it has to be somebody's explicit job to look.

   The pipe, and what can go wrong at each joint:

     a lane's working tree   -> uncommitted, so invisible
     a commit                -> unpushed, so invisible
     origin/main             -> red, so the deploy is GATED and everyone stops
     CI                      -> failing or queued
     the deployed build      -> older than main
     the served page         -> a 404 in the import graph is a black screen
     the running game        -> an API nobody calls is not a feature

   Exit code is 0 only when the owner can play what main says.

   Its parts, still usable alone:
     verify.js   is this red for real, or is it somebody's desk?
     shipped.js  can the player actually have it?
     profile.js  where does the frame go?

   Takes about two minutes, nearly all of it the test suite. */

import { execSync } from "node:child_process";
import fs from "node:fs";

const LIVE = "https://zxc3vb123.github.io/Mission";
const sh = c => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const lines = a => a.join("\n");

const clogs = [];   /* work that exists and cannot reach the player */
const notes = [];   /* true and useful, but not blocking anybody */
const clog = (what, action) => clogs.push({ what, action });

/* --------------------------------------------------------- 1. the tree --- */
sh("git fetch -q origin");
const head   = sh("git rev-parse HEAD").slice(0, 7);
const origin = sh("git rev-parse origin/main").slice(0, 7);
const branch = sh("git rev-parse --abbrev-ref HEAD");

if(branch !== "main" && branch !== "master")
  clog("You are on branch " + branch + ", not main. Every lane commits on main here.",
       "git switch main");

/* --------------------------------------------- 2. is the suite red FOR REAL */
let treeRed = false, treeOut = "";
try { treeOut = execSync("node tools/run-tests.js", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
catch(e){ treeRed = true; treeOut = (e.stdout || "") + (e.stderr || ""); }

const fails = treeOut.split("\n").filter(l => l.startsWith("FAIL")).map(l => l.trim());
const count = (treeOut.match(/(all \d+ checks passed|\d+ of \d+ checks FAILED)/) || [""])[0];

if(treeRed){
  /* The shared tree is every lane's work in progress at once, so red here
     belongs to nobody. A commit is the only thing that can be red in a way
     that is somebody's. */
  let commitRed = false;
  try { execSync("node tools/verify.js origin/main", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch { commitRed = true; }

  if(commitRed)
    clog(lines(["origin/main ITSELF is red. This is everyone's problem, not one lane's.",
                "     " + (fails.slice(0, 6).join("\n     ") || "(the runner did not finish - a syntax error mid-edit?)")]),
         "node tools/verify.js origin/main   then route the named checks to their lane");
  else
    notes.push(lines([fails.length + " check(s) red in the shared tree but GREEN on origin/main.",
                      "     Somebody's work in progress. Do not route it.",
                      "     " + fails.slice(0, 4).join("\n     ")]));
}

/* --------------------------------------------------- 3. the deploy gate --- */
let ci = "unknown", ciFailed = false;
{
  try {
    const r = JSON.parse(sh("gh run list --limit 1 --json headSha,status,conclusion"))[0];
    if(r){
      ci = r.headSha.slice(0, 7) + " " + r.status + " " + (r.conclusion || "-");
      ciFailed = /failure|timed_out|startup_failure/.test(ci);
    }
  } catch { /* gh absent, or offline */ }
}
if(ciFailed)
  clog(lines(["THE DEPLOY IS GATED BY A FAILING BUILD.  " + ci,
              "     Every lane is stopped, not only the one that broke it. This is an",
              "     OUTAGE, and it is invisible from inside every lane."]),
       "node tools/verify.js origin/main   then chase the owning lane NOW, not next tick");

/* ----------------------------------------- 4. committed, but not pushed --- */
if(head !== origin){
  const ahead = sh("git log --oneline origin/main..HEAD");
  if(ahead)
    clog(lines(["COMMITTED BUT NOT PUSHED - finished work the player cannot have:",
                "     " + ahead.split("\n").join("\n     ")]),
         "node tools/verify.js HEAD   and if it is green, git push origin main");
}

/* ------------------------------------------------- 5. never committed ----- */
{
  const dirty = sh("git status --porcelain -- src index.html").split("\n").filter(Boolean);
  const untracked = dirty.filter(l => l.startsWith("??")).map(l => l.slice(3));
  const modified  = dirty.filter(l => !l.startsWith("??")).length;
  if(untracked.length)
    notes.push(lines(["Untracked in src/: " + untracked.join(", "),
                      "     In flight, or forgotten? A file nobody committed is invisible."]));
  if(modified) notes.push(modified + " tracked file(s) modified - lanes at work.");

  /* WORKFLOW 4a-i: staging is shared, so anything left staged is fair game
     for whoever commits next, and they will not see it. */
  const staged = sh("git diff --cached --name-only").split("\n").filter(Boolean);
  if(staged.length)
    clog(lines(["STAGED BUT NOT COMMITTED - the index is shared, so the next commit by",
                "     ANY lane will sweep these in under someone else's message:",
                "     " + staged.join("\n     ")]),
         "commit them by pathspec, or git restore --staged them   (WORKFLOW 4a-i)");
}

/* ----------------------------------------------- 6. is it actually served - */
let live = null;
try {
  const r = await fetch(LIVE + "/build.json", { cache: "no-store" });
  if(r.ok) live = await r.json();
} catch { /* offline */ }

if(live && live.short !== origin)
  clog("PUSHED BUT NOT DEPLOYED: origin/main is " + origin + ", the live build is " + live.short + ".",
       ciFailed ? "see the gate above - that is why" : "CI says " + ci + "; in_progress clears itself in about a minute");

/* Does the live page actually LOAD? One 404 inside the import graph is a
   black screen, and to the player that looks exactly like a feature that was
   never built. Walk what index.html really pulls, breadth-first. */
if(live && live.short === origin){
  const seen = new Set(), bad = [];
  const RE = /(?:\bfrom\s*["']|\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+?\.js[^"']*)["']/g;

  async function pull(url){
    try {
      const r = await fetch(url, { cache: "no-store" });
      if(!r.ok){ bad.push(url.replace(LIVE + "/", "") + "  (" + r.status + ")"); return []; }
      const text = await r.text();
      const out = [];
      let m; RE.lastIndex = 0;
      while((m = RE.exec(text))) out.push(new URL(m[1], url).toString());
      return out;
    } catch { bad.push(url.replace(LIVE + "/", "") + "  (unreachable)"); return []; }
  }

  try {
    const html = await (await fetch(LIVE + "/", { cache: "no-store" })).text();
    const entry = /<script[^>]+src="([^"]+)"/.exec(html);

    /* The stale-page check from the outside: every module URL in index.html
       carries ?v=<sha>, and it must be the sha build.json reports. If they
       disagree, the deploy wrote one without the other and every player is
       loading modules from a build nobody published. */
    if(entry){
      const stamp = /[?&]v=([^&"']+)/.exec(entry[1]);
      if(stamp && stamp[1] !== live.short)
        clog(lines(["index.html points at build " + stamp[1] + " but build.json says " + live.short + ".",
                    "     Players are loading modules from a build nobody deployed."]),
             "re-run the deploy - tools/cachebust.js and the build stamp must agree");
    }

    let frontier = entry ? [new URL(entry[1], LIVE + "/").toString()] : [];
    while(frontier.length && seen.size < 250){
      const batch = frontier.filter(u => !seen.has(u));
      batch.forEach(u => seen.add(u));
      const found = await Promise.all(batch.map(pull));
      frontier = [...new Set(found.flat())].filter(u => !seen.has(u));
    }

    if(bad.length)
      clog(lines(["THE LIVE GAME DOES NOT LOAD - " + bad.length + " module(s) missing:",
                  "     " + bad.join("\n     "),
                  "     One 404 in the import graph is a black screen, not a missing feature."]),
           "check the deploy copied src/ whole, then re-run this");
    else if(seen.size)
      notes.push("Live import graph walked: " + seen.size + " modules, every one served.");
  } catch { /* offline */ }
}

/* -------------------------------------- 7. built, but can anyone reach it - */
/* WORKFLOW 4c: a published API with no call site is inert, and that is the
   most expensive failure this project has had. Answer it mechanically. */
{
  let md = "";
  try { md = fs.readFileSync("docs/REQUESTS.md", "utf8"); } catch { /* no file */ }

  const open = [];
  for(const b of md.split(/^### /m).slice(1)){
    if(!/^Status: open/m.test(b)) continue;
    const title = b.split("\n")[0].trim();
    const api = /`([A-Za-z_$][\w$]*)\(/.exec(b);
    open.push({ title, api: api ? api[1] : null });
  }

  const inert = [];
  for(const o of open){
    if(!o.api) continue;
    const hits = sh('git grep -l -- "' + o.api + '" -- src').split("\n").filter(Boolean);
    if(!hits.length) inert.push(o.title + "   (" + o.api + " appears nowhere in src/)");
  }

  if(open.length) notes.push(open.length + " open request(s) in docs/REQUESTS.md.");
  if(inert.length)
    clog(lines(["AN OPEN REQUEST NAMES AN API THAT IS IN NO SOURCE FILE:",
                "     " + inert.join("\n     "),
                "     Either it was never built, or it was built under another name and",
                "     the request was never closed. Both look identical from every lane."]),
         "ask the OWNING lane which - then wire a call site, or close it (WORKFLOW 4c)");
}

/* --------------------------------------------------------------- print --- */
const pad = s => (s + "                    ").slice(0, 20);
console.log("");
console.log("  " + pad("branch") + branch);
console.log("  " + pad("local HEAD") + head);
console.log("  " + pad("origin/main") + origin);
console.log("  " + pad("deployed") + (live ? live.short + "  " + (live.subject || "").slice(0, 46) : "unknown"));
console.log("  " + pad("CI") + ci);
console.log("  " + pad("suite (whole tree)") + (count || "did not finish"));
console.log("");

for(const n of notes) console.log("  -  " + n + "\n");

if(!clogs.length){
  console.log("  NOTHING IS CLOGGED. What main says is what the owner can play.\n");
  process.exit(0);
}

console.log("  " + clogs.length + " THING(S) STANDING BETWEEN A LANE AND THE OWNER:\n");
for(const c of clogs) console.log("  !! " + c.what + "\n     ->  " + c.action + "\n");
process.exit(1);
