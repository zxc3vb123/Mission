/* Stamp the build sha onto every module URL. LANE E (core).

   GitHub Pages serves everything with Cache-Control: max-age=600, and each
   file ages on its own timer. A player who reloads therefore gets an
   arbitrary mix of ten-minute-old and current modules - or, if the entry
   point is cached, none of the new code at all. That is exactly what "it
   is the same game I have been playing since the start" looks like.

   So at deploy time every relative import gets ?v=<sha> appended, which
   makes each build a set of URLs the browser has never seen and cannot
   serve from cache. Runs against the CI checkout only; nothing here is
   committed back to the repo.

     node tools/cachebust.js <sha>
*/

import fs from "node:fs";
import path from "node:path";

const sha = (process.argv[2] || "dev").slice(0, 7);
const root = process.cwd();

/* only relative specifiers - a bare specifier would be a CDN import, and
   there are none, but rewriting one would break it */
const SPEC = /(\bfrom\s*["']|\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+?\.js)(["'])/g;

let files = 0, rewrites = 0;

function walk(dir){
  for(const entry of fs.readdirSync(dir, { withFileTypes: true })){
    const p = path.join(dir, entry.name);
    if(entry.isDirectory()) walk(p);
    else if(entry.name.endsWith(".js")) stampJs(p);
  }
}

function stampJs(file){
  const src = fs.readFileSync(file, "utf8");
  let n = 0;
  const out = src.replace(SPEC, (m, head, spec, tail) => {
    if(spec.includes("?")) return m;
    n++;
    return head + spec + "?v=" + sha + tail;
  });
  if(n){
    fs.writeFileSync(file, out);
    files++; rewrites += n;
  }
}

/* the entry point and the stylesheet are referenced from the HTML */
function stampHtml(file){
  if(!fs.existsSync(file)) return;
  let src = fs.readFileSync(file, "utf8");
  src = src.replace(/(<script[^>]*\bsrc=")([^"?]+\.js)(")/g, (m, a, s, b) => a + s + "?v=" + sha + b);
  src = src.replace(/(<link[^>]*\bhref=")([^"?]+\.css)(")/g, (m, a, s, b) => a + s + "?v=" + sha + b);
  fs.writeFileSync(file, src);
}

walk(path.join(root, "src"));
stampHtml(path.join(root, "index.html"));

console.log("cachebust " + sha + ": " + rewrites + " imports in " + files + " files");
