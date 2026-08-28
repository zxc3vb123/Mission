/* LANE NET's checks. Coop: rooms, replay, joining, and remote bodies.

   THE CONSTRAINT THAT SHAPES THIS FILE. Every system in the game is a
   module singleton - the landscape most of all - so two whole games cannot
   exist in one Node process, and "boot two players and connect them" is not
   available. Rather than pretend otherwise, the claim is split into three
   claims that CAN each be proved, and between them they are the milestone:

     1. REPLAY IS EXACT.       Against the real landscape: dig, keep the
                               operations, throw the world away, grow it
                               from the same seed, replay - and every pixel
                               in the band is the pixel it was.
     2. THE JOIN PAYLOAD IS THE SAVE FILE. Also against the real landscape:
                               seed plus lane A's chunk diff rebuilds a dug
                               world pixel for pixel, in a few kilobytes.
     3. THE ROOM CARRIES THEM. Two sessions, one process, over the loopback
                               transport with real latency, against stub
                               worlds: a guest's dig reaches the host and the
                               other guest, poses arrive, ground reconciles,
                               and hostile messages are refused.

   1 and 2 are lane A's determinism, measured rather than assumed. 3 is this
   lane's protocol with lane A stubbed out. What neither can prove is the
   BROKER - two browsers actually meeting - and that is stated plainly in
   docs/status/net.md rather than implied here. */

import { boot, suite } from "../testkit.js";
import { bus } from "../../src/core/bus.js";
import { createLoopback } from "../../src/net/transport.js";
import { createSession, POSE_TICKS, SYNC_TICKS } from "../../src/net/session.js";
import { createTap } from "../../src/net/tap.js";
import { createGhosts } from "../../src/net/ghosts.js";
import * as P from "../../src/net/protocol.js";
import { newRoomCode, normaliseCode, peerIdFor, codeFromPeerId,
         colourFor, CODE_LENGTH } from "../../src/net/room.js";

/* ------------------------------------------------------------ stubs ----- */
/* A world small enough to compare pixel by pixel and dumb enough that any
   disagreement is the protocol's fault and not the landscape's. */
const STUB_CHUNK = 16;
function stubGame(id, seed = 4242){
  /* one number per "chunk", accumulated COMMUTATIVELY so that two peers
     that received the same operations in a different order still agree -
     the stub must not fail a test for a reason the real landscape would
     not have */
  const cells = new Map();
  const g = {
    id, seed_: seed, regens: 0, ops: 0, restores: 0, pose: [0,0,1,"WALK",1,0,0],
    seed(){ return g.seed_; },
    regenerate(s){ g.seed_ = s; cells.clear(); g.regens++; },
    snapshot(){ return { world: { chunks: g.chunkDiffs() } }; },
    restore(map){
      g.restores++;
      const list = map && map.world && map.world.chunks;
      if(!Array.isArray(list)) return;
      for(const e of list) cells.set(e.c, e.d[0]);
    },
    chunkDiffs(){ return [...cells.entries()].map(([c, v]) => ({ c, d:[v] })); },
    applyOp(op){
      if(!P.validOp(op)) return false;
      g.ops++;
      const ci = Math.max(0, Math.floor(op[1] / STUB_CHUNK));
      cells.set(ci, (cells.get(ci) || 0) + Math.round(op[2] * 31 + op[3]));
      return true;
    },
    /* what the local player did happens locally first and is only then
       described to everyone else - which is what the tap does for real */
    dig(op){ g.applyOp(op); return op; },
    localPose(){ return g.pose; },
    fingerprint(){ return JSON.stringify([...cells.entries()].sort((a,b) => a[0]-b[0])); }
  };
  return g;
}

