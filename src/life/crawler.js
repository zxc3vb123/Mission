/* The crawler. LANE I (creatures).

   ONE creature, and it gets worse with depth, because a bestiary is what you
   build after one thing is right rather than instead of it
   (docs/DECISIONS.md, 2026-08-28: "There is something hostile underground,
   and it gets worse with depth").

   It is built so that every defence the player already owns is a real
   answer, which is the whole design and not a nicety:

     LIGHT   it will not walk into lit ground, and bright ground drives it
             back. The head lamp is a CONE, so the dark is behind you - and
             a fire you put down is not a cone. That is the first time those
             two things have differed in a way anyone can feel.
     WALLS   it moves through open space and cannot dig one pixel. Terrain
             here is moved and never destroyed, so a shaft you seal behind
             you is sealed.
     QUIET   digging is heard from 240 px, walking from 130, standing still
             from 36. A player who stops is very hard to find.
     ABSENCE it holds still when there is no player within AWAKE - it has
             nothing to hunt. That is also what makes the whole system cost
             nothing when the map is empty.

   And what it costs the player is TIME and ATTENTION rather than a health
   bar: this is not a combat game, and if the fastest way through a stage
   turns out to be killing things then something here is wrong and should be
   said out loud rather than balanced around.

   DETERMINISM. No Math.random and no wall clock. The stream below is this
   lane's own, seeded off the world seed and saved with the creatures, so it
   does not depend on how many numbers any other system happened to draw
   this tick - which is what makes two clients agree (docs/DECISIONS.md,
   the coop entry: those rules "are now load-bearing for multiplayer"). */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { moveShape, shapeBlocked } from "../core/shape.js";
import { lightHere, noiseRadius } from "./senses.js";
import {
  BANDS, BAND_CHANCE, bandAt, LIGHT_EDGE, LIGHT_FLEE, FEEL, ALERT_TICKS,
  ATTACK_RANGE, AWAKE, MIN_DEPTH, SPAWN_MIN, SPAWN_MAX, SPAWN_EVERY,
  MAX_ALIVE, NEAR_CAP, SPAWN_TRIES
} from "./spec.js";

const GRAV = 0.24, MAXFALL = 6.5;
const CLIMB_SPEED = 0.55;
const FORGET_TICKS = 2160;             /* a minute with nobody near: it goes */

/* A small body. Four vertices is enough for something this size and it is
   what keeps the movement cost flat - see docs/lanes/LANE_I_CREATURES.md on
   the simulation budget. */
function vertsFor(size){
  const r = Math.round(size);
  return [[0, -r], [-r, 0], [r, 0], [0, r]];
}

