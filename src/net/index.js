/* Coop. LANE NET.

   One player opens a room and reads out a six-letter code; the others type
   it in. Everybody then sees everybody move, and the ground they dig is the
   same ground. The model - host-authoritative over the WORLD, client-owned
   over BODIES, operations on the wire and the seed plus lane A's chunk diff
   for joining - is argued in docs/DECISIONS.md (2026-08-28) and should be
   read before changing anything here.

   PUBLISHED API (net.api):
     host({ name })       -> Promise<{ ok, code, error? }>   open a room
     join(code, { name }) -> Promise<{ ok, code, error? }>   enter one
     leave()                                                  close the link
     attach(transport, { role, code, name })  wire an arbitrary transport
     status()  -> { active, role, code, phase, self, peers, stats }
     peers()   -> [{ id, name, x, y }]     where everybody is, for the UI
     isActive() isHost() code()

   A room writes its own save slot (lane E's `setSaveSlot`), so joining
   somebody else's world never overwrites your own game.

   EVENTS emitted (docs/ARCHITECTURE.md):
     "net:room"   { code, role, open }     a room opened or closed
     "net:peer"   { id, name, joined }     somebody arrived or left
     "net:error"  { message }              and it is shown on screen too

   This system is DORMANT until a room is opened: no wrapping, no listeners,
   no network, no cost. Single player is unchanged and unaware. */

import { state } from "../core/state.js";
import { bus } from "../core/bus.js";
import { setSaveSlot } from "../core/persist.js";
import { poseOf, readPose, JOIN_SYSTEMS, sanitiseJoin } from "./protocol.js";
import { newRoomCode, normaliseCode, colourFor } from "./room.js";
import { createSession } from "./session.js";
import { createTap } from "./tap.js";
import { createGhosts } from "./ghosts.js";

const NOTICE_TICKS = 300;

