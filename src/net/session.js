/* The room: who is in it, and what they tell each other. LANE NET.

   A session is the model from docs/DECISIONS.md made concrete. It knows
   nothing about canvases, chunks or clonks - it is handed a TRANSPORT and a
   GAME adapter and does the rest, which is what lets the headless suite run
   two of them in one process against stub worlds.

   THE GAME ADAPTER (see index.js for the real one):
     seed()                current world seed
     regenerate(seed)      throw the world away and grow it from this seed
     snapshot(names)       { systemName: saveValue } for the named systems
     restore(map)          hand those values back
     chunkDiffs()          the landscape as [{ c, d }], lane A's save shape
     applyOp(op)           replay one world operation, -> bool
     localPose()           this player's pose, or null

   THE SHAPE OF A TICK, on both sides:
     1. everything the local player did this tick goes out as one frame
     2. the host applies what guests sent, and relays it to the others
     3. every few seconds the host sends the ground itself to anyone whose
        copy could have drifted

   Step 3 is why step 1 is allowed to be lossy. An operation that is
   dropped, capped or replayed against ground that had settled differently
   is corrected by the next sync, so nothing here has to be reliable in
   order to be correct - only prompt. */

import {
  PROTOCOL, HELLO, WELCOME, DENY, JOINED, PARTED, FRAME, SYNC, RESYNC,
  JOIN_SYSTEMS, MAX_OPS_FRAME, checkMessage, cleanName
} from "./protocol.js";

export const POSE_TICKS = 2;      /* 18 Hz of body, interpolated on arrival */
export const SYNC_TICKS = 360;    /* 10 s: ground is the backstop, not the road */
export const MAX_PEERS  = 7;

