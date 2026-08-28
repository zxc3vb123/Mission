/* The test world. LANE G (testbed).

   A menu entry that drops the player into a flat arena with every feature of
   the game laid out side by side, so a change can be tried in ten seconds
   instead of ten minutes of walking.

   Four things make this worth having rather than a toy:

   1. **It is not a mock.** The terrain is written into the real landscape
      through `world.api.setMat` and hollowed out with `digFreeCircle`. The
      stations and the ladders are put up by `build.api.place()`, which means
      they cost real materials, obey real support rules and refuse for real
      reasons. The pile of chunks is `items.api.spawnDrop`. If something
      behaves here, it behaves out there.

   2. **Every list is generated from a registry.** The material row comes from
      lane A's `MATS`, ordered by lane F's tool tiers; the stations come from
      `BUILDING_IDS`; master mode's list comes from `ITEM_IDS`. Lanes add
      content weekly, and a hand-typed list is wrong the day after it is
      written - which is exactly how the old key panel came to lie for days.
      Nothing in this file names an item or a building it did not read.

   3. **It cannot cost the player their save.** Entering wraps core's save
      storage: reads pass through, so "Continue" still finds the real game,
      and writes are refused for as long as the arena is up. Autosave cannot
      overwrite a real run with a test fixture.

   4. **Master mode (T) is scoped to the arena, deliberately.** It hands out
      any item in the game, which in a real save would be a cheat that
      autosave then makes permanent. Here the save is already protected, so
      it cannot cost anything. It is a debug tool and looks like one: the
      pack screen is lane H's and is not reimplemented here.

   NOTE for lane A: this is the one place outside `src/world/` that reads
   `materials.js`. `setMat(x, y, m)` is published but the material indices it
   takes are not, so there is no other way to place a named material. A
   `world.api.materials()` would close that gap. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { setStorage, saveSlot } from "../core/persist.js";
import { MATS, M_SKY, M_GRANITE, M_EARTH, M_SAND, M_WATER, M_LAVA, M_OIL }
  from "../world/materials.js";
import { ITEM_IDS, ITEM_DATA, itemData, CARRY_START, CARRY_BEST }
  from "../content/items.js";
import { BUILDING_IDS, building } from "../content/buildings.js";
import { TOOL_IDS, hardnessOf, UNCUTTABLE } from "../content/tools.js";
import { registerScreen, closeOthers } from "./screens.js";
import { keyCap } from "./keys.js";

/* Not in src/ui/keys.js on purpose: that table is the list of keys the
   guidebook teaches every player, and this one only exists inside the test
   world. The menu bar still offers it, because master mode registers as a
   screen while the arena is up. */
export const KEY_MASTER = "t";

/* ------------------------------------------------------------ geometry --- */
/* Everything is an offset from the arena's left edge, so the whole layout
   reads in one place and moving a station cannot silently overlap another. */
export const SPAN = 1900;          /* arena width in world pixels        */
const CEIL       = 170;            /* headroom cleared above the floor   */
const BLOCK_W    = 14, BLOCK_GAP = 3, BLOCK_H = 44, TIER_GAP = 12;

const AT = {
  pad:      40,      /* where the player lands, and the pile of chunks   */
  blocks:  100,      /* every diggable material, in tool-tier order      */
  water:   540,
  lava:    670,
  oil:     800,
  sand:    930,      /* the column that collapses when undermined        */
  shop:   1010,      /* left edge of the workshop row, which packs itself */
  shaft:  1570,      /* mouth of the dark tunnel                         */
  tower:  1630,      /* the ladder tower: laddered wall, rope, bare wall */
  wall:   1820       /* the wall to scale, with an overhang to hangle    */
};

/* How far from the station it needs a building may sit. The player has to be
   within REACH (70) of the site AND within STATION_R (40) of the station, so
   110 is the arithmetic limit and 100 leaves room for the height difference
   between a workbench and a derrick. Both numbers are lane C's. */
const NEAR = 100;
const GAP  = 8;

const BASIN_W = 110, BASIN_D = 40;
const TOWER_WALL = 12, TOWER_SLOT = 44, TOWER_H = 96;

/* The chunks left lying at the spawn pad: heavier than the pack, on purpose.
   A refused pickup is a thing worth testing too. Filtered against the real
   registry on the way out, so a renamed id becomes nothing rather than a
   ghost drop. */
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

/* Reads pass straight through, so the pause menu still offers the real save
   while an arena is on screen. Writes THROW rather than quietly doing
   nothing: a save that reports success and did not happen is worse than one
   that reports a refusal, and core already surfaces the error it gets back
   from storage.

   ONLY THE PLAYER'S OWN SAVE IS DEFENDED. Core now lets a feature that takes
   over the world claim a save slot of its own, and a multiplayer room does
   exactly that - a room's autosave goes to its own key and was never going to
   touch the solo game. Refusing those writes as well would have made the
   arena break a feature it has nothing to do with, so the guard steps aside
   whenever somebody else has claimed the world: their key, their business.

   Why this rather than claiming a slot of our own, which is what core's note
   suggests and would be tidier: leaving is the problem. A room has an
   explicit "leave the room" to put the slot back, and the arena has only
   `world:generated`, which cannot tell "the player left" from "the player
   reloaded the arena". Clear the slot on the wrong one of those and the next
   autosave writes the arena over the real game - the exact thing this exists
   to prevent. A refusal cannot fail that way round: while the arena is up the
   solo save is unwritable, whatever order anything happens in. */
