/* The test world. LANE G (testbed).

   A menu entry that drops the player into a flat arena with every feature
   of the game laid out side by side, so a change can be tried in ten
   seconds instead of ten minutes of walking.

   Two things make this worth having rather than a toy:

   1. **It is not a mock.** The arena is written into the real landscape
      through the published `world.api` - `setMat` to place material,
      `digFreeCircle` to hollow the tunnel out, `items.api.spawnDrop` for
      the pile of chunks. Liquids level themselves, sand collapses and the
      lamp lights the tunnel because those are the same systems the main
      world runs. If something behaves here, it behaves out there.

   2. **It cannot cost the player their save.** Entering sets a flag and
      wraps core's save storage: reads still pass through, so "Continue"
      still finds the real game, but every write is refused for as long as
      the test world is up. Autosave therefore cannot overwrite a real run
      with an arena. Leaving is "Continue" or "New world" in the pause
      menu: both regenerate the landscape from a seed, which throws the
      arena away.

   The main world is untouched by all of this - nothing here runs unless
   the player asks for it.

   NOTE for lane A: this is the one place outside `src/world/` that reads
   `materials.js`. `setMat(x, y, m)` is published but the material indices
   it takes are not, so there is no other way to place a named material.
   A `world.api.materials()` would close that gap; until then this import
   is read-only and leans on nothing but the index constants, which that
   file already promises never to renumber. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { setStorage } from "../core/persist.js";
import { MATS, M_SKY, M_GRANITE, M_EARTH, M_SAND, M_WATER, M_LAVA }
  from "../world/materials.js";
import { ITEM_IDS } from "../content/items.js";

/* ------------------------------------------------------------ geometry --- */
/* Everything is an offset from the arena's left edge, so the whole layout
   reads in one place and moving a station cannot silently overlap another. */
export const SPAN = 1000;          /* arena width in world pixels        */
const CEIL       = 150;            /* headroom cleared above the floor   */
const BLOCK_W    = 14, BLOCK_GAP = 3, BLOCK_H = 44;

const AT = {
  pad:    40,        /* where the player lands, and the pile of chunks */
  blocks: 96,        /* one block of every diggable material          */
  water:  470,
  lava:   600,
  sand:   730,       /* the column that collapses when undermined     */
  shaft:  822,       /* mouth of the dark tunnel                      */
  wall:   920        /* the wall to scale, with an overhang to hangle */
};

/* The chunks left lying at the spawn pad: heavier than the pack, on
   purpose. A refused pickup is a thing worth testing too. */
const PILE = [
  "rock", "rock", "rock", "soil", "soil", "sand", "clay", "limestone",
  "gravel", "coal", "coal", "iron_ore", "copper_ore", "tin_ore", "quartz",
  "silver_ore", "gold_ore", "uranium_ore", "wood", "stick", "stick",
  "plant_fibre", "plant_fibre", "rope", "torch", "stone_knife", "stone_axe",
  "stone_shovel", "stone_pickaxe", "bandage", "charcoal", "brick", "glass"
];

/* --------------------------------------------------- the save, protected --- */
let active  = false;             /* is the test world up right now?       */
let guarded = false;             /* has the storage wrapper been fitted?  */

export function isSandbox(){ return active; }

function realStorage(){
  try {
    if(typeof localStorage !== "undefined"){
      localStorage.setItem("mission.probe.sandbox", "1");
      localStorage.removeItem("mission.probe.sandbox");
      return localStorage;
    }
  } catch(e){ /* private mode, file://, tests */ }
  const mem = new Map();
  return {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k)
  };
}

/* Reads pass straight through, so the pause menu still offers the real
   save while an arena is on screen. Writes THROW rather than quietly doing
   nothing: a save that reports success and did not happen is worse than
   one that reports a refusal, and core already surfaces the error it gets
   back from storage. */
