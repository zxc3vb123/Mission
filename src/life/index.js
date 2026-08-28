/* The life system. LANE I (creatures and fighting).

   Everything alive that is not the player: what it is, how it behaves, how
   it hurts you and how you deal with it.

   PUBLISHED API - other lanes may call exactly these:
     swing()            -> { ok, reason?, toolId, kind, damage, reach, ticks, hit }
     canSwing()         -> is the last swing recovered yet
     swingCooldown()    -> ticks left before the next one may be taken
     swingKey           -> the key that swings, so nobody copies the binding
     weaponFor(toolId)  -> { id, kind, damage, swing } for ANY tool id, or none
     reachFor(toolId)   -> how far that tool reaches
     creatures()        -> [{ id, kind, band, x, y, hp, hpMax, mode }]
     creatureCount()    nearestCreature(x, y, r)
     spawnAt(x, y)      -> put one there, or null if that spot will not hold one
     lightFor(x, y)     -> how lit a point is to something that lives in the dark
     clear()            -> remove every creature (the sandbox and the tests)
     config             -> the numbers, so the guidebook prints rather than copies

   EVENTS emitted:
     "swing:started"   { toolId, kind, damage, reach, ticks, x, y, dx, dy }
     "creature:spawned"{ id, kind, band, x, y }
     "creature:hit"    { id, kind, x, y, damage, killed, hp, toolId }
     "creature:killed" { id, kind, x, y, why }
     "creature:attack" { id, kind, band, damage, x, y }

   `creature:attack` is the one that matters to anybody else: it is a
   creature landing a blow, and the damage it carries is not applied to
   anything by this lane. `state.player.energy` is lane B's branch and this
   lane does not write it (docs/ARCHITECTURE.md section 4). There is a
   request open for the one `bus.on` at their end that makes a bite hurt -
   docs/REQUESTS.md, "life -> actor: something has to be able to hurt the
   player" - and until it lands a crawler is frightening and harmless. That
   entry stays open until there is a CALL SITE, per WORKFLOW 4c.

   WHAT THIS LANE DOES NOT DO, deliberately: creatures drop nothing. A drop
   is matter appearing, and matter here comes from somewhere or it does not
   come at all (WORKFLOW 5c). Meat and hide belong with lane J's food items,
   and when they exist a kill will yield them through the same spawnDrop
   every other item uses. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { createCrawlers } from "./crawler.js";
import { createSwing, SWING_KEY } from "./swing.js";
import { drawCrawlers, drawSwing } from "./render_life.js";
import { sampleMotion, lightHere, noiseRadius, clearPlacedLights,
         noteLight, forgetLight, placedLightCount } from "./senses.js";
import { weaponFor, reachFor, cooldownFor, BANDS, ATTACK_RANGE, AWAKE,
         LIGHT_EDGE, LIGHT_FLEE, MIN_DEPTH, MAX_ALIVE, bandAt } from "./spec.js";

/* A key press that is somebody typing is not a command. Every lane in this
   project binds a letter and none of them check this, so the guidebook's
   search box currently drops your item and lays track as you type - worth
   copying rather than worth being smug about. It is a DOM question, so it
   answers false headless and costs nothing. */
function typingSomewhere(){
  if(typeof document === "undefined") return false;
  const a = document.activeElement;
  if(!a) return false;
  return a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable === true;
}

export function createLife(world, items){
  const crawlers = createCrawlers(world);
  const swing = createSwing(world, items, crawlers);

  bus.on("input:key", e => {
    if(!e.down || e.key !== SWING_KEY) return;
    if(state.paused || typingSomewhere()) return;
    swing.swing();
  });

  return {
    name: "life",

    init(){
      crawlers.seedStream((state.world.seed >>> 0) ^ 0x1f5c);
    },

    tick(){
      /* how loud the player is, measured before anything reads it */
      sampleMotion();
      swing.tick();
      crawlers.tick();
    },

    /* Drawn with the actors, after lane B's clonk, because a thing standing
       on top of you should be in front of you. */
    renderActor(ctx){
      drawCrawlers(ctx, crawlers.list);
      drawSwing(ctx, swing.lastSwing());
    },

    /* A creature that forgets it was wounded across a save is worse than no
       creature (the lane brief), so this exists from the first commit
       rather than as a later chore. */
    serialise(){ return crawlers.serialise(); },
    restore(data){ crawlers.restore(data); },

    api: {
      swing: swing.swing,
      canSwing: swing.ready,
      swingCooldown: swing.cooling,
      swingKey: SWING_KEY,

      weaponFor, reachFor, cooldownFor,

      creatures: () => crawlers.list.map(c => ({
        id: c.id, kind: c.kind, band: BANDS[c.band].name,
        x: c.x, y: c.y, hp: c.hp, hpMax: c.hpMax, mode: c.mode
      })),
      creatureCount: () => crawlers.list.length,

      /* Everything alive within r of a point. Asked for by lane J, who own
         husbandry - what a thing eats, what it gives and what comes off it -
         while this lane owns the animal itself. A cow that flees a wolf and a
         crawler that flees a lamp are the same machinery and belong in one
         place. `tame` is on every row from the start so that nothing has to
         change shape the day the first one exists. */
      creaturesNear(x, y, r){
        const out = [];
        const rr = (r === undefined ? Infinity : r);
        for(const c of crawlers.list){
          if(c.dead) continue;
          const d = Math.sqrt((c.x - x) * (c.x - x) + (c.y - y) * (c.y - y));
          if(d > rr) continue;
          out.push({ id: c.id, kind: c.kind, band: BANDS[c.band].name,
                     x: c.x, y: c.y, hp: c.hp, hpMax: c.hpMax, mode: c.mode,
                     tame: !!c.tame, fed: c.fed || 0, d });
        }
        return out;
      },

      nearestCreature(x, y, r){
        let best = null, bestD = r === undefined ? Infinity : r;
        for(const c of crawlers.list){
          if(c.dead) continue;
          const d = Math.sqrt((c.x - x) * (c.x - x) + (c.y - y) * (c.y - y));
          if(d <= bestD){ bestD = d; best = c; }
        }
        return best ? { id: best.id, kind: best.kind, x: best.x, y: best.y,
                        hp: best.hp, hpMax: best.hpMax, mode: best.mode,
                        band: BANDS[best.band].name, d: bestD } : null;
      },

      /* Put one there. Used by the tests and by lane G's sandbox: a
         creature you cannot summon is a creature nobody can look at. */
      spawnAt(x, y, band){
        const bi = band === undefined ? bandAt(y - world.surfaceAt(x)) : band;
        return crawlers.make(x, y, Math.min(BANDS.length - 1, Math.max(0, bi)));
      },
      trySpawn: crawlers.trySpawn,
      clear(){ crawlers.clear(); clearPlacedLights(); swing.reset(); },

      lightFor: (x, y) => lightHere(world, x, y),
      noiseRadius,
      noteLight, forgetLight, placedLightCount,

      config: {
        BANDS, ATTACK_RANGE, AWAKE, LIGHT_EDGE, LIGHT_FLEE, MIN_DEPTH,
        MAX_ALIVE, swingKey: SWING_KEY
      }
    }
  };
}
