/* Plots, growth and harvest. LANE J (farming).

   A PLOT IS NOT A LANDSCAPE PIXEL and it is not a structure. It is a thing
   standing on the ground at a point, the way a wagon is - it needs soil
   under it and sky over it, it is re-checked while it stands, and pulling
   the ground out from under it kills it and hands back what it was holding.

   CONSERVATION OF MATTER IS THE WHOLE DESIGN HERE, not a check bolted on
   afterwards (WORKFLOW 5c). A plant is a machine that turns water into food,
   so:

     - the seed is TAKEN from the pack, and take() is asked whether it worked
     - the water is real: either lifted out of the world by the roots through
       lane A's drawLiquid, which reports what it actually got, or handed
       over by a bucket that left the pack
     - a plot HOLDS its water. Water that has gone in and not yet become
       grain is still water, and it comes back out of a plant you pull up
     - the harvest weighs exactly what the plot drank. That is not a number
       anyone chose: spec.js derives the thirst from the yield through the
       one px-to-kg bridge the game has, so the two cannot drift apart

   Nothing here calls Math.random or reads a clock. Growth is counted in
   sips of water on a fixed tick, so two clients running the same seed and
   the same waterings see the same field.

   DISTANCE MUST NOT CHANGE THE RESULT. Every plot ticks every tick, exactly
   like lane C's structures - there is no catch-up model and nothing that has
   to happen on load. The only thing distance costs is that a plot far from
   the camera pages a chunk in when its slow beat comes round, which is the
   same bargain lane D took for the derrick. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { hash2, rnd } from "../core/rng.js";
import { ITEM_DATA } from "../content/items.js";
import {
  SEED_ID, GRAIN_ID, YIELD_GRAIN, YIELD_SEED, WILD_GRAIN, WILD_SEED,
  SIP_TICKS, PLOT_SPACING, PICK_R, REACH, WATER_R,
  CHECK_EVERY, SOAK_EVERY, SOAK_R, SOAK_PER, SKY_SCAN,
  WILD_STEP, WILD_CHANCE, WILD_CLUMP, REGROW_EVERY, REGROW_NEAR,
  waterNeed, plotCapacity, waterKgPerPixel
} from "./spec.js";

export const plots = [];

/* Water that belongs to nobody yet: the tail of a bucket that overshot a
   row, or what came out of a plant somebody pulled up. It is held here and
   poured back into the world a bit at a time until lane A accepts it.

   It is a QUEUE rather than a discard on purpose. pourLiquid refuses when
   there is nowhere for the liquid to go, and honouring that refusal by
   dropping the water on the floor would destroy matter in the one system
   whose entire premise is that it does not. */
export const spill = [];

let nextId = 1;
let wildTarget = 0;
let world = null, items = null;

export function attachWorld(api){ world = api || null; }
export function attachItems(api){ items = api || null; }

export function clearCrops(){
  plots.length = 0; spill.length = 0; nextId = 1; wildTarget = 0;
}

/* ------------------------------------------------------------ the site --- */

/* Soil is lane A's declaration, not an index we copy: their material table
   marks earth `soil: 1`. Reading the flag means a second soil - loam, peat,
   whatever they add - is farmable the day they add it, and nothing here has
   to be told. */
export function isSoil(x, y){
  if(!world) return false;
  const m = world.matInfo(x, y);
  return !!(m && m.soil);
}

/* Open to the sky, within a bounded look upward. A crop needs daylight, and
   lightAt cannot answer this: the light grid is computed around the camera,
   so it reads 0 for a field the player has walked away from. Gating growth
   on it would make a farm work only while watched, which is the exact thing
   the owner's decision forbids. Geometry is the same fact and does not care
   where the camera is. */
export function underSky(x, y){
  if(!world) return false;
  for(let k = 1; k <= SKY_SCAN; k++){
    if(world.isSolid(x, y - k)) return false;
  }
  return true;
}

/* Is this a place a seed could go: soil underfoot, air above, sky over it,
   and no plant already standing here. */
export function siteVerdict(x, y){
  if(!world) return { ok:false, reason:"no world" };
  const gx = Math.round(x), gy = Math.round(y);
  if(!isSoil(gx, gy + 1)) return { ok:false, reason:"nothing but bare ground grows a crop - you need soil" };
  if(world.isSolid(gx, gy)) return { ok:false, reason:"there is no room for a plant here" };
  if(!underSky(gx, gy)) return { ok:false, reason:"a crop needs daylight, and this is roofed over" };
  if(nearestPlot(gx, gy, PLOT_SPACING)) return { ok:false, reason:"something is already growing here" };
  return { ok:true, x:gx, y:gy };
}