function guardSave(){
  if(guarded) return;
  const real = realStorage();
  const refuse = () => {
    throw new Error("test world is up - the real save is protected");
  };
  setStorage({
    getItem: k => real.getItem(k),
    setItem: (k, v) => { if(active) refuse(); real.setItem(k, v); },
    removeItem: k => { if(active) refuse(); real.removeItem(k); }
  });
  guarded = true;
}

/* Any regeneration - "Continue", "New world", r - is the way out of here.
   The arena lived in the landscape, and the landscape has just been rebuilt
   from a seed, so there is nothing left to leave. */
bus.on("world:generated", () => {
  /* The site is chosen from the ground line, so it belongs to the seed it
     was chosen under. Forgetting it here is what stops a second visit
     after "New world" from building the arena into a hillside that has
     moved out from under it. */
  site = null;
  if(!active) return;
  active = false;
  hideLegend();
});

/* ---------------------------------------------------------- the builder --- */
function fillRect(world, x0, y0, x1, y1, m){
  if(y1 < y0 || x1 < x0) return;
  for(let y = y0; y <= y1; y++)
    for(let x = x0; x <= x1; x++) world.setMat(x, y, m);
}

/* The flattest dry span on the map, so levelling it costs the fewest
   pixels and the arena sits on a hill rather than in a cliff. Reading
   surfaceAt is free - the ground line is one array that is always
   resident - so this scan does not page a single chunk in. */
function pickSite(world){
  const { W } = world.size();
  const water = state.world.waterLevel;

  /* Every column, not every eighth: a single unsampled spike above the
     floor would poke through it and put a patch of the arena in its own
     shadow. The ground line is one flat array, so exactness is free. */
  function span(x){
    let lo = Infinity, hi = -Infinity;
    for(let k = 0; k <= SPAN; k++){
      const s = world.surfaceAt(x + k);
      if(s < lo) lo = s;
      if(s > hi) hi = s;
    }
    return { x0: x, lo, hi };
  }

  let best = null;
  for(let x = 256; x < W - SPAN - 256; x += 64){
    const c = span(x);
    if(c.hi >= water - 12) continue;               /* keep both feet dry */
    if(!best || c.hi - c.lo < best.hi - best.lo) best = c;
  }
  /* a map that is all lake: fall back to wherever the player spawns */
  if(!best) best = span(Math.max(256, Math.min(W - SPAN - 256,
                                               state.world.spawn.x - SPAN / 2)));

  /* The floor sits just above the highest ground in the span, and that is
     what makes the arena daylit: a pixel counts as lit when it is above
     its column's ground line. Nothing here is dark by accident, so the one
     dark place is the one that is meant to be. */
  best.floor = best.lo - 2;
  return best;
}

/* every material that can be dug, in table order, with granite in front of
   them as the one that cannot - a live list rather than a copy that rots */
function sampleMaterials(){
  const out = [M_GRANITE];
  for(const m of MATS) if(m.dig2) out.push(m.index);
  return out;
}

