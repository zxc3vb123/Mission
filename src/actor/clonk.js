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
import { groundSpeed, airSpeed, gripOf } from "./motion.js";
import { addDust, addSteam, addSplash } from "../core/fx.js";

export const GRAV = 0.28, MAXFALL = 9.0;
export const WALK_SPEED = 2.15, JUMP_V = -4.9;
export const SCALE_SPEED = 1.05, HANGLE_SPEED = 1.05;
export const MANTLE_SPEED = 1.10, MANTLE_LIMIT = 48;
export const SWIM_SPEED = 1.55, DIG_SPEED = 0.80;
export const DIG_RADIUS = 9, DIG_REACH = 4;
/* The pace DIG_SPEED was tuned to: a stone shovel in earth, 360 px/s from
   lane A's digSpeedFor. Everything else is scaled off it, so bare hands in
   soil (90 px/s) advance at a quarter of that and a better shovel of the
   same kind is honestly faster. */
export const DIG_REF_RATE = 360;
export const DIG_MIN_SCALE = 0.12;

export const CLONK_VERTS = [[0,-8],[-3,-6],[3,-6],[-3,0],[3,0],[-3,6],[3,6],[0,8]];
export const DIG_VERTS   = [[0,-5],[-3,-3],[3,-3],[-3,3],[3,3],[0,5]];

export const clonk = {
  x:0, y:0, vx:0, vy:0, dir:1, act:"FLIGHT",
  energy:100, breath:100, walkPhase:0, digPhase:0,
  digX:1, digY:0, stuck:0, jumpLatch:0, digRate:0, chop:0,
  mantle:0, mantleX:0, mantleY:0, mantleT:0,   /* pulling up over a lip */
  grip:0.65                       /* grip of the last ground it stood on */
};

