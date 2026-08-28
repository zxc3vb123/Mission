/* What is food and what eating it is worth. LANE J (farming).

   THE SPLIT WITH LANE B, stated once so nobody has to guess: hunger is a
   number on the body, and the body is theirs (docs/ARCHITECTURE.md 4,
   docs/DECISIONS.md 2026-08-28). Food - what it is, where it comes from and
   how much of it a thing is worth - is ours. So this file never writes to
   state.player. It takes the food out of the pack, checks that it really
   took it, and announces the size of the meal.

   THAT MEANS EATING IS INERT UNTIL LANE B LISTENS. WORKFLOW 4c is explicit
   that publishing the API is half the job and that the request stays open
   until there is a call site, so the request names lane B as the consumer
   and stays open. Said plainly in docs/status/farm.md rather than left to be
   discovered: today `eat()` removes the food and fires `food:eaten`, and
   nothing yet feels it.

   The value of a food is LANE F'S NUMBER the moment they want it. Their item
   entry wins; spec.js only carries a fallback for the two items this lane
   registers itself. */

import { bus } from "../core/bus.js";
import { state } from "../core/state.js";
import { GRAIN_ID, GRAIN_DEF } from "./spec.js";

let items = null;
export function attachItems(api){ items = api || null; }

/* Lane F's declaration first, ours only if they have not made one. A `food`
   block on an item is the whole test, so anything they mark as food - a
   berry, a roast, a loaf - is edible here with no change. */
export function foodValue(id){
  const def = items && items.itemDef ? items.itemDef(id) : null;
  if(def && def.id === id && def.food && def.food.nutrition > 0) return def.food.nutrition;
  if(id === GRAIN_ID) return GRAIN_DEF.food.nutrition;
  return 0;
}
export function isFood(id){ return foodValue(id) > 0; }

/* Everything edible in the pack, best first, so a HUD or a hungry player
   does not have to hunt for it. */
export function carriedFood(){
  if(!items) return [];
  const all = items.inventory.all();
  const out = [];
  for(const id in all){
    if(!(all[id] > 0)) continue;
    if(isFood(id)) out.push({ id, count: all[id], nutrition: foodValue(id) });
  }
  return out.sort((a, b) => b.nutrition - a.nutrition);
}

/* Eat one. With no id it eats what is in your hands if that is food, and
   otherwise the best thing in the pack. */
export function eat(id){
  if(!items) return { ok:false, reason:"no pack" };

  if(id === undefined || id === null){
    const held = items.equipped();
    if(held && isFood(held.id)) id = held.id;
    else {
      const best = carriedFood()[0];
      if(!best) return { ok:false, reason:"you have nothing to eat" };
      id = best.id;
    }
  }
  if(!isFood(id)) return { ok:false, reason:"that is not food" };

  /* The checked destroy. take() says whether the food actually left the
     pack, and a meal eaten without the food leaving is the same bug as a
     bucket minted from a pail that was no longer there. */
  if(!items.inventory.take(id, 1)) return { ok:false, reason:"you have none of that" };

  const nutrition = foodValue(id);
  bus.emit("food:eaten", { id, nutrition, x: state.player.x, y: state.player.y });
  return { ok:true, id, nutrition };
}
