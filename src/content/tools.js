/* TOOLS and HARDNESS - depth is gated by tool tier. LANE F (content).

   Data only. LANE A reads this for digSpeedFor(matIndex, toolId).

   THE DESIGN, from docs/DECISIONS.md "Depth is gated by tool tier, not by
   time": every material has a hardness tier, every tool cuts up to a tier and
   never above it. So depth IS the progression - you dig as deep as your tools
   allow, climb out, smelt what you found, and come back through ground that
   stopped you an hour ago.

   TWO AXES, AND KEEPING THEM SEPARATE IS THE WHOLE THING
     kind   what CLASS of material a tool touches at all. A shovel moves loose
            ground. A pickaxe breaks stone. No amount of metallurgy turns one
            into the other: an iron shovel is a better shovel, not a pickaxe.
     cuts   how hard a material that tool can get through, within its class.

   That separation is what stops upgrades collapsing the ladder into "the
   newest tool does everything". A better tool of the same kind is FASTER and
   never DEEPER unless its tier says so, and a shovel's tier is fixed at the
   softest ground forever. tools/tests/content.test.js pins this.

   NO CIRCULAR TIERS. Every tool must be craftable from material that an
   EARLIER tool could already reach, or the ladder has a rung you can only
   climb by already standing on it. The recorded sketch had exactly that bug:
   it put iron in tier 2 alongside copper and tin, while the tier 2 pickaxe
   had to be made of metal - and tier 1 contained no metal at all. Iron is
   therefore tier 1 here, which is also where docs/GAME_DESIGN.md section 6
   has always put it: the shallow band, with coal, "fire, steel, tools".
   The suite proves the whole ladder is reachable from bare hands.

   The first rung leans on something easy to miss: the stone pickaxe is made
   of rock, and rock is tier 1, which a stone pickaxe is needed to dig. It
   works only because loose rock lies on the SURFACE and is gathered by hand.
   If gatherables ever stop yielding rock, the game becomes uncompletable
   from the first minute. There is a test for that too.
*/

/* Hardness tier per material, keyed by the `name` in src/world/materials.js.
   UNCUTTABLE is granite: no tool at any tier gets through it, ever. It is the
   bedrock that makes a shaft a decision rather than a formality. */
export const UNCUTTABLE = -1;

export const HARDNESS = {
  /* tier 0 - loose ground. Hands work; a shovel is simply faster. */
  "Earth": 0,
  "Sand": 0,
  "Clay": 0,
  "Gravel": 0,

  /* tier 1 - stone and the shallow band. A stone pickaxe opens all of it,
     and it contains iron, which is what makes the next tier possible. */
  "Rock": 1,
  "Limestone": 1,
  "Coal": 1,
  "Iron ore": 1,

  /* tier 2 - the middle band. Needs an iron pickaxe, made from tier 1 iron. */
  "Copper ore": 2,
  "Tin ore": 2,
  "Zinc ore": 2,
  "Lead ore": 2,
  "Bauxite": 2,
  "Quartz": 2,

  /* tier 3 - the deep metals. Needs steel: iron and coal, both tier 1. */
  "Nickel ore": 3,
  "Silver ore": 3,
  "Gold ore": 3,
  "Titanium ore": 3,

  /* tier 4 - the bottom of the world. Needs a titanium-tipped pick, and
     titanium is tier 3, so the last rung stands on the one below it. */
  "Uranium ore": 4,
  "Rare earth": 4,

  /* never */
  "Granite": UNCUTTABLE
};

/* What a kind of tool touches at all, and the hardest it may EVER cut no
   matter what it is made of. This ceiling is the rule that survives every
   upgrade. */
export const TOOL_KINDS = {
  hands:   { maxTier: 0, note: "Loose ground only, and slowly. Everything starts here." },
  shovel:  { maxTier: 0, note: "Loose ground, much faster. Never stone, at any tier - an iron shovel is a better shovel, not a pickaxe." },
  pickaxe: { maxTier: 4, note: "Stone and ore. The tool whose tier decides how deep the world lets you go." },
  axe:     { maxTier: 0, note: "For trees, not for ground. It fells wood and does not dig." }
};

