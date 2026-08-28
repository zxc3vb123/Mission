/* The swing. LANE I (creatures and fighting).

   THE SHAPE THE OWNER SET: "create a fighting system. i should be able to
   hit using everything. axes. shovels etc. they do different dmg, but
   still." So there is no weapon slot and no weapon class. Whatever is in
   your hands swings, and the tool you were already carrying decides what
   the swing is worth. It costs the player no extra kilograms, it makes what
   you take down a shaft a real decision, and somebody caught unprepared is
   never empty-handed - only badly armed.

   TWO THINGS THAT HAD TO BE RIGHT FROM THE FIRST LINE, both from the lane
   brief, and both of them are about what a click means:

   1. A SWING IS NOT A FREE ACTION. It costs time. Every tool has a cadence
      and the swing refuses until it has recovered, so an encounter cannot
      turn into spam - and the slow heavy tools genuinely feel slow, which
      is the only thing that makes "heavy and slow" mean anything.

   2. HITTING A CREATURE AND HITTING ROCK ARE NOT THE SAME CLICK. Digging is
      the mouse (lane B) and the swing is its own key, so being surprised in
      a tunnel never makes a player dig their own roof out by reflex. This
      is the one thing about fighting that would be expensive to change
      later, so it is settled first. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { weaponFor, reachFor, cooldownFor, ARC_HALF, GRAPPLE,
         KNOCKBACK, KNOCK_LIFT } from "./spec.js";
import { BANDS } from "./spec.js";

/* `h` for hit. It is not the key a player would guess - a swing wants a
   mouse button - but the left one digs and places, and the right one is lane
   H's and has a resolved story behind it that is not mine to reopen. So: a
   letter now, registered in ARCHITECTURE 4a, and an entry in REQUESTS asking
   lane H whether the swing should have the right button. `t` was the obvious
   letter and lane J had already taken it for tending crops, which is exactly
   what that table exists to prevent. */
export const SWING_KEY = "h";

export function createSwing(world, items, crawlers){
  let cool = 0;                 /* ticks until the next swing may be taken */
  let last = null;              /* what the last swing was, for the renderer */

  function toolId(){
    if(!items || !items.equipped) return null;
    const e = items.equipped();
    return e ? e.id : null;
  }

  /* Angle between the aim and a target, so a swing is a cone rather than a
     circle - except very close in, where a thing that is already on top of
     you can always be hit. */
  function inArc(dx, dy, d){
    if(d <= GRAPPLE) return true;
    const p = state.player;
    const aimA = Math.atan2(p.aim.y, p.aim.x);
    const a = Math.atan2(dy, dx);
    const da = Math.abs(((a - aimA + Math.PI * 3) % 6.28318) - Math.PI);
    return da < ARC_HALF;
  }

  /* The one thing this swing connects with. Nearest wins: a tool meets ONE
     thing, and an axe that cleaves three crawlers at a stroke would quietly
     turn a fight into the fastest way through a room. */
  function target(reach){
    const p = state.player;
    let best = null, bestD = Infinity;
    for(const c of crawlers.list){
      if(c.dead) continue;
      const dx = c.x - p.x, dy = c.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const size = BANDS[c.band] ? BANDS[c.band].size : 3;
      if(d > reach + size) continue;
      if(!inArc(dx, dy, d)) continue;
      if(d < bestD){ bestD = d; best = c; }
    }
    return best;
  }

  /* Take a swing. Returns a verdict rather than a sentence, the way every
     other refusal in this project does, so a UI can say why nothing
     happened without this file knowing any copy. */
  function swing(){
    if(cool > 0) return { ok: false, reason: "recovering", ticks: cool };

    const id = toolId();
    const w = weaponFor(id);
    const reach = reachFor(id);
    const ticks = cooldownFor(id);
    cool = ticks;

    const p = state.player;
    last = { tick: state.tick, toolId: id, kind: w.kind, ticks,
             x: p.x, y: p.y, ax: p.aim.x, ay: p.aim.y, reach, hit: false };

    /* Announced BEFORE it is resolved, so lane B can animate the whole
       stroke rather than its outcome. A miss is a swing too. */
    bus.emit("swing:started", {
      toolId: id, kind: w.kind, damage: w.damage, reach, ticks,
      x: p.x, y: p.y, dx: p.aim.x, dy: p.aim.y
    });

    const c = target(reach);
    if(!c) return { ok: true, toolId: id, kind: w.kind, damage: w.damage,
                    reach, ticks, hit: null };

    const r = crawlers.hurt(c, w.damage, p.x, p.y, KNOCKBACK, KNOCK_LIFT);
    last.hit = true;
    bus.emit("creature:hit", {
      id: r.id, kind: r.kind, x: r.x, y: r.y,
      damage: r.damage, killed: r.killed, hp: r.hp, toolId: id
    });
    return { ok: true, toolId: id, kind: w.kind, damage: w.damage,
             reach, ticks, hit: r };
  }

  return {
    swing,
    tick(){ if(cool > 0) cool--; },
    ready: () => cool <= 0,
    cooling: () => cool,
    lastSwing: () => last,
    reset(){ cool = 0; last = null; }
  };
}
