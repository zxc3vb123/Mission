/* REFERENCE - the in-game guidebook's reference half. LANE F (content).

   GUIDE says what to do next. This says how anything works. The panel shows
   both; they are not replacements for each other.

   Data only. Lane E builds the panel, the search and the navigation.

   THREE RULES THIS FILE KEEPS
   1. No numbers in prose. Anything that lives in a table is pulled from that
      table into `figures`, so tuning a mass or a capacity updates the book.
      The test fails on any digit in a `body`.
   2. No key bindings. Those are UI facts and the panel generates them from
      the real bindings, so they can never go stale here.
   3. EVERY PAGE SAYS WHETHER IT IS TRUE YET. `status` is "live" for a
      mechanic that is in the build the player is holding, and "planned" for
      one that exists as data but has no system behind it. The owner's actual
      complaint is "I cannot tell what is in the game", and a reference book
      that quietly describes unbuilt mechanics would answer that question
      wrongly - worse than not answering it. The panel should render planned
      pages visibly differently, or hide them behind a toggle.

   Fields
     id        stable key, also the search result's anchor.
     title     what the page is called.
     body      how it works, in this game. Two to four sentences. No digits.
     keywords  what a confused player would actually TYPE. Someone stuck at a
               rock face searches "rock" or "cant dig", not "pickaxe". Include
               the wrong words, the panicky words and the plural forms.
     status    "live" | "planned". See rule three.
     figures   derived numbers, computed from the real tables at load. Never
               typed by hand.
     see       related page ids.

   Recipes and buildings are deliberately NOT re-described here: the panel
   renders those from RECIPES and BUILDINGS directly. What it cannot render
   is the rules, which is what these pages are.
*/

import { ITEM_DATA, ITEM_IDS, CARRY_START, CARRY_BEST } from "./items.js";
const itemDataLocal = id => ITEM_DATA[id] || null;
import { RECIPE_IDS, RECIPES, HAND } from "./recipes.js";
import { HAULAGE, HAULAGE_IDS } from "./haulage.js";
import { STAGES } from "./stages.js";
import { TOOLS, TOOL_IDS, HARDNESS } from "./tools.js";
import { BUILDINGS, BUILDING_IDS, recoveryFraction, MAX_SPAN } from "./buildings.js";

/* ---- figures, derived so they cannot go stale ---- */
const rocksPerTrip = Math.floor(CARRY_START / ITEM_DATA.rock.mass);
const deepPerTrip = Math.floor(CARRY_START / ITEM_DATA.uranium_ore.mass);
const bestRocks = Math.floor(CARRY_BEST / ITEM_DATA.rock.mass);
const handRecipes = RECIPE_IDS.filter(id => RECIPES[id].station === HAND).length;
const oreCount = ITEM_IDS.filter(id => ITEM_DATA[id].category === "raw").length;

/* What each pickaxe opens, straight off the tier table. */
const TIER_FIGURES = TOOL_IDS
  .filter(id => TOOLS[id].kind === "pickaxe")
  .sort((a, b) => TOOLS[a].cuts - TOOLS[b].cuts)
  .map(id => ({
    label: TOOLS[id].name,
    value: Object.keys(HARDNESS).filter(m => HARDNESS[m] === TOOLS[id].cuts).join(", ")
  }));

/* How much of each building comes back, straight off the tables. */
const HOUSE_FIGURES = BUILDING_IDS.filter(id => BUILDINGS[id].piece).map(id => ({
  label: BUILDINGS[id].name,
  value: Object.entries(BUILDINGS[id].materials).map(([m, n]) => n + " " + m).join(", ")
})).concat([{
  label: "Unsupported reach",
  value: MAX_SPAN + " pieces from the last post"
}]);

const BUILD_RECOVERY = BUILDING_IDS.map(id => ({
  label: BUILDINGS[id].name,
  value: Math.round(recoveryFraction(id, itemDataLocal) * 100) + "% returned"
}));

