/* LANE B owns this file: character movement and digging behaviour. */

import { boot, suite, countSolid, findMaterial } from "../testkit.js";
import { bus } from "../../src/core/bus.js";
import { heldLook } from "../../src/actor/render_actor.js";
import { M_EARTH, M_GRANITE, M_TUNNEL, M_COAL } from "../../src/world/materials.js";
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
    /* Granite floor, granite roof, granite end caps. The roof matters: cutting
       a bare hole underground undermines whatever is above it, and collapsing
       sand lands on the floor - which changes the grip under the feet, or
       blocks the run outright. Sealing it keeps this a measurement of the
       movement code rather than of the weather. */
    const carve = () => {
      for(let x=bx-20; x<=bx+200; x++){
        for(let y=by-34; y<by-26; y++) W.setMat(x, y, M_GRANITE);
        for(let y=by-26; y<by;    y++) W.setMat(x, y, M_TUNNEL);
        for(let y=by;    y<=by+8; y++) W.setMat(x, y, M_GRANITE);
      }
      for(let y=by-34; y<=by+8; y++){
        for(let x=bx-24; x<bx-20;  x++) W.setMat(x, y, M_GRANITE);
        for(let x=bx+201; x<bx+205; x++) W.setMat(x, y, M_GRANITE);
      }
    };
    carve();
    const place = () => {
      g.releaseAll();
      carve();                       /* clear anything that drifted in since */
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
    t.check("the coast is measured from a clear run", vRun > WALK_SPEED*0.95,
            "vx="+vRun.toFixed(2)+" at the moment the key is released");
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

  /* ---------------------------------------------------------------- *
     The tool gate. What is in the hands decides what can be dug at all:
     hands and shovels move loose ground, a pickaxe opens stone, and granite
     stops everything. The actor's job is only to pass the tool through -
     the gate itself is lane A's, and the tiers are lane F's.
   * ---------------------------------------------------------------- */
  {
    const { W:LW } = W.size();
    const rx0 = Math.round(LW*0.55), ry0 = W.surfaceAt(rx0) + 160;
    /* how far the face stands from where the clonk is placed: it walks this
       much before the swing starts, and that walk is not digging */
    const FACE = 14;

    /* a sealed room with a face of one material to the right of it */
    const room = (face) => {
      for(let x=rx0-30; x<=rx0+140; x++){
        for(let y=ry0-34; y<ry0-26; y++) W.setMat(x, y, M_GRANITE);
        for(let y=ry0-26; y<ry0;    y++) W.setMat(x, y, x>=rx0+FACE ? face : M_TUNNEL);
        for(let y=ry0;    y<=ry0+8; y++) W.setMat(x, y, M_GRANITE);
      }
      for(let y=ry0-34; y<=ry0+8; y++)
        for(let x=rx0-34; x<rx0-30; x++) W.setMat(x, y, M_GRANITE);
    };
    const countMat = (m) => {
      let n = 0;
      for(let y=ry0-26; y<ry0; y++)
        for(let x=rx0+FACE; x<=rx0+140; x++) if(W.matAt(x,y)===m) n++;
      return n;
    };
    const equip = (id) => {
      g.items.inventory.clear();
      if(id) g.items.inventory.add(id, 1);
      const slot = id ? g.items.hotbar.slots().indexOf(id) : -1;
      g.items.hotbar.select(slot < 0 ? 0 : slot);
    };
    /* dig rightwards for n ticks; report how far the body got and whether
       the DIG procedure was ever entered at all */
    const dig = (n) => {
      g.releaseAll();
      g.actor.clonk.x = rx0; g.actor.clonk.y = ry0-9;
      g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
      g.actor.clonk.act = "WALK";
      g.tick(1);
      g.press("shift"); g.press("d");
      let dug = false;
      for(let i=0;i<n;i++){ g.tick(1); if(g.actor.clonk.act==="DIG") dug = true; }
      g.releaseAll();
      /* cut = how far it got THROUGH the face, with the approach walk taken off */
      return { dug, dx: g.actor.clonk.x - rx0, cut: g.actor.clonk.x - rx0 - FACE };
    };

    equip(null);
    t.check("empty hands read as bare hands, not as an ungated dig",
            g.actor.tool() === null);
    equip("stone_pickaxe");
    t.check("the actor reads the equipped tool from the hotbar",
            g.actor.tool() === "stone_pickaxe", "tool="+g.actor.tool());

    /* the limit: coal is tier 1, and hands are tier 0 */
    room(M_COAL);
    const coalBefore = countMat(M_COAL);
    equip(null);
    const byHand = dig(60);
    t.check("bare hands cannot dig coal at all",
            countMat(M_COAL) === coalBefore && !byHand.dug,
            "coal "+coalBefore+" -> "+countMat(M_COAL)+", entered DIG: "+byHand.dug);
    t.check("and a face it cannot cut reads as a wall, not as slow going",
            byHand.cut < 2, "got "+byHand.cut.toFixed(1)+"px past the face");

    /* a shovel is a better shovel, never a pickaxe */
    room(M_COAL);
    equip("stone_shovel");
    const byShovel = dig(60);
    t.check("a shovel is no help against stone either",
            countMat(M_COAL) === coalBefore && !byShovel.dug,
            "coal "+coalBefore+" -> "+countMat(M_COAL));

    /* the ability: a pickaxe opens it */
    room(M_COAL);
    equip("stone_pickaxe");
    const byPick = dig(60);
    t.check("a stone pickaxe opens coal", countMat(M_COAL) < coalBefore-150 && byPick.dug,
            "coal "+coalBefore+" -> "+countMat(M_COAL));

    /* the rate is data, not a constant: same ground, different tools */
    room(M_EARTH);
    equip(null);
    const handsEarth = dig(60).cut;
    room(M_EARTH);
    equip("stone_shovel");
    const shovelEarth = dig(60).cut;
    t.check("bare hands do dig soil, only slowly", handsEarth > 5 && handsEarth < 20,
            "cut "+handsEarth.toFixed(1)+"px in 60 ticks");
    t.check("a shovel is markedly faster than hands in the same soil",
            shovelEarth > handsEarth*2.5,
            "shovel cut "+shovelEarth.toFixed(1)+"px vs hands "+handsEarth.toFixed(1)+"px");

    /* granite is the floor of the whole ladder */
    room(M_GRANITE);
    equip("stone_pickaxe");
    const granite = dig(60);
    t.check("granite stops even a pickaxe", !granite.dug && granite.cut < 2,
            "got "+granite.cut.toFixed(1)+"px past the face");

    equip(null);
  }

  /* ---------------------------------------------------------------- *
     Chopping. Wood has exactly one source, so this swing is the whole of
     stage 0's supply of it - and an axe is the only thing that gets it.
   * ---------------------------------------------------------------- */
  {
    /* Trees only exist on loaded chunks, so walk the clonk along and let the
       world stream in rather than scanning a map that is not there yet. */
    let tree = null, tx = 0;
    const { W:LW } = W.size();
    for(let x = Math.round(LW*0.10); x < LW-300 && !tree; x += 40){
      g.actor.clonk.x = x; g.actor.clonk.y = W.surfaceAt(x) - 10;
      g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
      g.tick(2);
      for(let k=0; k<40 && !tree; k++){
        const px = x - 20 + k;
        const t = W.treeAt(px, W.surfaceAt(px) - 14, 6);
        if(t){ tree = t; tx = t.x; }
      }
    }

    if(!tree){ t.check("found a tree to chop", false); }
    else {
      const equip = (id) => {
        g.items.inventory.clear();
        if(id) g.items.inventory.add(id, 1);
        const slot = id ? g.items.hotbar.slots().indexOf(id) : -1;
        g.items.hotbar.select(slot < 0 ? 0 : slot);
      };
      /* stand just west of the trunk and swing east at it */
      const swing = (n) => {
        g.releaseAll();
        g.actor.clonk.x = tx - 12;
        g.actor.clonk.y = W.surfaceAt(tx-12) - 9;
        g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
        g.tick(1);
        g.press("shift"); g.press("d");
        g.tick(n);
        g.releaseAll();
      };

      equip(null);
      swing(200);
      const afterHands = W.treeAt(tx, W.surfaceAt(tx)-14, 8);
      t.check("bare hands cannot fell a tree, however long you swing",
              !!afterHands && afterHands.standing && afterHands.progress === 0,
              afterHands ? "progress "+afterHands.progress.toFixed(2) : "tree gone");
      t.check("and the swing does not dig the ground out from under it instead",
              W.isSolid(tx, W.surfaceAt(tx)+2), "ground under the trunk intact");

      equip("stone_axe");
      swing(40);
      const part = W.treeAt(tx, W.surfaceAt(tx)-14, 8);
      t.check("an axe bites: the tree takes damage as you swing",
              !!part && part.progress > 0.1 && part.progress < 1,
              part ? "progress "+part.progress.toFixed(2) : "tree gone");
      t.check("the chop meter is published for the HUD",
              g.state.player.chop > 0 && g.state.player.chop <= 1,
              "chop="+g.state.player.chop.toFixed(2));

      let wood = 0;
      const off = bus.on("dig:yield", e => { if(e.item==="wood") wood++; });
      g.press("shift"); g.press("d");
      for(let i=0;i<500 && wood===0;i++) g.tick(1);
      g.releaseAll();
      if(typeof off === "function") off();
      t.check("a stone axe fells the tree and it yields wood", wood > 0,
              wood+" logs");
      equip(null);
      g.tick(2);
      t.check("the chop meter clears when the swing stops",
              g.state.player.chop === 0, "chop="+g.state.player.chop);
    }
  }

  /* ---------------------------------------------------------------- *
     Climbing a square-edged wall. The owner's report: you scale a straight
     wall, stick at the top, press jump and leap away from it - so a flat
     top was the one thing you could not get onto. A mantle is the most
     ordinary thing anyone does with a wall, so it is the reliable case.
   * ---------------------------------------------------------------- */
  {
    const { W:LW } = W.size();
    /* a sealed granite chamber with a square-topped pillar `h` high in it */
    const pillar = (px, h) => {
      const fy = W.surfaceAt(px) + 120;
      for(let x=px-60; x<=px+60; x++){
        for(let y=fy-140; y<fy-130; y++) W.setMat(x, y, M_GRANITE);   /* roof */
        for(let y=fy-130; y<fy;     y++) W.setMat(x, y, M_TUNNEL);
        for(let y=fy;     y<=fy+8;  y++) W.setMat(x, y, M_GRANITE);   /* floor */
      }
      for(let x=px; x<=px+24; x++)
        for(let y=fy-h; y<fy; y++) W.setMat(x, y, M_GRANITE);         /* the wall */
      return { fy, top: fy-h };
    };

    /* the ability: climb it and end up standing on top */
    {
      const px = Math.round(LW*0.72);
      const { fy, top } = pillar(px, 60);
      g.releaseAll();
      g.actor.clonk.x = px-16; g.actor.clonk.y = fy-9;
      g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
      g.actor.clonk.act = "WALK"; g.actor.clonk.mantle = 0;
      g.tick(1);
      g.press("d"); g.press("w");
      /* stop the moment it is up: a player who keeps holding "walk right"
         after topping out walks off the far side, which is their business */
      let mounted = -1;
      for(let i=0;i<200 && mounted<0;i++){
        g.tick(1);
        if(g.actor.clonk.act==="WALK" && g.actor.clonk.y < top-2) mounted = i;
      }
      g.releaseAll();
      const c = g.actor.clonk;
      t.check("a square-edged wall can be climbed and mounted", mounted >= 0,
              mounted < 0 ? "still at ("+c.x.toFixed(0)+","+c.y.toFixed(0)+"), top is y="+top
                          : "up in "+mounted+" ticks");
      t.check("and it ends up standing on the top, not hanging off it",
              c.act==="WALK" && !c.mantle && c.x > px-2,
              "act="+c.act+" at x="+c.x.toFixed(0));
      /* the whole footprint has to be over the top, not just the leading
         edge - a mantle that ends with the body overhanging drops straight
         back down the face */
      const fx = Math.round(c.x), fy2 = Math.round(c.y);
      t.check("its whole footprint is on the top, not overhanging the edge",
              W.isSolid(fx-3, fy2+9) && W.isSolid(fx+3, fy2+9),
              "under feet: "+W.isSolid(fx-3,fy2+9)+"/"+W.isSolid(fx+3,fy2+9));
      g.tick(20);
      t.check("it stays up there rather than sliding back off",
              g.actor.clonk.y < top-2,
              "y="+g.actor.clonk.y.toFixed(0)+" vs top "+top);
    }

    /* the limit: with no lip in reach, jump still pushes you off the wall,
       because that is how you come down on purpose */
    {
      const px = Math.round(LW*0.82);
      const { fy } = pillar(px, 110);
      g.releaseAll();
      g.actor.clonk.x = px-16; g.actor.clonk.y = fy-9;
      g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
      g.actor.clonk.act = "WALK"; g.actor.clonk.mantle = 0;
      g.tick(1);
      g.press("d"); g.press("w");
      g.tick(40);
      const onWall = g.actor.clonk.act;
      const xWall = g.actor.clonk.x;
      g.press("w", false); g.tick(2);        /* release, so the jump is a new press */
      g.press(" ");
      g.tick(4);
      g.releaseAll();
      t.check("a wall too tall to top out on is still climbed", onWall==="SCALE",
              "act="+onWall);
      t.check("and jumping off it still works, since that is how you come down",
              g.actor.clonk.x < xWall-1 && !g.actor.clonk.mantle,
              "x "+xWall.toFixed(1)+" -> "+g.actor.clonk.x.toFixed(1));
    }
    /* the owner's exact gesture: climb, stick at the top, press jump. That
       used to throw you off the wall, which is the one thing that guarantees
       you cannot get up. */
    {
      const px = Math.round(LW*0.62);
      const { fy, top } = pillar(px, 60);
      g.releaseAll();
      g.actor.clonk.x = px-16; g.actor.clonk.y = fy-9;
      g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
      g.actor.clonk.act = "WALK"; g.actor.clonk.mantle = 0;
      g.tick(1);
      g.press("d"); g.press("w");
      /* climb until the head is up near the lip, then stop climbing */
      let near = false;
      for(let i=0;i<160 && !near;i++){
        g.tick(1);
        near = g.actor.clonk.act==="SCALE" && g.actor.clonk.y < top+10;
      }
      const stuckX = g.actor.clonk.x;
      g.press("w", false); g.tick(2);      /* let go: this is a fresh jump press */
      g.press(" ");
      let up = false;
      for(let i=0;i<60 && !up;i++){
        g.tick(1);
        up = g.actor.clonk.y < top-2 && g.actor.clonk.act==="WALK";
      }
      g.releaseAll();
      t.check("reached the top of the wall to press jump at", near);
      t.check("pressing jump at the lip pulls you up, it does not throw you off",
              up && g.actor.clonk.x > stuckX,
              "x "+stuckX.toFixed(0)+" -> "+g.actor.clonk.x.toFixed(0)+
              ", y="+g.actor.clonk.y.toFixed(0)+" top="+top);
    }
  }

  /* ---------------------------------------------------------------- *
     What the character is holding, and whether you can see it. A player
     who crafts a pickaxe should be able to tell from the figure alone.
   * ---------------------------------------------------------------- */
  {
    const equip = (id) => {
      g.items.inventory.clear();
      if(id) g.items.inventory.add(id, 1);
      const slot = id ? g.items.hotbar.slots().indexOf(id) : -1;
      g.items.hotbar.select(slot < 0 ? 0 : slot);
      g.tick(1);
    };

    equip("stone_pickaxe");
    t.check("the figure is handed whatever the hotbar has",
            !!g.actor.clonk.held && g.actor.clonk.held.id==="stone_pickaxe",
            g.actor.clonk.held ? g.actor.clonk.held.id : "nothing");
    const pick = heldLook(g.actor.clonk.held);

    equip(null);
    t.check("and empty hands are empty, not a tool with no name",
            g.actor.clonk.held === null && heldLook(g.actor.clonk.held).kind==="hands");

    /* the point of the exercise: three tools that read differently */
    const look = id => heldLook({ id, def: g.items.itemDef(id) }).kind;
    const shovel = look("stone_shovel"), axe = look("stone_axe");
    t.check("a shovel, a pickaxe and an axe are three different silhouettes",
            shovel!==pick.kind && shovel!==axe && pick.kind!==axe,
            shovel+" / "+pick.kind+" / "+axe);
    t.check("and none of them is the bare-hands shape",
            shovel!=="hands" && pick.kind!=="hands" && axe!=="hands");
    t.check("a tool with no dig kind still reads as a tool, not as cargo",
            look("stone_knife")==="blade", look("stone_knife"));
    t.check("anything that is not a tool is simply carried",
            look("rock")==="item", look("rock"));
    t.check("the tier shows in the colour, not in the shape",
            look("stone_pickaxe")===look("iron_pickaxe") &&
            heldLook({id:"stone_pickaxe", def:g.items.itemDef("stone_pickaxe")}).col !==
            heldLook({id:"iron_pickaxe",  def:g.items.itemDef("iron_pickaxe")}).col);
    equip(null);
  }

  /* ---------------------------------------------------------------- *
     One click, one action. Lane C places a building on the mouse event
     and this lane digs while the mouse is held, so a single left click
     used to place a campfire AND bite the ground out from under it.
   * ---------------------------------------------------------------- */
  {
    const { W:LW } = W.size();
    const bx2 = Math.round(LW*0.44), by2 = W.surfaceAt(bx2) + 150;
    for(let x=bx2-40; x<=bx2+40; x++){
      for(let y=by2-30; y<by2; y++) W.setMat(x, y, M_TUNNEL);
      for(let y=by2;    y<=by2+8; y++) W.setMat(x, y, M_EARTH);
    }
    const stand = () => {
      g.releaseAll();
      g.actor.clonk.x = bx2; g.actor.clonk.y = by2-9;
      g.actor.clonk.vx = 0; g.actor.clonk.vy = 0;
      g.actor.clonk.act = "WALK"; g.actor.clonk.placeLatch = 0;
      g.tick(1);
    };
    const dugUnder = () => {
      let n = 0;
      for(let y=by2; y<by2+8; y++)
        for(let x=bx2-12; x<=bx2+12; x++) if(!W.isSolid(x,y)) n++;
      return n;
    };

    /* the click that placed a building must not also swing */
    stand();
    g.mouse.wx = bx2+6; g.mouse.wy = by2-2;
    const before = dugUnder();
    g.mouse.down = true;
    bus.emit("structure:placed", { defId:"campfire", x:bx2+6, y:by2-2 });
    g.tick(30);
    t.check("placing a building does not dig the ground out from under it",
            dugUnder() === before && g.actor.clonk.act !== "DIG",
            "holes "+before+" -> "+dugUnder()+", act="+g.actor.clonk.act);

    g.tick(60);
    t.check("and holding that same click down still does not start a swing",
            dugUnder() === before, "holes "+dugUnder());

    /* the limit: let go, click again, and digging is digging */
    g.mouse.down = false; g.tick(2);
    t.check("the latch clears when the button comes up",
            g.actor.clonk.placeLatch === 0);
    g.mouse.down = true; g.mouse.wx = bx2+6; g.mouse.wy = by2+3;
    g.tick(30);
    g.mouse.down = false;
    t.check("a click that placed nothing digs as it always did",
            dugUnder() > before, "holes "+before+" -> "+dugUnder());

    /* a refused placement is still a build click, not a dig */
    stand();
    const before2 = dugUnder();
    g.mouse.down = true; g.mouse.wx = bx2+6; g.mouse.wy = by2+3;
    bus.emit("build:refused", { defId:"campfire", reason:"nope" });
    g.tick(30);
    g.mouse.down = false;
    t.check("a refused placement does not fall through into a dig",
            dugUnder() === before2, "holes "+before2+" -> "+dugUnder());

    /* the keyboard dig never places anything, so it is untouched */
    stand();
    const before3 = dugUnder();
    bus.emit("structure:placed", { defId:"campfire", x:bx2, y:by2 });
    g.press("shift"); g.press("s");
    g.tick(30);
    g.releaseAll();
    t.check("the keyboard dig is not caught by the build latch",
            dugUnder() > before3, "holes "+before3+" -> "+dugUnder());
  }

  /* the pose other lanes read is published every tick */
  g.tick(2);
  t.check("state.player mirrors the clonk",
          Math.abs(g.state.player.x-g.actor.clonk.x) < 0.001 &&
          Math.abs(g.state.player.y-g.actor.clonk.y) < 0.001);

  return t;
}
