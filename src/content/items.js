/* ITEM_DATA - the item vocabulary. LANE F (content).

   Data only. No systems, no rendering, no simulation code in this folder.
   Other lanes import this table; they never hard-code an item's numbers.

   Fields
     id        stable string key. MUST match src/world/materials.js `dig2`
               for anything the landscape yields, and must never change once
               a save file has seen it.
     name      display name shown in the HUD and the guidebook.
     mass      KILOGRAMS for one chunk/unit. This is the main balance lever
               in the game: the backpack holds ~35 kg to start and ~60 kg
               with the best pack, so a 5 kg rock means seven rocks a trip.
               See MASS NOTES below before touching any of these.
     category  raw | gathered | crafted | tool | light | medical
     band      where it is found: surface, shallow, middle, deep, verydeep,
               or null for things that are made rather than found.
               Mirrors docs/GAME_DESIGN.md section 6.
     stage     the earliest progression stage at which this item has a real
               use (docs/PROGRESSION.md). Not where it is found - coal sits
               in the shallow band but only matters once there is a kiln.
     tier      lane C's existing depth tier. Kept identical to
               src/items/itemdefs.js so swapping that table for this one
               changes nothing.
     col/dark  the two colours a dropped chunk is drawn with. Identical to
               lane C's values for every raw item - changing them would
               silently repaint every chunk on the ground.
     use       one line answering "what is this for?". Every entry has one;
               an item no chain uses does not belong in this table.
     recover   0..1, how much of this comes back when a building made of it is
               taken apart. Absent means 1 - full recovery - because
               destroying a player's property needs a designed reason and
               silence is not one (lane C's structures.js reads this).

               THE PRINCIPLE: you recover the bulk, you lose the WORKED value.
               Stacked stone and untouched timber come back whole; anything
               fired, mortared or cut to fit does not come apart cleanly. That
               is physically honest, and it produces the curve the game wants
               on its own - the early buildings are almost free to move while
               you are still learning where things should go, and the forge,
               the one real commitment, costs materials to relocate. Placement
               only matters if moving something is a decision.

   MASS NOTES
     Anchor: one chunk of plain rock is 5 kg. Everything else is scaled from
     that by how dense the ore-bearing rock actually is, which is why a
     uranium chunk (7.5 kg) is half again as heavy as coal (3.6 kg) and why
     four deep-ore chunks nearly fill a starting backpack. Making ore lighter
     is the one change that would remove the reason for the entire industry
     lane - see docs/lanes/content.md, Gotchas.

     These are kilograms. Lane C's table used an unscaled number (rock 40)
     that predates the carry decision; the ordering is preserved, the unit
     is not. Nothing reads mass yet except inventory.carriedMass().
*/

/* Backpack capacities in kg - what the masses above are tuned against.
   docs/DECISIONS.md, 2026-08-27 "Carrying is mass-limited, human scale". */
export const CARRY_START = 35;
export const CARRY_BEST = 60;

