/* A tiny screen stack. LANE H (ui).

   Escape has to mean "close the thing in front of me" before it means "open
   the pause menu", or reading the guidebook and then pressing escape both
   closes the book and pauses the game, and the player is looking at a menu
   they did not ask for. The event bus broadcasts to everyone and has no way
   to say "handled", so the screens register here and menu.js asks this first.

   Newest registered screen wins, which is right while there is no way to
   stack two of them: whichever is open is the one in front. */

const screens = [];

export function registerScreen(s){
  if(!s || typeof s.isOpen !== "function" || typeof s.close !== "function") return () => {};
  screens.push(s);
  return () => {
    const i = screens.indexOf(s);
    if(i >= 0) screens.splice(i, 1);
  };
}

export function anyScreenOpen(){
  for(const s of screens) if(s.isOpen()) return true;
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

/* Boot in a fresh process, or a second boot in the same one, must not keep
   the last game's screens - they are dead DOM nodes by then. */
export function clearScreens(){ screens.length = 0; }
