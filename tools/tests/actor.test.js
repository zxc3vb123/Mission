/* LANE B owns this file: character movement and digging behaviour. */

import { boot, suite, countSolid, findMaterial } from "../testkit.js";
import { M_EARTH, M_GRANITE } from "../../src/world/materials.js";

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

  /* the pose other lanes read is published every tick */
  g.tick(2);
  t.check("state.player mirrors the clonk",
          Math.abs(g.state.player.x-g.actor.clonk.x) < 0.001 &&
          Math.abs(g.state.player.y-g.actor.clonk.y) < 0.001);

  return t;
}
