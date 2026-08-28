/* GUIDE - what the guidebook says. LANE F (content).

   Data only. Lane E renders this; I write it.

   THE ONE RULE: NEVER WRITE A SHORTFALL DOWN.
   An entry never says "you need 12 wood". It says "build a workbench" and
   points at the thing, and the UI does the subtraction against what the
   player is actually carrying. That is why every action carries a `needs`
   spec instead of a sentence with numbers in it: numbers written into prose
   go stale the moment a cost is tuned, and tuning costs is this lane's whole
   job. docs/lanes/content.md: "write them as templates with slots for
   'you have / you need', never as fixed paragraphs".

   An action's `needs` is one of:
     { build: buildingId }   -> materials come from BUILDINGS[id].materials
     { craft: recipeId }     -> inputs come from RECIPES[id].inputs, and
                                RECIPES[id].tool if it has one
     { items: {id: n} }      -> for "gather this", which is nobody's recipe
     null                    -> prose only, allowed ONLY above the last costed
                                stage, where there is nothing to subtract yet
   The UI renders "you have 5 of 12 wood" from that. It should also quote
   buildMass(), because "12 wood and 4 stone" means nothing to a player until
   it reads as "104 kg, three trips".

   Fields per stage
     stage    index into STAGES. Every stage has exactly one entry.
     lookFor  what to look for in the WORLD, not in a menu. Never coordinates.
     actions  two or three next useful things, in the order worth doing them.
       id     stable key, so the UI can remember what has been dismissed
       do     the imperative, short enough for one line
       why    what it buys you - a guidebook that only says "do X" teaches
              nothing about a game whose whole point is physical consequence
       needs  see above
*/

