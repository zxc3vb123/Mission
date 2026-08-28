/* LANE A owns this file: darkness and the head lamp. */

import { boot, suite } from "../testkit.js";
import { computeLight, lightAt, lightConfig, lightSourceCount,
         clearLightSources } from "../../src/world/lighting.js";
import { M_GRANITE, M_TUNNEL, M_EARTH } from "../../src/world/materials.js";
import { bus } from "../../src/core/bus.js";

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
  /* ------------------------------------------- a lamp you can put down ---
     Darkness is the early antagonist, so a light you can leave behind is a
     mechanic rather than a decoration: it is the difference between
     exploring a shaft and holding a torch in the hand you wanted to dig
     with. */
  {
    clearLightSources();
    g.state.player.lamp.on = false;
    /* a sealed room with a wall down the middle, well away from daylight */
    const bx = Math.round(g.state.cam.x) - 60, by = W.surfaceAt(bx) + 140;
    for(let y = by-6; y <= by+40; y++)
      for(let x = bx-6; x <= bx+130; x++) W.setMat(x, y, M_GRANITE);
    for(let y = by; y < by+34; y++)
      for(let x = bx; x < bx+120; x++) W.setMat(x, y, M_TUNNEL);
    for(let y = by; y < by+34; y++)
      for(let x = bx+58; x < bx+64; x++) W.setMat(x, y, M_EARTH);   /* the wall */
    g.tick(5);
    const look = () => computeLight({ x0: bx-10, y0: by-10, x1: bx+130, y1: by+44 });

    look();
    t.check("a sealed room is dark to begin with",
            lightAt(bx+30, by+16) < 0.05, lightAt(bx+30, by+16).toFixed(3));

    W.addLightSource("fire", { x: bx+30, y: by+16, r: 70, power: 1 });
    look();
    t.check("a light put down lights the room it is in",
            lightAt(bx+30, by+16) > 0.7, lightAt(bx+30, by+16).toFixed(2));
    t.check("and does not shine through solid rock",
            lightAt(bx+90, by+16) < 0.05,
            "far side of the wall " + lightAt(bx+90, by+16).toFixed(3));

    W.removeLightSource("fire");
    look();
    t.check("taking it away puts the dark back",
            lightAt(bx+30, by+16) < 0.05 && W.lightSourceCount() === 0);

    /* a torch wedged in a wall goes out when the wall does */
    {
      let out = null;
      const off = bus.on("light:out", e => { out = e.id; });
      W.addLightSource("torch", { x: bx+56, y: by+16, r: 50, power: 1,
                                  attach: { x: bx+60, y: by+16 } });
      look();
      t.check("a torch fixed to a wall lights from it",
              lightAt(bx+50, by+16) > 0.4, lightAt(bx+50, by+16).toFixed(2));
      W.digFreeCircle(bx+60, by+16, 4, false);
      g.tick(3);
      look();
      t.check("and goes out when that wall is dug away, rather than hanging in the air",
              W.lightSourceCount() === 0 && lightAt(bx+50, by+16) < 0.05 && out === "torch",
              "sources " + W.lightSourceCount() + ", event " + out);
      off && off();
    }

    /* a structure that declares no light registers none */
    {
      bus.emit("structure:placed", { defId: "workbench", x: bx+10, y: by+20, rot: false });
      t.check("a structure that does not declare light does not make any",
              W.lightSourceCount() === 0);
    }
    clearLightSources();
  }

  return t;
}