const PAGES = [
  {
    id: "how-to-read-this",
    title: "How to use this book",
    status: "live",
    keywords: ["help", "guide", "book", "how", "start", "lost", "confused", "what do i do"],
    body: "This half of the book explains how things work. The other half tells you what to do next, and it reads your actual pockets to do it. Search for whatever word is in your head, including the wrong one. Pages marked as not yet in the build describe things that are designed but not finished, so you can tell what is missing rather than assuming you have failed to find it.",
    figures: [],
    see: ["getting-started", "stages"]
  },
  {
    id: "getting-started",
    title: "The first few minutes",
    status: "live",
    keywords: ["start", "beginning", "first", "new game", "what now", "lost", "spawn"],
    body: "You arrive with nothing on a world with nobody. Sticks, fibrous plants and loose rock lie on the surface and need no tool to pick up. From those you can make a blade, and from the blade rope, and from rope an axe, and the axe is what gets you wood. It is getting dark, so make a torch early.",
    figures: [{ label: "Things craftable with no station", value: handRecipes }],
    see: ["gathering", "crafting", "light"]
  },
  {
    id: "gathering",
    title: "Picking things up",
    status: "live",
    keywords: ["gather", "pick up", "collect", "sticks", "fibre", "fiber", "plants", "loose rock", "grab"],
    body: "Sticks, plant fibre and loose rock lie on the surface and are taken by walking over them. Everything else in the world has to be dug out. Anything you drop, or anything a dig knocks free, falls and lies where it lands until something picks it up, so nothing is ever destroyed by being dropped.",
    figures: [],
    see: ["dropped-chunks", "digging"]
  },
  {
    id: "crafting",
    title: "Crafting",
    status: "live",
    keywords: ["craft", "make", "build", "recipe", "recipes", "how do i make", "create"],
    body: "A small set of things can be made anywhere, with nothing: that is the hand list. Everything else needs you to be standing at a station, and the station's recipe list is the real shape of your progress. Some recipes need a tool as well as materials - the tool is required but never used up, because it is a capability rather than an ingredient.",
    figures: [{ label: "Craftable with bare hands", value: handRecipes }],
    see: ["stations", "backpack", "tools"]
  },
  {
    id: "stations",
    title: "Stations and buildings",
    status: "live",
    keywords: ["station", "workbench", "bench", "kiln", "forge", "sawmill", "chest",
               "campfire", "ladder", "place", "placing", "placement", "build", "build a",
               "how do i build", "construct", "put down", "cant build"],
    body: "You do not craft a building and carry it. You stand where you want it, with its materials in your pack, and put it into the ground - then it rises over time and starts working when it is finished, not before. It needs solid ground under it, because nothing here floats, and it will refuse a site rather than half-stand on one. Where you put it is the decision: a chest at the tunnel mouth saves more walking than a chest at home, and a station is only as useful as the walk to reach it.",
    figures: [],
    see: ["crafting", "deconstruct", "hauling"]
  },
  {
    id: "deconstruct",
    title: "Taking a building apart",
    status: "live",
    keywords: ["deconstruct", "dismantle", "demolish", "remove", "undo", "move",
               "wrong place", "mistake", "take apart", "delete", "destroy", "refund"],
    body: "Nothing you build is permanent. Take a structure apart and its materials come back to you - but only the ones that survived being built with. Stacked stone and untouched timber return whole; anything fired, mortared or cut to fit does not come apart cleanly, and mortar in particular is simply gone. So the early buildings cost almost nothing to move while you are still learning where things belong, and the expensive later ones are a commitment. Put those somewhere you have thought about.",
    figures: BUILD_RECOVERY,
    see: ["stations", "crafting"]
  },
  {
    id: "house",
    title: "Building a house out of pieces",
    status: "live",
    keywords: ["house", "home", "build a house", "room", "wall", "walls", "floor",
               "ceiling", "roof", "post", "posts", "beam", "beams", "foundation",
               "plank", "planks", "frame", "carpentry", "shelter", "rotate"],
    body: "Stations are things you place whole; a house is a thing you assemble. You lay a brick foundation on solid ground, stand posts on it, run beams between them and close the gaps with floor and wall. It is all one small set of pieces rotated: a beam laid flat is a beam and stood upright is a post, and the same is true of floor and wall - there is nothing extra to find. Pieces hold each other up, but only so far: a run held from one end reaches a few pieces and then needs something under it, so a floor that spans a room wants a post, and one that spans a hall wants several.",
    figures: HOUSE_FIGURES,
    see: ["stations", "deconstruct", "crafting"]
  },
  {
    id: "digging",
    title: "Digging",
    status: "live",
    keywords: ["dig", "cant dig", "can't dig", "cant dig rock", "wont dig", "rock", "stuck", "blocked", "hard", "tunnel", "shaft", "mine"],
    body: "Soft ground - soil, sand, clay - gives way to bare hands, slowly. Rock does not, and no amount of patience changes that: a pickaxe is the only thing that opens it, and a shovel never will, however good a shovel you make. Granite yields to nothing at all. What you dig out does not vanish either - it comes free as material, and that material is real and has to end up somewhere.",
    figures: [],
    see: ["tools", "spoil", "unstable-ground"]
  },
  {
    id: "tools",
    title: "Tools and dig speed",
    status: "live",
    keywords: ["tool", "tools", "shovel", "pickaxe", "pick", "axe", "dig", "rock", "faster", "speed", "upgrade", "better tool"],
    body: "A shovel moves soft ground several times faster than hands and does nothing at all to rock. A pickaxe is the one thing that opens rock, which is why the first rock layer is a wall rather than a slow patch. An axe fells trees. Each tool does one job properly rather than every job adequately, and a better tool of a kind is faster but never deeper - an iron shovel is a better shovel, not a pickaxe. How deep you can go is decided by what is in your hands.",
    figures: TIER_FIGURES,
    see: ["digging", "crafting"]
  },
  {
    id: "backpack",
    title: "The backpack",
    status: "live",
    keywords: ["backpack", "pack", "inventory", "full", "carry", "weight", "mass", "heavy", "cant pick up", "no room"],
    body: "The pack is limited by mass, not by slots. Ore is heavy and torches are not, so what fills it is weight rather than count, and dense ore from deep down fills it far faster than rubble from the surface. When it is full, the next chunk stays on the ground rather than disappearing. A heavy load slows you down before it stops you.",
    figures: [
      { label: "Starting capacity", value: CARRY_START + " kg" },
      { label: "Best pack", value: CARRY_BEST + " kg" },
      { label: "Rocks per trip", value: rocksPerTrip },
      { label: "Rocks per trip, best pack", value: bestRocks },
      { label: "Deep ore per trip", value: deepPerTrip }
    ],
    see: ["hauling", "dropped-chunks"]
  },
  {
    id: "dropped-chunks",
    title: "Chunks on the ground",
    status: "live",
    keywords: ["drop", "dropped", "chunk", "lost", "left behind", "ground", "pick up", "gone"],
    body: "Anything dug or dropped becomes a chunk that falls, settles and waits. Walk over one and you take it, unless your pack has no room for the weight, in which case it stays exactly where it is. Nothing rots and nothing despawns, so a pile left at the tunnel mouth is still there when you come back with somewhere to put it.",
    figures: [],
    see: ["backpack", "gathering"]
  },
  {
    id: "spoil",
    title: "Spoil, and where dirt goes",
    status: "live",
    keywords: ["spoil", "dirt", "soil", "waste", "dump", "tip", "fill", "conservation", "where does it go"],
    body: "Material is moved, never destroyed. Every hole you dig hands you exactly what came out of it, and you can pour it back: dumped material is not placed, it is POURED, falling as loose grains that land and tumble down whatever they hit. So a heap you make is a heap the world agrees with - sand slumps flat, earth holds a steeper pile - and it works as readily downward as up. Backfill a shaft behind you, ramp a slope you could not climb, bury a lava pool, or raise ground where there was none. Pour into somewhere impossible and it refuses rather than eating what you were carrying.",
    figures: [],
    see: ["digging", "hauling"]
  },
  {
    id: "hauling",
    title: "Moving material",
    status: "live",
    keywords: ["haul", "hauling", "carry", "cart", "wheelbarrow", "barrow", "wagon", "rail", "train", "conveyor", "belt", "slow", "too far"],
    body: "Moving material is the real problem this game sets you, and the answer is a ladder of machines rather than a bigger pocket. Each rung carries far more than the one below it, and each has a physical limit that keeps the rung below useful: a barrow needs level ground and cannot climb, a wagon runs only where rails are laid, a train needs a graded route. A conveyor never stops and needs nobody to drive it, but it moves less than a train and is fixed to one route - it is a choice against rail, not an upgrade over it.",
    figures: HAULAGE_IDS.map(id => ({
      label: HAULAGE[id].name,
      value: (HAULAGE[id].capacity === null ? "continuous" : HAULAGE[id].capacity + " kg") +
             " (x" + HAULAGE[id].throughput + ")"
    })),
    see: ["backpack", "spoil", "stations"]
  },
  {
    id: "light",
    title: "Light and darkness",
    status: "live",
    keywords: ["dark", "darkness", "light", "cant see", "can't see", "black", "torch", "lamp", "blind", "night"],
    body: "Underground is genuinely black and your eyes never adjust. Daylight reaches only a little way into a shaft, so past that you have what you brought. Your lamp throws a cone in the direction you face, not a room around you, which means what you cannot see is usually a drop. Lava and uranium give off their own light, and seeing a glow you did not bring is information worth stopping for.",
    figures: [],
    see: ["hazards", "digging"]
  },
  {
    id: "water",
    title: "Water",
    status: "live",
    keywords: ["water", "drown", "drowning", "flood", "flooded", "swim", "wet", "breath", "air", "aquifer"],
    body: "Liquids find their level. Dig into water and it will flood your shaft down to its own level, not down to how much you wanted it to. You can swim, but your breath runs out, and a flooded shaft with the surface a long way up is the most ordinary way to die in this game. Water beading at the face is a warning that you are close to more of it.",
    figures: [],
    see: ["hazards", "light"]
  },
  {
    id: "lava",
    title: "Lava and heat",
    status: "live",
    keywords: ["lava", "fire", "burn", "burning", "hot", "heat", "magma", "died", "orange glow"],
    body: "Lava kills quickly and flows like any other liquid, downhill and into whatever you have just opened. It glows, and that glow carries through a thin wall before you break it, so an orange light where your lamp is not pointing means stop. Water will quench it, which is a tool as much as a hazard.",
    figures: [],
    see: ["hazards", "water"]
  },
  {
    id: "falling",
    title: "Falling and climbing",
    status: "live",
    keywords: ["fall", "fell", "falling", "damage", "hurt", "jump", "climb", "ladder", "rope", "height", "died"],
    body: "Gravity applies to you, to what you drop, and to loose ground. A fall hurts in proportion to how far you fell, and a shaft you dug straight down is a shaft you have to get back up. You climb where there is something to hold - a ledge, a rope, a scaffold you built - not up smooth walls, and there is no second jump in mid-air to save you.",
    figures: [],
    see: ["hazards", "digging"]
  },
  {
    id: "cave-ins",
    title: "Roofs that come down",
    status: "live",
    keywords: ["cave in", "cave-in", "collapse", "collapsed", "roof", "buried",
               "crushed", "prop", "props", "support", "timber", "tunnel fell",
               "dust", "creaking", "died digging"],
    body: "A tunnel is not free. Cut a wide one through loose ground and the roof over the gap has nothing holding it, and it comes down - on you, if you are still under it. Loose ground holds only a short span; stone holds far longer; granite never falls. It warns first: dust trickles from a roof that is about to go, several seconds before anything moves, which is time enough to get out or to stand a prop under it. Only ground you disturbed can fail - a cave that was there when you arrived has already found its shape. Nothing is destroyed when it goes: the roof becomes rubble on the floor, and it is all still there to dig again.",
    figures: [],
    see: ["digging", "unstable-ground", "spoil"]
  },
  {
    id: "unstable-ground",
    title: "Ground that slumps",
    status: "live",
    keywords: ["sand", "gravel", "collapse", "cave in", "caved", "slump", "slide", "buried", "unstable", "fell on me"],
    body: "Sand and gravel are held up by what is under them. Undercut either and it slides down into the space you just made, which is fine when you are beside it and bad when you are beneath it. If it is loose and it is above you, it is going to be below you shortly.",
    figures: [],
    see: ["digging", "hazards"]
  },
  {
    id: "ores",
    title: "Ores and how deep they are",
    status: "live",
    keywords: ["ore", "ores", "metal", "coal", "iron", "copper", "gold", "find", "where", "deep", "mineral", "vein", "seam"],
    body: "Everything the world contains is banded by depth, so digging down is also digging forward in time: surface materials first, then coal and iron, then the middle band of copper and tin and oil, then the deep metals, then the rarest things at the very bottom. Each announces itself by sight rather than by any map - rusty red flecks, vivid green, a faint glow. Going deeper costs heat, water and the sheer distance everything has to travel back up.",
    figures: [
      { label: "Materials the ground yields", value: oreCount },
      { label: "Depth bands", value: "surface, shallow, middle, deep, very deep" }
    ],
    see: ["digging", "hauling", "stages"]
  },
  {
    id: "hazards",
    title: "What the world is telling you",
    status: "live",
    keywords: ["danger", "dangerous", "hazard", "warning", "safe", "died", "death", "killed", "risk"],
    body: "There is nothing hunting you here. Everything that can kill you is the world doing what it always does: liquids finding their level, loose ground falling, heat where you did not expect it, and the drop you could not see. All of them announce themselves first, and learning those signs is most of what getting good at this game means.",
    figures: [],
    see: ["water", "lava", "falling", "unstable-ground"]
  },
  {
    id: "death",
    title: "Dying",
    status: "live",
    keywords: ["die", "died", "death", "dead", "respawn", "lost everything", "killed", "restart"],
    body: "Falls, drowning and lava will all kill you, and injury builds up rather than arriving all at once. Death is a setback and not an ending: you come back and the world is exactly as you left it, including every tunnel you dug.",
    figures: [],
    see: ["hazards", "falling"]
  },
  {
    id: "survival",
    title: "Hunger and healing",
    status: "planned",
    keywords: ["hunger", "hungry", "food", "eat", "starve", "heal", "healing", "health", "bandage", "injured", "rest"],
    body: "Hunger ticks slowly and is meant to be a chore you solve once rather than a clock you fight. Food comes from foraging and hunting, and later from crops and cooking. Injuries heal with food and rest, and faster with a bandage. Survival is deliberately light here: the world is the opponent, not your stomach.",
    figures: [],
    see: ["death", "hazards"]
  },
  {
    id: "stages",
    title: "Stages and progress",
    status: "live",
    keywords: ["stage", "stages", "progress", "progression", "tech", "tier", "level", "unlock", "next"],
    body: "Progress is measured by what physically exists, not by what you know or could afford. You have reached a stage when the thing that defines it has actually been built and is standing in the world. Each stage opens a station, each station opens a page of recipes, and that recipe list is the whole tech tree - there is no separate thing to research.",
    figures: [
      { label: "Stages, bare hands to launch", value: STAGES.length },
      { label: "First", value: STAGES[0].name },
      { label: "Last", value: STAGES[STAGES.length - 1].name }
    ],
    see: ["crafting", "stations"]
  }
];

