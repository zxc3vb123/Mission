/* KEY BINDINGS - one table, and it is the real one. LANE H (ui).

   The guidebook prints keys from here rather than from prose, because a
   hand-written key list goes stale the moment anybody binds anything. That
   has already happened twice to the panel in index.html.

   Three degrees of "real", weakest last:

     1. The screens in this folder BIND from the constants below. There is no
        second copy to drift from - src/ui/craft.js reads KEY_PACK, so if this
        file says "i" then "i" is what opens the pack. Nothing to verify.

     2. Lane C's keys are read at RUN TIME off items.api (dropKey, grabKey,
        hotbar.size), so a lane C rebind moves this table with it.

     3. Lane A's and lane B's keys are read from `keys[...]` deep inside their
        own loops and are not published anywhere we can import. Those rows
        carry `source` and `literals`, and tools/tests/ui.test.js opens that
        file and fails if the literal is no longer in it. That does not prove
        the key still does what the row says, but it does catch a rename,
        which is the way these actually go stale.

   Adding a binding: put it here first, then bind from the constant. A key
   bound anywhere in src/ui that is not in this table is a bug - the book
   will not teach it, so no player will ever find it. */

/* ---- keys the screens in this folder bind from ---- */
export const KEY_PACK    = "i";        /* the pack: everything carried + crafting */
export const KEY_CRAFT   = "c";        /* the same screen, opened on the craft side */
export const KEY_BOOK    = "g";        /* this book */
export const KEY_MENU    = "escape";
export const KEY_LAMP    = "l";
export const KEY_FREECAM = "f";
export const KEY_VERTS   = "v";
export const KEY_REGEN   = "r";
export const KEY_PREV    = "q";
export const KEY_NEXT    = "e";
export const KEY_CONFIRM = "enter";
export const KEY_SWITCH  = "tab";

/* How a key is written for a player. Lowercase single letters read as shouted
   keycaps; the named ones get their conventional short forms. */
const NAMED = {
  " ": "Space", "escape": "Esc", "enter": "Enter", "shift": "Shift",
  "control": "Ctrl", "alt": "Alt", "tab": "Tab", "backspace": "Backspace",
  "arrowleft": "Left", "arrowright": "Right",
  "arrowup": "Up", "arrowdown": "Down"
};
export function keyCap(k){
  if(k == null) return "";
  const s = String(k);
  if(NAMED[s]) return NAMED[s];
  return s.length === 1 ? s.toUpperCase() : (s.charAt(0).toUpperCase() + s.slice(1));
}

/* A row's keys joined the way the book prints them: "A / D", "W / Space". */
export function capList(keys){
  return (keys || []).map(keyCap).join(" / ");
}

/* ---- the table ----
   group    which heading it sits under in the book
   keys     the raw key strings; null for a row that is mouse or wheel only
   cap      overrides the printed form (ranges, mouse buttons)
   what     what it does, in the second person, no numbers
   source   the file that actually binds it
   literals key strings the test expects to still find in `source`; omitted
            for rows bound from the constants above, which cannot drift */
