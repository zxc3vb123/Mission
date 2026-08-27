/* LANE A owns this file: darkness and the head lamp. */

import { boot, suite } from "../testkit.js";
import { computeLight, lightAt, lightConfig } from "../../src/world/lighting.js";

function lightAround(px, py, half){
  computeLight({ x0: px-half, x1: px+half, y0: py-half, y1: py+half });
}

export function run(){
  const t = suite("lighting");
  const g = boot(90210);
  const W = g.world;
  const { W:LW, H:LH } = W.size();

  /* a spot in the open, and a spot deep underground */
  const sx = g.state.world.spawn.x;
  const skyY = W.surfaceAt(sx) - 30;
  const deepY = Math.min(LH-120, W.surfaceAt(sx) + 320);

  /* --- with the lamp off --- */
  g.state.player.lamp.on = false;
  g.state.player.x = sx; g.state.player.y = deepY;
  lightAround(sx, skyY, 160);
  t.check("open sky is fully lit", lightAt(sx, skyY) > 0.85, lightAt(sx, skyY).toFixed(2));

  lightAround(sx, deepY, 160);
  const darkDeep = lightAt(sx, deepY);
  t.check("deep ground is dark without a lamp", darkDeep < 0.08, darkDeep.toFixed(3));

  /* --- with the lamp on --- */
  g.state.player.lamp.on = true;
  g.state.player.aim.x = 1; g.state.player.aim.y = 0;
  W.digFreeCircle(sx, deepY, 12, false);            /* stand in a small cave */
  lightAround(sx, deepY, 160);
  const atLamp = lightAt(sx, deepY);
  const nearLamp = lightAt(sx+14, deepY);
  const farFromLamp = lightAt(sx+150, deepY);
  t.check("the lamp lights the clonk's own position", atLamp > 0.6, atLamp.toFixed(2));
  t.check("the lamp lights a little way out", nearLamp > 0.15, nearLamp.toFixed(2));
  t.check("light does not reach far away", farFromLamp < 0.25, farFromLamp.toFixed(2));

  /* --- the aimed cone reaches further than the sides --- */
  {
    const room = 90;
    for(let k=0;k<12;k++) W.digFreeCircle(sx+k*8, deepY, 9, false);   /* a corridor */
    g.state.player.aim.x = 1; g.state.player.aim.y = 0;
    lightAround(sx, deepY, 200);
    const ahead = lightAt(sx+70, deepY);
    g.state.player.aim.x = -1;
    lightAround(sx, deepY, 200);
    const behind = lightAt(sx+70, deepY);
    t.check("the aimed direction is lit further than behind", ahead > behind,
            "ahead "+ahead.toFixed(2)+" vs behind "+behind.toFixed(2));
    void room;
  }

  /* --- lava lights its own cavern --- */
  {
    let lx=-1, ly=-1;
    for(let y=LH-60;y>LH-260 && lx<0;y-=2)
      for(let x=100;x<LW-100;x+=7)
        if(W.matAt(x,y)===24){ lx=x; ly=y; break; }        /* M_LAVA */
    if(lx>0){
      g.state.player.lamp.on = false;
      g.state.player.x = -9999; g.state.player.y = -9999;
      lightAround(lx, ly, 90);
      t.check("lava glows on its own", lightAt(lx, ly-6) > 0.25, lightAt(lx, ly-6).toFixed(2));
      g.state.player.lamp.on = true;
    } else t.check("found lava to check the glow", false);
  }

  t.check("darkness can be switched off for debugging", lightConfig.enabled === true);
  return t;
}
