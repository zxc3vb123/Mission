/* The real wire: WebRTC, introduced by a public broker. LANE NET.

   There is no backend - the game is static files on GitHub Pages - so peers
   meet over WebRTC, and WebRTC cannot introduce two browsers by itself.
   Somebody's server does the introductions and the only question is whose.
   The reasoning, and what we accept by choosing this one, is in
   docs/DECISIONS.md; the short version is that PeerJS's broker maps a room
   code onto its native primitive with no protocol of our own: the host
   registers the peer id `mission-<CODE>` and a joiner connects to that id.

   Nothing here is loaded until a player actually opens or joins a room. A
   single-player game never touches the network, and the headless suite
   never sees this file at all - it drives the loopback in transport.js
   against the same four methods.

   THIS FILE IS THE BLAST RADIUS. If the broker disappears or the library
   moves, everything above it is unchanged, because the session speaks the
   transport interface and nothing else. */

import { peerIdFor } from "./room.js";

/* Pinned, because "latest" is a live dependency on somebody else's release
   process. Two CDNs because one of them will be blocked somewhere. */
const LIB_VERSION = "1.5.4";
const LIB_URLS = [
  "https://cdn.jsdelivr.net/npm/peerjs@" + LIB_VERSION + "/dist/peerjs.min.js",
  "https://unpkg.com/peerjs@" + LIB_VERSION + "/dist/peerjs.min.js"
];
const CONNECT_TIMEOUT_MS = 20000;

let libPromise = null;

function loadScript(url){
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = url;
    el.async = true;
    el.onload = () => resolve(true);
    el.onerror = () => { el.remove(); reject(new Error("could not load " + url)); };
    document.head.appendChild(el);
  });
}

export async function loadPeerLib(){
  if(typeof window === "undefined") throw new Error("multiplayer needs a browser");
  if(window.Peer) return window.Peer;
  if(libPromise) return libPromise;
  libPromise = (async () => {
    let last = null;
    for(const url of LIB_URLS){
      try { await loadScript(url); if(window.Peer) return window.Peer; }
      catch(err){ last = err; }
    }
    libPromise = null;
    throw last || new Error("could not reach a copy of the connection library");
  })();
  return libPromise;
}

function emitter(){
  const fns = [];
  return {
    add(fn){ fns.push(fn); return () => { const i = fns.indexOf(fn); if(i>=0) fns.splice(i,1); }; },
    fire(a, b){ for(const fn of fns.slice()) fn(a, b); }
  };
}

/* Resolves once we are reachable: for a host, when the broker has accepted
   our id; for a guest, when the channel to the host is open. */
export function createBrokerTransport({ role, code, timeout = CONNECT_TIMEOUT_MS } = {}){
  const isHost = role === "host";
  const messages = emitter(), peersE = emitter(), errors = emitter();
  const conns = new Map();          /* peer id -> DataConnection */
  let peer = null, myId = null, closed = false;

  function wire(conn){
    const id = conn.peer;
    conn.on("open", () => {
      if(closed){ try { conn.close(); } catch(e){} return; }
      conns.set(id, conn);
      peersE.fire({ id, joined: true });
    });
    conn.on("data", data => { if(!closed) messages.fire(id, data); });
    conn.on("close", () => {
      if(!conns.has(id)) return;
      conns.delete(id);
      peersE.fire({ id, joined: false });
    });
    conn.on("error", err => errors.fire(err instanceof Error ? err : new Error(String(err))));
  }

  const transport = {
    kind: "broker",
    get id(){ return myId; },
    peers(){ return [...conns.keys()]; },
    send(to, msg){ const c = conns.get(to); if(c && c.open) c.send(msg); },
    broadcast(msg){ for(const c of conns.values()) if(c.open) c.send(msg); },
    onMessage: messages.add,
    onPeer: peersE.add,
    onError: errors.add,
    close(){
      closed = true;
      for(const c of conns.values()){ try { c.close(); } catch(e){} }
      conns.clear();
      if(peer){ try { peer.destroy(); } catch(e){} peer = null; }
    }
  };

  const ready = (async () => {
    const Peer = await loadPeerLib();
    const opts = { debug: 0 };
    peer = isHost ? new Peer(peerIdFor(code), opts) : new Peer(undefined, opts);

    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if(settled) return;
        settled = true;
        reject(new Error(isHost
          ? "the room could not be opened - no answer from the meeting point"
          : "no answer - check the code, or the host may have closed the room"));
      }, timeout);
      const done = err => {
        if(settled) return;
        settled = true;
        clearTimeout(timer);
        err ? reject(err) : resolve();
      };

      peer.on("error", err => {
        const type = err && err.type;
        if(type === "unavailable-id") return done(new Error("that room code is already open"));
        if(type === "peer-unavailable") return done(new Error("no room with that code"));
        if(!settled) return done(err instanceof Error ? err : new Error(String(err)));
        errors.fire(err instanceof Error ? err : new Error(String(err)));
      });

      peer.on("open", id => {
        myId = id;
        if(isHost){
          peer.on("connection", conn => { if(!closed) wire(conn); });
          return done();
        }
        const conn = peer.connect(peerIdFor(code), {
          reliable: true, serialization: "json", metadata: { code }
        });
        conn.on("open", () => {
          conns.set(conn.peer, conn);
          conn.on("data", data => { if(!closed) messages.fire(conn.peer, data); });
          conn.on("close", () => {
            if(!conns.has(conn.peer)) return;
            conns.delete(conn.peer);
            peersE.fire({ id: conn.peer, joined: false });
          });
          done();
          peersE.fire({ id: conn.peer, joined: true });
        });
        conn.on("error", err => done(err instanceof Error ? err : new Error(String(err))));
      });
    });

    return transport;
  })();

  return { transport, ready };
}
