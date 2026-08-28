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
  axe:     { maxTier: 0, note: "For trees, not for ground. It fells wood and does not dig." },
  knife:   { maxTier: -1, note: "Cuts fibre and butchers what you hunt, and touches no ground at all - not even soil. It is on this table so that nothing asking about a knife gets a silent zero from an id it has never heard of." }
};

/* WHAT A TOOL DOES TO SOMETHING ALIVE. Lane I owns creatures and fighting;
   these are the numbers, and they are built ON the tier ladder rather than
   beside it.

     damage = KIND_COMBAT[kind].damage x TOOLS[id].speed
     swing  = KIND_COMBAT[kind].swing   (hits per second)

   REUSING `speed` AS THE MATERIAL MULTIPLIER IS THE POINT. It already means
   "how good is this metal", so an iron axe hits harder than a stone one for
   exactly the reason it fells a tree faster, and weapon damage can never
   drift away from the tool ladder because there is no second number to
   forget to update. The owner asked for tier to matter the way it does
   against rock; this is that, literally.

   The shape they asked for, and what falls out at stone tier:

     axe       good              13 x 1.0  = 13.0 damage/second
     knife     quick and light    7 x 1.7  = 11.9
     pickaxe   heavy and slow    16 x 0.55 =  8.8   (hardest single hit)
     shovel    clumsy             5 x 0.9  =  4.5
     hands     nearly useless     3 x 1.3  =  2.3

   A pickaxe lands the hardest blow in the game and is the third-best weapon,
   which is what "heavy and slow" has to mean if it means anything. */
export const KIND_COMBAT = {
  hands:   { damage: 3,  swing: 1.3,  note: "A fist against a thing with teeth. Nearly useless on purpose - being caught without a tool should be frightening." },
  knife:   { damage: 7,  swing: 1.7,  note: "Fast and light. The first thing that makes being cornered survivable, and it weighs almost nothing to carry." },
  axe:     { damage: 13, swing: 1.0,  note: "The best weapon in the game and it is not close. A felling axe is a weapon that happens to be good at trees." },
  shovel:  { damage: 5,  swing: 0.9,  note: "Clumsy. A blade on the wrong end of a long handle, and it swings like one." },
  pickaxe: { damage: 16, swing: 0.55, note: "The hardest single blow anywhere, and slow enough that missing it hurts. A point on a heavy head is a terrible thing to be hit by and an awkward thing to hit with." }
};

export function weaponOf(toolId){
  const t = TOOLS[toolId];
  if (!t) return null;
  const k = KIND_COMBAT[t.kind];
  if (!k) return null;
  const damage = Math.round(k.damage * t.speed * 10) / 10;
  return { damage, swing: k.swing, dps: Math.round(damage * k.swing * 10) / 10 };
}

/* speed is relative to a stone tool of the same kind doing its own job. */
const DATA = [
  { id: "hands", name: "Bare hands", kind: "hands", material: "none", cuts: 0,
    speed: 0.30, stage: 0,
    /* Raised to 0.60 for one commit, reading "halve the early hand pain" as
       covering this. It does not. HAULAGE AND THE TOOL LADDER ARE DIFFERENT
       AXES: repetitive trips are a chore worth softening, which is what the
       owner was actually asked about, and hands being much slower than a
       shovel is not a chore - it is the game's first lesson. Two other lanes
       had encoded the ratio as a contract and their suites caught it, which
       is the best argument I have seen for testing ratios over values. */
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

  { id: "stone_knife", name: "Stone knife", kind: "knife", material: "stone", cuts: -1,
    speed: 1.00, stage: 0,
    note: "The first tool anyone makes and it was not on this table until creatures arrived - so anything asking what a knife does got a silent zero from an id nothing had heard of, the same gap the axe had. It cuts no ground at any tier." },

  { id: "iron_knife", name: "Iron knife", kind: "knife", material: "iron", cuts: -1,
    speed: 1.90, stage: 4,
    note: "Holds an edge, so it butchers faster and fights better. Still touches no ground." },

  { id: "stone_axe", name: "Stone axe", kind: "axe", material: "stone", cuts: 0,
    speed: 1.00, stage: 0,
    note: "Fells trees. It is on this table so that lane A has one answer for every tool a player can be holding." },

  { id: "iron_axe", name: "Iron axe", kind: "axe", material: "iron", cuts: 0,
    speed: 1.90, stage: 4,
    note: "The axe line was the one tool that never tiered up - stone forever, while every shovel and pickaxe got metal. That was an oversight in this table rather than a decision, and lane A's chopSpeedFor was already multiplying by whatever speed it found here, so the moment this entry existed a faster axe simply worked. Still cuts nothing: an axe is for wood, at every tier." }
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
