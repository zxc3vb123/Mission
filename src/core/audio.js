/* Synthesised sound. LANE E (core).

   No asset files: every sound is a short filtered-noise burst or a two-point
   oscillator sweep built at play time. Nothing here lasts longer than about
   200 ms and the master gain sits at 0.25, because this runs while somebody
   is holding the dig button down.

   It is a normal system (see ARCHITECTURE.md section 2): registered in
   src/systems.js, ticked at 36 Hz, and it never writes simulation state.

   Sources:
     dig       state.player.digging, on a cooldown, pitched by the material
     footstep  state.player.act === "WALK", spaced by distance travelled
     landing   a fall speed collapsing to nothing
     pickup    bus "item:collected"
     refused   bus "pickup:refused"
     splash    the player entering or leaving liquid

   Browsers will not start an AudioContext outside a user gesture, so the
   context is built the first time "input:key" or "input:mouse" arrives -
   those fire inside the real listener, so we are still in the gesture - and
   resumed whenever it is found suspended. If any of it fails, the whole
   module goes quiet and the game carries on. */

import { bus } from "./bus.js";
import { state } from "./state.js";

const MASTER = 0.25;          /* everything below is relative to this */
const MAX_VOICES = 12;        /* refuse to pile up, cheaper than a limiter */
const DIG_REACH = 4;          /* where lane B aims the shovel, in pixels */

/* A private noise source. core/rng.js belongs to the simulation and drawing
   from it here would desynchronise a seed, so audio keeps its own. */
let rndState = 0x2f6e2b1;
function arnd(){
  rndState ^= rndState << 13; rndState ^= rndState >>> 17; rndState ^= rndState << 5;
  return ((rndState >>> 0) % 100000) / 100000;
}
function vary(v, amount){ return v * (1 + (arnd()-0.5)*amount); }