export const REFERENCE = Object.create(null);
for (const p of PAGES) REFERENCE[p.id] = p;

export const REFERENCE_IDS = PAGES.map(p => p.id);

/* Pages describing mechanics that are actually in the build. */
export const LIVE_IDS = PAGES.filter(p => p.status === "live").map(p => p.id);
export const PLANNED_IDS = PAGES.filter(p => p.status === "planned").map(p => p.id);

export function referencePage(id){ return REFERENCE[id] || null; }

/* Search. Deliberately forgiving: a player types what is in their head, not
   the word we happened to choose. Title and keyword hits rank above body
   hits, and a multi-word query matches on any of its words so that
   "cant dig rock" still finds the digging page. */
/* Words that carry no meaning in a query and would otherwise let a page win
   on "the". Kept short: over-filtering loses real queries. */
const NOISE = new Set(["the", "a", "an", "and", "it", "its", "is", "my", "me",
                       "to", "of", "in", "on", "for", "do", "does", "did",
                       "how", "why", "keep", "keeps", "get", "got", "am", "are"]);

/* Whole-word test. Substring matching looked fine until "its too dark"
   ranked the TOOLS page first, because "tools" contains "too". A reference
   book that answers the wrong question confidently is worse than one that
   finds nothing, so matching is on word boundaries. */