/* the ground level at x within a short look up and down, so a plant sits on
   the soil rather than hovering over it or buried in it */
export function settleY(x, y){
  const gx = Math.round(x);
  let gy = Math.round(y);
  for(let k = 0; k <= 6; k++) if(isSoil(gx, gy + 1 + k) && !world.isSolid(gx, gy + k)) return gy + k;
  for(let k = 1; k <= 6; k++) if(isSoil(gx, gy + 1 - k) && !world.isSolid(gx, gy - k)) return gy - k;
  return gy;
}

export function nearestPlot(x, y, r){
  let best = null, bd = r * r;
  for(const p of plots){
    const dx = p.x - x, dy = p.y - y, d = dx*dx + dy*dy;
    if(d <= bd){ bd = d; best = p; }
  }
  return best;
}

function inReach(x, y){
  const p = state.player;
  return Math.hypot(x - p.x, y - p.y) <= REACH;
}

/* --------------------------------------------------------------- plots --- */

function makePlot(x, y, wild){
  const p = {
    id: nextId++, x, y, kind: GRAIN_ID,
    wild: !!wild,
    water: 0,                 /* px of water held and not yet drunk */
    drunk: wild ? waterNeed() : 0,   /* px turned into plant, = ripeness */
    sip: 0,
    ok: true, why: "",
    ripeAt: 0
  };
  if(p.wild) p.ripeAt = state.tick;
  plots.push(p);
  return p;
}

export function isRipe(p){ return p.drunk >= waterNeed(); }
export function progress(p){ return Math.min(1, p.drunk / waterNeed()); }

/* -------------------------------------------------------------- matter ---
   Everything a plot is holding, in px of water, so a suite can audit the
   whole farm against the world in one number. */
export function heldWater(){
  let n = 0;
  for(const p of plots) if(!p.wild) n += p.water + p.drunk;
  for(const s of spill) n += s.px;
  return n;
}

/* Give water back to the world, or hold it until the world can take it. */
export function returnWater(x, y, px){
  if(!(px > 0)) return;
  spill.push({ x: Math.round(x), y: Math.round(y), px: Math.round(px) });
}

function drainSpill(){
  if(!world || !spill.length) return;
  const s = spill[0];
  const at = world.liquidAt(s.x, s.y);
  /* pourLiquid needs to be told WHICH liquid; water is what a plot ever
     holds, and the only way to name it without copying lane A's material
     index is to ask the world what water is. A puddle within reach answers
     it; failing that the sea does. */
  const m = at ? at.matIndex : waterIndex();
  if(m < 0) return;
  const r = world.pourLiquid(s.x, s.y, m, s.px);
  const took = r && r.accepted > 0 ? r.accepted : 0;
  if(took <= 0) return;                 /* nowhere for it: keep it, try again */
  s.px -= took;
  if(s.px <= 0) spill.shift();
}

/* Lane A names materials; we do not keep a copy of their index. The world
   level is water by construction (state.world.waterLevel), so one read at
   the sea surface identifies it, and the answer is cached. */
let waterMat = -1;
export function waterIndex(){
  if(waterMat >= 0) return waterMat;
  if(!world) return -1;
  const { W } = world.size();
  const at = world.liquidAt(Math.round(W/2), Math.round(state.world.waterLevel) + 4);
  if(at && at.matIndex >= 0){
    const info = world.matInfo(at.x, at.y);
    if(info && info.name === "Water") waterMat = at.matIndex;
  }
  return waterMat;
}
export function forgetWaterIndex(){ waterMat = -1; }

/* -------------------------------------------------------------- verbs ---- */

export function canPlant(x, y){
  if(!items) return { ok:false, reason:"no pack" };
  if(!inReach(x, y)) return { ok:false, reason:"too far away" };
  if(!items.inventory.has(SEED_ID, 1))
    return { ok:false, reason:"you have no seed", missing: { [SEED_ID]: 1 } };
  const gy = settleY(x, y);
  return siteVerdict(x, gy);
}

