/* Chunks lying on the ground. LANE C (items).

   Digging emits "dig:yield"; this turns that into a physical chunk that
   falls, sinks in liquid and is picked up when the player walks over it. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { rnd } from "../core/rng.js";
import { moveShape, shapeInLiquid } from "../core/shape.js";
import { itemDef } from "./itemdefs.js";
import { inventory } from "./inventory.js";

export const drops = [];
export const DROP_VERTS = [[-2,-2],[2,-2],[-2,2],[2,2],[0,3]];

const GRAV = 0.28, MAXFALL = 9.0;
export const PICKUP_R2 = 190;

export function spawnDrop(x, y, id){
  drops.push({ x, y, vx:(rnd()-0.5)*1.2, vy:-0.6-rnd()*0.6, id,
               rot: rnd()*Math.PI, born:0 });
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

    if(it.born>20){
      const dx = it.x-p.x, dy = it.y-p.y;
      if(dx*dx+dy*dy < PICKUP_R2){
        inventory.add(it.id, 1);
        bus.emit("item:collected", { id: it.id, x: it.x, y: it.y });
        drops.splice(i,1);
      }
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

export function attachDropSpawning(){
  bus.on("dig:yield", e => spawnDrop(e.x, e.y, e.item));
  bus.on("world:generated", () => { clearDrops(); });
}
