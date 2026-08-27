/* The item registry. LANE C (items).

   The vocabulary itself is data and belongs to LANE F: this file builds the
   live registry from src/content/items.js (ITEM_DATA) rather than keeping a
   second copy of every name, colour and mass. Lane F tunes the numbers; we
   implement the mechanics that read them.

   Refined goods (ingots, parts, assemblies) are registered by LANE D at
   startup with registerItem(), so that lane never has to edit this file.

   MASSES ARE KILOGRAMS, anchored at one chunk of rock = 5 kg. They used to be
   unscaled (rock 40); anything comparing a mass against a literal must be read
   in kg. See src/content/items.js, MASS NOTES. */

import { ITEM_DATA, ITEM_IDS } from "../content/items.js";

export const ITEMS = {};
export const ITEM_ORDER = [];

export function registerItem(id, def){
  ITEMS[id] = Object.assign({
    id,
    name: id,
    col: "#8a7c6c",
    dark: "#5d5347",
    mass: 1,          /* kg, and deliberately light: an unpriced item should
                         never be the thing that fills a backpack unnoticed */
    category: "misc",
    band: null,
    stage: 0,
    tier: 0
  }, def);
  if(!ITEM_ORDER.includes(id)) ITEM_ORDER.push(id);
  return ITEMS[id];
}

/* --- everything lane F has named --- */
for(const id of ITEM_IDS){
  const d = ITEM_DATA[id];
  registerItem(id, {
    name: d.name, col: d.col, dark: d.dark, mass: d.mass,
    category: d.category, band: d.band, stage: d.stage, tier: d.tier,
    use: d.use
  });
}

export function itemDef(id){ return ITEMS[id] || ITEMS.rock; }