export function createSession({ transport, role, code, name, game, hooks = {} }){
  const isHost = role === "host";
  const self = { id: transport.id, name: cleanName(name) };
  const peers = new Map();          /* id -> { id, name } */
  const offs = [];

  let phase = isHost ? "live" : "connecting";   /* connecting|joining|live|lost */
  let hostId = isHost ? self.id : null;
  let outOps = [];
  let overflowed = false;
  let poseAt = 0, syncAt = 0, tick = 0;
  let wantFullSync = false;
  const sentChunks = new Map();     /* chunk index -> the diff last sent */
  const stats = { sent:0, received:0, opsIn:0, opsOut:0, syncs:0, dropped:0 };

  const say = (evt, data) => { if(hooks[evt]) hooks[evt](data); };

  /* ------------------------------------------------------------ send --- */
  function send(to, msg){ stats.sent++; transport.send(to, msg); }
  function toAll(msg, except){
    for(const id of transport.peers()){
      if(id === except) continue;
      send(id, msg);
    }
  }

  /* --------------------------------------------------------- capture --- */
  /* Called by the tap for every world change the local player caused. */
  function recordOp(op){
    if(outOps.length >= MAX_OPS_FRAME){
      /* Something is writing pixels in a loop. Drop the tail rather than
         send a message nobody can parse, and let the ground correct it. */
      overflowed = true; stats.dropped++;
      return;
    }
    outOps.push(op);
    stats.opsOut++;
  }

  /* ------------------------------------------------------- the ground --- */
  /* Only the chunks whose diff has CHANGED since we last sent one. Lane A
     gives the whole changed set at once, so the difference is taken here;
     `docs/REQUESTS.md` asks them for a cheaper way to ask the question. */
  function chunkUpdate(full){
    const list = game.chunkDiffs() || [];
    if(full){
      sentChunks.clear();
      for(const e of list) sentChunks.set(e.c, JSON.stringify(e.d));
      return list;
    }
    const out = [];
    for(const e of list){
      const packed = JSON.stringify(e.d);
      if(sentChunks.get(e.c) === packed) continue;
      sentChunks.set(e.c, packed);
      out.push(e);
    }
    return out;
  }

  function sendSync(to, full){
    const chunks = chunkUpdate(full);
    if(!chunks.length && !full) return 0;
    const msg = { t:SYNC, chunks };
    if(to) send(to, msg); else toAll(msg);
    stats.syncs++;
    return chunks.length;
  }

  /* ---------------------------------------------------------- joining --- */
  function welcome(to, theirName){
    if(peers.size >= MAX_PEERS){ send(to, { t:DENY, reason:"room is full" }); return; }
    peers.set(to, { id: to, name: cleanName(theirName) });

    /* the whole world, once: the seed plus every lane's save value. This is
       the save file, sent down a wire. */
    send(to, {
      t: WELCOME, p: PROTOCOL, code,
      seed: game.seed(), you: to,
      peers: [{ id: self.id, name: self.name }]
        .concat([...peers.values()].filter(p => p.id !== to)
                                   .map(p => ({ id:p.id, name:p.name }))),
      systems: game.snapshot(JOIN_SYSTEMS)
    });
    /* everyone else hears about it; the ground they share is unaffected */
    toAll({ t:JOINED, id: to, name: peers.get(to).name }, to);
    /* a joiner's baseline is now the full set, so the incremental sync
       everybody else gets has to start again from a known point */
    wantFullSync = true;
    say("onPeer", { id: to, name: peers.get(to).name, joined: true });
  }

  /* ---------------------------------------------------------- receive --- */
  function onMessage(from, raw){
    stats.received++;
    const m = checkMessage(raw, from);
    if(!m) return;

    /* A guest listens to the host and to nobody else. That is not caution
       about cheating - coop has no adversary - it is what makes the host
       the sequencer: two sources of truth would need an order agreed
       between them, which is the thing host authority exists to avoid. */
    if(!isHost && hostId && from !== hostId && m.t !== WELCOME) return;

    switch(m.t){
      case HELLO:
        if(isHost) welcome(from, m.name);
        return;

      case WELCOME: {
        if(isHost || phase === "live") return;
        hostId = from;
        self.id = m.you || self.id;
        peers.clear();
        for(const p of m.peers) if(p.id !== self.id) peers.set(p.id, p);
        /* the world, rebuilt: the seed first, then every lane's changes on
           top of it - which is exactly the order a load already runs in */
        game.regenerate(m.seed);
        game.restore(m.systems);
        phase = "live";
        say("onJoined", { code, hostId, peers: [...peers.values()] });
        for(const p of peers.values()) say("onPeer", { ...p, joined: true });
        return;
      }

      case DENY:
        phase = "lost";
        say("onError", new Error(m.reason));
        return;

      case JOINED:
        if(m.id === self.id) return;
        peers.set(m.id, { id:m.id, name:m.name });
        say("onPeer", { id:m.id, name:m.name, joined: true });
        return;

      case PARTED:
        if(!peers.has(m.id)) return;
        peers.delete(m.id);
        say("onPeer", { id:m.id, joined: false });
        return;

      case FRAME: {
        /* only the host may speak for a third party; a guest's claim about
           whose frame this is counts for nothing */
        const who = isHost ? from : m.id;
        if(who === self.id) return;
        if(m.pose) say("onPose", { id: who, pose: m.pose });
        for(const op of m.ops){ if(game.applyOp(op)) stats.opsIn++; }
        if(isHost){
          if(m.over) wantFullSync = true;
          if(m.pose || m.ops.length)
            toAll({ t:FRAME, id: who, pose: m.pose || undefined,
                    ops: m.ops.length ? m.ops : undefined }, from);
        }
        return;
      }

      case SYNC:
        if(isHost) return;                       /* ground flows one way */
        game.restore({ world: { chunks: m.chunks } });
        stats.syncs++;
        return;

      case RESYNC:
        if(isHost) sendSync(from, true);
        return;
    }
  }

  function onPeer(e){
    if(e.joined){
      if(!isHost && !hostId){
        /* the only peer a guest ever has is the host */
        hostId = e.id;
        phase = "joining";
        send(hostId, { t:HELLO, p:PROTOCOL, name:self.name });
      }
      return;
    }
    if(isHost){
      if(!peers.has(e.id)) return;
      peers.delete(e.id);
      toAll({ t:PARTED, id:e.id });
      say("onPeer", { id:e.id, joined:false });
    } else if(e.id === hostId){
      phase = "lost";
      peers.clear();
      say("onError", new Error("the host closed the room"));
    }
  }

  offs.push(transport.onMessage(onMessage));
  offs.push(transport.onPeer(onPeer));
  if(transport.onError) offs.push(transport.onError(err => say("onError", err)));

  /* a guest wired up before its listener existed still has to say hello */
  if(!isHost){
    const known = transport.peers();
    if(known.length) onPeer({ id: known[0], joined: true });
  }

  /* ------------------------------------------------------------- tick --- */
  function step(){
    tick++;
    if(phase !== "live" && phase !== "joining") return;

    const ops = outOps;
    outOps = [];
    const over = overflowed;
    overflowed = false;

    const posedue = tick - poseAt >= POSE_TICKS;
    if(phase === "live" && (ops.length || posedue)){
      const pose = posedue ? game.localPose() : null;
      if(posedue) poseAt = tick;
      const frame = { t:FRAME };
      if(pose) frame.pose = pose;
      if(ops.length) frame.ops = ops;
      if(over) frame.over = 1;
      if(isHost){ frame.id = self.id; toAll(frame); }
      else if(hostId) send(hostId, frame);
    }

    if(!isHost) return;
    if(over) wantFullSync = true;
    if(peers.size === 0){ syncAt = tick; return; }   /* nobody to tell */
    if(wantFullSync || tick - syncAt >= SYNC_TICKS){
      const full = wantFullSync;
      wantFullSync = false;
      syncAt = tick;
      sendSync(null, full);
    }
  }

  function close(){
    for(const off of offs) off();
    offs.length = 0;
    peers.clear();
    phase = "lost";
    try { transport.close(); } catch(e){}
  }

  return {
    role, code, self,
    recordOp, step, close,
    phase(){ return phase; },
    peers(){ return [...peers.values()]; },
    stats(){ return { ...stats, peers: peers.size, phase }; },
    /* the two the UI and the tests reach for */
    isLive(){ return phase === "live"; },
    requestResync(){ if(!isHost && hostId) send(hostId, { t:RESYNC }); },
    forceSync(){ if(isHost) wantFullSync = true; }
  };
}
