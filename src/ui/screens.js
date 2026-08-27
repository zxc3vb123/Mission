/* THE SCREEN REGISTRY. LANE H (ui).

   Every screen in the game registers here, and two things read the list:

     - the menu bar, which draws a button per screen. That is the point of
       the registry rather than a hand-written list of buttons: a screen that
       exists is a screen the bar offers, so it is not possible to ship one
       the player cannot reach. Placement had been finished and unreachable
       for hours because nothing offered it, and the guidebook was invisible
       for the same reason. Discoverability is structural here, not a note in
       a panel somewhere.

     - escape, which has to mean "close the thing in front of me" before it
       means "open the pause menu". The event bus broadcasts to everyone and
       has no way to say "handled", so menu.js asks this first.

   Newest registered wins for escape, which is right while there is no way to
   stack two of them: whichever is open is the one in front. */

const screens = [];
let version = 0;

/* s: { id, label, key, isOpen(), open(), close() }
   `key` is the key that toggles it, so the bar can print it beside the label
   and nobody has to keep a second copy of the bindings. */
export function registerScreen(s){
  if(!s || typeof s.isOpen !== "function" || typeof s.close !== "function") return () => {};
  screens.push(s);
  version++;
  return () => {
    const i = screens.indexOf(s);
    if(i >= 0){ screens.splice(i, 1); version++; }
  };
}

/* In registration order, which is the order the bar draws them. */
export function listScreens(){ return screens.slice(); }

/* Bumped whenever the list changes, so the bar can redraw only when it must
   rather than rebuilding its buttons every tick. */
export function screensVersion(){ return version; }

export function anyScreenOpen(){
  for(const s of screens) if(s.isOpen()) return true;
  return false;
}

export function openScreen(id){
  for(const s of screens){
    if(s.id === id && typeof s.open === "function"){ s.open(); return true; }
  }
  return false;
}

/* Closes the frontmost open screen and reports whether it closed one, so the
   caller can decide not to do its own thing with the key. */
export function closeTopScreen(){
  for(let i = screens.length - 1; i >= 0; i--){
    if(screens[i].isOpen()){ screens[i].close(); return true; }
  }
  return false;
}

/* Everything except the one named, for a screen that wants the view to
   itself. Two full-screen panels stacked on each other is never wanted. */
export function closeOthers(id){
  for(const s of screens) if(s.id !== id && s.isOpen()) s.close();
}

/* Boot in a fresh process, or a second boot in the same one, must not keep
   the last game's screens - they are dead DOM nodes by then. */
export function clearScreens(){ screens.length = 0; version++; }
