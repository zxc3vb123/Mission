/* ITEM ICONS - one drawing, used by every screen. LANE H (ui).

   The owner: "make it show what the items look like, not just names", and
   "same for all things that display item names". Until now every screen drew
   a coloured square beside a word, which is a debug view rather than an
   inventory.

   TWO RULES, AND THEY ARE THE WHOLE DESIGN.

   1. ONE FUNCTION, EVERY SCREEN. The pack, the hotbar, the crafting list, the
      build menu and the guidebook all call itemIcon(). A per-screen copy is a
      thing that drifts, and the day the crafting screen and the pack disagree
      about what copper looks like is the day the player stops trusting both.
      The suite fails if a file in this folder draws its own item swatch.

   2. IT DOES NOT INVENT A SECOND VOCABULARY. Lane B already draws the tool in
      the clonk's hands as a distinct silhouette, and this asks THEIR
      classifier - heldLook() - rather than copying their rules. So a shovel
      in your pack and the shovel in your hands are the same shape because
      they came from the same decision, not because two files happen to agree
      today. If lane B changes what counts as a pickaxe, these move with it.

   For everything that is not a tool, lane B has no opinion worth borrowing -
   a carried item is a fist-sized thing in a hand - so the shape comes from
   lane F's `category` and the colours from their `col` and `dark`. That is
   ten silhouettes across forty-four items, which is enough to tell a torch
   from an ore at a glance while the colour does the rest; the ore colours are
   deliberately distinct already.

   NOTHING IS HARD-CODED PER ITEM. If lane F ever publishes an `icon` field on
   an item, it is honoured the moment it appears, ahead of the category
   default - so refining a single item's appearance is a data edit over there
   rather than a change here. There is deliberately no table of item ids in
   this file, and a check keeps it that way. */

import { ITEM_DATA, itemData } from "../content/items.js";
import { BUILDINGS } from "../content/buildings.js";
import { heldLook } from "../actor/render_actor.js";

/* The vocabulary. The first four are lane B's, named exactly as they name
   them; the rest are this lane's, for things lane B draws as a plain carried
   block. */
export const ICON_SHAPES = [
  "shovel", "pickaxe", "axe", "knife", "blade", /* lane B's, borrowed whole */
  "chunk", "stick", "block", "torch", "roll", "cart",
  "unknown"                                     /* not an item - see iconShape */
];

/* What a category looks like when nothing more specific is known. */
const BY_CATEGORY = {
  raw: "chunk",
  gathered: "stick",
  crafted: "block",
  light: "torch",
  medical: "roll",
  vehicle: "cart",
  tool: "blade"          /* a tool lane B has no kind for is an edge */
};

/* Lane B's answer, where they have one. They classify by their own tool table,
   so this cannot fall out of step with what the clonk is holding. */
function toolKind(id, def){
  try {
    const look = heldLook({ id, def });
    if(look && look.kind && look.kind !== "item" && look.kind !== "hands"){
      return look.kind;
    }
  } catch(err){ /* lane B mid-landing must not blank every icon on the screen */ }
  return null;
}

/* Is this a real item at all? Ask before drawing something that might not be
   one - a building id, a machine id, a typo. See the `unknown` shape. */
export function hasIcon(id){ return !!itemData(id); }

/* Which silhouette an item gets. Pure, so the suite can check every item in
   the game has one without a DOM.

   An id that is not an item gets `unknown`, NOT a rock. That distinction is
   the whole reason this function exists rather than defaulting: master mode
   lists buildings beside items, and a building drawn as a convincing grey
   chunk is silently wrong in a way nobody would ever report - it just looks
   like every building is a rock. A visibly neutral placeholder is worse to
   look at and far better to debug, which is the same trade the guidebook
   makes when it refuses to imply that something works. */
export function iconShape(id){
  const d = itemData(id);
  if(!d) return "unknown";
  const fromTool = toolKind(id, d);
  if(fromTool) return fromTool;
  /* lane F's own say, if they ever publish one */
  if(d.icon && ICON_SHAPES.indexOf(d.icon) >= 0) return d.icon;
  return BY_CATEGORY[d.category] || "chunk";
}