/* speed is relative to a stone tool of the same kind doing its own job. */
const DATA = [
  { id: "hands", name: "Bare hands", kind: "hands", material: "none", cuts: 0,
    speed: 0.30, stage: 0,
    note: "Deliberately slow. Digging by hand should feel like something you want to stop doing, because wanting a shovel is the first thing the game teaches." },

  { id: "stone_shovel", name: "Stone shovel", kind: "shovel", material: "stone", cuts: 0,
    speed: 1.00, stage: 1,
    note: "Several times faster than hands in loose ground, and completely useless against stone. That uselessness is load-bearing." },

  { id: "stone_pickaxe", name: "Stone pickaxe", kind: "pickaxe", material: "stone", cuts: 1,
    speed: 1.00, stage: 1,
    note: "Opens rock, coal, limestone and iron. Made from rock gathered off the surface, which is the only reason the ladder has a bottom rung at all." },

  { id: "iron_shovel", name: "Iron shovel", kind: "shovel", material: "iron", cuts: 0,
    speed: 1.90, stage: 4,
    note: "Twice the shovel, still exactly as unable to touch stone. The clearest demonstration of the rule." },

  { id: "iron_pickaxe", name: "Iron pickaxe", kind: "pickaxe", material: "iron", cuts: 2,
    speed: 1.90, stage: 4,
    note: "The middle band opens: copper, tin, zinc, lead, bauxite, quartz. Made from tier one iron, so nothing here is locked behind itself." },

  { id: "steel_shovel", name: "Steel shovel", kind: "shovel", material: "steel", cuts: 0,
    speed: 2.90, stage: 4,
    note: "The fastest a shovel gets. Still not a pickaxe." },

  { id: "steel_pickaxe", name: "Steel pickaxe", kind: "pickaxe", material: "steel", cuts: 3,
    speed: 2.90, stage: 4,
    note: "Steel is iron and coal, both shallow, so the deep metals are gated by knowing how rather than by digging deeper first." },

  { id: "titanium_pickaxe", name: "Titanium-tipped pickaxe", kind: "pickaxe", material: "titanium", cuts: 4,
    speed: 4.00, stage: 6,
    note: "The last rung, and it stands on the one below: titanium is tier three, so a steel pick is what earns you the tool that reaches the bottom of the world." },

  { id: "stone_axe", name: "Stone axe", kind: "axe", material: "stone", cuts: 0,
    speed: 1.00, stage: 0,
    note: "Fells trees. It is on this table so that lane A has one answer for every tool a player can be holding." }
];

export const TOOLS = Object.create(null);
for (const t of DATA) TOOLS[t.id] = t;

export const TOOL_IDS = DATA.map(t => t.id);

/* The deepest tier any tool can reach. Useful to the guidebook for saying
   "nothing you can build gets through this yet". */
export const MAX_TIER = Math.max(...DATA.map(t => t.cuts));

export function tool(id){ return TOOLS[id] || null; }

export function hardnessOf(materialName){
  const h = HARDNESS[materialName];
  return h === undefined ? null : h;
}

/* Can this tool get through this material at all? Granite never yields, and
   a tool never exceeds the ceiling its KIND imposes. */
export function canCut(toolId, materialName){
  const t = TOOLS[toolId];
  const h = hardnessOf(materialName);
  if (!t || h === null || h === UNCUTTABLE) return false;
  if (h > TOOL_KINDS[t.kind].maxTier) return false;
  return h <= t.cuts;
}

/* Relative dig speed, or 0 for "this tool cannot touch this". Lane A scales
   its own pixels-per-second by this. */
export function digSpeed(toolId, materialName){
  if (!canCut(toolId, materialName)) return 0;
  return TOOLS[toolId].speed;
}

/* Every tool that can get through a material, best first - what the guidebook
   answers "what do I need to dig this?" with. */
export function toolsThatCut(materialName){
  return TOOL_IDS.filter(id => canCut(id, materialName))
                 .sort((a, b) => TOOLS[b].speed - TOOLS[a].speed);
}