export function plant(x, y){
  const v = canPlant(x, y);
  if(!v.ok){ bus.emit("crop:refused", { reason: v.reason, missing: v.missing }); return v; }
  /* THE CHECKED DESTROY. take() answers whether it actually got the seed,
     and a plant that appeared while the seed stayed in the pack is the bug
     this project has shipped four times in one day. */
  if(!items.inventory.take(SEED_ID, 1))
    return { ok:false, reason:"you have no seed" };
  const p = makePlot(v.x, v.y, false);
  bus.emit("crop:planted", { id: p.kind, x: p.x, y: p.y });
  return { ok:true, plot: p };
}

/* Empty one carried pail over a row. The water goes into the plants that
   want it, nearest first, and whatever is left over goes on the ground -
   never into nothing. */
export function water(x, y){
  if(!items || !world) return { ok:false, reason:"no pack" };
  if(!inReach(x, y)) return { ok:false, reason:"too far away" };

  const pail = carriedPail();
  if(!pail) return { ok:false, reason:"you are carrying no water" };

  const row = thirstyNear(x, y, WATER_R);
  if(!row.length) return { ok:false, reason:"nothing here needs watering" };

  /* Same swap the bucket lane makes, and for the same reason: a full pail is
     a different item from an empty one, so emptying it is a take and an add,
     and BOTH are checked. If the empty will not fit, the full one goes back
     exactly as it was. */
  if(!items.inventory.take(pail.full, 1)) return { ok:false, reason:"you are carrying no water" };
  if(items.inventory.add(pail.empty, 1) < 1){
    items.inventory.add(pail.full, 1);
    return { ok:false, reason:"no room in your pack for the empty pail" };
  }

  let left = pail.px, given = 0;
  const cap = plotCapacity();
  for(const p of row){
    if(left <= 0) break;
    const want = Math.max(0, cap - p.water - p.drunk);
    const n = Math.min(want, left);
    p.water += n; left -= n; given += n;
  }
  if(left > 0) returnWater(x, y, left);      /* the rest goes on the ground */
  bus.emit("crop:watered", { x, y, px: given, spilled: left, plants: row.length });
  return { ok:true, px: given, spilled: left };
}

/* What a full vessel is, is LANE F'S VOCABULARY: `container` names the empty
   it becomes, `liquid` names the material by lane A's name for it, and
   `liquidAmount` says how many pixels it holds.

   IT IS READ FROM ITEM_DATA AND NOT ONLY FROM THE LIVE REGISTRY, and that
   is not belt and braces - the live registry does not currently carry those
   three fields at all. src/items/itemdefs.js copies a fixed list of columns
   out of ITEM_DATA and container is not among them, so on origin/main today
   a player holding a bucket cannot fill it: items.api.isEmptyContainer
   ("bucket") is false. Lane C's own suite is green because its fixture
   registers a test pail with the fields set by hand. That is lane C's line
   to fix (docs/REQUESTS.md, farm -> items) and not ours to reach into, so
   this reads the table lane F actually wrote, and prefers the registry the
   moment it starts carrying the fields. */
function vesselDef(id){
  const live = items.itemDef(id);
  if(live && live.id === id && live.container !== undefined) return live;
  return ITEM_DATA[id] || null;
}

function carriedPail(){
  const all = items.inventory.all();
  for(const id in all){
    if(!(all[id] > 0)) continue;
    const def = vesselDef(id);
    if(!def || typeof def.container !== "string") continue;
    if(def.liquid !== "Water") continue;
    return { full: id, empty: def.container,
             px: def.liquidAmount > 0 ? def.liquidAmount : 0 };
  }
  return null;
}

function thirstyNear(x, y, r){
  const cap = plotCapacity();
  return plots
    .filter(p => !p.wild && p.water + p.drunk < cap && Math.hypot(p.x - x, p.y - y) <= r)
    .sort((a, b) => Math.hypot(a.x-x, a.y-y) - Math.hypot(b.x-x, b.y-y));
}

export function harvest(x, y){
  if(!items) return { ok:false, reason:"no pack" };
  const p = nearestPlot(Math.round(x), Math.round(y), PICK_R);
  if(!p) return { ok:false, reason:"nothing to harvest here" };
  if(!inReach(p.x, p.y)) return { ok:false, reason:"too far away" };
  if(!isRipe(p)) return { ok:false, reason:"not ripe yet", progress: progress(p) };

  const grain = p.wild ? WILD_GRAIN : YIELD_GRAIN;
  const seed  = p.wild ? WILD_SEED  : YIELD_SEED;
  const outputs = { [GRAIN_ID]: grain, [SEED_ID]: seed };

  /* The pack is mass-limited and a harvest is heavy. Whatever will not fit
     falls at the plant's feet as a real chunk rather than being refused or,
     worse, quietly dropped. */
  for(const id in outputs) give(id, outputs[id], p.x, p.y);

  /* A tended plot drinks exactly what it needed, so p.water is normally 0
     here. Anything still held goes back to the world. */
  if(!p.wild && p.water > 0) returnWater(p.x, p.y, p.water);
  remove(p);
  bus.emit("crop:harvested", { id: p.kind, x: p.x, y: p.y, outputs, wild: p.wild });
  return { ok:true, outputs };
}