function buildArena(world, site){
  const x0 = site.x0, F = site.floor;
  const stations = [];
  const label = (dx, dy, text) => stations.push({ x: x0 + dx, y: F + dy, text });

  /* 1. a flat floor: solid down past the natural ground, clear above it */
  fillRect(world, x0, F, x0 + SPAN, site.hi + 26, M_GRANITE);
  fillRect(world, x0, Math.max(0, F - CEIL), x0 + SPAN, F - 1, M_SKY);

  /* kerbs, so a mistimed jump does not put you back in the wild */
  fillRect(world, x0, F - 60, x0 + 12, F - 1, M_GRANITE);
  fillRect(world, x0 + SPAN - 12, F - 60, x0 + SPAN, F - 1, M_GRANITE);

  /* 2. one block of every diggable material, granite-divided so a slumping
        sand block cannot swallow its neighbour. The HUD already names the
        material under the cursor, so the row needs one label, not twenty. */
  let bx = x0 + AT.blocks;
  for(const mi of sampleMaterials()){
    fillRect(world, bx, F - BLOCK_H, bx + BLOCK_W - 1, F - 1, mi);
    fillRect(world, bx + BLOCK_W, F - BLOCK_H,
             bx + BLOCK_W + BLOCK_GAP - 1, F - 1, M_GRANITE);
    bx += BLOCK_W + BLOCK_GAP;
  }
  label((AT.blocks + (bx - x0)) / 2, -BLOCK_H - 8,
        "every diggable material  (granite first: it never gives)");

  /* 3. two pools in granite basins. Open topped and standing on the floor,
        so they level themselves and a hole in a wall drains them. */
  function basin(dx, w, depth, liquid){
    const a = x0 + dx, b = a + w;
    fillRect(world, a, F - depth, a + 5, F - 1, M_GRANITE);
    fillRect(world, b - 5, F - depth, b, F - 1, M_GRANITE);
    fillRect(world, a + 6, F - depth, b - 6, F - 1, M_SKY);
    fillRect(world, a + 6, F - depth + 10, b - 6, F - 1, liquid);
  }
  basin(AT.water, 110, 40, M_WATER);
  label(AT.water + 55, -52, "water");
  basin(AT.lava, 110, 40, M_LAVA);
  label(AT.lava + 55, -52, "lava");

  /* 4. a sand column in a granite chimney, standing on an earth plug that
        is open to the air on both sides. Dig the plug out and the column
        comes down; the walls are what stop it slumping into a harmless
        cone before anyone touches it.

        The plug is 18 px, which is the dig radius doubled, and that number
        is load bearing. A thicker plug can be hollowed through the middle
        and leave an earth lintel behind - earth is not unstable, so it
        hangs there and holds the sand up forever, and the demonstration
        silently fails. One pass has to take the whole plug. */
  const sa = x0 + AT.sand, sw = 60;
  fillRect(world, sa, F - 120, sa + 5, F - 19, M_GRANITE);
  fillRect(world, sa + sw - 5, F - 120, sa + sw, F - 19, M_GRANITE);
  fillRect(world, sa + 6, F - 18, sa + sw - 6, F - 1, M_EARTH);
  fillRect(world, sa + 6, F - 118, sa + sw - 6, F - 19, M_SAND);
  label(AT.sand + sw / 2, -132, "undermine the earth: the sand follows");

  /* 5. the dark tunnel. It has to run below the natural ground line to be
        dark at all, so it drops out of the arena floor and heads back
        underneath it. The corridor is lined with granite first and
        hollowed out with the real digger second, so it cannot break into
        a cave or an aquifer on the way and arrive full of water. */
  const tx = x0 + AT.shaft;
  const deep = site.hi + 80;
  const tun0 = tx - 210;
  fillRect(world, tx - 14, F - 4, tx + 14, deep + 16, M_GRANITE);
  fillRect(world, tun0 - 6, deep - 16, tx + 14, deep + 16, M_GRANITE);
  fillRect(world, tx - 9, F - 4, tx + 9, deep + 11, M_EARTH);
  fillRect(world, tun0, deep - 11, tx + 9, deep + 11, M_EARTH);
  for(let y = F - 2; y <= deep; y += 6) world.digFreeCircle(tx, y, 9, false);
  for(let x = tx; x >= tun0 + 10; x -= 6) world.digFreeCircle(x, deep, 9, false);
  label(AT.shaft, -12, "dark tunnel  (l toggles the lamp)");

  /* 6. a wall to scale with an overhang to hangle along. The overhang hangs
        off the top of the climbing face on purpose: you run out of wall
        before you run out of height, and have to change procedure. */
  const wa = x0 + AT.wall;
  fillRect(world, wa, F - 130, wa + 24, F - 1, M_GRANITE);
  fillRect(world, wa - 70, F - 130, wa - 1, F - 119, M_GRANITE);
  label(AT.wall - 34, -138, "scale, then hangle");

  label(AT.pad, -34, "test world");
  return stations;
}