export const GUIDE = [
  {
    stage: 0,
    lookFor: "Sticks and fibrous plants lie loose on the surface, and rocks sit in the open ground near slopes. You need no tool to pick any of it up.",
    actions: [
      { id: "gather-first", do: "Gather sticks, plant fibre and a loose rock",
        why: "Everything in the first hour is made of these three, and none of them needs a tool.",
        needs: { items: { stick: 2, plant_fibre: 4, rock: 3 } } },
      { id: "knife-first", do: "Make a stone knife",
        why: "It is not spent when you use it. It is the capability that unlocks rope, and rope unlocks the axe.",
        needs: { craft: "stone_knife" } },
      { id: "torch-before-dark", do: "Make a torch before the light goes",
        why: "Underground is genuinely black and your eyes do not adjust. A torch is the difference between digging and guessing.",
        needs: { craft: "torch" } },
      { id: "axe-then-tree", do: "Make a stone axe and fell a tree",
        why: "Wood is the workbench, and the workbench is every tool after this one.",
        needs: { craft: "stone_axe" } }
    ]
  },
  {
    stage: 1,
    lookFor: "Grey rock under the soil stops your hands entirely - that is what the pickaxe is for. Coal shows as near-black seams, and iron as rusty red flecks, both just below the first rock layer.",
    actions: [
      { id: "build-workbench", do: "Build a workbench",
        why: "It is the first station, and its recipe list is the next page of the game.",
        needs: { build: "workbench" } },
      { id: "make-pickaxe", do: "Make a stone pickaxe",
        why: "It is the only thing that opens rock. Everything below the first rock layer is behind this one object.",
        needs: { craft: "stone_pickaxe" } },
      { id: "make-wheelbarrow", do: "Make a wheelbarrow",
        why: "It pushes several backpacks at once over level ground. This is where hauling stops being your whole day.",
        needs: { craft: "wheelbarrow" } },
      { id: "build-chest", do: "Build a chest near where you dig",
        why: "Your back holds one load and no more. A chest at the tunnel mouth is the difference between mining and walking.",
        needs: { build: "chest" } }
    ]
  },
  {
    stage: 2,
    lookFor: "Clay sits in reddish-brown bands near water and low ground. Limestone is the pale, almost cream-coloured rock. Sand is on the surface and in dry hollows.",
    actions: [
      { id: "haul-clay", do: "Haul clay and stone to one spot",
        why: "The kiln is the heaviest thing you have built so far. Pick where it goes before you carry anything.",
        needs: { build: "kiln" } },
      { id: "burn-charcoal", do: "Burn charcoal in the kiln",
        why: "Wood fire will not melt metal. Charcoal is the first fuel that will, so it gates every metal you will ever smelt.",
        needs: { craft: "charcoal" } },
      { id: "bricks-for-shelter", do: "Fire bricks and build something that lasts",
        why: "Bricks survive weather and cave-ins in a way that stacked wood does not.",
        needs: { craft: "brick" } }
    ]
  },
  {
    stage: 3,
    lookFor: "Moving water on a slope is what a wheel wants. Mature trees are the plank supply, and flat ground near water is where a farm plot will take.",
    actions: [
      { id: "sawmill", do: "Build a sawmill on moving water",
        why: "It is wood, stone and rope - no metal - so water power is reachable before you have smelted anything.",
        needs: { build: "sawmill" } },
      { id: "saw-planks", do: "Saw your logs into planks",
        why: "A log gives back more pieces than you put in, and the forge is built of them - so this stage is what the next one stands on.",
        needs: { craft: "plank" } },
      { id: "first-machine", do: "Put a water wheel on a shaft-and-belt line",
        why: "The first machine that keeps working while you are somewhere else. Everything after this is about that idea.",
        needs: null },
      { id: "farm", do: "Break ground for a farm plot",
        why: "Food stops being a daily chore, which is what lets you stay underground for a long shift.",
        needs: null }
    ]
  },
  {
    stage: 4,
    lookFor: "Water seeping into the bottom of a deep shaft is the problem this stage solves. Limestone is your flux; coal and iron you already know by sight.",
    actions: [
      { id: "forge", do: "Raise a forge and smelt iron",
        why: "Iron is tools that do not break, rails that carry tonnes, and plate that holds pressure.",
        needs: { build: "forge" } },
      { id: "iron-pickaxe", do: "Forge an iron pickaxe",
        why: "The ground that stopped you now gives way. This is the moment the map gets deeper because of something you made rather than something you endured.",
        needs: { craft: "iron_pickaxe" } },
      { id: "steam-pump", do: "Build a boiler and put a steam pump at the bottom of the shaft",
        why: "Groundwater is what stops a deep mine. A pump is the first thing that beats it, so depth becomes a choice again.",
        needs: null },
      { id: "rails", do: "Lay rails from the face to the surface",
        why: "Wagons move spoil and ore in tonnes. This is the stage where hauling stops being your problem.",
        needs: null }
    ]
  },
  {
    stage: 5,
    lookFor: "Oil sits in dark pockets in the middle band and does not flow uphill on its own. It will not be near where you want it.",
    actions: [
      { id: "derrick", do: "Sink a derrick over an oil pocket",
        why: "Crude is the feedstock for fuel, lubricant and tar, and eventually for what the rocket burns. The tower is only timber and rope - what gates oil is the pickaxe that reaches the depth.",
        needs: { build: "derrick" } },
      { id: "walking-beam", do: "Stand a walking beam beside it",
        why: "A bore that is not pumped is a hole. The tower is cheap and the engine is what costs, which is the right way round.",
        needs: { build: "walking_beam" } },
      { id: "refinery", do: "Build a refinery and crack the crude",
        why: "Nothing useful comes out of the ground finished.",
        needs: null },
      { id: "explosives", do: "Make blasting charges - and think first",
        why: "Blasting is fast and lossy: it scatters spoil, some of it out of reach for good. Digging is slow and loses nothing.",
        needs: null }
    ]
  },
  {
    stage: 6,
    lookFor: "Bauxite is the pinkish-brown ore in the middle band; it is useless until now, because aluminium needs electrolysis. Silver and gold are deep, and they are for contacts, not for wealth.",
    actions: [
      { id: "dynamo", do: "Drive a dynamo from the steam or water you already have",
        why: "Electricity is not a new resource. It is distribution: one engine driving machines nowhere near it.",
        needs: null },
      { id: "cables", do: "Run cable to the far end of the mine",
        why: "Electric light that does not burn out, and cutters and conveyors at the face.",
        needs: null },
      { id: "electrolysis", do: "Set up electrolysis and make aluminium",
        why: "Light, strong, and the only reason bauxite was ever worth carrying.",
        needs: null }
    ]
  },
  {
    stage: 7,
    lookFor: "Titanium is deep and purple-flecked; nickel is deep and green-grey; rare earths are the deepest thing in the world. You will need all of them.",
    actions: [
      { id: "assembly-hall", do: "Build the assembly hall and the pad",
        why: "The sections are too big to move far. Build where it will launch.",
        needs: null },
      { id: "sections", do: "Assemble structure, engine and avionics",
        why: "Each section is a bill for a different part of the world you have dug.",
        needs: null },
      { id: "launch", do: "Fuel the tanks, get aboard, and leave",
        why: "The rock you picked up by hand on the first evening is part of this.",
        needs: null }
    ]
  }
];