function guardSave(){
  if(guarded) return;
  const real = realStorage();
  const mine = () => active && !saveSlot();
  const refuse = () => {
    throw new Error("test world is up - the real save is protected");
  };
  setStorage({
    getItem: k => real.getItem(k),
    setItem: (k, v) => { if(mine()) refuse(); real.setItem(k, v); },
    removeItem: k => { if(mine()) refuse(); real.removeItem(k); }
  });
  guarded = true;
}

/* Any regeneration - "Continue", "New world", r - is the way out of here. The
   arena lived in the landscape, and the landscape has just been rebuilt from
   a seed, so there is nothing left to leave. */
bus.on("world:generated", () => {
  /* The site is chosen from the ground line, so it belongs to the seed it was
     chosen under. Forgetting it here is what stops a second visit after "New
     world" from building the arena into a hillside that has moved out from
     under it. */
  site = null;
  if(!active) return;
  active = false;
  setMaster(false);
  hideLegend();
});

/* ---------------------------------------------------------- the builder --- */
function fillRect(world, x0, y0, x1, y1, m){
  if(y1 < y0 || x1 < x0) return;
  for(let y = y0; y <= y1; y++)
    for(let x = x0; x <= x1; x++) world.setMat(x, y, m);
}

/* The flattest dry span on the map, so levelling it costs the fewest pixels
   and the arena sits on a hill rather than in a cliff. Reading surfaceAt is
   free - the ground line is one array that is always resident - so this scan
   does not page a single chunk in. */
function pickSite(world){
  const { W } = world.size();
  const water = state.world.waterLevel;

  /* Every column, not every eighth: a single unsampled spike above the floor
     would poke through it and put a patch of the arena in its own shadow. */
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
  if(!best) best = span(Math.max(256, Math.min(W - SPAN - 256,
                                               state.world.spawn.x - SPAN / 2)));

  /* The floor sits just above the highest ground in the span, and that is
     what makes the arena daylit: a pixel counts as lit when it is above its
     column's ground line. Nothing here is dark by accident, so the one dark
     place is the one that is meant to be. */
  best.floor = best.lo - 2;
  return best;
}

/* Every diggable material in TOOL-TIER ORDER, which is the whole point of the
   row: walk left to right and the tools run out under you. Tier comes from
   lane F's table keyed by lane A's material name, so neither the list nor the
   order is written down here. Granite goes last as the one that never yields. */
function materialRow(){
  const rows = [];
  for(const m of MATS){
    if(!m.dig2 && m.index !== M_GRANITE) continue;
    const tier = hardnessOf(m.name);
    if(tier === null) continue;
    rows.push({ index: m.index, name: m.name, tier });
  }
  rows.sort((a, b) => {
    const at = a.tier === UNCUTTABLE ? 99 : a.tier;
    const bt = b.tier === UNCUTTABLE ? 99 : b.tier;
    return at - bt || a.index - b.index;
  });
  return rows;
}
const TIER_NOTE = [
  "tier 0 - hands, or a shovel much faster",
  "tier 1 - stone pickaxe",
  "tier 2 - iron pickaxe",
  "tier 3 - steel pickaxe",
  "tier 4 - titanium pickaxe"
];