/* Pull a growing plant up. Everything it was holding comes back: the seed,
   and every pixel of water that went in - including what had already become
   plant, because a green shoot is water and not yet food. */
export function uproot(p, why){
  if(!p) return { ok:false };
  const returns = {};
  if(p.wild){
    give(GRAIN_ID, WILD_GRAIN, p.x, p.y); returns[GRAIN_ID] = WILD_GRAIN;
    give(SEED_ID, WILD_SEED, p.x, p.y);   returns[SEED_ID]  = WILD_SEED;
  } else if(isRipe(p)){
    for(const id of [GRAIN_ID, SEED_ID]){
      const n = id === GRAIN_ID ? YIELD_GRAIN : YIELD_SEED;
      give(id, n, p.x, p.y); returns[id] = n;
    }
    if(p.water > 0) returnWater(p.x, p.y, p.water);
  } else {
    give(SEED_ID, 1, p.x, p.y); returns[SEED_ID] = 1;
    returnWater(p.x, p.y, p.water + p.drunk);
  }
  remove(p);
  bus.emit("crop:lost", { id: p.kind, x: p.x, y: p.y, why: why || "pulled up", returns });
  return { ok:true, returns };
}

/* Hand n of something to the player. add() reports how many the pack could
   actually take - it fills partially rather than refusing - and everything
   it would not take falls at the plant's feet as a real chunk. Reading that
   return value is the whole of it: dropping the remainder on the floor of
   the code is how a harvest would quietly weigh less than the field. */
function give(id, n, x, y){
  if(!(n > 0)) return;
  const took = items.inventory.add(id, n);
  for(let i = took; i < n; i++) items.spawnDrop(x, y - 2, id, {});
}

function remove(p){
  const i = plots.indexOf(p);
  if(i >= 0) plots.splice(i, 1);
}

/* ---------------------------------------------------------- the tick ----- */

function revalidate(p){
  const was = p.ok;
  if(!isSoil(p.x, p.y + 1)){
    uproot(p, "the soil was dug out from under it");
    return;
  }
  if(world.isSolid(p.x, p.y)){
    uproot(p, "it was buried");
    return;
  }
  const sky = underSky(p.x, p.y);
  p.ok = sky;
  p.why = sky ? "" : "no daylight";
  if(was !== p.ok) bus.emit("crop:shaded", { x: p.x, y: p.y, ok: p.ok });
}

/* A thirsty plot looks for standing water within a root's reach and lifts
   some. drawLiquid reports what it ACTUALLY got - a ditch that has run dry
   gives 0 and the plot simply waits, which is what makes a well honest here
   for the same reason it does for a pump. */
function soak(p){
  const at = world.liquidAt(p.x, p.y + 1);
  if(!at || at.matIndex !== waterIndex()) return;
  if(typeof at.dist === "number" && at.dist > SOAK_R) return;
  const want = Math.min(SOAK_PER, plotCapacity() - p.water - p.drunk);
  if(want <= 0) return;
  const got = world.drawLiquid(at.x, at.y, want);
  if(!got || !(got.taken > 0)) return;
  p.water += got.taken;
  bus.emit("crop:soaked", { x: p.x, y: p.y, px: got.taken });
}

