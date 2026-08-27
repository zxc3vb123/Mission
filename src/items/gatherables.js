/* Loose things lying on the surface. LANE C (items).

   Stage 0 asks the player to gather sticks, plant fibre and a loose rock,
   and until this existed there was no way to obtain any of the three: the
   first instruction the game gives was impossible to follow. Everything in
   the first hour is made of these - stick and fibre make a torch, a rock
   makes a knife, the knife makes rope, rope makes the axe, and the axe is
   the only source of wood.

   Deliberately NOT seeded: wood. It comes from felling a tree with a stone
   axe, and scattering it on the ground would skip the entire stage 0 chain
   that the axe exists to gate.

   These are ordinary drops, so they fall, settle, sink in water and are
   picked up by walking over them - the pickup path already works and this
   only decides where they lie. A slow regrowth keeps a player who has
   cleared their valley from being stranded.

   Placement uses hash2(x, 0, seed) rather than rnd(): the scatter then
   depends only on the world seed and not on how many random numbers other
   systems happened to draw first. Regrowth is live simulation, so it uses
   the shared deterministic stream like everything else. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { hash2, rnd } from "../core/rng.js";
import { spawnDrop, drops } from "./drops.js";
import { STEP, CHANCE, REGROW_EVERY, REGROW_NEAR, kindForRoll } from "../content/scatter.js";

/* The scatter is lane F's, in src/content/scatter.js: how thickly each thing
   lies, how it clumps, and how fast it grows back. It moved there because
   their reachability proof depends on it - a stone pickaxe is made of rock,
   rock needs a stone pickaxe to dig, and loose surface rock is the only thing
   between that and deadlock. The declaration and the number now live in one
   lane, and can no longer disagree.

   kindForRoll is theirs too, deliberately: the weights and the rule that
   selects from them are one thing, and splitting them is how they drift. */

let target = 0;             /* how many wild items the world was seeded with */
let detach = [];            /* see drops.js: one boot, one set of listeners */

/* A spot is good if it is dry ground with air above it. */
function surfaceSpot(world, x){
  const { W } = world.size();
  if(x < 4 || x > W-4) return null;
  const y = world.surfaceAt(x);
  if(!(y > 4)) return null;
  if(y >= state.world.waterLevel) return null;   /* under water, not "lying about" */
  if(!world.isFree(x, y-4)) return null;
  return y - 4;                                   /* just above the ground, so it settles */
}

export function wildCount(){
  let n = 0;
  for(const d of drops) if(d.wild) n++;
  return n;
}

/* Scatter across the whole surface, thinly and everywhere, so that wherever
   a player is put down there is something within a short walk. */
export function seedSurface(world, seed){
  const { W } = world.size();
  let placed = 0;
  for(let x = STEP; x < W - STEP; x += STEP){
    if(hash2(x, 1, seed) > CHANCE) continue;
    const y = surfaceSpot(world, x);
    if(y === null) continue;
    const kind = kindForRoll(hash2(x, 2, seed));
    const n = 1 + Math.floor(hash2(x, 3, seed) * kind.clump);
    for(let i=0;i<n;i++){
      spawnDrop(x + (i*3) - 3, y, kind.id, { wild:true });
      placed++;
    }
  }
  target = placed;
  return placed;
}

/* One item at a time, out of sight, so a cleared valley slowly fills back in
   without things appearing at the player's feet. */
export function regrowOne(world){
  const { W } = world.size();
  for(let attempt=0; attempt<12; attempt++){
    const x = Math.floor(rnd() * W);
    if(Math.abs(x - state.player.x) < REGROW_NEAR) continue;
    const y = surfaceSpot(world, x);
    if(y === null) continue;
    const kind = kindForRoll(rnd());
    spawnDrop(x, y, kind.id, { wild:true });
    return true;
  }
  return false;
}

export function createGatherables(world){
  /* -1 means "seed on the next tick". It starts there because the world is
     generated inside buildSystems() before this system exists to hear
     world:generated, and it goes back there whenever a new world arrives.
     Seeding a tick late also keeps the scatter out of the drop list that
     world:generated is about to clear. */
  let t = -1;

  for(const off of detach) off();
  detach = [ bus.on("world:generated", () => { t = -1; }) ];

  return {
    name: "gatherables",
    tick(){
      if(t === -1){ seedSurface(world, state.world.seed); t = 0; return; }
      if(++t < REGROW_EVERY) return;
      t = 0;
      if(wildCount() < target) regrowOne(world);
    },

    /* The scatter is a fact about this world, and the drops themselves are
       saved by the items system. All that is needed here is the target, so
       regrowth does not decide the world was always this bare. */
    serialise(){ return { target }; },
    restore(data){ if(data && data.target >= 0) target = data.target|0; },

    api: { wildCount, seedSurface: () => seedSurface(world, state.world.seed) }
  };
}
