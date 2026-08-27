/* The player character. LANE B (actor).

   Procedures: WALK, FLIGHT, SCALE (climbing a wall), HANGLE (hanging from
   a ceiling), SWIM, DIG. Collision runs through core/shape.js vertices, so
   the character walks over bumps, gets stopped by undiggable material and
   can be buried by collapsing sand.

   This lane writes state.player every tick - that is the pose every other
   lane reads (camera, lighting, buildings). */

import { state } from "../core/state.js";
import { keys, mouse } from "../core/input.js";
import { bus } from "../core/bus.js";
import { hash2, rnd, clamp } from "../core/rng.js";
import { moveShape, shapeBlocked } from "../core/shape.js";
import { addDust, addSteam, addSplash } from "../core/fx.js";

export const GRAV = 0.28, MAXFALL = 9.0;
export const WALK_SPEED = 2.15, JUMP_V = -4.9;
export const SCALE_SPEED = 1.05, HANGLE_SPEED = 1.05;
export const SWIM_SPEED = 1.55, DIG_SPEED = 0.80;
export const DIG_RADIUS = 9, DIG_REACH = 4;

export const CLONK_VERTS = [[0,-8],[-3,-6],[3,-6],[-3,0],[3,0],[-3,6],[3,6],[0,8]];
export const DIG_VERTS   = [[0,-5],[-3,-3],[3,-3],[-3,3],[3,3],[0,5]];

export const clonk = {
  x:0, y:0, vx:0, vy:0, dir:1, act:"FLIGHT",
  energy:100, breath:100, walkPhase:0, digPhase:0,
  digX:1, digY:0, stuck:0, jumpLatch:0
};

