/* LANE A owns this file: terrain, digging, liquids, ores. */

import { boot, suite, countSolid, findMaterial } from "../testkit.js";
import { MATS, M_EARTH, M_SAND, M_GRANITE, M_COAL, M_IRON, M_WATER, M_LAVA,
         M_TUNNEL, M_TITAN, M_URANIUM } from "../../src/world/materials.js";

export function run(){
  const t = suite("world");
  const g = boot(20260827);
  const W = g.world;

  /* --- generation --- */
  const counts = {};
  const { W:LW, H:LH } = W.size();
  for(let x=0;x<LW;x+=2) for(let y=0;y<LH;y+=2){
    const m = W.matAt(x,y);
    counts[m] = (counts[m]||0)+1;
  }
  t.check("earth is the bulk of the ground", (counts[M_EARTH]||0) > 20000, "earth "+(counts[M_EARTH]||0));
  t.check("caves were carved", (counts[M_TUNNEL]||0) > 1000);
  t.check("water exists", (counts[M_WATER]||0) > 300);
  t.check("lava exists", (counts[M_LAVA]||0) > 40);

  const oreNames = [];
  let missing = 0;
  for(const M of MATS){
    if(!M.dig2 || M.index===M_EARTH) continue;
    const n = counts[M.index]||0;
    if(n === 0){ missing++; oreNames.push(M.name+":0"); }
  }
  t.check("every ore type is present in the map", missing===0, oreNames.join(" ") || "all present");

  /* deep ores must be deep */
  let titanTop = LH, uranTop = LH;
  for(let x=0;x<LW;x+=3) for(let y=0;y<LH;y+=2){
    const m = W.matAt(x,y);
    if(m===M_TITAN && y<titanTop) titanTop = y;
    if(m===M_URANIUM && y<uranTop) uranTop = y;
  }
  t.check("titanium only occurs deep", titanTop > LH*0.55, "topmost y "+titanTop);
  t.check("uranium only occurs very deep", uranTop > LH*0.70, "topmost y "+uranTop);

  /* --- digging --- */
  const spot = findMaterial(W, M_EARTH, 30);
  if(spot){
    const before = countSolid(W, spot.x-20, spot.y-20, 40, 40);
    W.digFreeCircle(spot.x, spot.y, 9, true);
    const after = countSolid(W, spot.x-20, spot.y-20, 40, 40);
    t.check("digging removes material", after < before-150, before+" -> "+after);
  } else t.check("found earth to dig", false);

  /* granite refuses */
  let gx=-1, gy=-1;
  for(let y=LH-5;y>LH-60 && gx<0;y--)
    for(let x=100;x<LW-100;x+=7)
      if(W.matAt(x,y)===M_GRANITE){ gx=x; gy=y; break; }
  const res = W.digFreeCircle(gx, gy, 5, true);
  t.check("granite cannot be dug", W.matAt(gx,gy)===M_GRANITE && res.blocked===true);

  /* --- unstable sand --- */
  const sand = findMaterial(W, M_SAND, 8, false);
  if(sand){
    W.digFreeCircle(sand.x, sand.y+14, 7, false);
    const p0 = W.counts().pxs;
    g.tick(40);
    t.check("undermined sand collapses",
            W.matAt(sand.x, sand.y)!==M_SAND || W.counts().pxs > p0);
  } else t.check("found a sand column", false);

  /* --- liquids level out --- */
  {
    let ox=-1, oy=-1;
    for(let x=300;x<LW-300 && ox<0;x+=29){
      for(let y=W.surfaceAt(x)+150; y<W.surfaceAt(x)+320 && y<LH-200; y+=17){
        if(countSolid(W,x,y,110,60) > 110*60*0.97){ ox=x; oy=y; break; }
      }
    }
    if(ox>=0){
      for(let y=oy;y<oy+40;y++) for(let x=ox;x<ox+100;x++) W.setMat(x,y,M_TUNNEL);
      for(let y=oy+16;y<oy+40;y++) for(let x=ox+2;x<ox+26;x++) W.setMat(x,y,M_WATER);
      for(let y=oy;y<oy+40;y++) for(let x=ox;x<ox+100;x++)
        if(W.isFree(x,y)) W.digFreeCircle(x,y,0,false);   /* no-op, just wakes */
      g.tick(1500);
      const tops = [];
      for(let x=ox+2;x<ox+98;x++){
        for(let y=oy;y<oy+40;y++){
          if(W.matAt(x,y)===M_WATER){ tops.push(y); break; }
        }
      }
      const lo = Math.min(...tops), hi = Math.max(...tops);
      t.check("water spreads across a cavern", tops.length>80, tops.length+" of 96 columns");
      t.check("water surface ends up level", hi-lo<=2, "top y "+lo+".."+hi);
    } else t.check("found a solid block for the water test", false);
  }

  return t;
}