export function createAudio(world){
  /* the headless test kit boots the whole game without a DOM */
  const silent = { name:"audio", tick(){}, api:{ isMuted:()=>true, setMuted(){}, setVolume(){} } };
  if(typeof window === "undefined") return silent;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if(!Ctor) return silent;

  let ctx = null, master = null, noise = null;
  let muted = false, volume = MASTER, voices = 0, dead = false;

  /* ---- context, created on the first gesture and never again ---- */

  /* only unlock() builds a context: a sound must never be the thing that
     first asks for one, because outside a gesture it would be born suspended */
  function unlock(){
    if(dead) return null;
    if(!ctx){
      try {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : volume;
        master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for(let i=0;i<d.length;i++) d[i] = arnd()*2 - 1;
      } catch(e){ dead = true; ctx = null; return null; }
    }
    return active();
  }

  /* the context if it is up, awake and audible - otherwise nothing happens */
  function active(){
    if(dead || !ctx || muted) return null;
    if(ctx.state === "suspended"){ try { ctx.resume(); } catch(e){} }
    return ctx.state === "running" ? ctx : null;
  }

  function safe(fn){ return a => { try { fn(a); } catch(e){} }; }

  /* ---- two voices is the whole synth ---- */

  function env(g, t, peak, attack, dur){
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function bookVoice(node, t, dur, offset){
    voices++;
    node.onended = () => { voices--; };
    if(offset === undefined) node.start(t); else node.start(t, offset);
    node.stop(t + dur + 0.02);
  }

  /* filtered noise: scrapes, steps, splashes, the body of a thump */
  function burst({ freq=900, q=1, type="bandpass", peak=0.1, dur=0.06,
                   attack=0.004, sweep=0, rate=1 }){
    const c = active();
    if(!c || voices >= MAX_VOICES) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = rate;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    if(sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq*sweep), t + dur);
    filt.Q.value = q;
    const g = c.createGain();
    env(g, t, peak, attack, dur);
    src.connect(filt); filt.connect(g); g.connect(master);
    /* start somewhere else in the noise every time, so two scrapes in a row
       are not the same scrape */
    bookVoice(src, t, dur, arnd() * (noise.duration - dur - 0.05));
  }

  /* a pitched blip: pickups, refusals, the low end of a landing */
  function tone({ f0=440, f1=440, type="sine", peak=0.08, dur=0.08, attack=0.004 }){
    const c = active();
    if(!c || voices >= MAX_VOICES) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if(f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur*0.9);
    const g = c.createGain();
    env(g, t, peak, attack, dur);
    osc.connect(g); g.connect(master);
    bookVoice(osc, t, dur);
  }

  /* ---- the sounds ---- */

  let lastDigFreq = 1200;

  /* Hardness, cheaply: the published matInfo, sampled at the shovel and only
     when a scrape is actually due. No world api (or a mouthful of air) and we
     keep the last pitch instead of guessing. */
  function digPitch(){
    if(!world || !world.matInfo) return lastDigFreq;
    const p = state.player;
    const ax = p.aim ? p.aim.x : p.dir, ay = p.aim ? p.aim.y : 0;
    for(let s=0; s<3; s++){
      const r = DIG_REACH + s*3;
      const m = world.matInfo(Math.round(p.x + ax*r), Math.round(p.y + ay*r));
      if(m && m.density >= 50){
        lastDigFreq = 420 + (m.friction||60) * 16;
        break;
      }
    }
    return lastDigFreq;
  }

  function dig(){
    const f = digPitch();
    burst({ freq: vary(f, 0.14), q: 1.4 + f/2600, peak: 0.085, dur: 0.055,
            attack: 0.008, sweep: 0.7, rate: vary(1, 0.3) });
  }
  function footstep(){
    burst({ freq: vary(340, 0.25), q: 0.9, type:"lowpass", peak: 0.05,
            dur: 0.045, attack: 0.003, rate: vary(1, 0.2) });
  }
  function landing(hard){          /* hard: 0..1 */
    const p = 0.06 + hard*0.10;
    tone({ f0: 120, f1: 46, type:"sine", peak: p, dur: 0.11, attack: 0.005 });
    burst({ freq: 220, q: 0.7, type:"lowpass", peak: p*0.7, dur: 0.07, attack: 0.003 });
  }
  function pickup(){
    tone({ f0: 880, f1: 1320, type:"triangle", peak: 0.07, dur: 0.07, attack: 0.003 });
  }
  function refused(){
    tone({ f0: 300, f1: 190, type:"triangle", peak: 0.06, dur: 0.13, attack: 0.006 });
  }
  function splash(){
    burst({ freq: 1700, q: 0.8, peak: 0.09, dur: 0.16, attack: 0.006, sweep: 0.22 });
  }

  /* ---- bus ---- */

  /* input:key and input:mouse are emitted from inside the real DOM listener
     in core/input.js, so we are still inside the user gesture here */
  bus.on("input:mouse", safe(unlock));
  bus.on("input:key", safe(e => {
    unlock();
    if(e && e.down && e.key === "m") setMuted(!muted);
  }));

  bus.on("item:collected", safe(pickup));

  /* refusals arrive once per dig yield while the pack is full, which is
     often; one note is a message, ten is nagging */
  let lastRefused = -999;
  bus.on("pickup:refused", safe(() => {
    if(state.tick - lastRefused < 36) return;
    lastRefused = state.tick;
    refused();
  }));

  function setMuted(m){
    muted = !!m;
    if(master && ctx){
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(muted ? 0.0001 : volume, t + 0.05);
    }
  }
  function setVolume(v){
    volume = Math.max(0, Math.min(1, v));
    if(!muted && master && ctx){
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(Math.max(0.0001, volume), t + 0.05);
    }
  }

  /* ---- per-tick watchers ---- */

  const DIG_EVERY = 7;           /* ticks between scrapes, ~195 ms */
  const STEP_DIST = 11;          /* pixels of ground covered per footstep */
  const FALL_HARD = 3.0;         /* px/tick downward before a landing is heard */

  let digCd = 0, stepDist = 0;
  let prevX = 0, prevY = 0, primed = false;
  let fallPeak = 0, wasLiquid = false;

  return {
    name: "audio",

    tick(){ try { watch(); } catch(e){ /* sound is never worth a broken tick */ } },

    api: {
      isMuted: () => muted,
      setMuted,
      setVolume
    }
  };

  function watch(){
    if(dead) return;
    const p = state.player;
    if(!primed){ prevX = p.x; prevY = p.y; primed = true; }
    const dx = p.x - prevX, dy = p.y - prevY;
    prevX = p.x; prevY = p.y;

    /* nothing is audible before the first gesture; keep the bookkeeping
       running anyway so the first sound after it is in the right place */
    const live = !!active();

    /* digging: a scrape on a cooldown, not one per tick */
    if(p.digging){
      if(digCd <= 0){ if(live) dig(); digCd = DIG_EVERY + Math.round(arnd()*2); }
      else digCd--;
    } else digCd = 0;

    /* footsteps, spaced by ground covered rather than by time */
    if(p.act === "WALK" && !p.digging){
      stepDist += Math.abs(dx);
      if(stepDist >= STEP_DIST){
        stepDist = 0;
        if(live) footstep();
      }
    } else stepDist = STEP_DIST*0.6;   /* land mid-stride, step soon after */

    /* landing: the biggest downward speed of a fall, the tick it stops */
    if(p.act === "FLIGHT" || p.act === "SWIM"){
      if(dy > fallPeak) fallPeak = dy;
    } else {
      if(fallPeak > FALL_HARD && Math.abs(dy) < 0.6){
        if(live) landing(Math.min(1, (fallPeak - FALL_HARD)/6));
      }
      if(Math.abs(dy) < 1.2) fallPeak = 0;
    }

    /* water: the surface crossing, in either direction */
    let inLiquid;
    if(world && world.isLiquid){
      try { inLiquid = !!world.isLiquid(Math.round(p.x), Math.round(p.y)); }
      catch(e){ inLiquid = p.act === "SWIM"; }
    } else inLiquid = p.act === "SWIM";
    if(inLiquid !== wasLiquid){
      if(live) splash();
      wasLiquid = inLiquid;
    }
  }
}