export function iconColours(id){
  const d = itemData(id) || {};
  return { col: d.col || "#8a7c6c", dark: d.dark || "#5d5347" };
}

/* ------------------------------------------------------------------------
   The shapes themselves, in a 16x16 box.

   `col` is the body and `dark` is the shading, the same two colours lane B
   draws the held tool with. Tools point up and to the right, head at the top,
   which is the readable orientation at this size and matches the direction
   the clonk holds them.

   Each entry returns a list of {d, fill} - a path and which colour it takes -
   so the DOM half below stays a loop and the shapes stay data.
------------------------------------------------------------------------ */
const HAFT = "#7b5a34";

const SHAPES = {
  /* broad flat blade, square across the end, wider than the haft */
  shovel: (c, k) => [
    { d:"M4.2 13.4 L9.6 6.4", stroke:HAFT, w:1.6 },
    { d:"M8.0 7.2 L12.6 3.0 L14.4 5.2 L10.2 9.2 Z", fill:c },
    { d:"M8.0 7.2 L9.6 5.8 L11.4 8.0 L10.2 9.2 Z", fill:k }
  ],
  /* a narrow head ACROSS the top, pointed at both ends - never a wedge */
  pickaxe: (c, k) => [
    { d:"M4.2 13.4 L9.8 6.6", stroke:HAFT, w:1.6 },
    { d:"M3.4 5.6 L9.6 2.2 L15.4 5.0 L14.6 6.4 L9.6 4.2 L4.4 7.2 Z", fill:c },
    { d:"M8.6 3.0 L10.8 3.0 L10.6 5.0 L8.8 5.0 Z", fill:k }
  ],
  /* a wedge on ONE side, which is what separates it from the pick */
  axe: (c, k) => [
    { d:"M4.2 13.4 L10.0 5.6", stroke:HAFT, w:1.6 },
    { d:"M9.0 6.6 L12.2 1.8 L15.0 4.4 L12.0 8.4 Z", fill:c },
    { d:"M9.0 6.6 L10.6 4.2 L12.2 5.8 L10.6 8.0 Z", fill:k }
  ],
  /* no haft worth drawing: a knife is a hand and an edge */
  knife: (c, k) => [
    { d:"M3.4 12.2 L11.6 3.4 L13.4 5.0 L5.2 13.6 Z", fill:c },
    { d:"M3.4 12.2 L5.4 10.0 L7.0 11.6 L5.2 13.6 Z", fill:k }
  ],
  /* lane B's fallback for a tool their table gives no kind - all we know is
     that it is a tool, so it gets the same edge rather than a wrong guess */
  blade: (c, k) => [
    { d:"M3.4 12.2 L11.6 3.4 L13.4 5.0 L5.2 13.6 Z", fill:c },
    { d:"M3.4 12.2 L5.4 10.0 L7.0 11.6 L5.2 13.6 Z", fill:k }
  ],
  /* rough, faceted, and not a square - what comes out of the ground */
  chunk: (c, k) => [
    { d:"M3.2 9.4 L5.6 4.2 L11.0 3.2 L14.0 7.0 L12.2 12.4 L6.0 12.8 Z", fill:c },
    { d:"M6.0 12.8 L12.2 12.4 L14.0 7.0 L10.4 8.6 Z", fill:k }
  ],
  /* a length of something: sticks, fibre, cut wood */
  stick: (c, k) => [
    { d:"M3.0 13.0 L12.6 3.4 L14.2 4.8 L4.6 14.4 Z", fill:c },
    { d:"M12.6 3.4 L14.2 4.8 L12.4 6.4 L11.0 5.0 Z", fill:k }
  ],
  /* made, not found: flat faces and a square end */
  block: (c, k) => [
    { d:"M2.6 6.4 L8.0 3.4 L13.8 6.0 L8.4 9.2 Z", fill:c },
    { d:"M2.6 6.4 L8.4 9.2 L8.4 13.4 L2.6 10.6 Z", fill:k },
    { d:"M8.4 9.2 L13.8 6.0 L13.8 10.2 L8.4 13.4 Z", fill:c, op:0.75 }
  ],
  /* the answer to the dark: a haft and a lit head. The flame is deliberately
     broad - drawn narrow it measured under four pixels wide in a sixteen
     pixel box, which beside a chunk and an axe reads as a smudge rather than
     as a torch. */
  torch: (c, k) => [
    { d:"M7.6 14.6 L8.4 9.2", stroke:HAFT, w:2.0 },
    { d:"M8.0 1.3 C11.7 4.3 12.1 7.3 10.0 8.9 C8.6 10.0 7.0 9.8 5.9 8.7 " +
        "C4.1 6.9 5.0 4.2 8.0 1.3 Z", fill:c },
    { d:"M8.1 4.8 C9.9 6.3 10.1 7.5 9.2 8.3 C8.4 9.0 7.3 8.9 6.7 8.2 " +
        "C5.9 7.3 6.5 6.1 8.1 4.8 Z", fill:k }
  ],
  /* wound round on itself */
  roll: (c, k) => [
    { d:"M3.0 5.2 L13.0 5.2 L13.0 11.0 L3.0 11.0 Z", fill:c },
    { d:"M3.0 7.2 L13.0 7.2 L13.0 8.4 L3.0 8.4 Z", fill:k },
    { d:"M3.0 9.6 L13.0 9.6 L13.0 10.4 L3.0 10.4 Z", fill:k }
  ],
  /* NOT AN ITEM. Deliberately unlike everything above: an empty dashed box
     reads as "nothing here" at a glance, where a plausible grey chunk reads
     as a rock and gets believed. */
  unknown: () => [
    { d:"M3.5 3.5 L12.5 3.5 L12.5 12.5 L3.5 12.5 Z", stroke:"#5d646e", w:1.1 },
    { d:"M6.6 6.6 L9.4 9.4 M9.4 6.6 L6.6 9.4", stroke:"#5d646e", w:1.1 }
  ],

  /* a box that goes somewhere */
  cart: (c, k) => [
    { d:"M2.6 4.6 L13.4 4.6 L11.8 10.0 L4.2 10.0 Z", fill:c },
    { d:"M4.2 10.0 L11.8 10.0 L11.4 11.2 L4.6 11.2 Z", fill:k },
    { d:"M5.4 13.6 m -1.5 0 a 1.5 1.5 0 1 0 3 0 a 1.5 1.5 0 1 0 -3 0", fill:k },
    { d:"M11.0 13.6 m -1.5 0 a 1.5 1.5 0 1 0 3 0 a 1.5 1.5 0 1 0 -3 0", fill:k }
  ]
};