function buildTerrain(world, site){
  const x0 = site.x0, F = site.floor;
  const stations = [];
  const label = (dx, dy, text) => stations.push({ x: x0 + dx, y: F + dy, text });

  /* 1. a flat floor: solid down past the natural ground, clear above it */
  fillRect(world, x0, F, x0 + SPAN, site.hi + 26, M_GRANITE);
  fillRect(world, x0, Math.max(0, F - CEIL), x0 + SPAN, F - 1, M_SKY);

  /* kerbs, so a mistimed jump does not put you back in the wild */
  fillRect(world, x0, F - 60, x0 + 14, F - 1, M_GRANITE);
  fillRect(world, x0 + SPAN - 14, F - 60, x0 + SPAN, F - 1, M_GRANITE);

  /* 2. the material row, granite-divided so a slumping sand block cannot
        swallow its neighbour, and gapped between tiers so the row reads as
        the ladder of tools it is. The HUD names the material under the
        cursor, so each tier needs one label rather than each block. */
  let bx = x0 + AT.blocks, lastTier = null, tierStart = bx;
  for(const m of materialRow()){
    if(lastTier !== null && m.tier !== lastTier){
      label((tierStart - x0 + bx - x0) / 2, -BLOCK_H - 8,
            lastTier === UNCUTTABLE ? "granite - nothing cuts it" : TIER_NOTE[lastTier]);
      bx += TIER_GAP;
      tierStart = bx;
    }
    lastTier = m.tier;
    fillRect(world, bx, F - BLOCK_H, bx + BLOCK_W - 1, F - 1, m.index);
    fillRect(world, bx + BLOCK_W, F - BLOCK_H,
             bx + BLOCK_W + BLOCK_GAP - 1, F - 1, M_GRANITE);
    bx += BLOCK_W + BLOCK_GAP;
  }
  if(lastTier !== null){
    label((tierStart - x0 + bx - x0) / 2, -BLOCK_H - 8,
          lastTier === UNCUTTABLE ? "granite - nothing cuts it" : TIER_NOTE[lastTier]);
  }

  /* 3. three pools in granite basins. Open topped and standing on the floor,
        so they level themselves and a hole in a wall drains them - contained
        rather than faked, which is what makes a hazard testable without
        flooding the arena. */
  function basin(dx, liquid){
    const a = x0 + dx, b = a + BASIN_W;
    fillRect(world, a, F - BASIN_D, a + 5, F - 1, M_GRANITE);
    fillRect(world, b - 5, F - BASIN_D, b, F - 1, M_GRANITE);
    fillRect(world, a + 6, F - BASIN_D, b - 6, F - 1, M_SKY);
    fillRect(world, a + 6, F - BASIN_D + 10, b - 6, F - 1, liquid);
  }
  basin(AT.water, M_WATER); label(AT.water + BASIN_W/2, -BASIN_D - 12, "water");
  basin(AT.lava,  M_LAVA);  label(AT.lava  + BASIN_W/2, -BASIN_D - 12, "lava");
  basin(AT.oil,   M_OIL);   label(AT.oil   + BASIN_W/2, -BASIN_D - 12, "oil");

  /* 4. a sand column in a granite chimney, standing on an earth plug that is
        open to the air on both sides. The plug is 18 px, which is the dig
        radius doubled, and that number is load bearing: a thicker plug can be
        hollowed through the middle and leave an earth lintel, and earth is
        not unstable, so it hangs there holding the sand up forever and the
        demonstration silently fails. One pass has to take the whole plug. */
  const sa = x0 + AT.sand, sw = 60;
  fillRect(world, sa, F - 120, sa + 5, F - 19, M_GRANITE);
  fillRect(world, sa + sw - 5, F - 120, sa + sw, F - 19, M_GRANITE);
  fillRect(world, sa + 6, F - 18, sa + sw - 6, F - 1, M_EARTH);
  fillRect(world, sa + 6, F - 118, sa + sw - 6, F - 19, M_SAND);
  label(AT.sand + sw/2, -132, "undermine the earth: the sand follows");

  /* 5. the dark tunnel. It has to run below the natural ground line to be
        dark at all, so it drops out of the arena floor and heads back
        underneath it. The corridor is lined with granite first and hollowed
        out with the real digger second, so it cannot break into a cave or an
        aquifer on the way and arrive full of water. */
  const tx = x0 + AT.shaft;
  const deep = site.hi + 80;
  const tun0 = tx - 210;
  fillRect(world, tx - 14, F - 4, tx + 14, deep + 16, M_GRANITE);
  fillRect(world, tun0 - 6, deep - 16, tx + 14, deep + 16, M_GRANITE);
  fillRect(world, tx - 9, F - 4, tx + 9, deep + 11, M_EARTH);
  fillRect(world, tun0, deep - 11, tx + 9, deep + 11, M_EARTH);
  for(let y = F - 2; y <= deep; y += 6) world.digFreeCircle(tx, y, 9, false);
  for(let x = tx; x >= tun0 + 10; x -= 6) world.digFreeCircle(x, deep, 9, false);
  label(AT.shaft, -12, "dark tunnel  (" + keyCap("l") + " toggles the lamp)");

  /* 6. THE LADDER TOWER. A real dug shaft would be the honest thing to build
        here and you would not be able to see a thing in it: below the natural
        ground line everything is dark, which is the whole reason the tunnel
        above works. So the shaft is a slot in a raised granite block instead.
        It is above the surface, so it is lit; it has two vertical walls and a
        floor, so a ladder is the only way out of it. The beam across the top
        is what the rope ladder hangs from - that support kind needs something
        solid directly overhead, and an open slot has nothing. */
  const ta = x0 + AT.tower;
  const slotL = ta + TOWER_WALL, slotR = slotL + TOWER_SLOT;
  fillRect(world, ta, F - TOWER_H, slotL - 1, F - 1, M_GRANITE);           /* left wall  */
  fillRect(world, slotR, F - TOWER_H, slotR + TOWER_WALL, F - 1, M_GRANITE); /* right wall */
  fillRect(world, slotL, F - TOWER_H, slotR - 1, F - 1, M_SKY);            /* the slot   */
  const beamX = slotL + 16;
  fillRect(world, beamX, F - TOWER_H - 6, beamX + 14, F - TOWER_H - 1, M_GRANITE);
  label(AT.tower + TOWER_WALL + TOWER_SLOT/2, -TOWER_H - 14,
        "ladders: fixed to the wall, hung from the beam, and one bare wall");

  /* 7. a wall to scale with an overhang to hangle along. The overhang hangs
        off the top of the climbing face on purpose: you run out of wall
        before you run out of height, and have to change procedure. */
  const wa = x0 + AT.wall;
  fillRect(world, wa, F - 130, wa + 24, F - 1, M_GRANITE);
  fillRect(world, wa - 70, F - 130, wa - 1, F - 119, M_GRANITE);
  label(AT.wall - 34, -138, "scale, then hangle");

  label(AT.pad, -34, "test world  (" + keyCap(KEY_MASTER) + " for master mode)");
  return { labels: stations, slotL, slotR, deep };
}

