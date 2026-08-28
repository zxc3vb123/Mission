/* What crosses the wire. LANE NET.

   The model is in docs/DECISIONS.md (2026-08-28, "Coop is host-authoritative
   over the WORLD, client-owned over BODIES"). The short version:

     - a body is a POSE its owner broadcasts; nobody else simulates it
     - the landscape changes only through lane A's published mutators, and
       each of those is a handful of numbers, so a change is an OPERATION
       that every peer replays over ground grown from the same seed
     - the host is the sequencer, and the ground itself is the tie-breaker

   Everything here is data and pure functions: no world, no transport, no
   browser. That is what lets the suite drive two peers in one process.

   MESSAGES ARE HOSTILE INPUT. They arrive from another player's browser,
   which may be on a different build, a broken build, or someone poking the
   channel by hand. Every field is checked before it reaches lane A - and
   the checks that matter most are the CAPS, because `blast(x, y, 1e9)` is
   not a wrong picture, it is a loop that never returns. */

export const PROTOCOL = 1;

/* Caps. Each one is the answer to "what would a malformed value cost?" */
export const MAX_RADIUS      = 256;     /* dig/chop/blast: the loop is O(r^2) */
export const MAX_PIXELS      = 1 << 20; /* a single pour */
export const MAX_COUNT       = 100000;  /* items in one dump */
export const MAX_OPS_FRAME   = 128;     /* per peer per tick; overflow resyncs */
export const MAX_CHUNKS_MSG  = 4096;    /* chunk diffs in one message */
export const MAX_NAME        = 20;
export const MAX_ID          = 64;

/* Operation kinds - one per published world mutator. If lane A publishes a
   new way to change the landscape it needs a kind here and a case in
   src/net/tap.js, or it changes the terrain on one screen only. */
export const DIG = "dig", CHOP = "chop", BLAST = "blast";
export const DUMPM = "dumpm", DUMPI = "dumpi", SETMAT = "setmat";

/* Systems whose state is part of THE WORLD rather than of a person, and so
   is handed to a joiner. `items` is deliberately absent: a pack and a
   hotbar belong to a player, and copying the host's would be a duplication
   of matter as well as a surprise. A lane adding a world-shared system adds
   its name here. */
export const JOIN_SYSTEMS = ["world", "build", "gatherables"];

/* WHAT A JOINER GETS OF A BUILDING IS ITS SHAPE, NEVER ITS WORK.

   This is the sharp edge of the whole payload and it is worth the words.
   A station is not a picture, it is a machine that runs on its own: lane C's
   `tickJob` completes a job into the station's own store, and then, finding
   itself idle, RESTARTS from that same store. Nothing in it needs a player.

   So a station copied to a second client is not a copy of a thing, it is a
   copy of a PROCESS. Both clients run it, both put a bar in their own store,
   and neither knows about the other - so one kiln with a standing recipe and
   a hopper of ore becomes one production stream PER PLAYER IN THE ROOM, out
   of one set of materials. That is conservation of matter broken along the
   player axis, which is the one axis the rule was never written against.

   Until lane C can say "this station is a replica, do not run it"
   (docs/REQUESTS.md), a replica must arrive INERT. A joiner gets where the
   buildings are and whether they are finished, which is what makes the world
   look like the host's; it does not get what is inside them or what they are
   part way through, because both ends would then do that work. A chest that
   reads empty is a stale picture. A forge that runs twice is invented iron. */
export const WORK_FIELDS = ["store", "job", "taking", "recipe"];

function inert(data){
  if(!data || !Array.isArray(data.structures)) return data;
  return Object.assign({}, data, {
    structures: data.structures.map(st => {
      const copy = Object.assign({}, st);
      for(const f of WORK_FIELDS) if(f in copy) copy[f] = null;
      return copy;
    })
  });
}

/* Applied on the way OUT and on the way IN. The one that protects you is the
   way in: a host on an older build would send the work regardless. */
export function sanitiseJoin(map){
  if(!map || typeof map !== "object") return {};
  const out = {};
  for(const name of JOIN_SYSTEMS){
    if(map[name] === undefined) continue;
    out[name] = name === "build" ? inert(map[name]) : map[name];
  }
  return out;
}