export function tickCrops(){
  if(!world || !items) return;
  drainSpill();

  const t = state.tick;
  const cap = plotCapacity();
  for(let i = plots.length - 1; i >= 0; i--){
    const p = plots[i];
    if(p.wild) continue;                       /* it grew before we got here */

    if((t + p.id) % CHECK_EVERY === 0){
      revalidate(p);
      if(plots[i] !== p) continue;             /* it was uprooted */
    }
    if(!p.ok) continue;
    if(p.drunk >= cap) continue;               /* ripe, standing and waiting */

    /* Roots first, and on the beat whether or not the plot is dry. Topping
       up rather than waiting until it runs out is what makes a ditch beside
       a row better than a ditch the row occasionally notices: the plot fills
       faster than it drinks, so an irrigated crop never stalls. Both the
       look and the lift stop the moment it has all it needs. */
    if((t + p.id) % SOAK_EVERY === 0 && p.water + p.drunk < cap) soak(p);

    if(p.water <= 0) continue;                 /* thirsty: it simply waits */
    if(++p.sip < SIP_TICKS) continue;
    p.sip = 0;
    p.water--; p.drunk++;
    if(p.drunk >= cap){
      p.ripeAt = t;
      bus.emit("crop:ripe", { id: p.kind, x: p.x, y: p.y });
    }
  }
}

/* ---------------------------------------------------------- the wild ----- */

function wildSpot(x){
  const { W } = world.size();
  if(x < 8 || x > W - 8) return null;
  const y = world.surfaceAt(x);
  if(!(y > 8)) return null;
  if(y >= state.world.waterLevel) return null;
  if(!isSoil(x, y)) return null;
  if(world.isSolid(x, y - 1)) return null;
  if(!underSky(x, y - 1)) return null;
  return y - 1;
}

/* Deterministic from the world seed alone, exactly like lane C's scatter:
   hash2 rather than rnd() so where wheat grows does not depend on how many
   random numbers some other system happened to draw first. */
export function seedWild(seed){
  const { W } = world.size();
  let placed = 0;
  for(let x = WILD_STEP; x < W - WILD_STEP; x += WILD_STEP){
    if(hash2(x, 41, seed) > WILD_CHANCE) continue;
    const n = 1 + Math.floor(hash2(x, 42, seed) * WILD_CLUMP);
    for(let i = 0; i < n; i++){
      const px = x + i * PLOT_SPACING;
      const py = wildSpot(px);
      if(py === null) continue;
      if(nearestPlot(px, py, PLOT_SPACING)) continue;
      makePlot(px, py, true);
      placed++;
    }
  }
  wildTarget = placed;
  return placed;
}

export function wildCount(){
  let n = 0;
  for(const p of plots) if(p.wild) n++;
  return n;
}
export function wildTargetCount(){ return wildTarget; }
export function setWildTarget(n){ wildTarget = n | 0; }

/* One at a time, out of sight, and never above what the world started with.
   Regrowth is live simulation rather than generation, so it uses the shared
   deterministic stream the same way lane C's does. */
export function regrowOne(){
  const { W } = world.size();
  for(let attempt = 0; attempt < 12; attempt++){
    const x = Math.floor(rnd() * W);
    if(Math.abs(x - state.player.x) < REGROW_NEAR) continue;
    const y = wildSpot(x);
    if(y === null) continue;
    if(nearestPlot(x, y, PLOT_SPACING)) continue;
    makePlot(x, y, true);
    return true;
  }
  return false;
}

export function tickWild(t){
  if(t % REGROW_EVERY !== 0) return;
  if(wildCount() < wildTarget) regrowOne();
}

/* ---------------------------------------------------------- save/load ---- */

export function serialiseCrops(){
  return {
    wildTarget,
    nextId,
    plots: plots.map(p => [p.x, p.y, p.wild ? 1 : 0, p.water, p.drunk, p.sip, p.id]),
    spill: spill.map(s => [s.x, s.y, s.px])
  };
}

export function restoreCrops(data){
  clearCrops();
  if(!data) return;
  wildTarget = data.wildTarget | 0;
  for(const row of (data.plots || [])){
    const [x, y, wild, w, drunk, sip, id] = row;
    plots.push({ id, x, y, kind: GRAIN_ID, wild: !!wild,
                 water: w || 0, drunk: drunk || 0, sip: sip || 0,
                 ok: true, why: "", ripeAt: 0 });
  }
  for(const row of (data.spill || [])) spill.push({ x: row[0], y: row[1], px: row[2] });
  nextId = data.nextId | 0;
  if(!(nextId > 0)){
    nextId = 1;
    for(const p of plots) if(p.id >= nextId) nextId = p.id + 1;
  }
}

/* what a suite wants to know without reaching inside */
export function farmStats(){
  return {
    plots: plots.length, wild: wildCount(), ripe: plots.filter(isRipe).length,
    heldWater: heldWater(), spill: spill.reduce((n, s) => n + s.px, 0),
    kgHeld: heldWater() * waterKgPerPixel()
  };
}