/* --------------------------------------------------- putting things up --- */
/* Everything below goes through build.api.place(), which means the arena is
   subject to every rule a player is: materials are consumed, support is
   checked, reach is checked, and a station that needs a workbench nearby will
   not go up without one. That is the point - a mock would prove nothing. */

/* place() measures reach from state.player, which lane B writes from the
   clonk once per tick. Moving the clonk without letting the actor run leaves
   state.player a frame behind, and every placement would be judged against
   where the player used to be. So: move, then let lane B publish the move. */
function standAt(ctx, x, y){
  const c = ctx.actor.clonk;
  c.x = x; c.y = y; c.vx = 0; c.vy = 0;
  const actor = ctx.systems.find(s => s.name === "actor");
  if(actor && actor.tick) actor.tick();
}

/* A station takes def.time seconds of real work to rise, which is right in
   the game and wrong in a test fixture: nothing here is worth waiting ninety
   seconds for. The rise is skipped, and the legend says so, because the
   timing is itself a thing worth watching - somewhere other than here. */
function finish(structure){
  if(!structure) return;
  structure.progress = structure.need;
  structure.built = true;
}

function stock(items, materials){
  for(const id in materials) items.inventory.add(id, materials[id]);
}

/* EVERY BUILDING LANE F HAS, minus the climbable ones - those are the ladder
   tower's job. Derived from BUILDING_IDS rather than listed here, and that is
   not a style preference: this function was a hand-written row of six for
   about an hour, and in that hour seven more buildings landed. A typed list
   would still be quietly putting up six and reporting success. What caught it
   was the arena's own check asking the registry what ought to be standing. */
function buildStations(ctx, site, labels){
  const { items } = ctx;
  const build = ctx.build;
  const x0 = site.x0, F = site.floor;
  const put = [];
  if(!build || typeof build.place !== "function") return put;

  const wanted = BUILDING_IDS.map(id => building(id)).filter(b => b && !b.climb);

  /* A row that marches left to right and packs itself, because the widths are
     lane F's and change: a stockpile is 48 wide and a timber prop is 4.

     THE ROW GROWS ITS OWN WORKBENCHES. A station only counts if the player is
     standing within STATION_R of it, so one workbench reaches about 200 px of
     row and there are far more than 200 px of things that need one. Rather
     than give up - which is what a fixed window did, silently leaving the
     forge and the derrick out - the row puts down another workbench whenever
     the next building would be out of reach of every one already standing.
     That is not a workaround: a workshop long enough to need two benches
     needs two benches, and the arena is showing the rule rather than dodging
     it. */
  const centres = Object.create(null);        /* defId -> [x, ...] */
  let cursor = AT.shop;

  function raise(def){
    /* Anything raised stops being pending, however it came to be raised. A
       walking beam pulls a forge up ahead of its turn; without this the row
       reached `forge` later and built a second one, with a second workbench
       beside it to reach it. */
    drop(def);
    const cx = cursor + def.w / 2;
    const anchor = nearestAnchor(def.buildsAt, cx);
    /* A piece is laid where you point; everything else is dropped onto the
       first solid ground under the cursor, so aim just above the floor. */
    const aimY = (def.support && def.support.piece) ? F - def.h / 2 : F - 4;
    stock(items, def.materials);
    /* Stand beside the site, but never further than STATION_R from the
       station this one needs, or it refuses for the reason it should. */
    const standX = anchor == null ? x0 + cx
                 : x0 + Math.max(anchor - 38, Math.min(anchor + 38, cx));
    standAt(ctx, standX, F - 12);

    const r = build.place(def.id, x0 + cx, aimY);
    if(r.ok){
      finish(r.structure);
      (centres[def.id] || (centres[def.id] = [])).push(cx);
      put.push(def.id);
    } else {
      put.push(def.id + " REFUSED: " + r.reason);
    }
    cursor = cx + def.w / 2 + GAP;
    return cx;
  }

  function nearestAnchor(id, cx){
    if(!id || id === "hand") return null;
    let best = null;
    for(const a of (centres[id] || [])){
      if(Math.abs(cx - a) > NEAR) continue;
      if(best == null || Math.abs(cx - a) < Math.abs(cx - best)) best = a;
    }
    return best;
  }

  /* Put down whatever `def` needs standing next to it, recursively - a
     walking beam needs a forge, and a forge needs a workbench. Depth is
     capped so a circular `buildsAt` in the data reports itself rather than
     filling the arena with benches. */
  function ensure(def, depth){
    const id = def.buildsAt;
    if(!id || id === "hand") return;
    for(let guard = 0; guard < 4; guard++){
      if(nearestAnchor(id, cursor + def.w / 2) != null) return;
      const station = building(id);
      if(!station || depth > 3){ return; }
      ensure(station, depth + 1);
      raise(station);
    }
  }

  /* Dependency order, worked out rather than assumed: a building goes up once
     the station named in its `buildsAt` can be stood next to. The pass stops
     when nothing moves, so an unbuildable chain reports itself instead of
     spinning. */
  const left = wanted.slice();
  function drop(def){
    const i = left.indexOf(def);
    if(i >= 0) left.splice(i, 1);
  }
  let progress = true;
  while(left.length && progress){
    progress = false;
    for(const def of left.slice()){
      if(left.indexOf(def) < 0) continue;      /* ensure() already put it up */
      const at = def.buildsAt;
      /* something that needs a station we have never built and cannot build
         yet waits for a later pass */
      if(at && at !== "hand" && !centres[at] && !canRaiseNow(at)) continue;
      ensure(def, 0);
      raise(def);
      progress = true;
    }
  }
  for(const def of left) put.push(def.id + " UNREACHABLE: needs " + def.buildsAt);

  /* can this station be put up right now, i.e. is its own chain satisfied? */
  function canRaiseNow(id, depth = 0){
    const def = building(id);
    if(!def || depth > 3) return false;
    const at = def.buildsAt;
    if(!at || at === "hand") return true;
    return !!centres[at] || canRaiseNow(at, depth + 1);
  }

  labels.push({ x: x0 + (AT.shop + cursor) / 2, y: F - 62,
                text: "every station lane F has, built and finished " +
                      "(the rise is skipped here)" });
  return put;
}