/* The paths for one item, as data. Exported so the suite can prove every item
   in the game draws something, without a DOM to draw it into. */
export function iconPaths(id){
  const shape = iconShape(id);
  const { col, dark } = iconColours(id);
  const make = SHAPES[shape] || SHAPES.chunk;
  return make(col, dark);
}

/* ---- buildings, which are not items and never were ----

   Master mode and the build menu list buildings beside items, and lane F
   gives buildings no colour and no appearance - what they do have is a
   FOOTPRINT, and the footprints differ in a way that means something: a kiln
   is tall and narrow, a sawmill is wide and low, a ladder is a sliver. So a
   building is drawn from its own proportions, on a ground line, in one
   structural colour. That is honest about what is known rather than
   inventing per-building art, and it makes a kiln and a sawmill tell
   themselves apart at a glance.

   The ground line matters: it is what says "this is a thing that stands in
   the world" rather than a thing you carry. */
const BUILD_COL = "#7f93a8", BUILD_DARK = "#4c5a68";

export function buildingPaths(id){
  const b = BUILDINGS[id];
  if(!b) return SHAPES.unknown();
  const w = b.w > 0 ? b.w : 10, h = b.h > 0 ? b.h : 10;
  /* fit the real footprint into the box, keeping its proportions */
  const scale = 11 / Math.max(w, h);
  const bw = Math.max(2.5, w * scale), bh = Math.max(2.5, h * scale);
  const x = 8 - bw / 2, top = 13 - bh;
  const r = n => Math.round(n * 10) / 10;
  return [
    { d:"M" + r(x) + " " + r(top) + " L" + r(x + bw) + " " + r(top) +
        " L" + r(x + bw) + " 13 L" + r(x) + " 13 Z", fill: BUILD_COL },
    /* a shaded base, so it reads as standing rather than floating */
    { d:"M" + r(x) + " " + r(13 - Math.min(2.6, bh * 0.34)) + " L" + r(x + bw) + " " +
        r(13 - Math.min(2.6, bh * 0.34)) + " L" + r(x + bw) + " 13 L" + r(x) + " 13 Z",
      fill: BUILD_DARK },
    { d:"M2 13.6 L14 13.6", stroke:"#3b3f47", w:1.2 }
  ];
}