const DATA = [
  /* --- raw: dug out of the landscape. ids match materials.js dig2 --- */
  { id: "soil", name: "Soil", mass: 3.5, category: "raw", band: "surface", stage: 0, tier: 0,
    col: "#6c4a2c", dark: "#563a22",
    use: "The spoil of every hole you dig, and the single most-hauled thing in the game. Tipped down shafts, carted away, or used to fill a hollow back in." },

  { id: "rock", name: "Rock", mass: 5.0, category: "raw", band: "surface", stage: 0, tier: 0,
    col: "#8a7c6c", dark: "#5d5347",
    use: "Hand tools, the workbench, and the first walls. The default spoil of any shaft." },

  { id: "sand", name: "Sand", mass: 3.2, category: "raw", band: "surface", stage: 2, tier: 0,
    col: "#c9ae70", dark: "#9a8450",
    use: "Glass at the kiln, later mould sand for casting and aggregate in concrete." },

  { id: "clay", name: "Clay", mass: 3.8, category: "raw", band: "surface", stage: 2, tier: 0,
    col: "#a8664a", dark: "#6f4030",
    use: "The kiln itself, then bricks - the first structures that survive a cave-in." },

  { id: "limestone", name: "Limestone", mass: 4.8, category: "raw", band: "surface", stage: 2, tier: 0,
    col: "#c2b99e", dark: "#8b8570",
    use: "Burnt in the kiln for quicklime: mortar, smelting flux, and later concrete." },

  { id: "gravel", name: "Gravel", mass: 4.0, category: "raw", band: "surface", stage: 7, tier: 0,
    col: "#9a938b", dark: "#6a655e",
    use: "Aggregate for the launch pad's concrete. Until then it is fill and rail ballast." },

  { id: "coal", name: "Coal", mass: 3.6, category: "raw", band: "shallow", stage: 4, tier: 1,
    col: "#3a383e", dark: "#1e1d21",
    use: "Forge fuel and the carbon in steel, then the boiler. Found in the first shaft and worth nothing until there is a forge - the clearest case in the game of a material whose band and whose stage are different questions." },

  { id: "iron_ore", name: "Iron ore", mass: 5.6, category: "raw", band: "shallow", stage: 4, tier: 1,
    col: "#a2643a", dark: "#6b3f24",
    use: "Iron and steel at the forge: tools, fittings, rails, boiler plate. The hinge of the whole game." },

  { id: "copper_ore", name: "Copper ore", mass: 5.6, category: "raw", band: "middle", stage: 4, tier: 2,
    col: "#3fb08a", dark: "#256a54",
    use: "Bronze and brass, boiler pipe and seals, and every metre of wire once electricity arrives." },

  { id: "tin_ore", name: "Tin ore", mass: 5.2, category: "raw", band: "middle", stage: 4, tier: 2,
    col: "#c3ccd4", dark: "#7d858c",
    use: "Alloyed with copper for bronze, and tinning that stops iron rusting." },

  { id: "zinc_ore", name: "Zinc ore", mass: 5.2, category: "raw", band: "middle", stage: 4, tier: 2,
    col: "#8fa7b8", dark: "#5b6e7c",
    use: "Alloyed with copper for brass: valves, fittings and instrument bodies." },

  { id: "lead_ore", name: "Lead ore", mass: 7.0, category: "raw", band: "middle", stage: 4, tier: 2,
    col: "#6d7686", dark: "#454b57",
    use: "Solder, pipe joints and seals, and shielding once uranium is being handled." },

  { id: "bauxite", name: "Bauxite", mass: 4.5, category: "raw", band: "middle", stage: 6, tier: 2,
    col: "#c98f6b", dark: "#875c44",
    use: "Aluminium by electrolysis - which is why it waits for electricity. Rocket tanks and structure." },

  { id: "quartz", name: "Quartz", mass: 4.4, category: "raw", band: "middle", stage: 2, tier: 2,
    col: "#e2e6ec", dark: "#9aa0a8",
    use: "Clear glass for lamps and instruments; later the silicon in avionics." },

  { id: "nickel_ore", name: "Nickel ore", mass: 6.0, category: "raw", band: "deep", stage: 6, tier: 3,
    col: "#a9c6a8", dark: "#6b8069",
    use: "High-temperature alloy - the part of the rocket engine that has to survive the burn." },

  { id: "silver_ore", name: "Silver ore", mass: 6.2, category: "raw", band: "deep", stage: 6, tier: 3,
    col: "#dfe6ea", dark: "#95a0a6",
    use: "Electrical contacts and mirror-backed instruments; the best conductor you can mine." },

  { id: "gold_ore", name: "Gold ore", mass: 7.2, category: "raw", band: "deep", stage: 7, tier: 3,
    col: "#e8bf46", dark: "#9c7c1e",
    use: "Contacts and plating in avionics, where a corroded connection ends the mission." },

  { id: "titanium_ore", name: "Titanium ore", mass: 5.5, category: "raw", band: "deep", stage: 6, tier: 4,
    col: "#a396c4", dark: "#655c80",
    use: "The tip of the only pickaxe that reaches the bottom of the world, and later the rocket structure and engine parts." },

  { id: "uranium_ore", name: "Uranium ore", mass: 7.5, category: "raw", band: "verydeep", stage: 6, tier: 5,
    col: "#8ee04a", dark: "#4e8226",
    use: "Late power once coal cannot keep up. Glows in the dark, and wants lead around it." },

  { id: "rare_earth", name: "Rare earth", mass: 5.8, category: "raw", band: "verydeep", stage: 7, tier: 5,
    col: "#c86ad0", dark: "#7c3f82",
    use: "Magnets and avionics - the last thing the rocket needs and the deepest thing to dig for." },


  /* --- stage 1: made at the workbench, and what they open up --- */
  { id: "stone_shovel", name: "Stone shovel", mass: 2.2, category: "tool", band: null, stage: 1, tier: 0,
    col: "#a99a80", dark: "#6a6052",
    use: "Moves soft ground several times faster than hands. Useless against rock, which is what the pickaxe is for." },

  { id: "stone_pickaxe", name: "Stone pickaxe", mass: 2.8, category: "tool", band: null, stage: 1, tier: 0,
    col: "#9c9488", dark: "#605a52",
    use: "The one tool that opens rock. Everything below the first rock layer is behind this." },

  { id: "wheelbarrow", name: "Wheelbarrow", mass: 18.0, category: "vehicle", band: null, stage: 1, tier: 0,
    col: "#8a6a44", dark: "#54402a",
    use: "Pushed, not carried: it moves several backpacks at once over level ground. The first time hauling stops being your whole day." },

  /* --- stage 2: fired in the kiln --- */
  { id: "charcoal", name: "Charcoal", mass: 1.8, category: "crafted", band: null, stage: 2, tier: 0,
    col: "#4a4642", dark: "#26241f",
    use: "The first fuel hot enough to melt metal. Light for its bulk, which is the only reason fuelling a forge is possible by hand." },

  { id: "brick", name: "Brick", mass: 2.5, category: "crafted", band: null, stage: 2, tier: 0,
    col: "#b0563c", dark: "#6e3324",
    recover: 0.5,   /* mortared together - half of them break coming apart */
    use: "Structures that survive weather and a cave-in. The forge and foundry are built of these." },

  { id: "quicklime", name: "Quicklime", mass: 2.0, category: "crafted", band: null, stage: 2, tier: 0,
    col: "#e4e0d4", dark: "#a09c8e",
    recover: 0,   /* it became the mortar. There is nothing to take back */
    use: "Mortar that makes brick into a wall, and the flux that makes a smelt actually work." },

  { id: "glass", name: "Glass", mass: 1.2, category: "crafted", band: null, stage: 2, tier: 0,
    col: "#bcd8dc", dark: "#6e8a8e",
    recover: 0.25,   /* mostly breaks, which is what glass does */
    use: "Lamps that do not blow out, and later the instruments the rocket cannot fly without." },



  /* --- stage 3: wood at scale --- */
  { id: "plank", name: "Plank", mass: 3.0, category: "crafted", band: null, stage: 3, tier: 0,
    col: "#b08a52", dark: "#6e5432",
    recover: 1,   /* sawn timber is nailed, not mortared - you lever planks out and use them again, which is why old barns get dismantled and re-erected rather than demolished. Arrived at while chasing a rounding bug that made one-plank pieces return nothing; lane C has since fixed that shape, so this stands on its own merit rather than as a workaround */
    use: "Sawn wood: the frame and charging floor of a forge, and later scaffolds, ladders and everything built above ground level." },

  /* --- stage 4: the smelting chain, and the tools it unlocks ---
     Bars are the hinge of the whole game: a bar is not a nicety, it is the
     key to the next layer of the map (docs/DECISIONS.md, tool tiers). */
  { id: "iron_bar", name: "Iron bar", mass: 4.0, category: "crafted", band: null, stage: 4, tier: 0,
    col: "#8d8b90", dark: "#54525a",
    recover: 0.85,   /* metal is metal, and it can go back in the fire */
    use: "Tools that reach the middle band, fittings, rails and plate. The first metal, and the reason the shallow band matters." },

  { id: "steel_bar", name: "Steel bar", mass: 4.2, category: "crafted", band: null, stage: 4, tier: 0,
    col: "#b8bcc4", dark: "#6c7078",
    recover: 0.85,   /* as iron: re-forgeable, minus what was driven in */
    use: "Iron and coal together. Tools that reach the deep metals, and everything that has to hold pressure." },

  { id: "iron_shovel", name: "Iron shovel", mass: 3.4, category: "tool", band: null, stage: 4, tier: 0,
    col: "#9a9aa2", dark: "#5c5c64",
    use: "Twice the shovel in loose ground, and still no use at all against stone." },

  { id: "iron_pickaxe", name: "Iron pickaxe", mass: 4.0, category: "tool", band: null, stage: 4, tier: 0,
    col: "#96969e", dark: "#585860",
    use: "Opens the middle band: copper, tin, zinc, lead, bauxite and quartz." },

  { id: "iron_axe", name: "Iron axe", mass: 3.6, category: "tool", band: null, stage: 4, tier: 0,
    col: "#9e9aa0", dark: "#5e5a62",
    use: "Fells a tree in half the time. It will never touch rock, however good the steel gets - an axe is for wood and that is the whole of it." },

  { id: "steel_shovel", name: "Steel shovel", mass: 3.2, category: "tool", band: null, stage: 4, tier: 0,
    col: "#c0c4cc", dark: "#70747c",
    use: "The fastest a shovel gets. Still not a pickaxe, and never will be." },

  { id: "steel_pickaxe", name: "Steel pickaxe", mass: 3.8, category: "tool", band: null, stage: 4, tier: 0,
    col: "#c8ccd4", dark: "#787c84",
    use: "Opens the deep metals: nickel, silver, gold and titanium." },

  { id: "titanium_pickaxe", name: "Titanium-tipped pickaxe", mass: 3.4, category: "tool", band: null, stage: 6, tier: 0,
    col: "#b6a8d4", dark: "#6a5f88",
    use: "The only tool that reaches uranium and the rare earths at the bottom of the world." },

  /* --- gathered: taken from the surface, no station needed --- */
  { id: "wood", name: "Wood", mass: 7.0, category: "gathered", band: "surface", stage: 0, tier: 0,
    col: "#7a5a34", dark: "#4e3921",
    use: "A length of felled log: the workbench, tool handles, planks, and charcoal for the kiln." },

  { id: "stick", name: "Stick", mass: 0.4, category: "gathered", band: "surface", stage: 0, tier: 0,
    col: "#8a6a42", dark: "#5a442a",
    use: "Hafts for stone tools and the shaft of a torch. Lying on the ground under trees." },

  { id: "plant_fibre", name: "Plant fibre", mass: 0.15, category: "gathered", band: "surface", stage: 0, tier: 0,
    col: "#9aa858", dark: "#61693a",
    use: "Twisted into rope, wadded into a torch head, or pressed into a bandage." },

  /* --- crafted by hand, anywhere, no station (docs/PROGRESSION.md stage 0) --- */
  { id: "rope", name: "Rope", mass: 0.9, category: "crafted", band: null, stage: 0, tier: 0,
    col: "#b39a63", dark: "#776444",
    recover: 1,   /* a lashing is UNTIED, not cut - knots do not consume rope, so it survives being taken apart. Same history as the plank: found while chasing the rounding bug that made a one-rope ladder return nothing, and kept afterwards because it is the truer story anyway */
    use: "Lashes a stone axe together, then climbs shafts, then hoists loads on a winch." },

  { id: "torch", name: "Torch", mass: 0.6, category: "light", band: null, stage: 0, tier: 0,
    col: "#e0913a", dark: "#7d4a1c",
    use: "The first answer to darkness. It burns out, which is why the light chain never stops." },

  { id: "stone_knife", name: "Stone knife", mass: 0.7, category: "tool", band: null, stage: 0, tier: 0,
    col: "#b6b0a4", dark: "#6e6a60",
    use: "Cuts fibre for rope and butchers what you hunt. The first tool worth the rock." },

  { id: "stone_axe", name: "Stone axe", mass: 1.8, category: "tool", band: null, stage: 0, tier: 0,
    col: "#9a8f7e", dark: "#5e574c",
    use: "Fells trees for wood, which is what stands between bare hands and a workbench." },

  { id: "bandage", name: "Bandage", mass: 0.1, category: "medical", band: null, stage: 0, tier: 0,
    col: "#e6e0d2", dark: "#a09a8c",
    use: "Stops the bleeding after a fall. Cheap enough to carry several, light enough to forget." }
];