function buildLadders(ctx, site, labels, slotL, slotR){
  const { items } = ctx;
  const build = ctx.build;
  const F = site.floor;
  const out = [];
  if(!build || typeof build.place !== "function") return out;

  const rigid = building("ladder"), rope = building("rope_ladder");

  /* The left wall, laddered from the floor up. A wall-supported thing goes
     WHERE THE CURSOR POINTS rather than dropping to the floor, so each
     section is placed at its own centre, and its left edge sits against the
     wall so wallFraction sees solid all the way up. */
  if(rigid){
    const cx = slotL + rigid.w / 2;
    for(let top = F - rigid.h; top >= F - TOWER_H; top -= rigid.h){
      stock(items, rigid.materials);
      standAt(ctx, cx + 14, top + rigid.h / 2);
      const r = build.place("ladder", cx, top + rigid.h / 2);
      if(r.ok){ finish(r.structure); out.push("ladder"); }
      else { out.push("ladder REFUSED: " + r.reason); break; }
    }
  }

  /* The rope ladder, hung from the beam. Three sections' worth of drop for a
     third of the weight, and it only fits from the top - which is the whole
     difference between the two, and why both are here to be climbed. */
  if(rope){
    const cx = slotL + 16 + 7;
    stock(items, rope.materials);
    standAt(ctx, cx, F - TOWER_H + 20);
    const r = build.place("rope_ladder", cx, F - TOWER_H + rope.h / 2);
    if(r.ok){ finish(r.structure); out.push("rope_ladder"); }
    else out.push("rope_ladder REFUSED: " + r.reason);
  }

  labels.push({ x: slotR - 6, y: F - 12, text: "this wall is bare: put your own here" });
  return out;
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

/* ----------------------------------------------------------- the styles --- */
/* Injected from here rather than added to src/ui/style.css: other chats have
   that file open, and a testbed is not worth a merge conflict in the
   stylesheet. Master mode is deliberately plainer than the real screens. */
function styleOnce(){
  if(typeof document === "undefined") return;
  if(document.getElementById("sandbox-style")) return;
  const st = document.createElement("style");
  st.id = "sandbox-style";
  st.textContent =
    '#sandbox{left:50%;top:10px;transform:translateX(-50%);max-width:min(680px,92vw);' +
    'text-align:center;z-index:22;font-size:11px;color:#9fb0c0;}' +
    '#sandbox b{color:#ffd479;font-weight:normal;letter-spacing:2px;}' +
    '#sandbox .sx{color:#e8e2d4;}' +
    '#sandbox .sw{color:#7c8593;display:block;margin-top:3px;}' +

    '#master{left:50%;top:50%;transform:translate(-50%,-50%);width:560px;' +
    'max-width:94vw;padding:10px 12px 8px;z-index:31;pointer-events:auto;' +
    'background:rgba(11,13,17,.96);font-size:12px;}' +
    '#master .mtitle{color:#ffd479;letter-spacing:3px;font-size:13px;}' +
    '#master .msub{color:#5d646e;font-size:10px;margin-bottom:6px;}' +
    '#master .mfind{width:100%;box-sizing:border-box;background:#15181d;' +
    'border:1px solid #3b3f47;color:#e8e2d4;font-family:inherit;font-size:12px;' +
    'padding:4px 6px;margin-bottom:6px;}' +
    '#master .mcap{display:flex;flex-wrap:wrap;gap:5px;align-items:center;' +
    'font-size:11px;color:#9fb0c0;margin-bottom:5px;}' +
    '#master .mcap b{color:#e8e2d4;letter-spacing:0;}' +
    '#master button{background:#1b1f26;color:#c8cdd4;border:1px solid #3b3f47;' +
    'border-radius:2px;font-family:inherit;font-size:10px;padding:2px 6px;cursor:pointer;}' +
    '#master button:hover{background:#252b34;border-color:#5b626e;}' +
    '#master button.on{border-color:#e8a04f;color:#e8a04f;}' +
    '#master .mmsg{height:15px;line-height:15px;font-size:11px;color:#7c8593;' +
    'overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}' +
    '#master .mmsg.bad{color:#e8a04f;}' +
    '#master .mmsg.good{color:#5d8c34;}' +
    '#master .mlist{max-height:52vh;overflow-y:auto;overflow-x:hidden;' +
    'border-top:1px solid #2b3038;border-bottom:1px solid #2b3038;padding:2px 0;}' +
    '#master .mhead{color:#8fa8b8;font-size:10px;letter-spacing:1px;' +
    'padding:6px 4px 2px;}' +
    '#master .mrow{display:flex;align-items:center;gap:7px;padding:2px 5px;' +
    'cursor:pointer;border-left:2px solid transparent;}' +
    '#master .mrow:hover{background:rgba(255,212,121,.07);border-left-color:#ffd479;}' +
    '#master .msw{width:8px;height:8px;border:1px solid #000;flex:none;}' +
    '#master .mnm{flex:1;color:#e8e2d4;white-space:nowrap;overflow:hidden;' +
    'text-overflow:ellipsis;}' +
    '#master .mkg{color:#7c8593;font-size:10px;flex:none;}' +
    '#master .mhave{color:#ffd479;font-size:10px;flex:none;min-width:22px;' +
    'text-align:right;}' +
    '#master .mten{flex:none;}' +
    '#master .mnone{color:#5d646e;padding:10px 4px;}' +
    '#master .mfoot{color:#5d646e;font-size:10px;margin-top:7px;text-align:center;}';
  document.head.appendChild(st);
}

/* ----------------------------------------------------------- the legend --- */
let legend = null;

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
    '<span class="sx">materials by tool tier &middot; water, lava, oil &middot; ' +
    'sand column &middot; dark tunnel &middot; every station &middot; ladders &middot; ' +
    'climb and hangle</span>' +
    '<span class="sw">' + keyCap(KEY_MASTER) + ' master mode: every item in the ' +
    'game &mdash; stations are pre-finished, so no rise to wait for &mdash; ' +
    'your save is protected while this is up</span>';
  legend.style.display = "block";
}
function hideLegend(){ if(legend) legend.style.display = "none"; }