/* ------------------------------------------------------------------------ */

const SVG_NS = "http://www.w3.org/2000/svg";

/* THE ONE ICON EVERY SCREEN USES. Returns an <svg>, sized in pixels, with the
   item's name on it so hovering anywhere in the game says what a thing is. */
export function itemIcon(id, size = 14, paths){
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", "iic");
  svg.setAttribute("aria-hidden", "true");

  for(const p of (paths || iconPaths(id))){
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", p.d);
    if(p.stroke){
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", p.stroke);
      path.setAttribute("stroke-width", String(p.w || 1.4));
      path.setAttribute("stroke-linecap", "round");
    } else {
      path.setAttribute("fill", p.fill);
      if(p.op != null) path.setAttribute("fill-opacity", String(p.op));
    }
    svg.appendChild(path);
  }

  const d = itemData(id) || BUILDINGS[id];
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = d ? d.name : id;
  svg.appendChild(title);
  return svg;
}

/* The same icon as a string, for the two panels that diff themselves by
   comparing innerHTML rather than by touching nodes. It is built from the
   same iconPaths(), so there is still exactly one description of what an
   item looks like - this is a second way to write it out, not a second
   opinion about it. */
export function iconMarkup(id, size = 14, paths){
  const d = itemData(id);
  let s = '<svg class="iic" viewBox="0 0 16 16" width="' + size + '" height="' +
          size + '" aria-hidden="true">';
  for(const p of (paths || iconPaths(id))){
    s += p.stroke
      ? '<path d="' + p.d + '" fill="none" stroke="' + p.stroke +
        '" stroke-width="' + (p.w || 1.4) + '" stroke-linecap="round"/>'
      : '<path d="' + p.d + '" fill="' + p.fill + '"' +
        (p.op != null ? ' fill-opacity="' + p.op + '"' : "") + '/>';
  }
  s += "<title>" + String(d ? d.name : (BUILDINGS[id] ? BUILDINGS[id].name : id))
       .replace(/[<&>]/g, "") + "</title></svg>";
  return s;
}

/* The same, for a building. Master mode and any build UI want these beside
   the items, and passing a building id to itemIcon() would draw it as a rock
   - convincingly, and wrongly. */
export function buildingMarkup(id, size = 14){
  return iconMarkup(id, size, buildingPaths(id));
}
export function buildingIcon(id, size = 14){
  return itemIcon(id, size, buildingPaths(id));
}

/* Draw an icon as the first child of `parent`, replacing one already there.
   The convenience the call sites actually want, so none of them has to know
   how an icon is built. */
export function iconInto(parent, id, size = 14){
  if(!parent) return null;
  const old = parent.querySelector(":scope > svg.iic");
  if(old) parent.removeChild(old);
  const svg = itemIcon(id, size);
  parent.insertBefore(svg, parent.firstChild);
  return svg;
}

/* Every item the game has, for the suite and for a contact sheet. */
export const ICON_ITEM_IDS = Object.keys(ITEM_DATA);
