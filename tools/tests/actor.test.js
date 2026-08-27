/* LANE B owns this file: character movement and digging behaviour. */

import { boot, suite, countSolid, findMaterial } from "../testkit.js";
import { M_EARTH, M_GRANITE, M_TUNNEL } from "../../src/world/materials.js";
import { WALK_SPEED } from "../../src/actor/clonk.js";
import { groundSpeed, airSpeed, gripOf, ticksToSpeed } from "../../src/actor/motion.js";

export function run(){
  const t = suite("actor");
  const g = boot(777001);
  const W = g.world;

  g.tick(140);
  t.check("the clonk lands and stands", g.state.player.act==="WALK" || g.state.player.act==="SCALE",
          g.state.player.act+" at y="+g.state.player.y.toFixed(0));
  t.check("the clonk is above bedrock", g.state.player.y < W.size().H-60);

  /* walking moves it sideways */
  const x0 = g.state.player.x;
  g.press("d"); g.tick(40); g.releaseAll(); g.tick(5);
  t.check("walking moves the clonk", Math.abs(g.state.player.x-x0) > 12,
          "dx="+(g.state.player.x-x0).toFixed(1));

  /* digging through earth */
  const spot = findMaterial(W, M_EARTH, 60);
  if(spot){
    const before = countSolid(W, spot.x-25, spot.y-25, 60, 50);
    g.actor.clonk.x = spot.x; g.actor.clonk.y = spot.y;
    g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
    g.press("shift"); g.press("d");
    g.tick(90);
    g.releaseAll();
    const after = countSolid(W, spot.x-25, spot.y-25, 60, 50);
    t.check("digging tunnels through earth", after < before-200, before+" -> "+after);
    t.check("the clonk advances while digging", g.actor.clonk.x > spot.x+8,
            "dx="+(g.actor.clonk.x-spot.x).toFixed(1));
  } else t.check("found earth to dig through", false);

  /* granite stops the clonk */
  {
    const { W:LW, H:LH } = W.size();
    let gx=-1, gy=-1;
    for(let y=LH-8;y>LH-50 && gx<0;y--)
      for(let x=200;x<LW-200;x+=11)
        if(W.matAt(x,y)===M_GRANITE && W.matAt(x+12,y)===M_GRANITE){ gx=x; gy=y; break; }
    if(gx>0){
      W.digFreeCircle(gx-14, gy, 8, false);          /* a pocket to stand in */
      g.actor.clonk.x = gx-14; g.actor.clonk.y = gy;
      g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
      g.press("shift"); g.press("d");
      g.tick(80);
      g.releaseAll();
      t.check("granite stops the clonk", g.actor.clonk.x < gx+2,
              "x="+g.actor.clonk.x.toFixed(1)+" granite at "+gx);
    } else t.check("found a granite wall", false);
  }

  /* ---------------------------------------------------------------- *
     Momentum. Measured in a granite corridor cut for the purpose, so the
     ground under the feet is known and the run is long enough to finish.
   * ---------------------------------------------------------------- */
  {
    const { W:LW } = W.size();
    const bx = Math.round(LW*0.30), by = W.surfaceAt(bx) + 140;
    for(let x=bx-40; x<=bx+420; x++){
      for(let y=by-26; y<by; y++) W.setMat(x, y, M_TUNNEL);
      for(let y=by; y<=by+8; y++) W.setMat(x, y, M_GRANITE);
    }
    const place = () => {
      g.releaseAll();
      g.actor.clonk.x = bx; g.actor.clonk.y = by-9;
      g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
      g.actor.clonk.act = "WALK";
      g.tick(1);
    };

    /* a standing start is not an instant sprint */
    place();
    g.press("d"); g.tick(1);
    const v1 = g.actor.clonk.vx;
    t.check("a standing start accelerates rather than snapping to speed",
            v1 > 0 && v1 < WALK_SPEED*0.5, "vx after one tick = "+v1.toFixed(3));

    g.tick(30);
    const vTop = g.actor.clonk.vx;
    t.check("a run still reaches full walking speed", vTop > WALK_SPEED*0.95,
            "vx="+vTop.toFixed(2)+" of "+WALK_SPEED);

    /* turning at full speed has to brake through zero first */
    g.press("d", false); g.press("a");
    g.tick(1);
    t.check("no instant direction flip at full speed", g.actor.clonk.vx > 0,
            "vx="+g.actor.clonk.vx.toFixed(2)+" one tick after reversing");
    let flip = 1;
    while(g.actor.clonk.vx > 0 && flip < 60){ g.tick(1); flip++; }
    t.check("turning round takes a handful of ticks", flip >= 4 && flip < 40,
            flip+" ticks to lose the old direction");
    g.tick(30);
    t.check("but it does turn round in the end", g.actor.clonk.vx < -WALK_SPEED*0.8,
            "vx="+g.actor.clonk.vx.toFixed(2));

    /* letting go coasts to a stop instead of stopping dead */
    place();
    g.press("d"); g.tick(40);
    const vRun = g.actor.clonk.vx, xRun = g.actor.clonk.x;
    g.releaseAll(); g.tick(1);
    t.check("letting go does not stop the clonk dead",
            g.actor.clonk.vx > 0 && g.actor.clonk.vx < vRun,
            vRun.toFixed(2)+" -> "+g.actor.clonk.vx.toFixed(2));
    g.tick(25);
    const slide = g.actor.clonk.x - xRun;
    t.check("it slides on before it settles", slide > 4 && g.actor.clonk.vx === 0,
            "slid "+slide.toFixed(1)+"px, vx="+g.actor.clonk.vx.toFixed(2));
  }

  /* the curve itself, without a world in the way */
  {
    const rock = gripOf(100), sand = gripOf(35);
    t.check("slippery ground takes longer to get going",
            ticksToSpeed(0, WALK_SPEED, sand) > ticksToSpeed(0, WALK_SPEED, rock)*2,
            ticksToSpeed(0,WALK_SPEED,sand)+" ticks on sand vs "+ticksToSpeed(0,WALK_SPEED,rock)+" on rock");
    t.check("and longer to stop",
            ticksToSpeed(WALK_SPEED, 0, sand) > ticksToSpeed(WALK_SPEED, 0, rock)*2,
            ticksToSpeed(WALK_SPEED,0,sand)+" ticks on sand vs "+ticksToSpeed(WALK_SPEED,0,rock)+" on rock");
    t.check("grip never reaches zero, so nothing is frictionless",
            gripOf(0) > 0 && gripOf(0) < gripOf(100));
    t.check("one tick never crosses from full speed to full reverse",
            groundSpeed(WALK_SPEED, -WALK_SPEED, 1) > 0);
    t.check("air steering cannot beat the momentum you already have",
            airSpeed(2.4, WALK_SPEED) === 2.4);
    t.check("air steering turns you slowly, not instantly",
            airSpeed(WALK_SPEED, -WALK_SPEED) > 0 &&
            airSpeed(WALK_SPEED, -WALK_SPEED) < WALK_SPEED);
  }

  /* the pose other lanes read is published every tick */
  g.tick(2);
  t.check("state.player mirrors the clonk",
          Math.abs(g.state.player.x-g.actor.clonk.x) < 0.001 &&
          Math.abs(g.state.player.y-g.actor.clonk.y) < 0.001);

  return t;
}