/* -------------------------------------------------------- master mode --- */
/* A debug tool, and it looks like one. The real pack screen is lane H's
   (src/ui/craft.js, I) and is not reimplemented here: two implementations of
   the same screen in one folder is the collision this project spends its
   whole day avoiding. This is a flat searchable list of what the registries
   contain, and one click puts one in the pack. */
let master = null, masterOpen = false, unregister = null;
let masterCtx = null, masterMsg = "", masterMsgKind = "";
let find = "";

/* Rows come from the registries, never from a list written here. */
function itemRows(){
  const tools = new Set(TOOL_IDS);
  const rows = [];
  for(const id of ITEM_IDS){
    const d = ITEM_DATA[id] || itemData(id);
    if(!d) continue;
    rows.push({ id, name: d.name, kg: d.mass,
                group: tools.has(id) ? "Tools" : (d.category || "other"),
                col: d.col });
  }
  return rows;
}
function buildingRows(){
  return BUILDING_IDS.map(id => {
    const b = building(id);
    return b ? { id, name: b.name, materials: b.materials } : null;
  }).filter(Boolean);
}

function matches(hay){
  if(!find) return true;
  return hay.toLowerCase().indexOf(find) >= 0;
}

function say(text, kind){
  masterMsg = text; masterMsgKind = kind || "";
  const el = master && master.querySelector(".mmsg");
  if(el){ el.textContent = text; el.className = "mmsg " + masterMsgKind; }
}