export function createNet({ systems, world, items, actor }){
  const ghosts = createGhosts();
  const tap = createTap(world.api);
  let session = null;
  let notice = null, noticeAt = 0;
  let bootstrapped = false;

  function announce(text){ notice = text; noticeAt = state.tick; }

  /* ------------------------------------------------------- the adapter --- */
  /* Everything the session is allowed to know about this game. `world` is
     the world SYSTEM rather than its api, because joining hands over the
     same value a save file carries and that lives on `serialise()`. */
  const game = {
    seed: () => state.world.seed >>> 0,
    regenerate(seed){ world.api.regenerate(seed >>> 0); },

    snapshot(names){
      const out = {};
      for(const s of systems){
        if(names.indexOf(s.name) < 0 || typeof s.serialise !== "function") continue;
        const d = s.serialise();
        if(d !== undefined) out[s.name] = d;
      }
      /* shape, not work - see sanitiseJoin. Sending it would put the host's
         iron in a second pair of hands as well as their own. */
      return sanitiseJoin(out);
    },

    /* Only the systems that are part of the WORLD, whatever a message
       claims. A peer that sent `{ items: ... }` would otherwise rewrite the
       pack of everyone who received it. */
    restore(map){
      if(!map || typeof map !== "object") return;
      for(const s of systems){
        if(JOIN_SYSTEMS.indexOf(s.name) < 0) continue;
        if(typeof s.restore !== "function") continue;
        const d = map[s.name];
        if(d === undefined) continue;
        try { s.restore(d); }
        catch(e){ announce("part of the world did not arrive"); }
      }
    },

    chunkDiffs(){
      const d = world.serialise();
      return (d && d.chunks) || [];
    },

    applyOp: op => tap.apply(op),

    localPose(){
      const c = actor.clonk;
      return c ? poseOf(c, state.player.lamp && state.player.lamp.on) : null;
    }
  };

  /* ---------------------------------------------------------- the room --- */
  const hooks = {
    onPose({ id, pose }){ ghosts.pose(id, readPose(pose)); },
    onPeer(p){
      if(p.joined){ ghosts.setName(p.id, p.name); announce((p.name || "somebody") + " joined"); }
      else { ghosts.remove(p.id); announce("somebody left"); }
      bus.emit("net:peer", { id: p.id, name: p.name, joined: !!p.joined });
    },
    onJoined(info){
      announce("joined room " + info.code);
      bus.emit("net:room", { code: info.code, role: "guest", open: true });
    },
    onError(err){
      const message = (err && err.message) ? err.message : String(err);
      announce(message);
      bus.emit("net:error", { message });
    }
  };

  function attach(transport, { role, code, name }){
    /* A room is not the player's own game and must not be autosaved over
       it. Lane E's save slot is what makes that true; set it before the
       world is replaced, and put it back when the room closes. */
    setSaveSlot("room:" + code);
    tap.install(op => { if(session) session.recordOp(op); });
    session = createSession({ transport, role, code, name, game, hooks });
    ghosts.clear();
    bus.emit("net:room", { code, role, open: true });
    return session;
  }

  function leave(){
    if(session){ session.close(); bus.emit("net:room", { code: session.code, role: session.role, open: false }); }
    session = null;
    setSaveSlot(null);
    tap.remove();
    ghosts.clear();
    announce("left the room");
  }

  async function open(role, wanted, opts = {}){
    if(session) leave();
    const name = opts.name || defaultName();
    const { createBrokerTransport } = await import("./broker.js");
    let code = wanted;
    for(let attempt = 0; attempt < 2; attempt++){
      if(role === "host" && !code) code = newRoomCode();
      const { transport, ready } = createBrokerTransport({ role, code });
      try {
        await ready;
        const opened = attach(transport, { role, code, name });
        announce(role === "host" ? "room " + code + " is open" : "joining " + code);
        /* A message that fails its checks is dropped rather than answered,
           which is right - there is nothing safe to say back to a peer whose
           message you could not parse - but it means a version mismatch
           looks exactly like silence. So a guest that is still waiting after
           a few seconds says so. This is a timer rather than a tick count on
           purpose: the game sits paused on the start screen, so a link that
           joined on load would otherwise never reach a tick to notice. */
        if(role === "guest" && typeof setTimeout === "function"){
          setTimeout(() => {
            if(session === opened && !opened.isLive())
              hooks.onError(new Error("the host is not answering - are you both on the same version?"));
          }, 8000);
        }
        return { ok: true, code };
      } catch(err){
        try { transport.close(); } catch(e){}
        const message = (err && err.message) ? err.message : String(err);
        /* one retry, and only for the one failure a retry can fix */
        if(role === "host" && attempt === 0 && /already open/.test(message)){ code = null; continue; }
        hooks.onError(err);
        return { ok: false, code, error: message };
      }
    }
    return { ok: false, code, error: "could not open a room" };
  }

  function defaultName(){
    try {
      if(typeof localStorage !== "undefined"){
        const saved = localStorage.getItem("mission.name");
        if(saved) return saved;
      }
    } catch(e){}
    return "clonk " + (state.world.seed % 97);
  }

  /* --------------------------------------------------- getting into it --- */
  /* A shared link is the one way into a room that needs no screen, so it
     works today: mission?room=ABC123 (or #room=ABC123) joins on load. The
     build menu equivalent is filed with lane H in docs/REQUESTS.md.

     NOT FROM `tick()`, which is where this started and where it did not
     work: the game opens on the start screen with `state.paused` true, so
     no system ticks until the player presses something. A link that only
     joined once you had already started playing would be no link at all.
     A task instead - it runs after main.js has finished its module body,
     which is what `window.mission` is waiting for. */
  function bootstrap(){
    if(bootstrapped) return;
    bootstrapped = true;
    if(typeof window === "undefined") return;
    window.mission = Object.assign(window.mission || {}, { net: api });
    let raw = null;
    try {
      const q = new URLSearchParams(window.location.search);
      raw = q.get("room");
      if(!raw && window.location.hash){
        const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        raw = h.get("room");
      }
    } catch(e){ return; }
    const code = normaliseCode(raw || "");
    if(code) api.join(code);
  }

  /* ----------------------------------------------------------- system --- */
  const api = {
    host(opts){ return open("host", null, opts || {}); },
    join(code, opts){
      const c = normaliseCode(code);
      if(!c) return Promise.resolve({ ok:false, error:"that is not a room code" });
      return open("guest", c, opts || {});
    },
    leave,
    attach,
    isActive(){ return !!session; },
    isHost(){ return !!session && session.role === "host"; },
    code(){ return session ? session.code : null; },
    peers(){
      return ghosts.all().map(g => ({ id:g.id, name:g.name, x:g.x, y:g.y, colour:g.colour.css }));
    },
    status(){
      if(!session) return { active:false, role:null, code:null, phase:"idle", peers:[] };
      return { active:true, role: session.role, code: session.code,
               phase: session.phase(), self: session.self,
               peers: session.peers(), stats: session.stats() };
    }
  };

  if(typeof window !== "undefined" && typeof setTimeout === "function")
    setTimeout(bootstrap, 0);

  return {
    name: "net",

    tick(){
      if(!bootstrapped) bootstrap();     /* belt and braces; see bootstrap() */
      ghosts.tick();
      if(session) session.step();
    },

    renderActor(ctx){ ghosts.draw(ctx); },

    /* A room code that nobody can read is a room nobody can join, so this
       lane draws the one line it cannot do without. The proper screen -
       open a room, type a code, see who is here - is lane H's and is filed
       in docs/REQUESTS.md. Nothing is drawn while the game is solo. */
    renderOverlay(ctx){
      const lines = [];
      if(session){
        const n = session.peers().length;
        lines.push("ROOM " + session.code + "  ·  " +
                   (n === 0 ? "waiting for players" : (n + 1) + " here") +
                   (session.phase() === "live" ? "" : "  ·  " + session.phase()));
      }
      if(notice && state.tick - noticeAt < NOTICE_TICKS) lines.push(notice);
      if(!lines.length) return;
      ctx.save();
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      const x = Math.round(state.view.w / 2);
      let y = 22;
      for(const line of lines){
        const w = ctx.measureText(line).width + 18;
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = "#0b0d10";
        ctx.fillRect(x - w/2, y - 12, w, 18);
        ctx.globalAlpha = 1;
        ctx.fillStyle = session && line.startsWith("ROOM")
          ? colourFor(session.code).css : "#cfd6dd";
        ctx.fillText(line, x, y);
        y += 22;
      }
      ctx.restore();
    },

    api
  };
}