/* A player types whatever number happens to be in their head - "collapses"
   when the page says "collapse". Without this, "how do i stop collapses"
   returned the LAVA page, because the plural matched nothing and lava's body
   happens to contain the word "stop". Matching the singular and the plural
   both ways costs nothing and removes a whole class of that. */
function forms(word){
  const w = word.replace(/[^a-z']/g, "");
  const out = new Set([w, w + "s"]);
  if (w.length > 3 && w.endsWith("s")) out.add(w.slice(0, -1));
  if (w.length > 4 && w.endsWith("es")) out.add(w.slice(0, -2));
  return [...out].filter(Boolean);
}

function hasWord(haystack, word){
  return forms(word).some(f =>
    new RegExp("(^|[^a-z])" + f + "([^a-z]|$)").test(haystack));
}

export function searchReference(query, opts){
  /* `ignoreStatus` drops the live-over-planned tiebreak. Nothing in the game
     passes it - the test does, to prove a ranking is right on the merits of
     the writing rather than because a competing page happened to be demoted.
     That distinction is not academic: the "cant dig rock" ordering once looked
     correct and pinned by test, and was in fact being held up entirely by the
     other page being marked planned. When that page went live the ranking
     inverted, and the test that was supposed to catch it had been passing for
     the wrong reason all along. */
  const ignoreStatus = !!(opts && opts.ignoreStatus);
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];
  const all = q.split(/[^a-z']+/).filter(w => w.length > 1);
  const words = all.filter(w => !NOISE.has(w));
  if (!words.length) return [];

  const scored = [];
  for (const p of PAGES) {
    const title = p.title.toLowerCase();
    const body = p.body.toLowerCase();

    /* the whole query is one of this page's keywords - once, not per word */
    let score = p.keywords.includes(q) ? 20 : 0;

    for (const w of words) {
      if (p.keywords.includes(w)) score += 8;
      else if (p.keywords.some(k => hasWord(k, w))) score += 5;
      if (hasWord(title, w)) score += 4;
      if (hasWord(p.id.replace(/-/g, " "), w)) score += 3;
      if (hasWord(body, w)) score += 1;
    }

    /* A page describing something that is not in the build yet should not
       out-rank one that answers the same question about the game as it
       actually is. It still appears; it just does not lead. */
    if (p.status === "planned" && !ignoreStatus) score *= 0.55;

    if (score > 0) scored.push({ page: p, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.page.id.localeCompare(b.page.id))
               .map(s => s.page);
}
