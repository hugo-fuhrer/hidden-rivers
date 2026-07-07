/* Hidden Rivers v2 — HR.island: scroll-lock / input-handover for game scenes.
   A game never steals scroll implicitly: the engage card appears when its
   scene is in view; the user starts it; Esc always opens the pause sheet.
   DOM conventions per game id:
     #<id>-engage  (.g-start / .g-skip buttons)
     #<id>-replay  (.g-start)
     #<id>-pause   (.g-resume / .g-restart / .g-skip2 / optional .g-ff)
   Game interface: { id, sceneId, start(), stop(), restart(), skip(),
                     pause(), resume(), ff()? }
   ff() (optional) fast-forwards the running game from its current state to its
   natural ending (autopilot + accelerated time). A floating "skip to end" chip,
   the F key, and a pause-sheet button all route here; games without ff() fall
   back to skip() (restart on autopilot). */
"use strict";
window.HR = window.HR || {};

HR.island = (() => {
  const games = new Map();
  let active = null;

  /* transition veil: a brief dip to black that hides the scroll-jump when a
     game takes or returns the viewport, so handoffs read as scene cuts */
  const veil = document.createElement("div");
  veil.id = "hr-veil";
  document.body.appendChild(veil);
  function dip(fn, hold = 380) {
    if (HR.REDUCED) { fn && fn(); return; }
    veil.classList.add("on");
    setTimeout(() => {
      fn && fn();
      setTimeout(() => veil.classList.remove("on"), 80);
    }, hold);
  }

  /* floating "fast-forward to the end" control, shown while a game is running */
  const ffBtn = document.createElement("button");
  ffBtn.id = "hr-ff";
  ffBtn.type = "button";
  ffBtn.className = "hr-ff";
  ffBtn.innerHTML = "<span aria-hidden=\"true\">⏩</span> Skip to end";
  ffBtn.setAttribute("aria-label", "Fast-forward to the end of this part (F)");
  ffBtn.addEventListener("click", fastForward);
  document.body.appendChild(ffBtn);
  const showFF = on => ffBtn.classList.toggle("on", on);

  const prevent = e => e.preventDefault();
  const SCROLLKEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
                      " ", "PageUp", "PageDown", "Home", "End"];
  function keyTrap(e) {
    if (!active) return;
    if (e.key === "Escape") { e.preventDefault(); togglePause(); return; }
    if (e.key === "f" || e.key === "F") { e.preventDefault(); fastForward(); return; }
    if (SCROLLKEYS.includes(e.key)) e.preventDefault();  // HR.input still sees it
  }

  /* fast-forward / end: jump the running game to its conclusion */
  function fastForward() {
    if (!active) return;
    if (window.HR && HR.audio) HR.audio.sfx.click();
    hidePause();
    showFF(false);
    if (typeof active.ff === "function") active.ff();
    else active.skip();                                  // games w/o ff: restart on autopilot
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
      q(".g-ff") && q(".g-ff").addEventListener("click", fastForward);
      /* leave the game entirely: straight to the next story section */
      q(".g-next") && q(".g-next").addEventListener("click", () => finish(g, "skipped"));
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
    if (g.stickyEl) { g.stickyEl.classList.add("gfix"); g.stickyEl.appendChild(ffBtn); }
    document.documentElement.classList.add("hr-locked");
    addEventListener("wheel", prevent, { passive: false });
    addEventListener("touchmove", prevent, { passive: false });
    addEventListener("keydown", keyTrap, true);
    if (g.engageEl) g.engageEl.classList.remove("on");
    if (g.replayEl) g.replayEl.classList.remove("on");
    dip(() => {                                          // cut, don't pop, into the game
      asSkip ? g.skip() : g.start();
      showFF(true);                                      // fast-forward available throughout
    }, 300);
  }

  function unlock() {
    if (active && active.stickyEl) active.stickyEl.classList.remove("gfix");
    document.documentElement.classList.remove("hr-locked");
    removeEventListener("wheel", prevent, { passive: false });
    removeEventListener("touchmove", prevent, { passive: false });
    removeEventListener("keydown", keyTrap, true);
    showFF(false);
    active = null;
  }

  /* a game calls finish from its end-screen continue button; the pause
     sheet's "next section" button routes here too. The scroll-jump happens
     under the veil so the return to the story reads as a scene cut. */
  function finish(g, result, data) {
    if (window.HR && HR.audio) HR.audio.sfx.soft();
    HR.state.set(g.id, Object.assign({ result }, data || {}));
    dip(() => {
      g.stop();
      hidePause();
      showFF(false);
      /* clear any end-screen overlay: left "on", it would sit over the scene
         and swallow the replay chip's clicks when the user scrolls back */
      document.querySelectorAll("#" + g.sceneId + " .govl.on")
        .forEach(el => el.classList.remove("on"));
      unlock();
      const sec = document.getElementById(g.sceneId);
      if (sec) scrollTo({
        top: sec.offsetTop + sec.offsetHeight - innerHeight + 6,
        behavior: "auto",
      });
    });
  }

  function togglePause() {
    if (!active || !active.pauseEl) return;
    const on = active.pauseEl.classList.toggle("on");
    showFF(!on);                                          // hide the chip behind the pause sheet
    on ? active.pause() : active.resume();
  }
  function hidePause() { active && active.pauseEl && active.pauseEl.classList.remove("on"); }

  return { register, maybeShow, lock, finish };
})();
