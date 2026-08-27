/* The item registry. LANE C (items).

   Raw ores are defined here because the material table names them. Refined
   goods (ingots, parts, assemblies) are registered by LANE D at startup
   with registerItem(), so that lane never has to edit this file. */

export const ITEMS = {};
export const ITEM_ORDER = [];

export function registerItem(id, def){
  ITEMS[id] = Object.assign({
    id,
    name: id,
    col: "#8a7c6c",
    dark: "#5d5347",
    mass: 40,
    category: "misc",
    tier: 0
  }, def);
  if(!ITEM_ORDER.includes(id)) ITEM_ORDER.push(id);
  return ITEMS[id];
}

/* --- raw materials the landscape yields --- */
const RAW = [
  ["rock",         "Rock",        "#8a7c6c", "#5d5347", 40, 0],
  ["sand",         "Sand",        "#c9ae70", "#9a8450", 25, 0],
  ["clay",         "Clay",        "#a8664a", "#6f4030", 30, 0],
  ["limestone",    "Limestone",   "#c2b99e", "#8b8570", 38, 0],
  ["gravel",       "Gravel",      "#9a938b", "#6a655e", 32, 0],
  ["coal",         "Coal",        "#3a383e", "#1e1d21", 30, 1],
  ["iron_ore",     "Iron ore",    "#a2643a", "#6b3f24", 45, 1],
  ["copper_ore",   "Copper ore",  "#3fb08a", "#256a54", 45, 2],
  ["tin_ore",      "Tin ore",     "#c3ccd4", "#7d858c", 42, 2],
  ["zinc_ore",     "Zinc ore",    "#8fa7b8", "#5b6e7c", 42, 2],
  ["lead_ore",     "Lead ore",    "#6d7686", "#454b57", 55, 2],
  ["bauxite",      "Bauxite",     "#c98f6b", "#875c44", 36, 2],
  ["quartz",       "Quartz",      "#e2e6ec", "#9aa0a8", 35, 2],
  ["nickel_ore",   "Nickel ore",  "#a9c6a8", "#6b8069", 48, 3],
  ["silver_ore",   "Silver ore",  "#dfe6ea", "#95a0a6", 50, 3],
  ["gold_ore",     "Gold ore",    "#e8bf46", "#9c7c1e", 58, 3],
  ["titanium_ore", "Titanium ore","#a396c4", "#655c80", 44, 4],
  ["uranium_ore",  "Uranium ore", "#8ee04a", "#4e8226", 60, 5],
  ["rare_earth",   "Rare earth",  "#c86ad0", "#7c3f82", 46, 5]
];
for(const [id,name,col,dark,mass,tier] of RAW){
  registerItem(id, { name, col, dark, mass, tier, category:"raw" });
}

export function itemDef(id){ return ITEMS[id] || ITEMS.rock; }