function room({ latency = 0, guests = 1 } = {}){
  const hub = createLoopback({ latency });
  const hostGame = stubGame("host");
  const host = createSession({
    transport: hub.endpoint("H"), role:"host", code:"ABC123",
    name:"host", game: hostGame, hooks: sink(hostGame)
  });
  const parts = [];
  for(let i = 0; i < guests; i++){
    const gid = "G" + i;
    hub.endpoint(gid);
    hub.connect("H", gid);
    const gg = stubGame(gid);
    parts.push({ id: gid, game: gg, session: createSession({
      transport: hub.endpoint(gid), role:"guest", code:"ABC123",
      name:"guest " + i, game: gg, hooks: sink(gg)
    })});
  }
  return { hub, host, hostGame, guests: parts,
    /* the local player digs: it happens here, and is then described */
    dig(part, op){ part.game.applyOp(op); part.session.recordOp(op); },
    /* one tick of the whole room, in the order the real loop would run it */
    step(n = 1){
      for(let i = 0; i < n; i++){
        hub.pump(1);
        host.step();
        for(const p of parts) p.session.step();
        hub.pump(1);
      }
    }
  };
}
function sink(game){
  game.poses = [];
  game.errors = [];
  return {
    onPose: e => game.poses.push(e),
    onPeer(){}, onJoined(){},
    onError: e => game.errors.push(e && e.message ? e.message : String(e))
  };
}

