/* What's new. LANE G (testbed).

   Press N, or the menu button, for the newest changes: newest first, tagged
   by the lane that made them, with everything since the last look marked.

   **The list is never written by hand.** Six chats commit to one branch all
   day, so a hand-maintained changelog is out of date within the hour and
   quietly stops being read. The deploy writes `changes.json` from the last
   forty commit subjects instead - the subjects are already "lane: what
   changed", which is exactly the shape this needs - so the panel says what
   the build actually contains and cannot drift from it.

   Two consequences that are features, not bugs:

     - running from a local server there is no `changes.json`, and the panel
       says so rather than showing a stale copy. "Not a published build" is
       the honest answer and it is also the useful one.
     - a commit with no `lane:` prefix is tagged `misc` rather than being
       dropped. A changelog that silently hides changes is worse than one
       that shows an untidy line. */

import { bus } from "../core/bus.js";

const FEED = "changes.json";
const SEEN_KEY = "mission.whatsnew.seen";

/* The lane behind each commit-subject prefix, from docs/WORKFLOW.md §1.
   An unknown prefix is not an error - it is a lane that has not been added
   here yet, and it still gets a row. */
const LANES = {
  world:    { lane: "A", col: "#6f8fb0" },
  actor:    { lane: "B", col: "#5d8c34" },
  items:    { lane: "C", col: "#ffd479" },
  build:    { lane: "C", col: "#ffd479" },
  industry: { lane: "D", col: "#8a6fb0" },
  core:     { lane: "E", col: "#8fd3ff" },
  ui:       { lane: "E", col: "#8fd3ff" },
  ci:       { lane: "E", col: "#8fd3ff" },
  content:  { lane: "F", col: "#e8a04f" },
  docs:     { lane: "",  col: "#7c8593" },
  test:     { lane: "",  col: "#7c8593" },
  tests:    { lane: "",  col: "#7c8593" }
};

function split(subject){
  const m = /^([a-z][a-z0-9_-]*)\s*:\s*(.+)$/i.exec(subject || "");
  if(!m) return { tag: "misc", text: subject || "", lane: "", col: "#7c8593" };
  const tag = m[1].toLowerCase();
  const L = LANES[tag] || { lane: "", col: "#7c8593" };
  return { tag, text: m[2], lane: L.lane, col: L.col };
}

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* --------------------------------------------------------- what is new --- */
/* The marker is the sha of the newest change the player has already been
   shown. Everything above it in the list is new. A first-ever look marks
   nothing: shouting "40 new" at somebody who has never opened the panel is
   noise, not news. */
function storage(){
  try {
    if(typeof localStorage !== "undefined"){
      localStorage.setItem("mission.probe.whatsnew", "1");
      localStorage.removeItem("mission.probe.whatsnew");
      return localStorage;
    }
  } catch(e){ /* private mode, file://, tests */ }
  return null;
}
function readSeen(){
  const s = storage();
  try { return s ? s.getItem(SEEN_KEY) : null; } catch(e){ return null; }
}
function writeSeen(sha){
  const s = storage();
  try { if(s && sha) s.setItem(SEEN_KEY, sha); } catch(e){}
}

/* How many of the commits are newer than the marker. A marker that is not
   in the list at all - the player skipped several builds, and forty
   subjects no longer reach back that far - counts as "all of them", which
   is the truthful answer rather than the convenient one. */
function unseenCount(list){
  if(!list.length) return 0;
  const seen = readSeen();
  if(!seen) return 0;
  const i = list.findIndex(c => c.sha === seen);
  return i < 0 ? list.length : i;
}

/* ------------------------------------------------------------- the feed --- */
let commits = null;          /* null until fetched; [] means "none"      */
let failed  = "";            /* why there is no list, in the player's words */
let loading = null;

function load(){
  if(loading) return loading;
  loading = fetch(FEED, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error("http " + r.status))))
    .then(d => {
      commits = Array.isArray(d) ? d : (d && Array.isArray(d.commits) ? d.commits : []);
      failed = "";
    })
    .catch(() => {
      commits = [];
      failed = "no changes.json - this is not a published build. " +
               "The deploy writes it from the last forty commits.";
    })
    .then(() => { badge(); if(open) render(); });
  return loading;
}

/* --------------------------------------------------------------- panel --- */
let panel = null, pill = null, open = false, started = false;