/* ...and the subset reconciled continuously afterwards. Only the landscape,
   for now, because its restore is per-chunk and additive. `build.restore`
   replaces the whole structure list, so syncing it would delete a guest's
   own campfire every few seconds until placement itself replicates. */
export const SYNC_SYSTEMS = ["world"];

const num   = v => typeof v === "number" && Number.isFinite(v);
const coord = v => num(v) && v > -1e6 && v < 1e6;
const idx   = v => num(v) && v >= 0 && v < 1e7 && (v | 0) === v;
/* A seed is a full 32-bit value and a chunk index is not. They were checked
   by the same rule once, and the room silently refused every welcome: a real
   seed is nine digits, `idx` caps at seven, and the joiner sat in "joining"
   for ever with no error, because a message that fails its check is dropped
   rather than answered. Found by opening two browsers, which is exactly the
   thing the headless suite cannot do. */
const u32   = v => Number.isInteger(v) && v >= 0 && v <= 4294967295;
const str   = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v, max) => v === null || str(v, max);

export function cleanName(v){
  if(typeof v !== "string") return "player";
  const s = v.replace(/[^\x20-\x7e]/g, "").trim().slice(0, MAX_NAME);
  return s || "player";
}

/* ------------------------------------------------------------- ops ------ */
/* Encoded as arrays because they are the message that repeats: one per tick
   per digging player. [kind, ...args]. */

export function validOp(o){
  if(!Array.isArray(o)) return false;
  switch(o[0]){
    /* [dig, x, y, r, gated, toolId|null]
       `gated` is carried because lane A's tier gate keys off whether the
       argument was passed AT ALL - undefined means "no gate", null means
       "bare hands" - and JSON cannot tell those two apart. */
    case DIG:
      return o.length === 6 && coord(o[1]) && coord(o[2]) &&
             num(o[3]) && o[3] >= 0 && o[3] <= MAX_RADIUS &&
             (o[4] === 0 || o[4] === 1) && optStr(o[5], MAX_NAME);
    /* [chop, x, y, r, toolId|null] */
    case CHOP:
      return o.length === 5 && coord(o[1]) && coord(o[2]) &&
             num(o[3]) && o[3] >= 0 && o[3] <= MAX_RADIUS && optStr(o[4], MAX_NAME);
    /* [blast, x, y, r] */
    case BLAST:
      return o.length === 4 && coord(o[1]) && coord(o[2]) &&
             num(o[3]) && o[3] >= 0 && o[3] <= MAX_RADIUS;
    /* [dumpm, x, y, matIndex, pixels] */
    case DUMPM:
      return o.length === 5 && coord(o[1]) && coord(o[2]) &&
             idx(o[3]) && o[3] < 256 && num(o[4]) && o[4] >= 0 && o[4] <= MAX_PIXELS;
    /* [dumpi, x, y, itemId, count] */
    case DUMPI:
      return o.length === 5 && coord(o[1]) && coord(o[2]) &&
             str(o[3], MAX_NAME) && num(o[4]) && o[4] >= 0 && o[4] <= MAX_COUNT;
    /* [setmat, x, y, matIndex] */
    case SETMAT:
      return o.length === 4 && coord(o[1]) && coord(o[2]) && idx(o[3]) && o[3] < 256;
    default: return false;
  }
}

export function validOps(list){
  return Array.isArray(list) && list.length <= MAX_OPS_FRAME && list.every(validOp);
}

/* ------------------------------------------------------------ pose ------ */
/* [x, y, dir, act, aimX, aimY, lampOn]. A body is small and sent often, so
   it is an array too, and the coordinates are quantised to a quarter pixel
   because nobody can see the rest of the float. */
