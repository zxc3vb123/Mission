/* Am I playing the build they just shipped? LANE E (core).

   THE BUG THIS EXISTS TO KILL. Every module import in index.html is stamped
   `?v=<sha>` by the deploy, so a new build can never be served with stale
   modules. But index.html ITSELF is the one file that cannot version itself,
   and GitHub Pages serves it with `Cache-Control: max-age=600`. So for ten
   minutes after a deploy, a browser that already has the page can load the
   whole game from disk without asking the server anything - and every module
   it pulls carries the OLD sha, because the old index.html is what named them.

   The result is indistinguishable from nothing having shipped: the player
   reloads, sees the same game, and reports that the feature is not there. It
   is there. They are looking at a photograph of the site taken minutes ago.

   Nothing about that is visible from inside the game, which is why it kept
   happening and kept being argued about. So:

     - at load, compare the sha this page's modules were stamped with against
       the sha the server is serving right now. They differ only when the page
       is stale, and that check costs one fetch.
     - poll while playing, so a build that lands mid-session announces itself
       rather than waiting to be discovered.
     - reload to a URL carrying the new sha as a query, because that is a
       different cache key: the browser cannot answer it from the copy it is
       holding. A plain reload can, and often does.

   The banner is deliberately plain and inline-styled. It belongs to nobody's
   stylesheet and must work on the very build it is complaining about. */

import { state } from "./state.js";
import { bus } from "./bus.js";

const POLL_MS = 45000;

/* The sha this page was built from, read from our own import URL - the deploy
   rewrites it to `...buildwatch.js?v=<sha>`. On a local server there is no
   stamp, which is itself the answer: not a published build. */
export function loadedSha(){
  const m = /[?&]v=([^&]+)/.exec(import.meta.url);
  return m ? m[1] : null;
}

async function servedBuild(){
  try {
    const r = await fetch("build.json", { cache: "no-store" });
    if(!r.ok) return null;
    const b = await r.json();
    return b && b.short ? b : null;
  } catch(e){ return null; }
}

/* Same page, plus a query the browser has no cached answer for. Existing
   params are kept: a coop guest is on ?room=CODE and must stay in the room. */
function freshUrl(sha){
  const u = new URL(location.href);
  u.searchParams.set("b", sha);
  return u.toString();
}

function banner(served){
  if(document.getElementById("bw_stale")) return;
  const el = document.createElement("div");
  el.id = "bw_stale";
  el.setAttribute("style",
    "position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99999;" +
    "background:#c8a13c;color:#1b1b1b;font:600 13px/1.4 ui-monospace,Consolas,monospace;" +
    "padding:8px 14px;border-radius:4px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5);" +
    "max-width:90vw;text-align:center");
  el.textContent = "A newer build is live (" + served.short + ") - you are playing " +
                   (loadedSha() || "an unpublished build") + ". Click to load it.";
  el.addEventListener("click", () => location.replace(freshUrl(served.short)));
  document.body.appendChild(el);
}

/* Exported for the suite: the decision, with no fetching and no DOM. */
export function isStale(loaded, served){
  if(!loaded || !served) return false;      /* local build, or offline */
  return loaded !== served;
}

export function startBuildWatch(){
  let announced = false;

  const check = async () => {
    const served = await servedBuild();
    if(!served) return;                     /* local server: nothing to compare */
    if(!state.build) state.build = served;

    /* The menu draws its build stamp once, before this resolves, and shows
       "local" until told otherwise. */
    bus.emit("build:known", served);

    if(!announced && isStale(loadedSha(), served.short)){
      announced = true;
      state.staleBuild = served.short;
      bus.emit("build:stale", served);
      if(typeof document !== "undefined") banner(served);
      console.warn("STALE PAGE: playing " + loadedSha() + ", live is " + served.short +
                   ". index.html came from the browser cache.");
    }
  };

  check();
  if(typeof setInterval === "function") setInterval(check, POLL_MS);
}