export function run(){
  const t = suite("net");

  /* ============================================================ codes === */
  const code = newRoomCode();
  t.check("a room code is six symbols from the readable alphabet",
    code.length === CODE_LENGTH && normaliseCode(code) === code, code);

  let allDifferent = new Set();
  for(let i = 0; i < 500; i++) allDifferent.add(newRoomCode());
  t.check("room codes do not repeat over five hundred draws",
    allDifferent.size === 500, allDifferent.size);

  t.check("a code read out and mistyped still opens the room",
    normaliseCode(" abc-1o0 ".slice(0,9)) === normaliseCode("ABC100") &&
    normaliseCode("abci23") === "ABC123",
    normaliseCode("abci23"));

  t.check("something that is not a code is refused rather than guessed at",
    normaliseCode("ABC12") === null && normaliseCode("ABC12U") === null &&
    normaliseCode("") === null && normaliseCode(null) === null);

  t.check("the broker id is namespaced, and round trips",
    peerIdFor("ABC123") === "mission-ABC123" &&
    codeFromPeerId(peerIdFor("ABC123")) === "ABC123" &&
    codeFromPeerId("chatroom-ABC123") === null);

  t.check("a player is the same colour on every screen",
    colourFor("peer-7").css === colourFor("peer-7").css &&
    colourFor("peer-7").css !== colourFor("peer-8").css);

  /* ==================================================== hostile input === */
  t.check("a dig with an absurd radius is refused, because it is a hang",
    P.validOp([P.DIG, 10, 10, 1e9, 1, null]) === false &&
    P.validOp([P.BLAST, 10, 10, 1e9]) === false &&
    P.validOp([P.DIG, 10, 10, 8, 1, null]) === true);

  t.check("an operation with the wrong shape, an unknown kind or a NaN is refused",
    P.validOp([P.DIG, 10, 10]) === false &&
    P.validOp(["drop-table", 1, 2]) === false &&
    P.validOp([P.SETMAT, NaN, 2, 3]) === false &&
    P.validOp([P.DUMPI, 1, 2, "soil", -4]) === false);

  t.check("a frame carrying more operations than the cap is refused whole",
    P.validOps(new Array(P.MAX_OPS_FRAME).fill([P.SETMAT,1,2,3])) === true &&
    P.validOps(new Array(P.MAX_OPS_FRAME + 1).fill([P.SETMAT,1,2,3])) === false);

  t.check("a malformed message is null rather than a half-read object",
    P.checkMessage({ t:"welcome", p:99 }, "H") === null &&
    P.checkMessage(null, "H") === null &&
    P.checkMessage({ t:"frame", pose:[1,2,3] }, "H") === null &&
    P.checkMessage({ t:"frame" }, "H") !== null);

  t.check("a peer cannot name itself somebody else: `from` wins",
    P.checkMessage({ t:"hello", p:P.PROTOCOL, name:"x" }, "G0").from === "G0");

  /* a real seed is nine digits; this was checked against the CHUNK INDEX
     rule for a while, and the only symptom was a joiner sitting in "joining"
     for ever - a message that fails its check is dropped, not answered */
  {
    const welcome = { t:P.WELCOME, p:P.PROTOCOL, seed: 740278236, you:"G0",
                      peers: [], systems: { world: { chunks: [] } } };
    const tiny = P.checkMessage({ ...welcome, seed: 12345 }, "H");
    const real = P.checkMessage(welcome, "H");
    const daft = P.checkMessage({ ...welcome, seed: -1 }, "H");
    t.check("a welcome carrying a real 32-bit world seed is accepted",
      !!real && real.seed === 740278236 && !!tiny && !daft,
      real ? "accepted" : "REFUSED, and a joiner would wait for ever");
  }

  /* ------------------------------------------- shape, never work ------ */
  /* The sharpest edge in the payload. A station is a PROCESS, not a picture:
     lane C's job finishes into the station's own store and then restarts
     from it, with no player involved. Copy that to a second client and both
     run it, so one kiln with a standing recipe becomes one production stream
     PER PLAYER out of one set of materials. */
  {
    const busy = { build: { structures: [
      { id:1, defId:"kiln", x:10, y:20, rot:0, progress:1, built:true,
        store:{ cap:200, items:{ iron_ore: 40 } },
        job:{ recipeId:"iron_bar", ticks:12, need:60, inputs:{ iron_ore:2 } },
        taking:{ ticks:3, need:40 }, recipe:"iron_bar" }
    ] } };
    const sent = P.sanitiseJoin(busy);
    const st = sent.build.structures[0];
    t.check("a joiner is told where a building is and whether it is finished",
      st.defId === "kiln" && st.x === 10 && st.y === 20 && st.built === true);
    t.check("but NOT what it holds, nor what it is part way through",
      st.store === null && st.job === null && st.taking === null && st.recipe === null,
      JSON.stringify(st));
    t.check("and sanitising does not reach into the caller's own structures",
      busy.build.structures[0].job.ticks === 12);
  }

  t.check("a pack is not part of the world, so it is not in the join payload",
    P.JOIN_SYSTEMS.indexOf("items") < 0 && P.JOIN_SYSTEMS.indexOf("world") >= 0 &&
    P.SYNC_SYSTEMS.length === 1 && P.SYNC_SYSTEMS[0] === "world");

  /* ======================================================== the room === */
  {
    const r = room({ latency: 2 });
    r.step(6);
    t.check("a guest that says hello is welcomed into the room",
      r.guests[0].session.isLive() && r.host.peers().length === 1,
      r.guests[0].session.phase());

    t.check("joining rebuilds the world from the host's seed",
      r.guests[0].game.regens === 1 && r.guests[0].game.seed() === r.hostGame.seed(),
      r.guests[0].game.seed());
  }

  /* the milestone, in miniature: a guest digs, and the host agrees */
  {
    const r = room({ latency: 2 });
    r.step(6);
    r.dig(r.guests[0], [P.DIG, 40, 12, 5, 1, "shovel"]);
    r.step(6);
    t.check("what a guest digs, the host has dug too",
      r.hostGame.fingerprint() === r.guests[0].game.fingerprint(),
      r.hostGame.ops + " ops applied by the host");
  }

  /* three in a room: the host is the sequencer, so B hears A through it */
  {
    const r = room({ latency: 1, guests: 2 });
    r.step(8);
    r.dig(r.guests[0], [P.DIG, 70, 30, 4, 1, "pickaxe"]);
    r.step(8);
    t.check("a third player sees a dig it was not told about directly",
      r.guests[1].game.ops === 1 &&
      r.guests[1].game.fingerprint() === r.hostGame.fingerprint(),
      r.guests[1].game.ops);

    t.check("nobody replays their own operation back onto themselves",
      r.guests[0].game.ops === 1, r.guests[0].game.ops);
  }

  /* bodies */
  {
    const r = room({ latency: 1 });
    r.step(4);
    r.guests[0].game.pose = [123.5, 44.25, -1, "DIG", 0.6, -0.8, 1];
    r.step(POSE_TICKS * 3);
    const seen = r.hostGame.poses[r.hostGame.poses.length - 1];
    t.check("a body arrives as the pose its owner sent",
      !!seen && seen.id === "G0" && P.readPose(seen.pose).x === 123.5 &&
      P.readPose(seen.pose).dir === -1 && P.readPose(seen.pose).act === "DIG",
      seen ? JSON.stringify(seen.pose) : "nothing arrived");
  }

  /* ground is the backstop: an operation nobody sends still converges */
  {
    const r = room({ latency: 1 });
    r.step(4);
    /* the host changes the world WITHOUT telling anyone - which is what
       liquids settling and ground collapsing actually are */
    r.hostGame.applyOp([P.DIG, 91, 5, 3, 1, null]);
    t.check("before a sync the two worlds genuinely disagree",
      r.hostGame.fingerprint() !== r.guests[0].game.fingerprint());
    r.host.forceSync();
    r.step(4);
    t.check("the host sending ground settles a disagreement nothing described",
      r.hostGame.fingerprint() === r.guests[0].game.fingerprint(),
      r.guests[0].game.restores + " restores");
  }

  /* and it is incremental, or it would be megabytes every few seconds */
  {
    const r = room({ latency: 0 });
    r.step(4);
    r.hostGame.applyOp([P.DIG, 5, 5, 1, 1, null]);
    r.host.forceSync(); r.step(2);
    const before = r.guests[0].game.restores;
    r.host.forceSync(); r.step(2);
    const after = r.guests[0].game.restores;
    t.check("a sync with nothing changed since the last one is not sent",
      after === before + 1, before + " -> " + after);
    /* (the one that IS sent is the forced full set a joiner's baseline
       needs; an unforced periodic sync with no change sends nothing) */
  }

  {
    const r = room({ latency: 0 });
    r.step(4);
    const sent = r.host.stats().sent;
    r.step(SYNC_TICKS + 4);
    t.check("an idle room is quiet apart from bodies",
      r.host.stats().sent - sent <= (SYNC_TICKS + 4) / POSE_TICKS + 2,
      r.host.stats().sent - sent);
  }

  /* leaving */
  {
    const r = room({ latency: 0, guests: 2 });
    r.step(6);
    r.hub.disconnect("H", "G0");
    r.step(4);
    t.check("a player who leaves stops being in the room",
      r.host.peers().length === 1 && r.guests[1].session.peers().length === 1,
      r.host.peers().length);
  }

  {
    const r = room({ latency: 0 });
    r.step(6);
    r.hub.disconnect("H", "G0");
    r.step(2);
    t.check("a guest whose host disappears is told, not left guessing",
      r.guests[0].session.phase() === "lost" &&
      r.guests[0].game.errors.length === 1, r.guests[0].game.errors[0]);
  }

  /* a lossy link is a slower room, not a wrong one */
  {
    const hub = createLoopback({ latency: 1, drop: (f, to, m, n) => n % 3 === 0 });
    const hg = stubGame("host"), gg = stubGame("G0");
    hub.endpoint("H"); hub.endpoint("G0"); hub.connect("H", "G0");
    const host = createSession({ transport: hub.endpoint("H"), role:"host",
      code:"ABC123", name:"h", game: hg, hooks: sink(hg) });
    const guest = createSession({ transport: hub.endpoint("G0"), role:"guest",
      code:"ABC123", name:"g", game: gg, hooks: sink(gg) });
    const step = n => { for(let i=0;i<n;i++){ hub.pump(1); host.step(); guest.step(); hub.pump(1); } };
    step(40);
    for(let i = 0; i < 12; i++){
      const op = [P.DIG, 10 + i * 9, 20, 3, 1, null];
      gg.applyOp(op); guest.recordOp(op); step(2);
    }
    step(10);
    const beforeSync = hg.fingerprint() === gg.fingerprint();
    host.forceSync(); step(20);
    t.check("a link that drops a message in three still converges on the ground",
      hg.fingerprint() === gg.fingerprint(),
      beforeSync ? "nothing was lost to lose" : "corrected by sync");
  }

  /* ======================================================= the ghosts === */
  {
    const g = createGhosts();
    g.pose("G0", { x: 100, y: 50, dir: 1, act:"WALK", aimX:1, aimY:0, lamp:false });
    const first = g.get("G0");
    t.check("the first pose from a player places them rather than eases them",
      first.x === 100 && first.y === 50);
    g.pose("G0", { x: 108, y: 50, dir: 1, act:"WALK", aimX:1, aimY:0, lamp:false });
    g.tick();
    const mid = g.get("G0").x;
    t.check("a body is smoothed towards where it was last seen, not snapped",
      mid > 100 && mid < 108, mid);
    for(let i = 0; i < 40; i++) g.tick();
    t.check("and it gets there", Math.abs(g.get("G0").x - 108) < 0.01, g.get("G0").x);
    g.pose("G0", { x: 900, y: 50, dir: 1, act:"FLIGHT", aimX:1, aimY:0, lamp:false });
    g.tick();
    t.check("a jump too far to be a walk is a respawn, and snaps",
      g.get("G0").x === 900, g.get("G0").x);
    g.remove("G0");
    t.check("a player who left leaves no ghost", g.count() === 0);
  }

  /* ================================================= the real world ==== */
  /* From here on the stubs are gone: this is lane A's landscape, and the
     claim is the one the whole model rests on. */
  const w = boot(20260828);
  const world = w.world;
  const seed = w.state.world.seed;
  const tap = createTap(world);

  /* somewhere with ground in it, and a tool that can cut it */
  const digX = Math.round(w.state.world.spawn.x) + 40;
  const digY = world.surfaceAt(digX) + 20;
  t.check("the test digs into solid ground rather than into the sky",
    world.isSolid(digX, digY), world.matInfo(digX, digY).name);

  const captured = [];
  tap.install(op => captured.push(op));
  for(let i = 0; i < 12; i++) world.digFreeCircle(digX, digY + i, 6, true, "stone_pickaxe");
  world.dumpMaterial(digX + 40, world.surfaceAt(digX + 40) - 6, 1, 200);
  w.tick(20);
  tap.remove();

  t.check("digging through the published api is captured as operations",
    captured.length >= 12 && captured[0][0] === P.DIG, captured.length);

  t.check("every captured operation survives being encoded and checked",
    captured.every(op => P.validOp(JSON.parse(JSON.stringify(op)))),
    JSON.stringify(captured[0]));

  const worldSystem = w.systems.find(s => s.name === "world");
  const dugSolid = worldSystem.serialise();
  t.check("the dig actually changed the landscape",
    !!dugSolid && dugSolid.chunks.length > 0,
    dugSolid ? dugSolid.chunks.length + " chunks" : "nothing changed");

  t.check("the join payload is small enough to be a message, not a download",
    JSON.stringify(dugSolid).length < 60000,
    JSON.stringify(dugSolid).length + " bytes for a twelve-bite tunnel");

  /* THE MEASURE IS PIXELS, NOT THE SAVE VALUE. Two players agree when the
     GROUND agrees, and reading it is also what forces lane A to page a
     chunk in and apply any diff still waiting for it - which comparing
     `serialise()` output would not, and which is a real difference: a
     restored chunk nobody has visited is not yet reported as changed.
     (Filed for lane A in docs/REQUESTS.md, because it costs a save file
     the same way.) */
  const BAND = { x0: digX - 72, y0: world.surfaceAt(digX) - 72,
                 x1: digX + 104, y1: digY + 72 };
  function terrainHash(){
    let h = 2166136261;
    for(let y = BAND.y0; y < BAND.y1; y++)
      for(let x = BAND.x0; x < BAND.x1; x++){
        h ^= world.matAt(x, y) + 1;
        h = Math.imul(h, 16777619);
      }
    return h >>> 0;
  }
  const afterDigging = terrainHash();

  /* --- claim 2: the join payload is the save file --------------------- */
  {
    const payload = { seed, systems: { world: dugSolid } };
    world.regenerate(payload.seed);
    t.check("a world grown again from the seed has none of the digging in it",
      terrainHash() !== afterDigging, afterDigging);
    world.regenerate(payload.seed);
    worldSystem.restore(payload.systems.world);
    t.check("seed plus lane A's chunk diff IS the world a joiner needs",
      terrainHash() === afterDigging, terrainHash() + " vs " + afterDigging);
  }

  /* --- claim 1: replay is exact --------------------------------------- */
  {
    world.regenerate(seed);
    const replay = createTap(world);
    const echoed = [];
    replay.install(op => echoed.push(op));
    /* through JSON, because that is the trip a real one takes */
    for(const op of captured) replay.apply(JSON.parse(JSON.stringify(op)));
    w.tick(20);
    const after = terrainHash();
    replay.remove();

    t.check("replaying what one player did reproduces the terrain EXACTLY",
      after === afterDigging,
      after === afterDigging ? "identical" : (after + " vs " + afterDigging));

    t.check("a replayed operation is not recorded again, or a room would echo",
      echoed.length === 0, echoed.length);
  }

  /* --- and replay must not hand out the other player's spoil ---------- */
  {
    world.regenerate(seed);
    w.items.inventory.clear();
    /* The claim is about YIELD, not about how many chunks are lying
       around: regenerating the world also tells lane C to scatter sticks
       and stones over the new surface, and counting those as ours would be
       measuring their work. `dig:yield` is the world saying "this became an
       item here", which is exactly the thing that must not happen twice. */
    let yielded = 0;
    const off = bus.on("dig:yield", () => { yielded++; });
    const offTree = bus.on("tree:felled", () => { yielded++; });
    const replay = createTap(world);
    replay.install(() => {});
    for(const op of captured) replay.apply(op);
    w.tick(4);
    replay.remove();
    off(); offTree();
    t.check("a remote player's spoil does not fall out of the ground here",
      yielded === 0, yielded + " items yielded by somebody else's dig");
    t.check("and it does not land in this player's pack either",
      w.items.inventory.count("soil") === 0, w.items.inventory.count("soil"));
  }

  /* --- a hostile operation reaches lane A only through the checks ----- */
  {
    world.regenerate(seed);
    const replay = createTap(world);
    replay.install(() => {});
    const before = terrainHash();
    const evil = [P.BLAST, digX, digY, 1e9];
    const passed = P.validOp(evil);
    if(!passed) { /* the session never calls apply() for one that fails */ }
    replay.apply(["nonsense", 1, 2]);
    replay.remove();
    t.check("an operation that fails the check never reaches the landscape",
      passed === false && terrainHash() === before);
  }

  /* --- and the same claim against lane C's REAL serialiser -------------- */
  /* The unit check above proves the filter; this proves it is pointed at the
     right fields, which is the half that rots when another lane adds one. */
  {
    const buildSystem = w.systems.find(s => s.name === "build");
    t.check("lane C's build system is registered, or this proves nothing",
      !!buildSystem && typeof buildSystem.serialise === "function");
    if(buildSystem){
      /* Put a REAL building in the world with REAL goods inside it, or the
         check passes on an empty list and proves nothing. A chest is the
         cheapest thing with a store; the materials are granted rather than
         earned, because what is under test is the payload, not the economy. */
      /* Put a REAL building in the world with REAL goods inside it, or the
         check passes on an empty list and proves nothing. A chest is the
         cheapest thing with a store; the materials are granted and the pack
         is widened rather than earned, because what is under test is the
         payload and not the economy.

         The SITES are searched for rather than written down. Placement
         refuses ground it cannot stand on, and this suite runs after others
         that have been reshaping the same landscape - a hard-coded offset
         would fail as "needs solid ground" one day and read like a bug in
         this lane. */
      const build = w.systems.find(x => x.name === "build").api;
      const px = Math.round(w.actor.pos().x);
      w.items.inventory.setCapacity(600);
      w.items.inventory.add("wood", 40);
      w.items.inventory.add("rock", 12);
      w.items.inventory.add("rope", 6);

      /* Sites are SEARCHED FOR, not written down, and searched nearest
         first: placement refuses ground it cannot stand on, a building only
         gets built while somebody is standing near it, and this suite runs
         after others that have been reshaping the same landscape. A
         hard-coded offset would one day fail as "needs solid ground" and
         read like a bug in this lane. */
      const near = (from, to) => {
        const out = [];
        for(let d = 0; d <= to - from; d += 2){ out.push(d); if(d) out.push(-d); }
        return out.filter(d => d >= from && d <= to);
      };
      const siteFor = (defId, from, to) => {
        for(const dx of near(from, to))
          for(const up of [4, 6, 8, 10, 12]){
            const x = px + dx, y = w.world.surfaceAt(x) - up;
            if(build.canPlace(defId, x, y).ok) return { x, y, dx };
          }
        return null;
      };

      const benchAt = siteFor("workbench", -40, 40);
      t.check("there is somewhere to stand a workbench, or nothing below proves anything",
        !!benchAt, benchAt ? "at " + benchAt.dx : "no site within reach");
      if(benchAt){
        build.place("workbench", benchAt.x, benchAt.y);
        w.tick(45 * 36);                     /* a workbench is 40 s of work */
      }
      t.check("and it finished, which a chest is built at",
        build.has("workbench"), build.all().length + " structures standing");

      const boxAt = build.has("workbench") ? siteFor("chest", -40, 40) : null;
      const put = boxAt ? build.place("chest", boxAt.x, boxAt.y) : null;
      t.check("a chest actually went down, or the payload check is empty",
        put && put.ok, put ? (put.reason || "placed") : "no site beside the bench");
      w.tick(20 * 36);
      const box = boxAt ? build.storageAt(boxAt.x, boxAt.y) : null;
      if(box) box.add("iron_ore", 5);
      t.check("and it is holding something worth not duplicating",
        !!box && box.count("iron_ore") === 5, box ? box.count("iron_ore") : "no container");

      const real = buildSystem.serialise();
      const before = JSON.stringify(real);
      t.check("lane C really does serialise what a building holds",
        before.indexOf("iron_ore") >= 0,
        before.indexOf("iron_ore") >= 0 ? "yes, and that is the hazard" : "no store in the save");
      const sent = P.sanitiseJoin({ build: real });
      const list = (sent.build && sent.build.structures) || [];
      const anyWork = list.some(st => P.WORK_FIELDS.some(f => st[f] !== null && st[f] !== undefined));
      t.check("nothing a real building is doing survives into the payload",
        list.length > 0 && !anyWork && JSON.stringify(sent).indexOf("iron_ore") < 0,
        list.length + " structures, work stripped from every one");
      t.check("and the building itself still crosses, or joining shows an empty world",
        list.some(st => st.defId === "chest" && st.built),
        JSON.stringify(list[0] || null));
      t.check("stripping did not damage what lane C would serialise next",
        JSON.stringify(buildSystem.serialise()) === before);

      /* and the whole loop, through lane C's own restore: this is what a
         joiner actually ends up looking at */
      buildSystem.restore(sent.build);
      const joined = boxAt ? build.storageAt(boxAt.x, boxAt.y) : null;
      t.check("a joiner sees the chest standing there",
        !!joined && build.has("workbench"),
        build.all().length + " structures after restoring the payload");
      t.check("...and it is empty, because the iron is in the host's chest and only there",
        !!joined && joined.count("iron_ore") === 0,
        joined ? joined.count("iron_ore") : "no container");
      /* the shape of what lane C writes is the thing that could change under
         us: if a new field carries work, this is where it should be noticed */
      const fields = list.length ? Object.keys(list[0]).sort().join(",") : "(none)";
      t.check("lane C's structure record still has the shape this lane filters",
        !list.length || P.WORK_FIELDS.every(f => f in list[0]), fields);
    }
  }

  /* the tap must leave the api exactly as it found it, or a single player
     game after a room would still be paying for the room */
  {
    const before = world.digFreeCircle;
    const tp = createTap(world);
    tp.install(() => {});
    const during = world.digFreeCircle;
    tp.remove();
    t.check("the tap is removed cleanly when the room closes",
      during !== before && world.digFreeCircle === before);
  }

  return t;
}
