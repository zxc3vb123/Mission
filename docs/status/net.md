# Status - lane net

Your section, and nobody else writes here. One line per finished thing,
newest at the top. Read the others before you start; write here before you
commit.

- [done] **The model is chosen and written down before any of it was built**
  (`docs/DECISIONS.md`, 2026-08-28): host-authoritative over the WORLD,
  client-authoritative over BODIES, operations on the wire rather than pixels,
  and the seed plus lane A's chunk diff for joining. Lockstep is rejected for a
  specific reason other lanes should know rather than rediscover: the chunk
  streamer focuses on `state.cam` over `state.view / state.cam.zoom`, so which
  ground is resident - and therefore which liquids settle and which ground
  collapses - is a function of where a player stands and how big their window
  is. **Two players do not simulate the same thing, by design.** Lockstep would
  mean simulating all 4096x2560 on every client, which is exactly what lane A's
  streaming exists to avoid. Determinism buys REPLAY instead, which is worth
  more.

- [done] **The first milestone, proved rather than asserted: replaying one
  player's dig reproduces the terrain EXACTLY.** Twelve bites with a stone
  pickaxe against the real landscape, the operations kept, the world thrown away
  and grown again from the same seed, the operations replayed - and every pixel
  in a 176x216 band hashes identically. That is the whole model in one check,
  and it is lane A's determinism measured rather than assumed. `tools/tests/
  net.test.js`, 43 checks.

- [done] **Joining is the save file, sent down a wire.** Seed plus lane A's
  run-length chunk diff rebuilds a dug world pixel for pixel, in **2784 bytes**
  for a twelve-bite tunnel - the landscape is megabytes and none of them are
  sent. `build` and `gatherables` ride along in the same payload, so a joiner
  arrives to the host's buildings as well as their holes. `items` is
  deliberately NOT in it: a pack belongs to a person.

- [done] **`src/net/` in eight small files**, each one job. `protocol.js` is
  data and pure functions - what a message is, and what makes one safe;
  `room.js` the codes; `transport.js` the seam and an in-process loopback with
  the clock made explicit; `broker.js` the real WebRTC; `tap.js` how a local
  world change becomes something to send; `session.js` the room; `ghosts.js`
  the other players; `index.js` the system.

- [done] **Dormant until a room is opened.** Nothing wrapped, nothing
  listening, nothing sent, no library fetched. Single player is unchanged and
  pays nothing, and the suite proves the tap restores `world.api` exactly as it
  found it when the room closes.

- [done] **Messages are treated as hostile input**, because they are: they come
  from another player's browser, possibly on a different build. Every field is
  checked before it reaches lane A, and the checks that earn their keep are the
  CAPS - `blast(x, y, 1e9)` is not a wrong picture, it is a loop that never
  returns. A peer also cannot name itself somebody else; only the host may speak
  for a third party, because only the host is the sequencer.

- [done] **The ground is the tie-breaker, so the wire is allowed to be lossy.**
  The host re-sends only the chunk diffs that CHANGED since it last sent them,
  every ten seconds. That converges everything replay cannot reproduce - water
  that found a different level, ground that collapsed on one screen and not
  another, an operation lost to a dropped channel. Proved with a link that drops
  one message in three: it converges. Nothing in this lane has to be reliable in
  order to be correct, only prompt.

- [done] **TWO REAL BROWSERS, DRIVEN, AND THE MILESTONE IS MET.** Two tabs on a
  local server, WebRTC, the public broker doing the introductions. One hosts and
  gets `36ZTET`; the other opens `?room=36ZTET` and lands in the same world -
  same seed, same 576 solid pixels in a sample block. The guest digs eight bites:
  576 -> 419 on their screen, and 576 -> 419 on the host's, which dug nothing.
  The host digs elsewhere: 558 -> 401 on both. Each sees the other's body at a
  real position rather than at the origin. That is the milestone, in the game,
  rather than in a stub.

- [done] **Running it found two bugs the suite could not have.** Both are now
  pinned by checks:
  1. **A joiner sat in "joining" for ever, silently.** `checkMessage` validated
     the world seed with the CHUNK INDEX rule, which caps at 1e7; a real seed is
     nine digits. So every welcome failed its check and was dropped - correctly,
     because there is nothing safe to say back to a message you could not parse,
     but that makes a version mismatch look exactly like silence. Fixed, and a
     guest still waiting after eight seconds now says so.
  2. **A `?room=` link never joined.** Bootstrapping happened on the first
     `tick()`, and the game opens on the start screen with `state.paused` true -
     so nothing ticks until the player presses something, and a link that only
     worked once you were already playing is not a link. It is a task now.

- [note] **What a browser could not show, and why it is not a defect.** The
  Browser pane composites only the tab in front, and a background tab gets no
  animation frames at all - so with the pane hidden neither tab ticked and the
  loop had to be driven by hand through `loop.step()`, which is exported for the
  headless harness. Everything measured above is the real simulation stepping;
  it is only the clock that was mine.

- [note] **What does NOT replicate yet, plainly:** inventories, dropped chunks,
  crafting, and structures built after somebody joined. A remote player's spoil
  goes into their own pack and lands on nobody else's ground. All four are the
  same missing piece - a placement and a pickup that do not charge the local
  pack - which is filed with lane C in `docs/REQUESTS.md` and is a few lines
  each side. Felled trees are a separate gap and belong to lane A: scenery is
  not in `serialise()` at all, so a joiner (and a save file) re-grows them
  standing.

- [done] **A room does not overwrite the world you were playing.** Joining
  regenerates from the host's seed, and the autosave would then have written
  their world into your own save slot within a minute. Lane E shipped
  `setSaveSlot()` the same hour it was reported (54379e3); this lane sets
  `room:<code>` when a room opens and null when it closes.

- [note] **There is no screen yet, and one line of overlay standing in for it.**
  A room code nobody can read is a room nobody can join, so this lane draws the
  code and a one-line notice and nothing else. The way in today is a link -
  `?room=ABC123`, or `#room=ABC123` - which joins on load, plus
  `mission.net.host()` in the console. The real screen is filed with the UI
  lane; delete the overlay when it lands.

- [note] **The known cost, named rather than discovered later.** The host's
  ten-second reconciliation calls `world.serialise()`, which packs and re-diffs
  EVERY modified chunk, and the guest's `world.restore()` repaints all of them.
  For one tunnel that is 2.8 kB and nothing; for an hour-old mine it is a
  periodic hitch on both ends. It is the one thing here that does not scale, and
  the fix is not mine: lane A has been asked for a "what changed since?" so the
  question can be asked cheaply. Until then, do not raise `SYNC_TICKS`
  expecting it to help - the cost is per sync, not per second.

- [next] Structures and items over the wire, once lane C's uncharged placement
  exists. Then a chunk-diff sync that does not repack every modified chunk
  (filed with lane A), and a binary encoding for frames - JSON is honest and
  three times bigger than it needs to be.

- [found, for lane A] **A restored chunk nobody has visited is not reported as
  changed.** Dig, `serialise()`, `regenerate()`, `restore()`, `serialise()` -
  and four of ten chunks are missing, because their diff is parked for lazy
  application and `serialiseChanges` only walks what is resident or archived.
  **Save, load, save again without walking back to your tunnel, and the tunnel
  is gone from the second save.** The pixels are fine either way, which is why
  it has not been noticed. Filed in `docs/REQUESTS.md`.