function styleOnce(){
  if(document.getElementById("whatsnew-style")) return;
  const st = document.createElement("style");
  st.id = "whatsnew-style";
  st.textContent =
    '#whatsnew{left:50%;top:50%;transform:translate(-50%,-50%);width:520px;' +
    'max-width:92vw;padding:10px 12px 8px;z-index:30;pointer-events:auto;' +
    'background:rgba(11,13,17,.94);font-size:12px;}' +
    '#whatsnew .wtitle{color:#ffd479;letter-spacing:3px;font-size:13px;}' +
    '#whatsnew .wsub{color:#5d646e;font-size:10px;margin-bottom:6px;}' +
    '#whatsnew .wlist{max-height:56vh;overflow-y:auto;overflow-x:hidden;' +
    'border-top:1px solid #2b3038;border-bottom:1px solid #2b3038;padding:3px 0;}' +
    '#whatsnew .wrow{display:flex;gap:8px;align-items:baseline;padding:3px 4px;' +
    'border-left:2px solid transparent;}' +
    '#whatsnew .wrow.fresh{border-left-color:#ffd479;background:rgba(255,212,121,.06);}' +
    '#whatsnew .wtag{flex:none;width:74px;font-size:10px;letter-spacing:1px;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '#whatsnew .wtxt{flex:1;color:#c8cdd4;line-height:1.4;}' +
    '#whatsnew .wrow.fresh .wtxt{color:#e8e2d4;}' +
    '#whatsnew .wnew{color:#ffd479;font-size:9px;letter-spacing:1px;flex:none;}' +
    '#whatsnew .wday{flex:none;color:#5d646e;font-size:10px;white-space:nowrap;}' +
    '#whatsnew .wnone{color:#7c8593;padding:10px 4px;line-height:1.5;}' +
    '#whatsnew .wfoot{color:#5d646e;font-size:10px;margin-top:7px;text-align:center;}' +
    '#whatsnew-badge{position:fixed;left:10px;bottom:132px;z-index:21;' +
    'background:rgba(14,16,20,.88);border:1px solid #6b5a2c;border-radius:3px;' +
    'padding:3px 8px;font-family:inherit;font-size:11px;color:#ffd479;' +
    'cursor:pointer;}' +
    '#whatsnew-badge:hover{border-color:#ffd479;}';
  document.head.appendChild(st);
}

function badge(){
  if(typeof document === "undefined") return;
  const n = commits ? unseenCount(commits) : 0;
  if(!n){ if(pill) pill.style.display = "none"; return; }
  styleOnce();
  if(!pill){
    pill = document.createElement("div");
    pill.id = "whatsnew-badge";
    pill.addEventListener("click", () => setOpen(true));
    document.body.appendChild(pill);
  }
  pill.textContent = n + (n === 1 ? " new change" : " new changes") + "  ·  n";
  pill.style.display = "block";
}

function render(){
  if(!panel) return;
  const list = commits || [];
  const fresh = unseenCount(list);

  let html = '<div class="wtitle">WHAT\'S NEW</div>' +
             '<div class="wsub">' +
             (list.length ? list.length + " newest changes, newest first" +
                            (fresh ? "  ·  " + fresh + " since your last look" : "")
                          : "generated from the commit log at deploy time") +
             '</div><div class="wlist">';

  if(!list.length){
    html += '<div class="wnone">' +
            esc(failed || "nothing to show yet.") + '</div>';
  } else {
    for(let i = 0; i < list.length; i++){
      const c = list[i], s = split(c.subject);
      html += '<div class="wrow' + (i < fresh ? " fresh" : "") + '">' +
              '<span class="wtag" style="color:' + s.col + '">' +
              esc(s.tag) + (s.lane ? " " + s.lane : "") + '</span>' +
              '<span class="wtxt">' + esc(s.text) + '</span>' +
              (i < fresh ? '<span class="wnew">NEW</span>' : "") +
              '<span class="wday">' + esc(c.date || "") + '</span>' +
              '</div>';
    }
  }
  html += '</div><div class="wfoot">n closes this</div>';
  panel.innerHTML = html;
}

function setOpen(v){
  if(typeof document === "undefined") return;
  styleOnce();
  if(!panel){
    panel = document.createElement("div");
    panel.id = "whatsnew";
    panel.className = "panel";
    document.body.appendChild(panel);
  }
  open = v;
  panel.style.display = v ? "block" : "none";
  if(v){
    if(commits === null) load();
    render();
  } else {
    /* Marked read on the way out, not on the way in, so the NEW flags stay
       up while they are being read. */
    if(commits && commits.length) writeSeen(commits[0].sha);
    badge();
  }
}

/* ---------------------------------------------------------------- entry --- */
/* Safe to call more than once: the menu imports this module lazily and
   src/main.js may have loaded it already. */
export function createWhatsNew(){
  if(typeof document === "undefined") return { name: "whatsnew" };
  if(!started){
    started = true;
    bus.on("input:key", e => { if(e.down && e.key === "n") setOpen(!open); });
    load();
  }
  return {
    name: "whatsnew",
    api: { open: () => setOpen(true), toggle: () => setOpen(!open) }
  };
}

export function openWhatsNew(){ createWhatsNew(); setOpen(true); }
export function toggleWhatsNew(){ createWhatsNew(); setOpen(!open); }