export function createCrawlers(world){
  const list = [];
  let nextId = 1;
  let rseed = 1;
  let sinceSpawn = 0;

  /* This lane's own deterministic stream. Same generator as core/rng.js,
     separate state on purpose: sharing the global stream would make our
     behaviour depend on how many numbers lane A drew for its grass. */
  function seedStream(s){ rseed = (s >>> 0) || 1; }
  function rnd(){
    rseed = (Math.imul(rseed, 1664525) + 1013904223) >>> 0;
    return rseed / 4294967296;
  }

  /* Seeded at construction, because the world is generated before the
     systems are built and nothing in this project calls a system's init().
     Regeneration re-seeds through the event below. */
  seedStream(((state.world.seed || 1) >>> 0) ^ 0x1f5c);

  bus.on("world:generated", e => {
    list.length = 0;
    nextId = 1;
    sinceSpawn = 0;
    seedStream(((e && e.seed) || state.world.seed || 1) ^ 0x1f5c);
  });

  /* ---------------------------------------------------------- the bodies --- */

  function make(x, y, bandIndex){
    const b = BANDS[bandIndex];
    const c = {
      id: nextId++, kind: "crawler", band: bandIndex,
      x, y, vx: 0, vy: 0, dir: 1,
      hp: b.hp, hpMax: b.hp,
      alert: 0, cool: 0, lonely: 0, mode: "lurk", phase: 0
    };
    c.verts = vertsFor(b.size);
    list.push(c);
    bus.emit("creature:spawned", { id: c.id, kind: c.kind, band: b.name, x, y });
    return c;
  }

  /* ------------------------------------------------------------ spawning --- */

  /* Where the player is, as the only body in the world that matters for
     this. Coop puts more of them here later; the shape below already takes
     a nearest-of rather than assuming one. */
  function nearestPlayer(x, y){
    const p = state.player;
    const dx = p.x - x, dy = p.y - y;
    return { x: p.x, y: p.y, d: Math.sqrt(dx * dx + dy * dy) };
  }

  function depthAt(x, y){ return y - world.surfaceAt(x); }

  /* Somewhere a crawler could be standing: free space with a floor under it,
     deep enough, and dark. The floor test is what stops them appearing in
     the middle of a cavern and falling for two seconds. */
  function siteOk(x, y, size){
    if(x < 8 || y < 8 || x > state.world.W - 8 || y > state.world.H - 8) return false;
    if(depthAt(x, y) < MIN_DEPTH) return false;
    if(shapeBlocked(vertsFor(size), x, y)) return false;
    if(world.isLiquid(Math.round(x), Math.round(y))) return false;
    let floor = false;
    for(let d = 2; d <= 14; d++) if(world.isSolid(Math.round(x), Math.round(y + d))){ floor = true; break; }
    if(!floor) return false;
    return lightHere(world, x, y) < LIGHT_EDGE;
  }

  function awakeNear(px, py){
    let n = 0;
    for(const c of list){
      const dx = c.x - px, dy = c.y - py;
      if(dx * dx + dy * dy < AWAKE * AWAKE) n++;
    }
    return n;
  }

  /* One attempt every SPAWN_EVERY ticks, and each attempt tries a handful of
     candidate sites - see SPAWN_TRIES in spec.js, where the measurement that
     set it is written down. The band a site falls in decides how likely it is
     to come to anything, so the same shaft is emptier at the top than at the
     bottom.

     The vertical offset is squashed deliberately: the resident band of
     world is one chunk past the view, which is much wider than it is tall,
     and a candidate outside it costs a chunk generation to answer. A
     tunnel is a horizontal thing anyway. */
  function trySpawn(){
    if(list.length >= MAX_ALIVE) return null;
    const p = state.player;
    if(awakeNear(p.x, p.y) >= NEAR_CAP) return null;

    for(let k = 0; k < SPAWN_TRIES; k++){
      const a = rnd() * 6.28318;
      const r = SPAWN_MIN + rnd() * (SPAWN_MAX - SPAWN_MIN);
      const x = Math.round(p.x + Math.cos(a) * r);
      const y = Math.round(p.y + Math.sin(a) * r * 0.45);

      const bi = bandAt(depthAt(x, y));
      if(rnd() >= BAND_CHANCE[bi]) continue;
      if(!siteOk(x, y, BANDS[bi].size)) continue;
      return make(x, y, bi);
    }
    return null;
  }

  /* ------------------------------------------------------------ the mind --- */

  /* Where is it darker? Four probes and take the best. Used only when a
     crawler is standing in light, which is the one moment it is worth
     paying for. */
  function darkestStep(c, reach){
    let bx = 0, by = 0, best = 2;
    for(let i = 0; i < 4; i++){
      const a = (i / 4) * 6.28318;
      const nx = c.x + Math.cos(a) * reach, ny = c.y + Math.sin(a) * reach;
      const l = lightHere(world, nx, ny);
      if(l < best){ best = l; bx = Math.cos(a); by = Math.sin(a); }
    }
    return { x: bx, y: by, light: best };
  }

  function think(c){
    const b = BANDS[c.band];
    const near = nearestPlayer(c.x, c.y);

    /* Nothing to hunt: hold still. A rule, not an optimisation - see
       spec.js on AWAKE. */
    if(near.d > AWAKE){
      c.mode = "lurk";
      c.dormant = true;
      c.alert = 0;
      c.lonely++;
      c.vx = 0;
      return;
    }
    c.dormant = false;
    c.lonely = 0;

    const litHere = lightHere(world, c.x, c.y);

    /* Driven back by real light. It will not fight in the open. */
    if(litHere > LIGHT_FLEE){
      c.mode = "flee";
      const away = darkestStep(c, 14);
      c.vx += ((away.x * b.speed * 1.2) - c.vx) * 0.25;
      if(away.y < -0.5 && (c.contact && (c.contact.l || c.contact.r))) c.vy = -CLIMB_SPEED;
      return;
    }

    /* Did it notice anything? Noise carries; a body this close is felt
       whatever the player does. */
    const heard = near.d < noiseRadius();
    const felt  = near.d < FEEL;
    if(heard || felt) c.alert = ALERT_TICKS;
    else if(c.alert > 0) c.alert--;

    if(c.alert <= 0){
      c.mode = "lurk";
      c.vx *= 0.6;
      return;
    }

    c.mode = "stalk";
    const dx = near.x - c.x, dy = near.y - c.y;
    const step = dx > 0 ? 1 : -1;

    /* Light is a fence. It stops at the edge of it rather than walking in,
       which is what makes a lit shaft a place a player can stand. */
    const ahead = lightHere(world, c.x + step * 9, c.y);
    if(ahead > LIGHT_EDGE){
      c.mode = "held";
      c.vx *= 0.5;
      return;
    }

    c.dir = step;
    c.vx += ((step * b.speed) - c.vx) * 0.22;

    /* It climbs. A crawler that could not follow you up your own shaft would
       be a thing you outrun rather than a thing you deal with - and a
       SEALED shaft still stops it, because it cannot dig. */
    if(dy < -3 && c.contact && (c.contact.l || c.contact.r)) c.vy = -CLIMB_SPEED;

    /* Reach: bite. */
    if(near.d < ATTACK_RANGE && c.cool <= 0){
      c.cool = b.attackEvery;
      c.mode = "bite";
      bus.emit("creature:attack", {
        id: c.id, kind: c.kind, band: b.name,
        damage: b.damage, x: c.x, y: c.y
      });
    }
  }

  function move(c){
    const b = BANDS[c.band];
    if(c.vy < MAXFALL) c.vy += GRAV;
    if(c.vy > MAXFALL) c.vy = MAXFALL;
    c.contact = moveShape(c, c.verts, 4);
    if(c.contact.b) c.vy = 0;
    c.phase += Math.abs(c.vx) * 0.5 + 0.02;
    /* buried by a collapse, or spawned into ground that moved: it dies with
       the roof like anything else down here */
    if(shapeBlocked(c.verts, c.x, c.y)){
      c.crushed = (c.crushed || 0) + 1;
      if(c.crushed > 90) kill(c, "crushed");
    } else c.crushed = 0;
    c.vx *= 0.92;
  }

  /* ---------------------------------------------------------- damage ------- */

  function kill(c, why){
    c.hp = 0;
    c.dead = true;
    bus.emit("creature:killed", { id: c.id, kind: c.kind, x: c.x, y: c.y, why: why || "struck" });
  }

  /* Called by the swing. Returns what actually happened, so the caller can
     tell "I hit nothing" from "I hit something and it died". */
  function hurt(c, damage, fromX, fromY, knock, lift){
    if(c.dead) return null;
    c.hp -= damage;
    c.alert = ALERT_TICKS;
    const dx = c.x - fromX, dy = c.y - fromY;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    c.vx += (dx / d) * knock;
    c.vy -= lift;
    const killed = c.hp <= 0;
    if(killed) kill(c, "struck");
    return { id: c.id, kind: c.kind, x: c.x, y: c.y, damage, killed, hp: Math.max(0, c.hp) };
  }

  /* ------------------------------------------------------------- the tick -- */

  function tick(){
    for(let i = list.length - 1; i >= 0; i--){
      const c = list[i];
      if(c.dead){ list.splice(i, 1); continue; }
      if(c.cool > 0) c.cool--;
      think(c);
      /* A dormant crawler does not move, so it also does not touch the
         world - which is what keeps one on the far side of the map from
         paging chunks in to answer questions nobody asked. Everything with
         a player in range moves, awake or not, so gravity still applies to
         a thing that is only sitting in the dark. */
      if(!c.dormant) move(c);
      if(c.lonely > FORGET_TICKS){ list.splice(i, 1); }
    }

    if(++sinceSpawn >= SPAWN_EVERY){
      sinceSpawn = 0;
      trySpawn();
    }
  }

  /* --------------------------------------------------------- save / load --- */

  function serialise(){
    if(!list.length) return undefined;
    return {
      seed: rseed, next: nextId,
      crawlers: list.map(c => ({
        i: c.id, b: c.band, x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10,
        hp: Math.round(c.hp * 10) / 10, a: c.alert, c: c.cool
      }))
    };
  }

  function restore(data){
    list.length = 0;
    if(!data) return;
    if(data.seed) rseed = data.seed >>> 0;
    if(data.next) nextId = data.next;
    for(const s of (data.crawlers || [])){
      const bi = Math.min(BANDS.length - 1, Math.max(0, s.b | 0));
      const b = BANDS[bi];
      list.push({
        id: s.i, kind: "crawler", band: bi,
        x: s.x, y: s.y, vx: 0, vy: 0, dir: 1,
        hp: s.hp === undefined ? b.hp : s.hp, hpMax: b.hp,
        alert: s.a || 0, cool: s.c || 0, lonely: 0, mode: "lurk", phase: 0,
        verts: vertsFor(b.size)
      });
    }
  }

  return {
    list, tick, serialise, restore, hurt, kill, make, trySpawn,
    clear(){ list.length = 0; },
    seedStream
  };
}
