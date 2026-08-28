/* WHAT IS ON THE BENCH, AND WHAT IT COULD BECOME. LANE H (ui).

   The matching half of the crafting screen, kept apart from the drawing so it
   can be reasoned about and tested without a DOM.

   ONE RULE ABOVE ALL OTHERS: MATCH ON WHAT, NEVER ON WHERE.

   Lane F's recipes are ingredient lists, not spatial patterns - `inputs` is
   { itemId: count } and nothing anywhere says which corner a stick goes in.
   So the bench is a multiset. Two rocks in the left slots and two in the
   right are the same bench, and a recipe that cared would invalidate every
   recipe lane F has written. If position-dependent recipes are ever wanted
   they are a data-model change across two lanes, not something this file
   should quietly start assuming.

   THREE ANSWERS, not one, because a crafting screen that only says yes or no
   teaches nothing:

     exact       the bench holds precisely one recipe's inputs. This is the
                 only state that may be made.
     candidates  everything on the bench belongs to this recipe and none of
                 it is over-filled - so it is still reachable, and we can say
                 what is missing. This is what turns a bench into a way of
                 finding out what a stick and a rock are for.
     nothing     something on the bench belongs to no recipe that fits, which
                 is worth saying plainly rather than leaving the player to
                 guess which item is the odd one.

   EXACT MEANS EXACT. A bench holding five fibre does not make a rope that
   wants four: it is over-filled, and quietly consuming four of five would
   teach the player that counts do not matter, right up until a recipe where
   they do. Over-filling is reported, not forgiven.

   AND SOMETIMES EXACT IS AMBIGUOUS, WHICH IS THE PRICE OF THE RULE ABOVE.
   An iron shovel and an iron axe are both one iron bar and one wood, so no
   arrangement of ingredients can tell them apart - that is a fact about the
   recipes, not a bug in the matcher, and it is the honest cost of matching on
   what rather than where. So `exactAll` carries EVERY recipe the bench
   satisfies and the screen lets the player pick; `exact` is only the first of
   them. Returning one and hiding the rest would make the iron axe unmakeable
   at a bench and nobody would ever know why. */

import { RECIPES, RECIPE_IDS } from "../content/recipes.js";

/* Sum a bench's slots into { itemId: count }. Slots are how the player
   arranges things; the multiset is what the recipe sees. */
export function benchTotals(slots){
  const out = Object.create(null);
  for(const s of (slots || [])){
    if(!s || !s.id || !(s.n > 0)) continue;
    out[s.id] = (out[s.id] || 0) + s.n;
  }
  return out;
}

export function benchIsEmpty(slots){
  return Object.keys(benchTotals(slots)).length === 0;
}

/* The verdict on a bench.

     exact       recipe id, or null
     candidates  [{ id, missing: { itemId: howManyMore }, total }] - still
                 reachable, nearest first
     stray       item ids on the bench that no candidate wants
     over        item ids the bench has too many of for every candidate  */
export function benchMatch(slots){
  const bench = benchTotals(slots);
  const ids = Object.keys(bench);
  if(!ids.length){
    return { exact:null, exactAll:[], candidates:[], stray:[], over:[], empty:true };
  }

  const exactAll = [];
  const candidates = [];
  const wantedBySome = new Set();
  const overBySome = new Set();

  for(const rid of RECIPE_IDS){
    const inputs = RECIPES[rid].inputs || {};

    /* everything on the bench must belong to this recipe, and not exceed it */
    let fits = true, over = false;
    for(const id of ids){
      const want = inputs[id] || 0;
      if(want === 0){ fits = false; break; }
      if(bench[id] > want){ over = true; }
    }
    if(!fits) continue;
    for(const id of ids) wantedBySome.add(id);
    if(over){ for(const id of ids) if(bench[id] > (inputs[id] || 0)) overBySome.add(id); continue; }

    const missing = Object.create(null);
    let short = 0;
    for(const id in inputs){
      const need = inputs[id] - (bench[id] || 0);
      if(need > 0){ missing[id] = need; short += need; }
    }
    if(short === 0){ exactAll.push(rid); continue; }
    candidates.push({ id: rid, missing, total: short });
  }

  candidates.sort((a, b) => a.total - b.total || a.id.localeCompare(b.id));

  return {
    /* the first of possibly several - see exactAll */
    exact: exactAll[0] || null,
    exactAll,
    candidates,
    /* an item no recipe that fits wants at all - the odd one out */
    stray: ids.filter(id => !wantedBySome.has(id)),
    /* an item every fitting recipe has too many of */
    over: Array.from(overBySome),
    empty: false
  };
}

/* Put a recipe's inputs onto a bench of `size` slots, one kind per slot.
   What the craft book's rows do when clicked: showing somebody the
   arrangement is a better answer to "what is a stick for" than a list is.
   Returns null rather than a partial bench if it will not fit. */
export function benchFor(recipeId, size){
  const r = RECIPES[recipeId];
  if(!r) return null;
  const inputs = r.inputs || {};
  const kinds = Object.keys(inputs);
  if(kinds.length > size) return null;
  const slots = new Array(size).fill(null).map(() => ({ id:null, n:0 }));
  kinds.forEach((id, i) => { slots[i] = { id, n: inputs[id] }; });
  return slots;
}
