/* Chunks lying on the ground. LANE C (items).

   Digging emits "dig:yield"; this turns that into a physical chunk that
   falls, sinks in liquid and is picked up when the player walks over it. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { rnd } from "../core/rng.js";
import { moveShape, shapeInLiquid } from "../core/shape.js";
import { keys } from "../core/input.js";
import { itemDef } from "./itemdefs.js";
import { inventory, BURDEN_AT } from "./inventory.js";

export const drops = [];
export const DROP_VERTS = [[-2,-2],[2,-2],[-2,2],[2,2],[0,3]];

const GRAV = 0.28, MAXFALL = 9.0;

/* Held to pick up while burdened. A hold, not a click: the brief is explicit
   that the player must never have to click a chunk on the ground. */
export const GRAB_KEY = "control";

/* Pressed to throw the item in your hands back into the world. */
export const DROP_KEY = "x";
export const PICKUP_R2 = 190;

/* opts.wild marks something that grew there rather than being dug, which is
   how gatherables.js knows how much of its scatter is left to regrow.
   opts.hold is ticks before it may be picked up, so a thrown item does not
   jump straight back into the pack it was just thrown out of.
   opts.vx / opts.vy throw it, rather than letting it fall where it stood. */
export function spawnDrop(x, y, id, opts){
  const o = opts || {};
  drops.push({ x, y,
               vx: o.vx !== undefined ? o.vx : (rnd()-0.5)*1.2,
               vy: o.vy !== undefined ? o.vy : -0.6-rnd()*0.6,
               id, rot: rnd()*Math.PI, born:0, refused:false,
               hold: o.hold || 0,
               wild: !!o.wild });
}

/* Taking things OUT of the pack and putting them in the world.

   The pack is mass-limited, so being able to put something down is not a
   convenience: without it a player who fills up on the wrong thing is stuck
   with it. Thrown forward and briefly unpickable, or it would be swallowed
   again on the same tick it left. */
export function dropFromPack(id, n=1){
  const have = inventory.count(id);
  const many = Math.min(n, have);
  if(many <= 0) return 0;
  inventory.take(id, many);

  const p = state.player;
  const dir = p.dir || 1;
  for(let i=0;i<many;i++){
    spawnDrop(p.x + dir*6, p.y - 8, id, {
      vx: dir*(1.6 + rnd()*0.8),
      vy: -1.4 - rnd()*0.5,
      hold: 45                       /* ~1.2s at 36 Hz, long enough to walk off */
    });
  }
  bus.emit("item:dropped", { id, n: many, x: p.x, y: p.y });
  return many;
}
export function clearDrops(){ drops.length = 0; }

export function updateDrops(){
  const p = state.player;
  for(let i=drops.length-1;i>=0;i--){
    const it = drops[i];
    it.born++;
    if(shapeInLiquid(DROP_VERTS, it.x, it.y)){
      it.vy += 0.06; it.vx *= 0.92; it.vy *= 0.92;
    } else {
      it.vy += GRAV;
    }
    if(it.vy>MAXFALL) it.vy = MAXFALL;
    const c = moveShape(it, DROP_VERTS, 1);
    if(c.b){
      it.vx *= 0.60;
      if(Math.abs(it.vx)<0.05) it.vx = 0;
    } else {
      it.rot += it.vx*0.05;
    }
    if(c.l || c.r) it.vx *= -0.3;
    if(it.y > state.world.H+30){ drops.splice(i,1); continue; }

    if(it.hold > 0) it.hold--;

    /* A full pack leaves the chunk where it lies. It is not destroyed and it
       is not silently swallowed - come back with room, or a cart.

       Nor does walking across a scattered surface quietly load you up: once
       you are carrying enough to be slowed, things are taken only when you
       ask for them by holding the grab key. Below that line everything is
       picked up automatically, so the early game never asks you to click a
       chunk on the ground. */
    if(it.born>20 && it.hold<=0){
      const dx = it.x-p.x, dy = it.y-p.y;
      if(dx*dx+dy*dy < PICKUP_R2){
        const burdened = inventory.load() >= BURDEN_AT;
        if(burdened && !keys[GRAB_KEY]){
          if(!it.refused){
            it.refused = true;
            bus.emit("pickup:refused", { id: it.id, x: it.x, y: it.y,
                                         reason: "burdened" });
          }
        } else if(inventory.add(it.id, 1) > 0){
          bus.emit("item:collected", { id: it.id, x: it.x, y: it.y });
          drops.splice(i,1);
          continue;
        } else if(!it.refused){
          /* Say so once per approach, not thirty-six times a second. */
          it.refused = true;
          bus.emit("pickup:refused", { id: it.id, x: it.x, y: it.y,
                                       reason: "full" });
        }
      } else if(it.refused) it.refused = false;
    }
  }
}

export function renderDrops(ctx){
  for(let i=0;i<drops.length;i++){
    const it = drops[i], D = itemDef(it.id);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.fillStyle = D.dark;
    ctx.fillRect(-3,-3,6,6);
    ctx.fillStyle = D.col;
    ctx.fillRect(-3,-3,5,5);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(-3,-3,2,2);
    ctx.restore();
  }
}

/* For lane E's save file: the chunks lying about are ours to remember.
   Velocity is kept so a load does not freeze a chunk in mid-fall. */
export function serialiseDrops(){
  return drops.map(d => ({ x:d.x, y:d.y, vx:d.vx, vy:d.vy, id:d.id,
                           rot:d.rot, born:d.born, wild:d.wild, hold:d.hold }));
}
export function restoreDrops(list){
  clearDrops();
  if(!Array.isArray(list)) return;
  for(const d of list){
    if(!d || typeof d.id !== "string") continue;
    drops.push({ x:+d.x||0, y:+d.y||0, vx:+d.vx||0, vy:+d.vy||0, id:d.id,
                 rot:+d.rot||0, born:+d.born||0, refused:false, wild:!!d.wild,
                 hold:+d.hold||0 });
  }
}

/* Every boot builds a fresh set of systems against the same module-level
   bus, so subscribing without detaching first stacks a second listener on
   top of the first: two chunks per dug pixel, two items thrown per keypress.
   Harmless in a game that boots once, wrong in a test run that boots six
   times, and wrong is wrong. */
let detach = [];
function resubscribe(subs){
  for(const off of detach) off();
  detach = subs();
}

export function attachDropSpawning(){
  resubscribe(() => [
    bus.on("dig:yield", e => spawnDrop(e.x, e.y, e.item)),
    bus.on("world:generated", () => { clearDrops(); }),
    bus.on("input:key", e => {
      if(!e.down || e.key !== DROP_KEY) return;
      const held = equipped && equipped();
      if(held) dropFromPack(held.id, 1);
    })
  ]);
}

/* Told by the items system how to find what is in the clonk's hands, so that
   drops.js does not have to import the hotbar and make a cycle of it. */
let equipped = null;
export function attachDropKey(equippedFn){ equipped = equippedFn; }