export function createClonkController(world, getTool = () => null){

  function respawn(){
    clonk.x = state.world.spawn.x;
    clonk.y = state.world.spawn.y;
    clonk.vx = 0; clonk.vy = 0;
    clonk.act = "FLIGHT";
    clonk.energy = 100; clonk.breath = 100; clonk.stuck = 0;
    clonk.mantle = 0; clonk.mantleT = 0;
    while(shapeBlocked(CLONK_VERTS, clonk.x, clonk.y) && clonk.y > 20) clonk.y -= 1;
    publish();
  }

  function publish(){
    const p = state.player;
    p.x = clonk.x; p.y = clonk.y; p.dir = clonk.dir; p.act = clonk.act;
    p.energy = clonk.energy; p.breath = clonk.breath;
    p.aim.x = clonk.digX; p.aim.y = clonk.digY;
    p.digging = clonk.act === "DIG";
    p.chop = clonk.chop;              /* 0..1 while felling, 0 otherwise */
  }

  /* Grip of the ground under the feet. Sampled across the width of the body
     and two rows down, because on a slope or a ledge edge a single probe
     misses the floor and the character would go mysteriously slippery. Only
     solid pixels count; if none are found we keep the last known footing. */
  function footingGrip(){
    const x = Math.round(clonk.x), y = Math.round(clonk.y);
    let best = 0;
    for(let dy=8; dy<=10; dy++){
      for(let dx=-3; dx<=3; dx+=3){
        const m = world.matInfo(x+dx, y+dy);
        if(m.density>=50 && m.friction>best) best = m.friction;
      }
    }
    if(best>0) clonk.grip = gripOf(best);
    return clonk.grip;
  }
  /* The face this tool is working: the first solid pixel along the aim,
     within the reach of the swing. Returns how fast this tool eats that
     material in px/s, 0 if it cannot cut it at all - which is the cue to
     stop the swing rather than grind - and -1 when there is nothing solid
     ahead, so the swing is cutting air. */
  function rateAhead(dvx, dvy, tool){
    for(let d=2; d<=DIG_REACH+DIG_RADIUS; d++){
      const x = Math.round(clonk.x+dvx*d), y = Math.round(clonk.y+dvy*d);
      if(!world.isSolid(x,y)) continue;
      return world.digSpeedFor(world.matAt(x,y), tool);
    }
    return -1;
  }

  /* The top of the wall you are holding, if the body can stand on it.
     Climbing a face and then being unable to get over the lip is the single
     most annoying thing a climb can do, so a flat top is the reliable case
     rather than the lucky one. Returns where the feet would land.

     Note the geometry this has to beat: the wall grip dies once the body's
     centre is 2px above the lip, so anything that waits for the body to be
     clear of the top before pulling up can never fire. This looks UP for the
     lip instead of waiting to be above it. */
  function mantleTarget(wallDir){
    const x = Math.round(clonk.x), y = Math.round(clonk.y);
    const probe = x + wallDir*6;
    let lip = 0, found = false;
    for(let dy=-12; dy<=4 && !found; dy++){
      const row = y + dy;
      if(!world.isSolid(probe, row)) continue;
      if(world.isSolid(probe, row-1)) return null;   /* the wall carries on up */
      lip = row; found = true;
    }
    if(!found) return null;

    /* Where the feet land. Step far enough in that the WHOLE footprint is
       over the top: a mantle that ends with the body overhanging drops
       straight back down the face, which looks exactly like failing to climb.
       Both foot vertices supported is the good landing; the centre alone is
       the fallback, for a ledge too narrow to stand square on. */
    const ny = lip - 9;
    let fallback = null;
    for(let off=5; off<=10; off++){
      const cx = x + wallDir*off;
      if(shapeBlocked(CLONK_VERTS, cx, ny)) continue;
      if(world.isSolid(cx-3, lip) && world.isSolid(cx+3, lip)) return { x: cx, y: ny };
      if(!fallback && world.isSolid(cx, lip)) fallback = { x: cx, y: ny };
    }
    return fallback;
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

    /* What is in the hands gates every dig. null is a real tool id to lane
       A's API - it means bare hands, and hands are gated like anything else.
       Only omitting the argument turns the gate off, which is for tests and
       machines that carry their own rules, not for a character. */
    const tool = getTool();
    /* The face is probed further than the dig circle reaches, so holding the
       button keeps the swing going as the body follows its own tunnel. Probe
       only as far as the circle, and the tunnel is always already clear when
       the next tick asks - the character would drop back to WALK and stroll
       through at walking pace, which is how a shovel used to reach uranium. */
    const faceRate = rateAhead(dvx, dvy, tool);
    const canCutAhead = faceRate > 0 ||
                        world.anyDiggable(digTargetX, digTargetY, DIG_RADIUS-1, tool);
    /* A tree in the swing takes the swing, whatever the ground behind it is
       made of. Wood has exactly one source, so this is the whole of stage 0's
       supply of it. */
    const treeAhead = world.treeAt(digTargetX, digTargetY, DIG_RADIUS);
    /* Buried: dig your way out, but only through material this tool can cut.
       Otherwise the swing would grind forever and the stuck timer would never
       run, because it does not count DIG ticks. */
    const canCutOut = shapeBlocked(DIG_VERTS, c.x, c.y) &&
                      world.anyDiggable(c.x, c.y, DIG_RADIUS-1, tool);

    if(wantDig && !bodyLiq && (treeAhead || canCutAhead || canCutOut)){
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
        /* a pull-up carries on past the point where the wall is still there
           to hold, which is the whole reason it can finish */
        if(!wallDir && !c.mantle) c.act = onGround ? "WALK" : "FLIGHT";
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
      const grip = footingGrip();
      const target = ((right?1:0)-(left?1:0)) * WALK_SPEED;
      c.vx = groundSpeed(c.vx, target, grip);
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
      c.vx = airSpeed(c.vx, air);
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
      const climbDir = c.mantle || wallDir;

      /* Reaching for the top beats jumping off it. The wall jump below is how
         you leave a wall on purpose, so it stays - but it only answers when
         there is no lip within reach, which is where you actually want it. */
      if(up && !c.mantle){
        const m = mantleTarget(climbDir);
        if(m){ c.mantle = climbDir; c.mantleX = m.x; c.mantleY = m.y; c.mantleT = 0; }
      }

      if(c.mantle){
        c.mantleT++;
        if(c.y > c.mantleY + 0.5){            /* rise until the feet clear the lip */
          c.vx = 0; c.vy = -MANTLE_SPEED;
        } else {                               /* then step in over it */
          c.vy = 0; c.vx = c.mantle*MANTLE_SPEED;
        }
        moveShape(c, CLONK_VERTS, 3);
        const over = c.mantle > 0 ? c.x >= c.mantleX-0.5 : c.x <= c.mantleX+0.5;
        if(over && c.y <= c.mantleY + 0.5){
          c.mantle = 0; c.vx = 0; c.vy = 0;
          c.jumpLatch = 1;                     /* do not hop straight off again */
          c.act = "WALK";
        } else if(c.mantleT > MANTLE_LIMIT || (!up && !keys[" "])){
          c.mantle = 0; c.act = "FLIGHT";      /* gave up, or the player let go */
        }
        c.walkPhase += 0.18;
        break;
      }

      c.vx = wallDir*0.35;
      c.vy = up ? -SCALE_SPEED : (down ? SCALE_SPEED*1.6 : 0);
      if(keys[" "] && !c.jumpLatch){
        c.vx = -wallDir*2.4; c.vy = -3.4; c.act = "FLIGHT"; c.jumpLatch = 1;
        moveShape(c, CLONK_VERTS, 0);
        break;
      }
      moveShape(c, CLONK_VERTS, 0);
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
      /* A swing is spent on the tree, not on the ground behind it. Without an
         axe the swing still lands - it just does nothing but thud, which is
         what tells the player it is the tool that is wrong and not the aim. */
      if(treeAhead){
        const ch = world.chopAt(digTargetX, digTargetY, DIG_RADIUS, tool);
        c.chop = ch.canChop ? ch.progress : 0;
        c.vx = groundSpeed(c.vx, 0, footingGrip());
        c.vy += GRAV;
        moveShape(c, CLONK_VERTS, 2);
        c.digPhase += ch.canChop ? 0.35 : 0.12;
        if(!ch.canChop && hash2(rx,ry,state.tick)<0.06)
          addDust(digTargetX, digTargetY, "rgb(150,110,66)");
        break;
      }
      c.chop = 0;
      const res = world.digFreeCircle(c.x + dvx*DIG_REACH, c.y + dvy*DIG_REACH,
                                      DIG_RADIUS, true, tool);
      /* How fast the tool eats this material sets how fast the body follows
         its own tunnel - the circle is cut around the body, so the advance
         rate IS the dig rate. Cutting air is free; a face this tool cannot
         cut, reached only because something off-axis is diggable, is the
         slowest going there is. */
      const scale = faceRate < 0 ? 1
                  : faceRate === 0 ? DIG_MIN_SCALE
                  : clamp(faceRate/DIG_REF_RATE, DIG_MIN_SCALE, 1);
      c.digRate = faceRate;
      c.vx = dvx*DIG_SPEED*scale;
      c.vy = dvy*DIG_SPEED*scale + 0.05;
      moveShape(c, DIG_VERTS, 1);
      c.digPhase += 0.35*scale;
      if(res.freed===0 && res.blocked && hash2(rx,ry,state.tick)<0.10)
        addDust(digTargetX, digTargetY, "rgb(150,150,156)");
      break;
    }
    }

    if(c.act !== "DIG") c.chop = 0;
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
