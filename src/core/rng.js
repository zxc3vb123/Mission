/* Shared deterministic random numbers and noise.
   LANE E (core). Other lanes import from here, never fork their own copy -
   the map has to be reproducible from a seed. */

export const clamp = (v,a,b) => v<a?a:(v>b?b:v);
export const sign  = v => v<0?-1:(v>0?1:0);

let RSEED = 12345;

export function setSeed(s){ RSEED = (s>>>0) || 1; }
export function getSeed(){ return RSEED; }

export function rnd(){
  RSEED = (Math.imul(RSEED,1664525) + 1013904223) >>> 0;
  return RSEED/4294967296;
}
export function rint(a,b){ return a + Math.floor(rnd()*(b-a+1)); }
export function pick(arr){ return arr[Math.floor(rnd()*arr.length)]; }

/* position hash: same input always gives the same value, so landscape
   texture can be computed on the fly instead of being stored */
export function hash2(x,y,s){
  let h = Math.imul(x|0, 374761393) ^ Math.imul(y|0, 668265263) ^ Math.imul(s|0, 362437);
  h = Math.imul(h ^ (h>>>13), 1274126177);
  h ^= h>>>16;
  return (h>>>0)/4294967296;
}
export function vnoise(x,y,s){
  const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi,s), b=hash2(xi+1,yi,s), c=hash2(xi,yi+1,s), d=hash2(xi+1,yi+1,s);
  const t=a+(b-a)*u, w=c+(d-c)*u;
  return t+(w-t)*v;
}
export function fbm(x,y,s,oct){
  let f=1,a=0.5,sum=0,nrm=0;
  for(let i=0;i<oct;i++){ sum+=a*vnoise(x*f,y*f,s+i*131); nrm+=a; f*=2; a*=0.5; }
  return sum/nrm;
}