function give(id, n){
  const items = masterCtx && masterCtx.items;
  if(!items) return;
  const took = items.inventory.add(id, n);
  const d = itemData(id);
  const nm = d ? d.name.toLowerCase() : id;
  if(took === n) say("took " + took + " " + nm, "good");
  else if(took > 0) say("only " + took + " of " + n + " " + nm + " fitted - pack full", "bad");
  else say("nothing taken: the pack is full at " +
           items.inventory.carriedMass().toFixed(1) + " / " +
           items.inventory.capacity() + " kg", "bad");
  renderMaster();
}

/* Buildings are placed, never carried, so the useful thing master mode can do
   is hand over the cost and arm the ghost. The placing itself stays lane C's,
   with every rule it enforces intact. */
function giveBuilding(id){
  const b = building(id), items = masterCtx && masterCtx.items;
  const build = masterCtx && masterCtx.build;
  if(!b || !items) return;
  for(const m in b.materials) items.inventory.add(m, b.materials[m]);
  if(build && typeof build.ghost === "function"){
    build.ghost(id);
    say(b.name + ": materials in the pack, ghost armed - click to place it", "good");
    setMaster(false);
  } else {
    say(b.name + ": materials in the pack", "good");
  }
  renderMaster();
}

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function renderMaster(){
  if(!master || !masterOpen) return;
  /* The list is rebuilt on every click, and taking ten of something is ten
     clicks on one row. Without this the list snaps back to the top after each
     one and the row you were using walks off the screen. */
  const wasList = master.querySelector(".mlist");
  const wasScroll = wasList ? wasList.scrollTop : 0;
  const wasFind = master.querySelector(".mfind");
  const hadFocus = wasFind && document.activeElement === wasFind;
  const caret = hadFocus ? wasFind.selectionStart : null;

  const items = masterCtx.items;
  const inv = items.inventory;
  const cap = inv.capacity();
  const rows = itemRows();

  /* group order: tools first, because the tool tiers are the thing the
     material row is there to demonstrate */
  const groups = ["Tools"];
  for(const r of rows) if(groups.indexOf(r.group) < 0) groups.push(r.group);

  let html =
    '<div class="mtitle">MASTER MODE</div>' +
    '<div class="msub">' + ITEM_IDS.length + ' items and ' + BUILDING_IDS.length +
    ' buildings, straight from the registries. Click a row for one, ' +
    '&times;10 for ten.</div>' +
    '<input class="mfind" placeholder="search" value="' + esc(find) + '">' +
    '<div class="mcap"><span>pack <b>' + inv.carriedMass().toFixed(1) + ' / ' +
    cap + ' kg</b></span>' +
    '<button data-cap="' + CARRY_START + '"' + (cap === CARRY_START ? ' class="on"' : '') +
    '>' + CARRY_START + ' kg start</button>' +
    '<button data-cap="' + CARRY_BEST + '"' + (cap === CARRY_BEST ? ' class="on"' : '') +
    '>' + CARRY_BEST + ' kg best pack</button>' +
    '<button data-cap="99999"' + (cap > CARRY_BEST ? ' class="on"' : '') +
    '>override: no limit</button>' +
    '<button data-empty="1">empty the pack</button></div>' +
    '<div class="mmsg ' + masterMsgKind + '">' + esc(masterMsg) + '</div>' +
    '<div class="mlist">';

  let shown = 0;
  for(const g of groups){
    const inGroup = rows.filter(r => r.group === g &&
                                (matches(r.name) || matches(r.id) || matches(g)));
    if(!inGroup.length) continue;
    html += '<div class="mhead">' + esc(g) + '</div>';
    for(const r of inGroup){
      shown++;
      const have = inv.count(r.id);
      html += '<div class="mrow" data-give="' + esc(r.id) + '">' +
              '<span class="msw" style="background:' + (r.col || "#555") + '"></span>' +
              '<span class="mnm">' + esc(r.name) + '</span>' +
              '<span class="mkg">' + r.kg + ' kg</span>' +
              '<span class="mhave">' + (have || "") + '</span>' +
              '<button class="mten" data-ten="' + esc(r.id) + '">&times;10</button>' +
              '</div>';
    }
  }

  const bs = buildingRows().filter(b => matches(b.name) || matches(b.id) ||
                                        matches("building"));
  if(bs.length){
    html += '<div class="mhead">Buildings &mdash; takes the cost and arms the ghost</div>';
    for(const b of bs){
      shown++;
      const cost = Object.keys(b.materials)
        .map(m => b.materials[m] + " " + ((itemData(m) && itemData(m).name.toLowerCase()) || m))
        .join(", ");
      html += '<div class="mrow" data-build="' + esc(b.id) + '">' +
              '<span class="msw" style="background:#6f8fb0"></span>' +
              '<span class="mnm">' + esc(b.name) + '</span>' +
              '<span class="mkg">' + esc(cost) + '</span></div>';
    }
  }

  if(!shown) html += '<div class="mnone">nothing matches &ldquo;' + esc(find) + '&rdquo;</div>';
  html += '</div><div class="mfoot">' + keyCap(KEY_MASTER) +
          ' closes this &middot; the test world only, so it can never reach your save</div>';
  master.innerHTML = html;

  const list = master.querySelector(".mlist");
  if(list) list.scrollTop = wasScroll;

  const box = master.querySelector(".mfind");
  if(box){
    box.addEventListener("input", () => {
      find = box.value.trim().toLowerCase();
      renderMaster();
    });
    /* Typing must survive the rebuild it causes, or the box eats every second
       letter. Focus is restored only if it was there to begin with, so a
       click on a row does not steal the caret. */
    if(hadFocus){
      box.focus();
      const at = caret == null ? box.value.length : caret;
      box.setSelectionRange(at, at);
    }
  }
}

