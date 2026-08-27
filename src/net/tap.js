/* The tap: turning a local world change into something to send. LANE NET.

   Lane A's published mutators are the complete list of ways the landscape
   can change from outside lane A. So instead of asking every lane to
   announce what it did, net wraps that list while a room is open, records
   each successful call as an operation, and replays operations that arrive
   from other players.

   WHY A WRAP AND NOT AN EVENT. The right long-term shape is lane A emitting
   the change itself - it is filed in docs/REQUESTS.md - but that is their
   code and their commit, and this needs nothing from them to work today.
   The wrap is installed only while a session is running and removed when it
   ends, so single player pays nothing and nothing is patched that a save,
   a test or a reload can trip over.

   WHAT IS NOT AN OPERATION. Anything lane A does to itself: water finding
   its level, sand slumping, a pour settling, a tunnel collapsing. Those run
   inside lane A against whatever ground that client has resident, which
   differs between players by design. They are converged by the host sending
   ground (see session.js), not by being described. The rule of thumb is
   that an operation is something a PERSON did.

   Nor is a call that changed nothing: lane B asks to dig on every tick it
   holds the button, including the ticks where the face is granite. A dig
   that frees no pixel is not sent. */

import { bus } from "../core/bus.js";
import { DIG, CHOP, BLAST, DUMPM, DUMPI, SETMAT } from "./protocol.js";

/* Events a replayed operation must not fire, and why: the world yielding an
   item is how lane C spawns a chunk on the ground, and replaying a remote
   player's dig would spawn their spoil on every screen - matter created out
   of nothing, several times over. Their pack is their own until inventory
   replicates. `digFreeCircle` has a `collect` flag for exactly this and we
   use it; `chopAt` has none, so the events are silenced instead, which is
   the other half of the request to lane A. */
const MUTED = ["dig:yield", "tree:felled"];

function withMutedEvents(fn){
  const real = bus.emit;
  bus.emit = function(name, payload){
    if(MUTED.indexOf(name) >= 0) return;
    return real.call(bus, name, payload);
  };
  try { return fn(); } finally { bus.emit = real; }
}

export function createTap(world){
  const orig = {};
  let sink = null;        /* where recorded operations go, or null */
  let installed = false;
  let replaying = false;

  function record(op){
    if(replaying || !sink) return;
    try { sink(op); } catch(e){ /* a broken listener must not break digging */ }
  }

  function install(fn){
    sink = fn;
    if(installed) return;
    for(const name of ["digFreeCircle", "chopAt", "blast",
                       "dumpMaterial", "dumpItem", "setMat"]){
      orig[name] = world[name];
    }

    world.digFreeCircle = function(x, y, r, collect, toolId){
      const res = orig.digFreeCircle(x, y, r, collect, toolId);
      if(res && res.freed > 0){
        const gated = toolId !== undefined;
        record([DIG, x, y, r, gated ? 1 : 0, gated ? (toolId || null) : null]);
      }
      return res;
    };

    world.chopAt = function(x, y, r, toolId){
      const res = orig.chopAt(x, y, r, toolId);
      if(res && res.hit) record([CHOP, x, y, r, toolId === undefined ? null : (toolId || null)]);
      return res;
    };

    world.blast = function(x, y, r){
      const res = orig.blast(x, y, r);
      record([BLAST, x, y, r]);
      return res;
    };

    world.dumpMaterial = function(x, y, matIndex, pixels){
      const res = orig.dumpMaterial(x, y, matIndex, pixels);
      if(res && res.accepted > 0) record([DUMPM, x, y, matIndex, res.accepted]);
      return res;
    };

    world.dumpItem = function(x, y, itemId, count){
      const res = orig.dumpItem(x, y, itemId, count);
      if(res && res.accepted > 0) record([DUMPI, x, y, itemId, res.accepted]);
      return res;
    };

    world.setMat = function(x, y, m){
      const res = orig.setMat(x, y, m);
      record([SETMAT, x, y, m]);
      return res;
    };

    installed = true;
  }

  function remove(){
    sink = null;
    if(!installed) return;
    for(const name in orig) world[name] = orig[name];
    installed = false;
  }

  /* Replay one operation that arrived from another player. Nothing recorded
     while this runs, or a three-player room would echo every dig forever. */
  function apply(op){
    if(!installed || !Array.isArray(op)) return false;
    replaying = true;
    try {
      switch(op[0]){
        case DIG:
          /* collect:false - the pixels are removed, the spoil is not ours */
          orig.digFreeCircle(op[1], op[2], op[3], false, op[4] ? (op[5] || null) : undefined);
          return true;
        case CHOP:
          withMutedEvents(() => orig.chopAt(op[1], op[2], op[3],
                                            op[4] === null ? undefined : op[4]));
          return true;
        case BLAST:  orig.blast(op[1], op[2], op[3]); return true;
        case DUMPM:  orig.dumpMaterial(op[1], op[2], op[3], op[4]); return true;
        case DUMPI:  orig.dumpItem(op[1], op[2], op[3], op[4]); return true;
        case SETMAT: orig.setMat(op[1], op[2], op[3]); return true;
        default: return false;
      }
    } catch(e){
      /* an operation from a peer on a different build must not take the
         game down with it */
      return false;
    } finally {
      replaying = false;
    }
  }

  return {
    install, remove, apply,
    isInstalled(){ return installed; },
    isReplaying(){ return replaying; }
  };
}
