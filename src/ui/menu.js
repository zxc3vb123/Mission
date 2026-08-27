/* Start screen, pause menu and settings. LANE E (ui).

   Built from JavaScript rather than markup in index.html, so the page stays
   a canvas and one script tag. Nothing here touches simulation state except
   through published APIs. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { saveGame, readSave, hasSave, applySave, clearSave } from "../core/persist.js";

export function createMenu(ctx){
  const { systems, world, items, actor, camera } = ctx;

  const root = document.createElement("div");
  root.id = "menu";
  document.body.appendChild(root);

  let mode = "start";          /* start | pause | hidden */
  let settingsOpen = false;

  function button(label, hint, onClick){
    const b = document.createElement("button");
    b.className = "mbtn";
    b.innerHTML = '<span class="ml">'+label+'</span>' +
                  (hint ? '<span class="mh">'+hint+'</span>' : '');
    b.addEventListener("click", onClick);
    return b;
  }

  function settingsPanel(){
    const wrap = document.createElement("div");
    wrap.className = "mset";

    const dark = document.createElement("label");
    dark.innerHTML = '<span>darkness</span>';
    const ds = document.createElement("input");
    ds.type = "range"; ds.min = "0"; ds.max = "100";
    ds.value = String(Math.round(world.lightConfig.darkness*100));
    ds.addEventListener("input", () => {
      world.lightConfig.darkness = Number(ds.value)/100;
    });
    dark.appendChild(ds);

    const zoom = document.createElement("label");
    zoom.innerHTML = '<span>zoom</span>';
    const zs = document.createElement("input");
    zs.type = "range"; zs.min = "10"; zs.max = "80";
    zs.value = String(Math.round(state.cam.zoom*10));
    zs.addEventListener("input", () => { state.cam.zoom = Number(zs.value)/10; });
    zoom.appendChild(zs);

    const verts = document.createElement("label");
    verts.innerHTML = '<span>show shape vertices</span>';
    const vc = document.createElement("input");
    vc.type = "checkbox";
    vc.checked = state.debug.showVerts;
    vc.addEventListener("change", () => { state.debug.showVerts = vc.checked; });
    verts.appendChild(vc);

    wrap.appendChild(dark);
    wrap.appendChild(zoom);
    wrap.appendChild(verts);
    return wrap;
  }

  function render(){
    root.innerHTML = "";
    if(mode === "hidden"){ root.style.display = "none"; state.paused = false; return; }
    root.style.display = "flex";
    state.paused = true;

    const card = document.createElement("div");
    card.className = "mcard";

    const title = document.createElement("div");
    title.className = "mtitle";
    title.textContent = mode === "start" ? "MISSION" : "PAUSED";
    card.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "msub";
    sub.textContent = mode === "start"
      ? "Dig a desolate world. Build an industry. Leave."
      : "";
    card.appendChild(sub);

    const save = readSave();

    if(mode === "pause"){
      card.appendChild(button("Resume", "esc", () => setMode("hidden")));
    }
    if(save){
      const when = save.stamp ? save.stamp.slice(0,16).replace("T"," ") : "";
      card.appendChild(button("Continue", when, () => {
        applySave(save, ctx);
        setMode("hidden");
        bus.emit("game:loaded", { seed: save.seed });
      }));
    }
    card.appendChild(button("New world", "random seed", () => {
      world.regenerate(Math.floor(Math.random()*1e9));
      items.inventory.clear();
      setMode("hidden");
    }));

    card.appendChild(button("Test world", "every feature in one arena; your save is left alone", () => { setMode("hidden"); import("./sandbox.js").then(m => m.enterSandbox(ctx)); }));

    card.appendChild(button("What's new", "n", () => { setMode("hidden"); import("./whatsnew.js").then(m => m.openWhatsNew()); }));

    if(mode === "pause"){
      card.appendChild(button("Save", "keeps your seed, position and load", () => {
        const r = saveGame(systems, items);
        bus.emit("game:saved", r);
        setMode("hidden");
      }));
    }

    card.appendChild(button(settingsOpen ? "Hide settings" : "Settings", "", () => {
      settingsOpen = !settingsOpen;
      render();
    }));
    if(settingsOpen) card.appendChild(settingsPanel());

    const foot = document.createElement("div");
    foot.className = "mfoot";
    /* the build stamp is what a playtest report should quote */
    const b = state.build;
    foot.textContent = "v" + state.version +
      (b ? "  ·  build " + b.short + "  ·  " + b.built : "  ·  local") +
      "  ·  esc to pause  ·  l toggles the lamp";
    card.appendChild(foot);

    root.appendChild(card);
  }

  function setMode(m){
    mode = m;
    render();
  }

  bus.on("input:key", e => {
    if(!e.down) return;
    if(e.key === "escape") setMode(mode === "hidden" ? "pause" : "hidden");
  });

  render();

  return {
    name: "menu",
    api: { setMode, isOpen: () => mode !== "hidden" }
  };
}