export function createClonkController(world){

  function respawn(){
    clonk.x = state.world.spawn.x;
    clonk.y = state.world.spawn.y;
    clonk.vx = 0; clonk.vy = 0;
    clonk.act = "FLIGHT";
    clonk.energy = 100; clonk.breath = 100; clonk.stuck = 0;
    while(shapeBlocked(CLONK_VERTS, clonk.x, clonk.y) && clonk.y > 20) clonk.y -= 1;
    publish();
  }

  function publish(){
    const p = state.player;
    p.x = clonk.x; p.y = clonk.y; p.dir = clonk.dir; p.act = clonk.act;
    p.energy = clonk.energy; p.breath = clonk.breath;
    p.aim.x = clonk.digX; p.aim.y = clonk.digY;
    p.digging = clonk.act === "DIG";
  }

  function groundFriction(){
    const f = world.matInfo(Math.round(clonk.x), Math.round(clonk.y+9)).friction;
    return clamp(f,10,100)/100;
  }
  function dustCol(x,y){
    const c = world.matInfo(x,y).col;
    return "rgb("+c[0]+","+c[1]+","+c[2]+")";
  }

  function tick(){
    const c = clonk;
    const left  = keys["a"]||keys["arrowleft"];
    const right = keys["d"]||keys["arrowright"];
    const up    = keys["w"]||keys["arrowup"]||keys[" "];
    const down  = keys["s"]||keys["arrowdown"];
    const wantDig = mouse.down || !!keys["shift"];

    const rx = Math.round(c.x), ry = Math.round(c.y);
    const headLiq = world.isLiquid(rx, ry-6);
    const bodyLiq = world.isLiquid(rx, ry) || world.isLiquid(rx, ry+4);

    /* --- hazards --- */
    let touchLava = false;
    for(let v=0;v<CLONK_VERTS.length;v++){
      if(world.matInfo(rx+CLONK_VERTS[v][0], ry+CLONK_VERTS[v][1]).incendiary){ touchLava = true; break; }
    }
    if(touchLava){
      c.energy -= 3.5;
      if(hash2(rx,ry,state.tick)<0.6) addSteam(rx, ry-4);
    }
    if(headLiq){
      c.breath -= 0.55;
      if(c.breath<0){ c.breath = 0; c.energy -= 0.9; }
      if(hash2(rx,ry,state.tick)<0.04) addSplash(rx+(rnd()-0.5)*4, ry-6, "rgba(190,220,255,0.8)");
    } else {
      c.breath = Math.min(100, c.breath+2.2);
    }
    if(c.energy<=0){
      c.energy = 0;
      for(let k=0;k<24;k++) addSplash(c.x, c.y, "rgba(210,90,70,0.85)");
      bus.emit("player:died", { x:c.x, y:c.y });
      respawn();
      return;
    }

    /* --- aim --- */
    let dvx, dvy;
    if(mouse.down){
      dvx = mouse.wx - c.x; dvy = mouse.wy - c.y;
    } else {
      dvx = (right?1:0)-(left?1:0);
      dvy = (down?1:0)-(up?1:0);
      if(!dvx && !dvy){ dvx = c.dir; dvy = 0; }
    }
    const dl = Math.sqrt(dvx*dvx+dvy*dvy) || 1;
    dvx /= dl; dvy /= dl;
    c.digX = dvx; c.digY = dvy;

    /* --- choose the procedure --- */
    const onGround = !bodyLiq && shapeBlocked(CLONK_VERTS, c.x, c.y+1.5) && c.vy>=0;
    const digTargetX = c.x + dvx*DIG_REACH, digTargetY = c.y + dvy*DIG_REACH;

    if(wantDig && !bodyLiq &&
       (world.anyDiggable(digTargetX, digTargetY, DIG_RADIUS-1) || shapeBlocked(DIG_VERTS,c.x,c.y))){
      c.act = "DIG";
    } else if(bodyLiq){
      c.act = "SWIM";
    } else if(c.act==="DIG" || c.act==="SWIM"){
      c.act = onGround ? "WALK" : "FLIGHT";
    }

    let wallDir = 0;
    if(right && (world.isSolid(rx+4, ry-2) || world.isSolid(rx+4, ry+2))) wallDir = 1;
    else if(left && (world.isSolid(rx-4, ry-2) || world.isSolid(rx-4, ry+2))) wallDir = -1;
    const ceiling = world.isSolid(rx, ry-10) || world.isSolid(rx-2, ry-10) || world.isSolid(rx+2, ry-10);

    if(c.act!=="DIG" && c.act!=="SWIM"){
      if(c.act==="SCALE"){
        if(!wallDir) c.act = onGround ? "WALK" : "FLIGHT";
      } else if(c.act==="HANGLE"){
        if(!ceiling || down) c.act = "FLIGHT";
      } else {
        if(wallDir && !onGround) c.act = "SCALE";
        else if(wallDir && onGround && up) c.act = "SCALE";
        else if(ceiling && up && !onGround && c.vy>-0.5) c.act = "HANGLE";
        else c.act = onGround ? "WALK" : "FLIGHT";
      }
    }

    if(left) c.dir = -1; else if(right) c.dir = 1;
    if(c.act==="DIG" && Math.abs(dvx)>0.2) c.dir = dvx>0?1:-1;

    let contact;
    switch(c.act){

    case "WALK": {
      const fr = groundFriction();
      const target = ((right?1:0)-(left?1:0)) * WALK_SPEED;
      c.vx += (target - c.vx)*(0.30 + 0.35*fr);
      if(Math.abs(c.vx)<0.05) c.vx = 0;
      c.vy += GRAV;
      if(up && !c.jumpLatch){
        c.vy = JUMP_V; c.act = "FLIGHT"; c.jumpLatch = 1;
        for(let j=0;j<4;j++) addDust(c.x+(rnd()-0.5)*5, c.y+8, dustCol(rx,ry+9));
      }
      contact = moveShape(c, CLONK_VERTS, 5);
      if(!contact.b && c.vy>=0 && c.vy<2){
        for(let s=1;s<=4;s++){
          if(shapeBlocked(CLONK_VERTS, c.x, c.y+s)){ c.y += s-1; c.vy = 0; break; }
        }
      }
      c.walkPhase += Math.abs(c.vx)*0.30;
      break;
    }

    case "FLIGHT": {
      const air = ((right?1:0)-(left?1:0)) * WALK_SPEED;
      c.vx += (air - c.vx)*0.09;
      c.vy += GRAV;
      if(c.vy>MAXFALL) c.vy = MAXFALL;
      contact = moveShape(c, CLONK_VERTS, 0);
      if(contact.b){
        if(contact.impact > 6.5){
          c.energy -= (contact.impact-6.5)*7;
          state.cam.shake = 8; state.cam.shakeMag = 2;
          for(let d=0;d<8;d++) addDust(c.x+(rnd()-0.5)*8, c.y+8, dustCol(rx,ry+9));
        }
        c.act = "WALK";
      }
      break;
    }

    case "SCALE": {
      c.vx = wallDir*0.35;
      c.vy = up ? -SCALE_SPEED : (down ? SCALE_SPEED*1.6 : 0);
      if(keys[" "] && !c.jumpLatch){
        c.vx = -wallDir*2.4; c.vy = -3.4; c.act = "FLIGHT"; c.jumpLatch = 1;
        moveShape(c, CLONK_VERTS, 0);
        break;
      }
      moveShape(c, CLONK_VERTS, 0);
      if(up && !world.isSolid(Math.round(c.x)+wallDir*4, Math.round(c.y)-4)
            && !shapeBlocked(CLONK_VERTS, c.x+wallDir*3, c.y-3)){
        c.x += wallDir*2; c.y -= 3; c.vy = -1.4; c.act = "FLIGHT";
      }
      c.walkPhase += 0.18;
      break;
    }

    case "HANGLE": {
      c.vy = 0;
      c.vx = ((right?1:0)-(left?1:0)) * HANGLE_SPEED;
      moveShape(c, CLONK_VERTS, 0);
      if(!world.isSolid(Math.round(c.x), Math.round(c.y)-10)){
        if(world.isSolid(Math.round(c.x), Math.round(c.y)-11)) c.y += 1;
        else c.act = "FLIGHT";
      } else if(world.isSolid(Math.round(c.x), Math.round(c.y)-9)) c.y += 1;
      c.walkPhase += Math.abs(c.vx)*0.35;
      break;
    }

    case "SWIM": {
      const tx = ((right?1:0)-(left?1:0)) * SWIM_SPEED;
      const ty = ((down?1:0)-(up?1:0)) * SWIM_SPEED*0.9;
      c.vx += (tx - c.vx)*0.18;
      c.vy += (ty - c.vy)*0.18;
      c.vy += headLiq ? 0.06 : 0.24;
      if(!headLiq && !up) c.vy += 0.10;
      c.vx *= 0.94; c.vy *= 0.94;
      moveShape(c, CLONK_VERTS, 3);
      c.walkPhase += 0.16;
      break;
    }

    case "DIG": {
      const res = world.digFreeCircle(c.x + dvx*DIG_REACH, c.y + dvy*DIG_REACH, DIG_RADIUS, true);
      c.vx = dvx*DIG_SPEED;
      c.vy = dvy*DIG_SPEED + 0.05;
      moveShape(c, DIG_VERTS, 1);
      c.digPhase += 0.35;
      if(res.freed===0 && res.blocked && hash2(rx,ry,state.tick)<0.10)
        addDust(digTargetX, digTargetY, "rgb(150,150,156)");
      break;
    }
    }

    if(!up && !keys[" "]) c.jumpLatch = 0;

    /* being buried */
    if(shapeBlocked(CLONK_VERTS, c.x, c.y) && c.act!=="DIG"){
      c.stuck++;
      if(c.stuck>150){
        outer:
        for(let r=1;r<=18;r++){
          for(let a=0;a<16;a++){
            const ang = a/16*6.283;
            const nx = c.x + Math.cos(ang)*r, ny = c.y + Math.sin(ang)*r;
            if(!shapeBlocked(CLONK_VERTS,nx,ny)){ c.x = nx; c.y = ny; c.stuck = 0; break outer; }
          }
        }
      }
    } else c.stuck = 0;

    c.x = clamp(c.x, 4, state.world.W-5);
    if(c.y > state.world.H+40) respawn();

    publish();
  }

  return { tick, respawn, clonk };
}