/* How a material announces itself, for a player who has no map and no scanner.
   Written as sight, not location - "rusty red flecks in rock", never "at y=800".
   Keyed by item id so the UI can show it next to the thing in the inventory. */
export const MATERIAL_HINTS = {
  soil:         "Plain brown ground, and most of what you will ever move. Every hole you dig is mostly this.",
  rock:         "Grey-brown stone under the soil. Your hands will not touch it; a pickaxe will.",
  sand:         "Pale loose grains on the surface and in dry hollows. It slumps when you undercut it, so do not stand below.",
  clay:         "Reddish-brown bands in low ground and near water. Smoother-looking than the earth around it.",
  limestone:    "The pale, almost cream-coloured rock. Burns to quicklime, which is mortar and smelting flux.",
  gravel:       "Loose grey shingle, flecked light and dark. Like sand, it slides when undermined.",
  coal:         "Near-black seams just below the first rock layer, dull rather than shiny.",
  iron_ore:     "Rusty red flecks scattered through grey rock, shallow and common. The first ore worth a shaft.",
  copper_ore:   "Vivid green flecks - the brightest thing you will see in the middle band, and unmistakable.",
  tin_ore:      "Pale silver-white flecks in dull rock. Easy to confuse with zinc until you learn both.",
  zinc_ore:     "Blue-grey flecks, cooler in colour than tin and a little duller.",
  lead_ore:     "Heavy grey-blue rock with a metallic sheen. It is noticeably worse to carry than it looks.",
  bauxite:      "Pinkish-brown, chalky-looking ore in the middle band. Worthless until you have electricity.",
  quartz:       "Bright white crystal seams that catch what light you have. Glass and, much later, silicon.",
  nickel_ore:   "Green-grey flecks, deep down. Alloyed for parts that must survive real heat.",
  silver_ore:   "Bright white-grey flecks, deep. The best conductor you can dig.",
  gold_ore:     "Unmistakable warm yellow flecks. Deep, heavy, and for contacts rather than for hoarding.",
  titanium_ore: "Purple-violet flecks in dark rock, deep. Strong for its weight, which is the whole point.",
  uranium_ore:  "Faintly glowing green. You will see it before your lamp reaches it, which is the warning.",
  rare_earth:   "Magenta flecks at the very bottom of the world. The last thing the rocket needs.",
  crude_oil:    "Dark pockets in the middle band that do not glitter and do not flow uphill. You will smell a seep before you see one, and it will never be where you wanted it.",
  wood:         "Standing trees. You cannot fell one by hand - it takes an axe.",
  stick:        "Loose on the ground under trees. Free, and the haft of every early tool.",
  plant_fibre:  "Fibrous plants on open ground. Pull them by hand; cut them with a knife for rope."
};

/* What the world is telling you when it looks like this. Hazards only - the
   game's opponent is the world, so the guidebook's job is to make its warnings
   legible before they are fatal. */
export const HAZARD_HINTS = {
  lava_glow:   "An orange glow through a wall means lava on the other side. It does not need to be touching you to kill you - break through and it comes to you, downhill, fast.",
  water_seep:  "Water beading at the face means you are near an aquifer. Dig on and the shaft floods to the level of the water, not to the level of your nerve.",
  loose_above: "Sand and gravel slump when you undercut them. If it is above you and it is loose, it is going to be below you shortly.",
  dark_ahead:  "Your lamp is a cone, not a room. What you cannot see is usually a drop.",
  deep_heat:   "The deeper you go, the further everything has to travel back up. Depth is a haulage problem long before it is a danger."
};

export function guideFor(stage){
  return GUIDE.find(g => g.stage === stage) || null;
}

export function hintFor(itemId){
  return MATERIAL_HINTS[itemId] || null;
}
