/* LANE H (ui) - the screens a player actually touches.

   The screens themselves need a DOM and there is none here, so what is
   checked is the layer underneath them: the key table, the pack lines, and
   the book's index and search. Every one of those is exported as a plain
   function from the module that draws it, so the thing under test is the
   thing that ships rather than a copy of it.

   Two checks here are unusual and deliberate:

     - "every key the book prints is still bound" opens the OTHER lane's
       source file and looks for the literal. Lane A's and lane B's keys are
       read out of the `keys` map deep inside their own loops and are not
       published anywhere importable, so a rename there would otherwise
       silently turn the guidebook into a liar. It cannot prove the key still
       does what the row says; it does catch the rename, which is how these
       actually go stale.

     - "every key bound in src/ui is in the table" is the same guard pointed
        the other way. A key bound on a screen but missing from the table is
        a key no player will ever find, because the book is the only place
        keys are written down now. */

import { readFileSync } from "node:fs";
import { boot, suite } from "../testkit.js";

import { BINDINGS, KEY_GROUPS, keyBindings, keyCap, keyKeywords,
         KEY_PACK, KEY_CRAFT, KEY_BOOK, KEY_MENU, KEY_PREV, KEY_NEXT,
         KEY_CONFIRM, KEY_SWITCH, KEY_LAMP, KEY_FREECAM, KEY_VERTS,
         KEY_REGEN, KEY_BUILD } from "../../src/ui/keys.js";
import { packRows, packTotals } from "../../src/ui/craft.js";
import { buildRows, risingRows } from "../../src/ui/build.js";
import { debugTools } from "../../src/ui/hud.js";
import { bookEntries, bookTally, bookSearch, reachability, supportLine,
         recipeStatus, buildingStatus } from "../../src/ui/book.js";

import { REFERENCE_IDS, LIVE_IDS, PLANNED_IDS, referencePage } from "../../src/content/reference.js";
import { RECIPE_IDS, RECIPES, HAND } from "../../src/content/recipes.js";
import { BUILDING_IDS, BUILDINGS } from "../../src/content/buildings.js";
import { ITEM_DATA } from "../../src/content/items.js";

const ROOT = new URL("../../", import.meta.url);
const readSrc = rel => readFileSync(new URL(rel, ROOT), "utf8");

