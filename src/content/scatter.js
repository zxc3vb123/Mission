/* SCATTER - what lies loose on the surface, and how thickly. LANE F (content).

   Data only. Lane C's src/items/gatherables.js does the placing; these are the
   numbers it places by. They lived in that file until now because there was no
   content table for them (their own note asked for this one).

   WHY THIS TABLE IS WORTH ITS OWN MODULE, and it is not tidiness.

   src/content/items.js declares SURFACE_PICKUPS - the things you can get with
   no tool - and the content suite's reachability proof leans on it: a stone
   pickaxe is made of rock, rock is hardness tier 1, and tier 1 needs a stone
   pickaxe to dig. The only reason that is not a deadlock in the first minute
   is that loose rock lies on the ground.

   But the NUMBER that made that true lived in a mechanics file. So the proof
   asserted something another lane could quietly falsify by tuning a weight to
   zero, and nothing would have caught it. Declaration and number now live
   together, and the suite checks they agree.

   THE ONE RULE HERE: reduce the amount of rock, never its existence. A weight
   of zero on rock makes the game uncompletable from its first minute, and
   every other symptom you would notice first - "the guidebook's opening step
   is impossible", "there is no knife" - is downstream of it.

   Fields
     STEP      pixels between candidate spots along the surface. Smaller is
               denser.
     CHANCE    how many of those candidate spots actually hold something.
     KINDS     what lies there, how often relative to each other, and how many
               come in one spot.
       weight  share of spots, relative to the other kinds.
       clump   how many items one spot yields. THIS IS THE DANGEROUS NUMBER:
               a clump is taken in a single step, so its mass lands on the
               player all at once. Rock at clump two was ten kilograms in one
               pickup - twenty-nine per cent of a starting pack - and it was
               what made the pack fill while merely walking across ground.
               Frequency is the safe lever; clump size is not.
     REGROW_*  how the world puts things back, so a player who has cleared
               their valley is inconvenienced rather than stranded.

   Deliberately NOT scattered: wood. It comes from felling a tree with a stone
   axe, and seeding it on the ground would skip the entire stage 0 chain the
   axe exists to gate.
*/

/* px between candidate spots along the surface */
export const STEP = 40;

/* how many candidate spots actually hold something, 0..1 */
export const CHANCE = 0.55;

export const KINDS = [
  { id: "plant_fibre", weight: 0.37, clump: 2,
    note: "Eight are needed for the stage 0 chain and they weigh almost nothing, so these are the one thing that may safely come in pairs." },

  { id: "stick", weight: 0.25, clump: 1,
    note: "Three needed. The scarcest of the three by walking distance, which is fine: it is also the one you need fewest of per craft." },

  { id: "rock", weight: 0.38, clump: 1,
    note: "Three needed, and hands cannot dig rock, so a short walk must reliably hold three or the game cannot start. ONE at a time and never two - at five kilograms a pair is a quarter of a starting pack in a single step. The frequency is high to compensate; that is the correct lever." }
];

/* ticks between regrowth attempts (the simulation runs at a fixed 36 Hz) */
export const REGROW_EVERY = 540;

/* px: never regrow this close to the player, so things do not appear underfoot */
export const REGROW_NEAR = 420;

/* Expected spots per pixel of surface walked. */
export const SPOTS_PER_PX = CHANCE / STEP;

/* How far a player expects to walk to gather n of something. The guidebook's
   opening instruction is only honest if this is a stroll rather than an
   expedition, so the suite checks the whole stage 0 chain against it. */
export function walkFor(id, n){
  const k = KINDS.find(x => x.id === id);
  if (!k) return Infinity;
  const perPx = SPOTS_PER_PX * k.weight * k.clump;
  return perPx > 0 ? n / perPx : Infinity;
}

export function scatterKind(id){ return KINDS.find(k => k.id === id) || null; }

/* Pick a kind from a 0..1 roll, weighted. Lane C's placement calls this so the
   selection rule and the weights cannot drift apart. */
export function kindForRoll(r){
  const total = KINDS.reduce((s, k) => s + k.weight, 0);
  let acc = 0;
  const x = r * total;
  for (const k of KINDS) {
    acc += k.weight;
    if (x < acc) return k;
  }
  return KINDS[KINDS.length - 1];
}