export function poseOf(c, lampOn){
  return [ Math.round(c.x * 4) / 4, Math.round(c.y * 4) / 4,
           c.dir < 0 ? -1 : 1, String(c.act || "").slice(0, 16),
           Math.round((c.digX || 0) * 100) / 100,
           Math.round((c.digY || 0) * 100) / 100,
           lampOn ? 1 : 0 ];
}
export function validPose(p){
  return Array.isArray(p) && p.length === 7 &&
         coord(p[0]) && coord(p[1]) && (p[2] === 1 || p[2] === -1) &&
         typeof p[3] === "string" && p[3].length <= 16 &&
         num(p[4]) && num(p[5]) && (p[6] === 0 || p[6] === 1);
}
export function readPose(p){
  return { x:p[0], y:p[1], dir:p[2], act:p[3], aimX:p[4], aimY:p[5], lamp:!!p[6] };
}

/* ---------------------------------------------------------- chunks ------ */
/* Lane A's run-length diff of a changed chunk against a freshly generated
   one - `world.serialise()`, the same value the save file carries. */
export function validChunks(list){
  if(!Array.isArray(list) || list.length > MAX_CHUNKS_MSG) return false;
  for(const e of list){
    if(!e || !idx(e.c) || !Array.isArray(e.d)) return false;
    for(const v of e.d) if(!num(v)) return false;
  }
  return true;
}

/* -------------------------------------------------------- messages ------ */
export const HELLO = "hello", WELCOME = "welcome", DENY = "deny";
export const JOINED = "joined", PARTED = "parted";
export const FRAME = "frame", SYNC = "sync", RESYNC = "resync";

/* The world entry of a welcome, which is the only part of the systems blob
   with a shape this file can check; the rest is another lane's opaque save
   value and is checked by whoever restores it. */
function chunksOf(m){
  const w = m.systems && m.systems.world;
  return w && Array.isArray(w.chunks) ? w.chunks : [];
}

/* Returns the message if it is well formed and safe to act on, else null.
   `from` is the id the TRANSPORT says it came from; a message may not name
   somebody else, so a sender's own claim about identity is discarded. */
export function checkMessage(m, from){
  if(!m || typeof m !== "object" || typeof m.t !== "string") return null;
  if(!str(from, MAX_ID)) return null;
  switch(m.t){
    case HELLO:
      if(m.p !== PROTOCOL) return null;
      return { t:HELLO, from, name: cleanName(m.name) };
    case WELCOME:
      if(m.p !== PROTOCOL || !u32(m.seed) || !validChunks(chunksOf(m))) return null;
      if(!str(m.you, MAX_ID) || !Array.isArray(m.peers)) return null;
      return { t:WELCOME, from, seed:m.seed, you:m.you,
               systems: sanitiseJoin(m.systems),
               peers: m.peers.filter(p => p && str(p.id, MAX_ID))
                             .map(p => ({ id:p.id, name: cleanName(p.name) })) };
    case DENY:
      return { t:DENY, from,
               reason: typeof m.reason === "string" ? m.reason.slice(0,80) : "refused" };
    case JOINED:
      if(!str(m.id, MAX_ID)) return null;
      return { t:JOINED, from, id:m.id, name: cleanName(m.name) };
    case PARTED:
      if(!str(m.id, MAX_ID)) return null;
      return { t:PARTED, from, id:m.id };
    case FRAME: {
      /* only the HOST may speak for somebody else, and it does so by
         stamping `id` on what it relays; the session decides whether to
         believe that, because only it knows who the host is */
      const who = str(m.id, MAX_ID) ? m.id : from;
      const pose = m.pose === undefined || m.pose === null
        ? null : (validPose(m.pose) ? m.pose : undefined);
      if(pose === undefined) return null;
      const ops = m.ops === undefined ? [] : (validOps(m.ops) ? m.ops : undefined);
      if(ops === undefined) return null;
      return { t:FRAME, from, id:who, pose, ops, over: m.over === 1 };
    }
    case SYNC:
      if(!validChunks(m.chunks)) return null;
      return { t:SYNC, from, chunks:m.chunks };
    case RESYNC:
      return { t:RESYNC, from };
    default: return null;
  }
}

export const encode = m => JSON.stringify(m);
export function decode(text){
  if(typeof text !== "string") return (text && typeof text === "object") ? text : null;
  try { return JSON.parse(text); } catch(e){ return null; }
}
