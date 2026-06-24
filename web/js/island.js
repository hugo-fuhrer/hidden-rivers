/* Hidden Rivers v2 — HR.island: scroll-lock / input-handover for game scenes.
   A game never steals scroll implicitly: the engage card appears when its
   scene is in view; the user starts it; Esc always opens the pause sheet.
   DOM conventions per game id:
     #<id>-engage  (.g-start / .g-skip buttons)
     #<id>-replay  (.g-start)
     #<id>-pause   (.g-resume / .g-restart / .g-skip2)
   Game interface: { id, sceneId, start(), stop(), restart(), skip(),
                     pause(), resume() } */
"use strict";
window.HR = window.HR || {};

HR.island = (() => {
  const games = new Map();
  let active = null;

  const prevent = e => e.preventDefault();
  const SCROLLKEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
                      " ", "PageUp", "PageDown", "Home", "End"];
  function keyTrap(e) {
    if (!active) return;
    if (e.key === "Escape") { e.preventDefault(); togglePause(); return; }
    if (SCROLLKEYS.includes(e.key)) e.preventDefault();  // HR.input still sees it
  }

  function register(g) {
    games.set(g.id, g);
    g.engageEl = document.getElementById(g.id + "-engage");
    g.replayEl = document.getElementById(g.id + "-replay");
    g.pauseEl = document.getElementById(g.id + "-pause");
    for (const el of [g.engageEl, g.replayEl]) {
      if (!el) continue;
      const start = el.querySelector(".g-start");
      const skip = el.querySelector(".g-skip");
      if (start) start.addEventListener("click", () => lock(g, false));
      if (skip) skip.addEventListener("click", () => lock(g, true));
    }
    if (g.pauseEl) {
      const q = c => g.pauseEl.querySelector(c);
      q(".g-resume") && q(".g-resume").addEventListener("click", togglePause);
      q(".g-restart") && q(".g-restart").addEventListener("click", () => { hidePause(); g.restart(); });
      q(".g-skip2") && q(".g-skip2").addEventListener("click", () => { hidePause(); g.skip(); });
    }
  }

  /* called from the scroll engine with the scene's progress */
  function maybeShow(id, p) {
    const g = games.get(id);
    if (!g || active === g) return;
    const done = !!(HR.state.get(g.id) || {}).result;
    const inView = p > .1 && p < .94;
    if (g.engageEl) g.engageEl.classList.toggle("on", inView && !done);
    if (g.replayEl) g.replayEl.classList.toggle("on", inView && done);
  }

  function lock(g, asSkip) {
    if (active) return;
    if (window.HR && HR.audio) HR.audio.sfx.click();
    active = g;
    /* overflow:hidden kills position:sticky, so pin the stage explicitly */
    g.stickyEl = g.stickyEl || document.querySelector("#" + g.sceneId + " .sticky");
    if (g.stickyEl) g.stickyEl.classList.add("gfix");
    document.documentElement.classList.add("hr-locked");
    addEventListener("wheel", prevent, { passive: false });
    addEventListener("touchmove", prevent, { passive: false });
    addEventListener("keydown", keyTrap, true);
    if (g.engageEl) g.engageEl.classList.remove("on");
    if (g.replayEl) g.replayEl.classList.remove("on");
    asSkip ? g.skip() : g.start();
  }

  function unlock() {
    if (active && active.stickyEl) active.stickyEl.classList.remove("gfix");
    document.documentElement.classList.remove("hr-locked");
    removeEventListener("wheel", prevent, { passive: false });
    removeEventListener("touchmove", prevent, { passive: false });
    removeEventListener("keydown", keyTrap, true);
    active = null;
  }

  /* a game calls finish from its end-screen continue button */
  function finish(g, result, data) {
    if (window.HR && HR.audio) HR.audio.sfx.soft();
    HR.state.set(g.id, Object.assign({ result }, data || {}));
    g.stop();
    hidePause();
    unlock();
    const sec = document.getElementById(g.sceneId);
    if (sec) scrollTo({
      top: sec.offsetTop + sec.offsetHeight - innerHeight + 6,
      behavior: HR.REDUCED ? "auto" : "smooth",
    });
  }

  function togglePause() {
    if (!active || !active.pauseEl) return;
    const on = active.pauseEl.classList.toggle("on");
    on ? active.pause() : active.resume();
  }
  function hidePause() { active && active.pauseEl && active.pauseEl.classList.remove("on"); }

  return { register, maybeShow, lock, finish };
})();
