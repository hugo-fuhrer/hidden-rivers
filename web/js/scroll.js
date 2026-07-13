/* Hidden Rivers v2 — HR.scroll: a speed limit, nothing more.
   Mouse wheels and trackpad flicks can tear through a scene in one gesture,
   so wheel input is intercepted and applied directly with a cap on velocity.
   There is deliberately NO easing or coasting: input that hasn't been spent
   within a beat of the fingers stopping is dropped, so the page halts the
   moment the user does. Native scrolling elsewhere (scrollbar drag,
   keyboard, touch) is untouched — touch pacing comes from the longer scene
   lengths. Disabled while a game holds the input lock and inside any
   scrollable overlay (drawer, menus, cards). */
"use strict";
window.HR = window.HR || {};

HR.scroll = (() => {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const SCROLLABLES = ".hp-drawer,#bookmark-menu,#finale,.govl .gcard,.engage,.step";
  let pending = 0, frac = 0, raf = 0, lastT = 0, lastInput = 0;

  const maxVel = () => innerHeight * 1.5;      // the cap, px per second
  const IDLE = 140;                            // ms without input = fingers stopped

  function tick(now) {
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    /* the user stopped: whatever they haven't scrolled yet, they didn't want */
    if (now - lastInput > IDLE) pending = 0;
    const cap = maxVel() * dt;
    const step = clamp(pending, -cap, cap);
    pending -= step;
    frac += step;
    const move = Math.trunc(frac);             // whole pixels; carry the rest
    frac -= move;
    if (move) {
      const docH = document.documentElement.scrollHeight - innerHeight;
      scrollTo(0, clamp(scrollY + move, 0, docH));
    }
    if (pending) raf = requestAnimationFrame(tick);
    else { raf = 0; frac = 0; }
  }

  addEventListener("wheel", e => {
    if (document.documentElement.classList.contains("hr-locked")) return;
    if (e.ctrlKey) return;                                  // pinch-zoom gesture
    if (e.target && e.target.closest && e.target.closest(SCROLLABLES)) {
      const sc = e.target.closest(SCROLLABLES);
      if (sc.scrollHeight > sc.clientHeight + 4) return;    // let the overlay scroll
    }
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;                        // lines → px
    else if (e.deltaMode === 2) dy *= innerHeight;          // pages → px
    pending += clamp(dy, -420, 420);
    lastInput = performance.now();
    if (!raf) { lastT = lastInput; raf = requestAnimationFrame(tick); }
  }, { passive: false });

  return { get active() { return raf !== 0; } };
})();
