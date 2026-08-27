/* Vertex based collision against the landscape. LANE E (core).

   An object does not use a bounding box. It carries a handful of shape
   vertices and is moved one pixel at a time, testing every vertex - the
   model the original engine uses. Anything that moves through terrain
   (player, dropped chunks, vehicles later) uses this. */

let solidTest = () => false;
let liquidTest = () => false;

export function setShapeTests(solidFn, liquidFn){
  solidTest = solidFn;
  liquidTest = liquidFn;
}

export function shapeBlocked(verts, x, y){
  for(let i=0;i<verts.length;i++){
    if(solidTest(Math.round(x+verts[i][0]), Math.round(y+verts[i][1]))) return true;
  }
  return false;
}
export function shapeInLiquid(verts, x, y){
  for(let i=0;i<verts.length;i++){
    if(liquidTest(Math.round(x+verts[i][0]), Math.round(y+verts[i][1]))) return true;
  }
  return false;
}

/* moves o by o.vx/o.vy, returns which sides made contact.
   stepUp lets a walker climb small steps instead of being stopped. */
export function moveShape(o, verts, stepUp){
  const c = { l:0, r:0, t:0, b:0, impact:0 };
  let steps = Math.ceil(Math.max(Math.abs(o.vx), Math.abs(o.vy)));
  if(steps<1) steps = 1;
  if(steps>48) steps = 48;
  let sx = o.vx/steps, sy = o.vy/steps;
  for(let s=0;s<steps;s++){
    if(sx!==0){
      const nx = o.x+sx;
      if(!shapeBlocked(verts,nx,o.y)) o.x = nx;
      else {
        let climbed = false;
        for(let up=1; up<=stepUp; up++){
          if(!shapeBlocked(verts,nx,o.y-up) && !shapeBlocked(verts,o.x,o.y-up)){
            o.x = nx; o.y -= up; climbed = true; break;
          }
        }
        if(!climbed){ c[sx>0?"r":"l"] = 1; o.vx = 0; sx = 0; }
      }
    }
    if(sy!==0){
      const ny = o.y+sy;
      if(!shapeBlocked(verts,o.x,ny)) o.y = ny;
      else {
        if(sy>0){ c.b = 1; c.impact = o.vy; } else c.t = 1;
        o.vy = 0; sy = 0;
      }
    }
  }
  return c;
}
