/* THE MENU BAR. LANE H (ui).

   The owner's words: "make a menu bar, see all keybinds clearly, can open all
   windows, full managing page with mouseclick to open things."

   Every window in the game, openable with the mouse, with its key printed
   beside it. That last part matters as much as the buttons: a player who
   never reads a manual learns the key by seeing it next to the thing it
   opens, every time they use the mouse instead.

   IT IS DRAWN FROM THE SCREEN REGISTRY, NOT FROM A LIST HERE. That is the
   whole design. Twice now this project has shipped a finished system that no
   player could reach - the guidebook, and then placement, which had a working
   ghost, reach, rising build and refusal reasons and no key at all. A
   hand-written list of buttons would have had exactly the same hole, because
   somebody has to remember to add to it. Registering a screen is what makes
   it exist, so registering it is what puts it on the bar. There is no way to
   ship an unreachable screen any more, and a check in the suite says so. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { listScreens, screensVersion } from "./screens.js";
import { keyCap, KEY_MENU, KEY_BOOK } from "./keys.js";

export function createBar(){
  if(typeof document === "undefined") return { name: "bar" };

  const host = document.createElement("div");
  host.id = "menubar";
  document.body.appendChild(host);

  let builtVersion = -1;
  const buttons = [];

  function el(tag, cls, parent, text){
    const n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    if(parent) parent.appendChild(n);
    return n;
  }

  function build(){
    host.innerHTML = "";
    buttons.length = 0;

    /* Registration order is boot order, which puts the pack last because it
       is its own system and registers after the panels. Order the bar the way
       a player reaches for it instead, and let anything unlisted fall in
       behind rather than disappearing - an unknown screen still gets a
       button, which is the whole point of drawing this from the registry. */
    const PREFERRED = ["pack", "build", "book"];
    const rank = s => {
      const i = PREFERRED.indexOf(s.id);
      return i < 0 ? PREFERRED.length : i;
    };
    const ordered = listScreens()
      .map((s, i) => ({ s, i }))
      .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
      .map(x => x.s);

    for(const s of ordered){
      if(!s.label) continue;                 /* unlabelled screens are internal */
      const b = el("div", "mbi", host);
      el("span", "mbl", b, s.label);
      if(s.key) el("span", "mbk", b, keyCap(s.key));
      b.addEventListener("click", () => {
        if(s.isOpen()) s.close();
        else if(typeof s.open === "function") s.open();
        paint();
      });
      buttons.push({ s, node: b });
    }

    /* The pause menu is not a registered screen - it owns the whole frame and
       pauses the simulation - but a bar that offers every window except the
       one with Save on it is not "all windows". */
    const m = el("div", "mbi", host);
    el("span", "mbl", m, "Menu");
    el("span", "mbk", m, keyCap(KEY_MENU));
    /* menu.js listens; the bar does not need a handle on it, which keeps
       this file free of a boot-order dependency it would otherwise have. */
    m.addEventListener("click", () => bus.emit("ui:menu", {}));

    /* And the direct route to the thing the owner actually asked for: every
       key in the game, in one place, one click away. */
    const k = el("div", "mbi keys", host);
    el("span", "mbl", k, "Keys");
    el("span", "mbk", k, keyCap(KEY_BOOK));
    k.title = "every key in the game";
    k.addEventListener("click", () => {
      for(const s of listScreens()){
        if(s.id === "book" && s.api && typeof s.api.open === "function"){
          s.api.open("keys", "keys");
          return;
        }
      }
    });

    builtVersion = screensVersion();
    paint();
  }

  function paint(){
    for(const b of buttons) b.node.classList.toggle("on", b.s.isOpen());
  }

  bus.on("input:key", e => { if(e.down) paint(); });

  return {
    name: "bar",
    tick(){
      /* Screens register during boot, after this system is made, so the bar
         builds itself once they are all in and again if the list ever moves. */
      if(builtVersion !== screensVersion()){ build(); return; }
      host.style.display = state.paused ? "none" : "flex";
      if(state.tick % 6 === 0) paint();
    },
    api: { rebuild: build, count: () => buttons.length }
  };
}