function onMasterClick(e){
  const inv = masterCtx.items.inventory;
  const ten = e.target.closest ? e.target.closest("[data-ten]") : null;
  if(ten){ e.stopPropagation(); give(ten.getAttribute("data-ten"), 10); return; }
  const capBtn = e.target.closest ? e.target.closest("[data-cap]") : null;
  if(capBtn){
    const kg = Number(capBtn.getAttribute("data-cap"));
    inv.setCapacity(kg);
    say(kg > CARRY_BEST
        ? "carry limit overridden - it is off until you put it back"
        : "carry limit set to " + kg + " kg", kg > CARRY_BEST ? "bad" : "good");
    renderMaster();
    return;
  }
  if(e.target.closest && e.target.closest("[data-empty]")){
    inv.clear(); say("pack emptied", "good"); renderMaster(); return;
  }
  const bld = e.target.closest ? e.target.closest("[data-build]") : null;
  if(bld){ giveBuilding(bld.getAttribute("data-build")); return; }
  const row = e.target.closest ? e.target.closest("[data-give]") : null;
  if(row) give(row.getAttribute("data-give"), 1);
}

function setMaster(open){
  if(typeof document === "undefined") return;
  if(open && !active) return;               /* the arena only */
  styleOnce();
  if(!master){
    master = document.createElement("div");
    master.id = "master";
    master.className = "panel";
    master.addEventListener("click", onMasterClick);
    document.body.appendChild(master);
  }
  masterOpen = !!open;
  master.style.display = masterOpen ? "block" : "none";
  if(masterOpen){ closeOthers("master"); renderMaster(); }
}

/* ------------------------------------------------------------- entering --- */
let system   = null;
let site     = null;
let labels   = [];
let returnHome = 0;

/* `ctx` is what src/main.js hands the menu: { systems, world, items, actor,
   camera }, every one of them a published API. `build` is not in it, so it is
   found in the systems list rather than by importing lane C's module. */
export function enterSandbox(ctx0){
  const build = (ctx0.systems.find(s => s.name === "build") || {}).api || null;
  const ctx = Object.assign({}, ctx0, { build });
  const { systems, world, items, actor, camera } = ctx;
  masterCtx = ctx;

  guardSave();
  active = true;

  if(!site) site = pickSite(world);
  const terrain = buildTerrain(world, site);
  labels = terrain.labels;

  /* Building consumes real materials, and the real limit is 35 kg while a
     workbench alone is 104. The limit is lifted for the construction and put
     straight back, so what the player then walks into is a normal pack in a
     normal world - the arena was built under the game's rules, not without
     them. */
  const capBefore = items.inventory.capacity();
  items.inventory.clear();
  items.inventory.setCapacity(99999);
  const built = buildStations(ctx, site, labels)
          .concat(buildLadders(ctx, site, labels, terrain.slotL, terrain.slotR));
  items.inventory.clear();
  items.inventory.setCapacity(capBefore > 0 ? capBefore : CARRY_START);

  /* Spawned fresh every visit, so coming back a second time is a full pile to
     fill a pack from rather than the leavings of the first. */
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
      renderFX(c){ if(active) drawLabels(c, labels); }
    };
    systems.push(system);
    /* Dying in the lava sends you to the world's spawn, which is nowhere near
       here. Put the player back rather than making them walk home or come
       round through the menu again. */
    bus.on("player:died", () => { if(active) returnHome = 24; });
    bus.on("input:key", e => {
      if(e.down && e.key === KEY_MASTER && active) setMaster(!masterOpen);
    });
  }

  /* Registered while the arena is up, so the menu bar offers master mode the
     same way it offers every other screen, and escape closes it first. */
  if(!unregister){
    unregister = registerScreen({
      id: "master", label: "Master mode", key: KEY_MASTER,
      isOpen: () => masterOpen,
      open: () => setMaster(true),
      close: () => setMaster(false)
    });
  }

  showLegend();
  return { site, built };
}

function placePlayer(actor, camera){
  const c = actor.clonk;
  c.x = site.x0 + AT.pad;
  c.y = site.floor - 12;
  c.vx = 0; c.vy = 0;
  c.energy = 100; c.breath = 100;
  if(camera) camera.snap();
}