export function run(){
  const t = suite("ui");
  const g = boot(4242);
  const items = g.items;
  const inv = items.inventory;

  /* =================================================== key bindings === */

  const groups = keyBindings(items);
  t.check("the key page has every group", groups.length === KEY_GROUPS.length,
          groups.map(x => x.group).join(","));
  t.check("every key row says a key and what it does",
          groups.every(gr => gr.rows.length > 0 &&
                             gr.rows.every(r => r.cap && r.what)),
          "groups " + groups.length);

  /* Lane C's keys are read off the live api, so a rebind there moves the
     book with it. This is the check that they really are read and not
     copied: change items.dropKey and the printed key changes. */
  const dropRow = groups.find(gr => gr.group === "Carrying")
                        .rows.find(r => /throw/i.test(r.what));
  t.check("the drop key is read from lane C, not copied",
          dropRow && dropRow.cap === keyCap(items.dropKey),
          dropRow ? dropRow.cap + " vs " + keyCap(items.dropKey) : "no row");

  const hotRow = groups.find(gr => gr.group === "Carrying")
                       .rows.find(r => /hands/i.test(r.what));
  t.check("the hotbar range is read from the real bar size",
          hotRow && hotRow.cap === "1 - " + items.hotbar.size,
          hotRow ? hotRow.cap : "no row");

  /* Every key the book prints is still bound where the table says it is. */
  let staleKey = null;
  for(const b of BINDINGS){
    if(!b.literals) continue;
    let src;
    try { src = readSrc(b.source); }
    catch(err){ staleKey = b.source + " is gone"; break; }
    for(const lit of b.literals){
      if(src.indexOf('"' + lit + '"') < 0){
        staleKey = lit + " no longer appears in " + b.source;
        break;
      }
    }
    if(staleKey) break;
  }
  t.check("every key the book prints is still bound in its own lane",
          staleKey === null, staleKey || "all present");

  /* And nothing is bound on a screen that the book does not teach. */
  const declared = new Set();
  for(const b of BINDINGS){
    for(const k of (b.keys || [])) declared.add(k);
    for(const k of (b.alt || [])) declared.add(k);
  }
  declared.add(items.dropKey);
  declared.add(items.grabKey);
  for(let i=1;i<=items.hotbar.size;i++) declared.add(String(i));

  /* sandbox.js and whatsnew.js belong to the testbed chat, not to this lane */
  const OURS = ["src/ui/craft.js", "src/ui/book.js", "src/ui/panels.js",
                "src/ui/hud.js", "src/ui/menu.js", "src/ui/build.js",
                "src/ui/bar.js"];
  let undocumented = null;
  for(const f of OURS){
    const src = readSrc(f);
    const re = /e\.key\s*===\s*"([^"]+)"/g;
    let m;
    while((m = re.exec(src))){
      if(!declared.has(m[1])){ undocumented = m[1] + " in " + f; break; }
    }
    if(undocumented) break;
  }
  t.check("no key is bound on a screen without the book teaching it",
          undocumented === null, undocumented || "all taught");

  /* ONE HANDLER PER MOUSE BUTTON IN THIS FOLDER. Right mouse was bound in
     two files at once - hud.js fired the blast tool and build.js cancelled an
     armed ghost - so cancelling a misplaced ghost also cratered the ground
     you were about to build on. Neither file was wrong on its own, which is
     exactly why no test caught it and why this one is about the SHAPE rather
     than the behaviour: two listeners for one button means the outcome
     depends on which the bus calls first, and that is a bug even on the days
     it happens to do the right thing. */
  const rightHandlers = [];
  for(const f of OURS){
    if(/button\s*!==\s*2|button\s*===\s*2|button===2/.test(readSrc(f))) rightHandlers.push(f);
  }
  t.check("exactly one file in src/ui handles the right mouse button",
          rightHandlers.length === 1, rightHandlers.join(",") || "none");

  /* And it has to be able to see the ghost, or it cannot let the cancel win
     over the blast the way the ownership table says it does. */
  t.check("the right-button handler asks whether a ghost is armed",
          rightHandlers.length === 1 && /ghostArmed\s*\(/.test(readSrc(rightHandlers[0])),
          rightHandlers[0] || "no handler");

  /* The blast permanently craters the world on one click and right mouse is
     now the universal cancel, so it must not be on unless it is asked for. */
  t.check("the terrain blast test tool is off until switched on",
          debugTools.blast === false, String(debugTools.blast));

  /* The screens must not fight each other, or lane C. */
  const uiKeys = [KEY_PACK, KEY_CRAFT, KEY_BOOK, KEY_BUILD, KEY_MENU, KEY_PREV,
                  KEY_NEXT, KEY_CONFIRM, KEY_SWITCH, KEY_LAMP, KEY_FREECAM,
                  KEY_VERTS, KEY_REGEN];
  t.check("no two ui keys collide", new Set(uiKeys).size === uiKeys.length,
          uiKeys.join(","));
  t.check("no ui key steals one of lane C's",
          !uiKeys.includes(items.dropKey) && !uiKeys.includes(items.grabKey) &&
          !uiKeys.some(k => /^[1-8]$/.test(k)),
          "drop " + items.dropKey + ", grab " + items.grabKey);

  t.check("the keys page is findable by the words a stuck player types",
          ["key", "keys", "controls", "jump"].every(w => keyKeywords().includes(w)),
          keyKeywords().length + " words");

  /* ===================================================== reachability === */

  /* THE CHECK THAT MATTERS MOST IN THIS FILE. Twice this project has shipped
     a finished system no player could reach: the guidebook, and then
     placement, which had a working ghost, reach, rising build and refusal
     reasons and no key at all. The menu bar draws itself from the screen
     registry, so a screen that registers gets a button - but only if it
     registers with the label and key the bar needs. The registry is DOM-only,
     so this reads the registration sites out of the source instead. */
  let unreachable = null;
  for(const f of ["src/ui/craft.js", "src/ui/book.js", "src/ui/build.js"]){
    const src = readSrc(f);
    const calls = src.match(/registerScreen\(\{[\s\S]*?\n  \}\)/g) || [];
    if(!calls.length){ unreachable = f + " registers no screen"; break; }
    for(const c of calls){
      for(const field of ["id:", "label:", "key:", "open:"]){
        if(c.indexOf(field) < 0){ unreachable = f + " registers without " + field; break; }
      }
      if(unreachable) break;
    }
    if(unreachable) break;
  }
  t.check("every screen registers so the menu bar can offer it",
          unreachable === null, unreachable || "pack, book, build");

  t.check("the build key is in the table, so the book teaches it",
          BINDINGS.some(b => (b.keys || []).includes(KEY_BUILD)), KEY_BUILD);

  /* ======================================================= the build === */

  const brows = buildRows(items, null);
  t.check("the build menu offers every building",
          brows.length === BUILDING_IDS.length,
          brows.length + " of " + BUILDING_IDS.length);
  t.check("every build row carries its cost, mass and what holds it up",
          brows.every(r => r.name && r.kg > 0 && r.time > 0 && Array.isArray(r.need) &&
                           typeof r.atCursor === "boolean"),
          brows.map(r => r.id).join(","));

  /* Ladders do not drop to the floor, and the row has to say so or the ghost
     looks broken to somebody expecting it to fall. */
  const ladderRow = brows.find(r => r.id === "ladder");
  const benchRow = brows.find(r => r.id === "workbench");
  t.check("a wall-fixed building is flagged as going where the cursor points",
          !ladderRow || ladderRow.atCursor === true,
          ladderRow ? ladderRow.atCursor : "no ladder");
  t.check("a ground building is not", !benchRow || benchRow.atCursor === false,
          benchRow ? benchRow.atCursor : "no workbench");

  inv.clear();
  const benchEmpty = buildRows(items, null).find(r => r.id === "workbench");
  t.check("an empty pack cannot afford anything",
          benchEmpty && benchEmpty.haveAll === false &&
          benchEmpty.need.every(n => n.have === 0),
          benchEmpty ? benchEmpty.need.map(n => n.have + "/" + n.need).join(" ") : "none");
  t.check("the haul is quoted in trips against the real pack",
          benchEmpty && benchEmpty.trips === Math.max(1, Math.ceil(benchEmpty.kg / inv.capacity())),
          benchEmpty ? benchEmpty.kg + " kg / " + benchEmpty.trips + " trips" : "none");

  t.check("nothing is reported as rising when nothing is being built",
          risingRows(null).length === 0 && risingRows({}).length === 0, "0");

  /* ======================================================== the pack === */

  inv.clear();
  inv.add("rock", 3);
  inv.add("stick", 4);

  let rows = packRows(items);
  t.check("the pack screen shows every kind carried, not the first eight",
          rows.length === 2, rows.map(r => r.id).join(","));

  const rock = rows.find(r => r.id === "rock");
  t.check("a stack shows its own mass", rock &&
          Math.abs(rock.mass - 3 * ITEM_DATA.rock.mass) < 1e-9,
          rock ? rock.mass : "no rock");
  t.check("a stack shows the mass of one", rock &&
          Math.abs(rock.unit - ITEM_DATA.rock.mass) < 1e-9,
          rock ? rock.unit : "no rock");

  let tot = packTotals(items);
  t.check("the total is the pack's real load",
          Math.abs(tot.carried - inv.carriedMass()) < 1e-9,
          tot.carried + " vs " + inv.carriedMass());
  t.check("the total is shown against the real capacity",
          tot.capacity === inv.capacity(), tot.capacity);
  t.check("the stack masses add up to the total",
          Math.abs(rows.reduce((s,r) => s + r.mass, 0) - tot.carried) < 1e-9,
          rows.reduce((s,r) => s + r.mass, 0) + " vs " + tot.carried);

  /* The order must not depend on the counts, or dropping one thing
     reshuffles the row you were about to click next. */
  const orderBefore = packRows(items).map(r => r.id).join(",");
  inv.add("rock", 2);
  t.check("adding to a stack does not reorder the pack",
          packRows(items).map(r => r.id).join(",") === orderBefore,
          packRows(items).map(r => r.id).join(","));

  /* Throwing out goes through lane C, and matter is conserved: what leaves
     the pack has to arrive on the ground. */
  const before = inv.count("rock"), dropsBefore = items.dropCount();
  const moved = items.drop("rock", 2);
  t.check("dropping takes exactly what it says it took",
          moved === 2 && inv.count("rock") === before - 2,
          "returned " + moved + ", pack " + inv.count("rock"));
  t.check("what leaves the pack lands on the ground",
          items.dropCount() === dropsBefore + 2,
          items.dropCount() + " chunks");
  t.check("the pack screen reads the drop straight away",
          packRows(items).find(r => r.id === "rock").count === before - 2,
          packRows(items).find(r => r.id === "rock").count);

  /* Asking for more than you have drops what you have, and the screen must
     report the return rather than what it asked for. */
  const all = inv.count("stick");
  t.check("dropping more than you carry drops what you carry",
          items.drop("stick", all + 50) === all && inv.count("stick") === 0,
          "had " + all);
  t.check("a kind that runs out leaves the pack",
          !packRows(items).some(r => r.id === "stick"),
          packRows(items).map(r => r.id).join(","));

  inv.clear();
  t.check("an empty pack has no rows and no load", packRows(items).length === 0 &&
          packTotals(items).carried === 0, "empty");

  /* ==================================================== the guidebook === */

  const entries = bookEntries(items, null);
  const kinds = k => entries.filter(e => e.kind === k);

  t.check("the book holds every reference page lane F wrote",
          kinds("page").length === REFERENCE_IDS.length,
          kinds("page").length + " of " + REFERENCE_IDS.length);
  t.check("the book holds every recipe",
          kinds("recipe").length === RECIPE_IDS.length,
          kinds("recipe").length + " of " + RECIPE_IDS.length);
  t.check("the book holds every building",
          kinds("building").length === BUILDING_IDS.length,
          kinds("building").length + " of " + BUILDING_IDS.length);
  t.check("the book holds a keys page and a what-to-do-next page",
          kinds("keys").length === 1 && kinds("next").length === 1,
          kinds("keys").length + "/" + kinds("next").length);

  /* The whole point of the book: it never implies something works. */
  t.check("every entry carries a state",
          entries.every(e => ["live","planned","locked"].includes(e.status)),
          entries.length + " entries");
  t.check("nothing is marked not-live without saying why",
          entries.every(e => e.status === "live" || (e.why && e.why.length > 3)),
          entries.filter(e => e.status !== "live" && !e.why).map(e => e.id).join(","));

  t.check("lane F's planned pages are shown as planned, all six of them",
          PLANNED_IDS.every(id => {
            const e = entries.find(x => x.kind === "page" && x.id === id);
            return e && e.status === "planned";
          }) && kinds("page").filter(e => e.status === "planned").length === PLANNED_IDS.length,
          PLANNED_IDS.length + " planned");
  t.check("lane F's live pages are shown as live",
          LIVE_IDS.every(id => {
            const e = entries.find(x => x.kind === "page" && x.id === id);
            return e && e.status === "live";
          }), LIVE_IDS.length + " live");

  const tally = bookTally(entries);
  t.check("the tally accounts for every entry",
          tally.live + tally.planned + tally.locked === tally.total &&
          tally.total === entries.length,
          tally.live + "/" + tally.planned + "/" + tally.locked);
  t.check("the tally is not a lie in either direction",
          tally.live > 0 && tally.planned >= PLANNED_IDS.length,
          "live " + tally.live + ", planned " + tally.planned);

  /* Reachability: with placing gone, a building cannot be honestly live. */
  const noBuild = reachability(items, null);
  t.check("with no placement, no building is live",
          BUILDING_IDS.every(id => !noBuild.buildingLive[id]),
          BUILDING_IDS.filter(id => noBuild.buildingLive[id]).join(","));
  t.check("hand recipes are live even with nothing built",
          RECIPE_IDS.filter(id => RECIPES[id].station === HAND)
                    .every(id => noBuild.recipeLive[id]),
          RECIPE_IDS.filter(id => RECIPES[id].station === HAND &&
                                  !noBuild.recipeLive[id]).join(","));
  t.check("a station recipe is not live when its station cannot be built",
          RECIPE_IDS.filter(id => RECIPES[id].station !== HAND)
                    .every(id => recipeStatus(id, noBuild).status !== "live"),
          "checked");
  t.check("a locked thing names what is missing",
          BUILDING_IDS.every(id => {
            const s = buildingStatus(id, noBuild);
            return s.status === "live" || /\w/.test(s.why);
          }), "checked");

  /* A building page must not tell you to stand a ladder on the floor. Lane F
     added `support.wall` and `support.anchor` for the two climbable ones, and
     the page had been printing "needs solid ground under it" for everything -
     wrong in the most misleading possible place, because a player would go
     looking for ground that the building explicitly does not want. */
  let groundLie = null;
  for(const id of BUILDING_IDS){
    const b = BUILDINGS[id], s = b.support || {};
    const line = supportLine(b);
    const claimsGround = /ground/.test(line);
    const standsOnGround = !s.wall && !s.anchor && s.ground > 0;
    if(claimsGround !== standsOnGround){ groundLie = id + ": " + line; break; }
    if(!line){ groundLie = id + ": says nothing"; break; }
  }
  t.check("no building page claims ground support it does not have",
          groundLie === null, groundLie || BUILDING_IDS.length + " buildings");
  t.check("a wall-fixed building says it needs a wall",
          /wall/.test(supportLine({ support:{ wall:true, ground:0 } })),
          supportLine({ support:{ wall:true, ground:0 } }));
  t.check("a hanging building says it needs nothing underneath",
          /nothing underneath/.test(supportLine({ support:{ anchor:"above", ground:0 } })),
          supportLine({ support:{ anchor:"above", ground:0 } }));
  t.check("a support shape nobody anticipated does not get a confident answer",
          supportLine({ support:{} }) === "nothing underneath it" &&
          supportLine({}) === "nothing underneath it",
          supportLine({}));

  /* ======================================================== searching === */

  /* SETTLED between lanes E, F and this one, after it was decided twice the
     other way: "cant dig rock" is answered by DIGGING, not by tools. The
     query is a question about why something is not working, and the digging
     page owns the rule that hands and shovels never cut rock; the tools page
     describes what the implements are for. Someone typing that sentence
     wants the rule.

     The ranking itself belongs to lane F - book.js defers to
     searchReference() for page results on purpose, and does not re-sort
     them. So a failure here is a conversation with lane F about what the
     right answer is, never a bug in the search code on this side. */
  const digging = bookSearch("cant dig rock", entries);
  const dig3 = digging ? digging.pages.slice(0,3).map(p => p.id) : [];
  t.check("a panicky query is answered by the page that owns the rule",
          dig3[0] === "digging", dig3.join(","));

  const axe = bookSearch("axe", entries);
  t.check("searching an item finds the recipe that makes it",
          axe && axe.recipes.some(r => r.id === "stone_axe"),
          axe ? axe.recipes.map(r => r.id).slice(0,4).join(",") : "nothing");

  const bench = bookSearch("workbench", entries);
  t.check("searching a building finds the building",
          bench && bench.buildings.some(b => b.id === "workbench"),
          bench ? bench.buildings.map(b => b.id).join(",") : "nothing");

  const jump = bookSearch("jump", entries);
  t.check("searching for a control finds the keys page",
          jump && jump.keys.length === 1, jump ? jump.keys.length : "nothing");

  const dark = bookSearch("its too dark", entries);
  t.check("a whole sentence still finds the right page",
          dark && dark.pages.length > 0 && dark.pages[0].id === "light",
          dark ? dark.pages.map(p => p.id).slice(0,3).join(",") : "nothing");

  t.check("an empty search is not a search", bookSearch("   ", entries) === null,
          "null");
  const nonsense = bookSearch("zzzqqx", entries);
  t.check("a query that matches nothing says nothing, rather than everything",
          nonsense && nonsense.count === 0, nonsense ? nonsense.count : "null");

  /* A not-yet thing appears in results but does not lead them, so the first
     answer to a question the game can already answer is the real one. */
  const spoil = bookSearch("spoil dirt", entries);
  t.check("a planned page still appears in search",
          spoil && spoil.pages.some(p => p.id === "spoil"),
          spoil ? spoil.pages.map(p => p.id).join(",") : "nothing");

  /* Lane F keeps digits out of page bodies because the panel prints figures
     from the tables. If a body ever grows one, our figure block is being
     bypassed and the number will go stale. */
  const withDigits = REFERENCE_IDS.filter(id => /\d/.test(referencePage(id).body));
  t.check("no page body carries a number the book should be deriving",
          withDigits.length === 0, withDigits.join(","));

  return t;
}