/* ------------------------------------------------------------- in-world --- */
/* Drawn in world space, so a label stays on the thing it names however far
   the camera is zoomed. Nothing here touches simulation state. */
function drawLabels(ctx, list){
  ctx.save();
  ctx.font = "6px 'Lucida Console',Consolas,monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(255,212,121,.85)";
  ctx.shadowColor = "rgba(0,0,0,.9)";
  ctx.shadowBlur = 3;
  for(const s of list) ctx.fillText(s.text, s.x, s.y);
  ctx.restore();
}

/* ----------------------------------------------------------- the legend --- */
/* Styles are injected from here rather than added to src/ui/style.css:
   five other chats have that file open, and a testbed is not worth a
   merge conflict in the stylesheet. */
let legend = null;

function styleOnce(){
  if(typeof document === "undefined") return;
  if(document.getElementById("sandbox-style")) return;
  const st = document.createElement("style");
  st.id = "sandbox-style";
  st.textContent =
    '#sandbox{left:50%;top:10px;transform:translateX(-50%);max-width:min(620px,92vw);' +
    'text-align:center;z-index:22;font-size:11px;color:#9fb0c0;}' +
    '#sandbox b{color:#ffd479;font-weight:normal;letter-spacing:2px;}' +
    '#sandbox .sx{color:#e8e2d4;}' +
    '#sandbox .sw{color:#7c8593;display:block;margin-top:3px;}';
  document.head.appendChild(st);
}

function showLegend(){
  if(typeof document === "undefined") return;
  styleOnce();
  if(!legend){
    legend = document.createElement("div");
    legend.id = "sandbox";
    legend.className = "panel";
    document.body.appendChild(legend);
  }
  legend.innerHTML =
    '<b>TEST WORLD</b> &nbsp; ' +
    '<span class="sx">materials &middot; water &middot; lava &middot; sand column ' +
    '&middot; dark tunnel &middot; climb and hangle</span>' +
    '<span class="sw">your save is protected while this is up &mdash; ' +
    'esc, then Continue or New world, to go back to it</span>';
  legend.style.display = "block";
}
function hideLegend(){ if(legend) legend.style.display = "none"; }

/* ------------------------------------------------------------- entering --- */
let system   = null;
let site     = null;
let stations = [];
let returnHome = 0;

/* `ctx` is what src/main.js hands the menu: { systems, world, items, actor,
   camera }, every one of them a published API. */
export function enterSandbox(ctx){
  const { systems, world, items, actor, camera } = ctx;

  guardSave();
  active = true;

  if(!site) site = pickSite(world);
  stations = buildArena(world, site);

  /* Spawned fresh every visit, so coming back a second time is a full pile
     to fill a pack from rather than the leavings of the first. */
  items.clearDrops();
  const px = site.x0 + AT.pad;
  let n = 0;
  for(const id of PILE){
    if(!ITEM_IDS.includes(id)) continue;         /* a renamed id is not a drop */
    items.spawnDrop(px - 26 + (n % 14) * 4,
                    site.floor - 24 - ((n / 14) | 0) * 6, id);
    n++;
  }

  placePlayer(actor, camera);

  if(!system){
    system = {
      name: "sandbox",
      tick(){
        if(!active || !returnHome) return;
        if(--returnHome === 0) placePlayer(actor, camera);
      },
      renderFX(c){ if(active) drawLabels(c, stations); }
    };
    systems.push(system);
    /* Dying in the lava sends you to the world's spawn, which is nowhere
       near here. Put the player back rather than making them walk home or
       come round through the menu again. */
    bus.on("player:died", () => { if(active) returnHome = 24; });
  }

  showLegend();
  return site;
}

function placePlayer(actor, camera){
  const c = actor.clonk;
  c.x = site.x0 + AT.pad;
  c.y = site.floor - 12;
  c.vx = 0; c.vy = 0;
  c.energy = 100; c.breath = 100;
  if(camera) camera.snap();
}
