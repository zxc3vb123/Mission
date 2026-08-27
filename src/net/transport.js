/* The wire, and the seam under it. LANE NET.

   Everything above this file - the session, the protocol, the replay of
   world operations - speaks only the interface below. That is deliberate:
   the rendezvous is somebody else's free service (docs/DECISIONS.md), and
   the day it disappears the repair should be one file and no protocol.

   A TRANSPORT is:

     id                 my own peer id, once connected
     peers()            -> [id]              who I can reach right now
     send(to, msg)      one peer
     broadcast(msg)     all of them
     onMessage(fn)      fn(fromId, msg)      -> unsubscribe
     onPeer(fn)         fn({ id, joined })   -> unsubscribe
     onError(fn)        fn(Error)            -> unsubscribe
     pump()             optional: deliver anything due (the loopback)
     close()

   Topology is a STAR, always. Guests talk to the host and to nobody else,
   because the host is the sequencer and a mesh would need the guests to
   agree an order between themselves, which is the thing host authority
   exists to avoid.

   The loopback below is the one the headless suite uses. It is not a mock
   of a network: it is a network with the clock made explicit, so a test can
   say "three ticks of latency" and get exactly three. Nothing in it reads
   wall-clock time, so a test that passes does so for a reason. */

function emitter(){
  const fns = [];
  return {
    add(fn){ fns.push(fn); return () => { const i = fns.indexOf(fn); if(i >= 0) fns.splice(i, 1); }; },
    fire(a, b){ for(const fn of fns.slice()) fn(a, b); },
    count(){ return fns.length; }
  };
}

/* ------------------------------------------------------------ loopback --- */
/* A hub of in-process endpoints. Messages are queued with a delivery time
   measured in PUMPS, not milliseconds, so the suite drives them the same
   way it drives ticks. */
export function createLoopback({ latency = 0, drop = null } = {}){
  const nodes = new Map();          /* id -> node */
  const links = new Map();          /* id -> Set(id) */
  let queue = [];
  let clock = 0;
  let sent = 0, dropped = 0;

  function linked(a){ return links.get(a) || new Set(); }

  function deliver(from, to, msg){
    sent++;
    if(drop && drop(from, to, msg, sent)){ dropped++; return; }
    /* structuredClone by way of the real encoding: a loopback that passed
       the same object by reference would hide every bug where one side
       mutates what it sent */
    queue.push({ at: clock + latency, from, to, text: JSON.stringify(msg) });
  }

  const hub = {
    stats(){ return { clock, sent, dropped, queued: queue.length }; },

    endpoint(id){
      if(nodes.has(id)) return nodes.get(id);
      const messages = emitter(), peersE = emitter(), errors = emitter();
      const node = {
        id,
        kind: "loopback",
        peers(){ return [...linked(id)]; },
        send(to, msg){ if(linked(id).has(to)) deliver(id, to, msg); },
        broadcast(msg){ for(const to of linked(id)) deliver(id, to, msg); },
        onMessage: messages.add,
        onPeer: peersE.add,
        onError: errors.add,
        pump(){ hub.pump(0); },
        close(){ hub.unplug(id); },
        _messages: messages, _peers: peersE, _errors: errors
      };
      nodes.set(id, node);
      links.set(id, new Set());
      return node;
    },

    /* A star: connect(host, guest) for each guest, and never guest-guest. */
    connect(a, b){
      hub.endpoint(a); hub.endpoint(b);
      links.get(a).add(b); links.get(b).add(a);
      nodes.get(a)._peers.fire({ id: b, joined: true });
      nodes.get(b)._peers.fire({ id: a, joined: true });
    },

    disconnect(a, b){
      if(links.has(a)) links.get(a).delete(b);
      if(links.has(b)) links.get(b).delete(a);
      if(nodes.has(a)) nodes.get(a)._peers.fire({ id: b, joined: false });
      if(nodes.has(b)) nodes.get(b)._peers.fire({ id: a, joined: false });
    },

    unplug(id){
      for(const other of [...linked(id)]) hub.disconnect(id, other);
      nodes.delete(id); links.delete(id);
      queue = queue.filter(m => m.from !== id && m.to !== id);
    },

    /* advance the clock by `steps` and hand over everything now due */
    pump(steps = 1){
      clock += steps;
      const due = queue.filter(m => m.at <= clock);
      queue = queue.filter(m => m.at > clock);
      for(const m of due){
        const node = nodes.get(m.to);
        if(node) node._messages.fire(m.from, JSON.parse(m.text));
      }
      return due.length;
    }
  };
  return hub;
}

/* A named pair, which is what most tests want: one host, one guest, wired. */
export function loopbackPair({ latency = 0 } = {}){
  const hub = createLoopback({ latency });
  const host = hub.endpoint("host");
  const guest = hub.endpoint("guest");
  hub.connect("host", "guest");
  return { hub, host, guest };
}
