/* Room codes. LANE NET.

   A code is what one player reads out to another, so the alphabet is
   Crockford's base32: the digits and the letters, less I, L, O and U. The
   first three are dropped because they are read as 1, 1 and 0, and the
   substitution is applied on the way IN, so a player who types what they
   heard still opens the right room. U is dropped so a code cannot spell
   something unfortunate. Thirty-two symbols, six of them: 1.07 billion
   rooms.

   The code also becomes a peer id on a PUBLIC broker (docs/DECISIONS.md),
   which makes two things worth being deliberate about:

   1. The namespace is global, so the code is the only thing between a
      stranger and your world. It must not be short, and it must not be
      predictable.
   2. It must NOT come from `core/rng.js`. That generator is the world's:
      drawing from it would make a code guessable from a seed AND advance
      the sequence the landscape is generated from - exactly the hidden
      coupling the determinism rule exists to forbid. Room codes are not
      simulation, so they use the platform's randomness and never touch a
      tick. */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 6;
export const PEER_PREFIX = "mission-";

/* crypto where there is one, Math.random where there is not. Neither is the
   simulation's RNG, which is the whole point. */
function randomBytes(n){
  const out = new Uint8Array(n);
  const c = (typeof globalThis !== "undefined") ? globalThis.crypto : null;
  if(c && typeof c.getRandomValues === "function"){ c.getRandomValues(out); return out; }
  for(let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function newRoomCode(){
  /* rejection sampling: a byte that does not divide evenly into the
     alphabet would otherwise bias the early letters */
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while(out.length < CODE_LENGTH){
    for(const b of randomBytes(CODE_LENGTH * 2)){
      if(b >= limit) continue;
      out += ALPHABET[b % ALPHABET.length];
      if(out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

/* What a player typed, turned into what a player meant: case folded, spaces
   and dashes dropped, and the three glyphs the alphabet leaves out mapped
   onto the ones they are always mistaken for. Returns null if it still is
   not a code, so a typo is refused rather than quietly opening a room that
   is not the one anybody meant. */
export function normaliseCode(raw){
  if(typeof raw !== "string") return null;
  const fixed = raw.toUpperCase()
    .replace(/[\s\-_]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if(fixed.length !== CODE_LENGTH) return null;
  for(const ch of fixed) if(ALPHABET.indexOf(ch) < 0) return null;
  return fixed;
}

export function isCode(raw){ return normaliseCode(raw) !== null; }

/* The broker's namespace is shared with every other application using it,
   so the prefix is not decoration - it is what keeps `ABC123` from being
   somebody else's chat room. */
export function peerIdFor(code){ return PEER_PREFIX + code; }
export function codeFromPeerId(id){
  if(typeof id !== "string" || !id.startsWith(PEER_PREFIX)) return null;
  return normaliseCode(id.slice(PEER_PREFIX.length));
}

/* A stable colour per player, so the same person is the same colour on
   every screen without anybody having to agree one. Not the simulation's
   RNG, and not random at all: a hash of the id. */
export function colourFor(id){
  let h = 2166136261;
  const s = String(id);
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  const hue = (h >>> 0) % 360;
  return { hue, css: "hsl(" + hue + ",62%,58%)", dark: "hsl(" + hue + ",55%,32%)" };
}