/* Keyed by id, which is how every other lane looks an item up. */
export const ITEM_DATA = Object.create(null);
for (const d of DATA) ITEM_DATA[d.id] = d;

/* Stable display order for the HUD and the guidebook. */
export const ITEM_IDS = DATA.map(d => d.id);

export const ITEM_CATEGORIES = ["raw", "gathered", "crafted", "tool", "light", "medical", "vehicle"];

/* Raw items the owner has agreed exist, but which no material yields yet
   because the lane that owns the terrain has not wired them up.

   The content test allows exactly these ids to have no source, AND fails once
   an id here does have one - so the list cleans itself up rather than rotting.
   That is not theoretical: `soil` sat here for one commit, lane A set
   dig2: "soil" on M_EARTH, and the suite immediately said to remove it.

   Empty is the correct resting state. Add an id only when the owner has
   settled it and the terrain side has not landed yet. */
export const PENDING_YIELD = [];

/* What lies loose on the surface and can be taken with no tool at all.
   `rock` is the important one and the easy one to miss: it is category "raw"
   because the ground also yields it, but a stone pickaxe is made OF rock and
   rock needs a stone pickaxe to dig. The only reason that is not a deadlock
   is that loose rock lies on the ground at the start.

   This list is therefore the bottom rung of the entire tool ladder. If it
   ever stops including rock, the game becomes uncompletable in its first
   minute, and the content suite's reachability proof is what would catch it.

   LANE C: src/items/gatherables.js must keep yielding exactly these. */
export const SURFACE_PICKUPS = ["stick", "plant_fibre", "rock"];

/* The depth bands of docs/GAME_DESIGN.md section 6, shallowest first. */
export const BANDS = ["surface", "shallow", "middle", "deep", "verydeep"];

export function itemData(id){ return ITEM_DATA[id] || null; }