const TABLE = [
  { group:"Moving", keys:["a","d"], alt:["arrowleft","arrowright"],
    what:"Walk. Held against a wall you can climb it.",
    source:"src/actor/clonk.js", literals:["a","d","arrowleft","arrowright"] },
  { group:"Moving", keys:["w"," "], alt:["arrowup"],
    what:"Jump, and hangle hand over hand along a ceiling.",
    source:"src/actor/clonk.js", literals:["w"," ","arrowup"] },
  { group:"Moving", keys:["s"], alt:["arrowdown"],
    what:"Climb down, or let go of what you are holding.",
    source:"src/actor/clonk.js", literals:["s","arrowdown"] },

  { group:"Digging", keys:null, cap:"Left mouse",
    what:"Dig toward the cursor with whatever is in your hands.",
    source:"src/actor/clonk.js" },
  { group:"Digging", keys:["shift"], capSuffix:" + a direction",
    what:"Dig with the keys instead of the mouse.",
    source:"src/actor/clonk.js", literals:["shift"] },
  { group:"Digging", keys:null, cap:"Right mouse",
    what:"Blast a hole. A test tool, not a real one.",
    source:"src/ui/hud.js" },

  { group:"Carrying", hotbar:true,
    what:"Put a carried item in your hands.",
    source:"src/items/hotbar.js" },
  { group:"Carrying", fromItems:"dropKey",
    what:"Throw one of what you are holding onto the ground.",
    source:"src/items/drops.js" },
  { group:"Carrying", fromItems:"grabKey", capPrefix:"Hold ",
    what:"Pick things up even when the pack is heavy enough to stop doing it for you.",
    source:"src/items/drops.js" },

  { group:"Screens", keys:[KEY_PACK],
    what:"The pack: everything you are carrying, its weight, and what you can make.",
    source:"src/ui/craft.js" },
  { group:"Screens", keys:[KEY_CRAFT],
    what:"The same screen, opened on the crafting side.",
    source:"src/ui/craft.js" },
  { group:"Screens", keys:[KEY_BOOK],
    what:"This book.",
    source:"src/ui/book.js" },
  { group:"Screens", keys:["n"],
    what:"What changed in this build.",
    source:"src/ui/whatsnew.js", literals:["n"] },
  { group:"Screens", keys:[KEY_MENU],
    what:"Pause, save, settings, and back to the start screen.",
    source:"src/ui/menu.js" },
  { group:"Screens", keys:[KEY_PREV, KEY_NEXT],
    what:"Move the selection on an open screen.",
    source:"src/ui/craft.js" },
  { group:"Screens", keys:[KEY_SWITCH],
    what:"Swap between the pack side and the crafting side.",
    source:"src/ui/craft.js" },
  { group:"Screens", keys:[KEY_CONFIRM],
    what:"Do the selected thing: craft it, or throw one away.",
    source:"src/ui/craft.js" },

  { group:"Seeing", keys:[KEY_LAMP],
    what:"Head lamp on and off. It throws a cone where you face, not a room.",
    source:"src/ui/hud.js" },
  { group:"Seeing", keys:["m"],
    what:"Mute.",
    source:"src/core/audio.js", literals:["m"] },
  { group:"Seeing", keys:null, cap:"Wheel",
    what:"Zoom in and out.",
    source:"src/core/input.js" },
  { group:"Seeing", keys:[KEY_FREECAM],
    what:"Free the camera from the clonk.",
    source:"src/ui/hud.js" },
  { group:"Seeing", keys:[KEY_VERTS],
    what:"Draw the shape vertices. A debugging view.",
    source:"src/ui/hud.js" },
  { group:"Seeing", keys:[KEY_REGEN],
    what:"Throw the landscape away and generate another one.",
    source:"src/ui/hud.js" }
];

export const BINDINGS = TABLE;
export const KEY_GROUPS = ["Moving", "Digging", "Carrying", "Screens", "Seeing"];

/* The table with lane C's keys filled in from the live api, grouped in
   KEY_GROUPS order. `items` may be missing or half-built - a book that
   throws is worse than one that says "unbound". */
export function keyBindings(items){
  const out = KEY_GROUPS.map(g => ({ group: g, rows: [] }));
  const byGroup = Object.create(null);
  for(const g of out) byGroup[g.group] = g;

  for(const b of TABLE){
    const row = { what: b.what, source: b.source, cap: "" };

    if(b.hotbar){
      const n = (items && items.hotbar && items.hotbar.size) || 0;
      row.cap = n > 1 ? ("1 - " + n) : (n === 1 ? "1" : "number keys");
    } else if(b.fromItems){
      const k = items ? items[b.fromItems] : null;
      row.cap = k ? keyCap(k) : "unbound";
      if(b.capPrefix) row.cap = b.capPrefix + row.cap;
    } else if(b.cap){
      row.cap = b.cap;
    } else {
      row.cap = capList(b.keys);
      if(b.alt && b.alt.length) row.cap += " / " + capList(b.alt);
      if(b.capSuffix) row.cap += b.capSuffix;
    }

    const g = byGroup[b.group];
    if(g) g.rows.push(row);
  }
  return out.filter(g => g.rows.length);
}

/* Every word the keys page contains, so the book's search can find a page
   about keys when somebody types "jump" or "what key drops things". */
export function keyKeywords(){
  const words = new Set(["key", "keys", "keyboard", "controls", "control",
                         "binding", "bindings", "shortcut", "shortcuts",
                         "button", "buttons", "what key", "how do i"]);
  for(const b of TABLE){
    for(const w of String(b.what).toLowerCase().split(/[^a-z']+/)){
      if(w.length > 2) words.add(w);
    }
  }
  return Array.from(words);
}

/* The one-line hint that sits under the hotbar, so a player who has never
   opened anything can find the book. */
export function keyHint(){
  return keyCap(KEY_BOOK) + " book · " + keyCap(KEY_PACK) + " pack · " +
         keyCap(KEY_MENU) + " menu";
}
