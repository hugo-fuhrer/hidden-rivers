/* Hidden Rivers v2 — HR.scroll: enforced scroll pacing.
   Mouse wheels and trackpad flicks can tear through a scene in one gesture,
   so wheel input is intercepted and re-played as a smooth scroll whose
   velocity is capped relative to the viewport. Native scrolling elsewhere
   (scrollbar drag, keyboard, touch) is untouched — touch pacing comes from
   the longer scene lengths. Disabled while a game holds the input lock and
   inside any scrollable overlay (drawer, menus, cards). */
"use strict";
window.HR = window.HR || {};

HR.scroll = (() => {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const SCROLLABLES = ".hp-drawer,#bookmark-menu,#finale,.govl .gcard,.engage,.step";
  let target = scrollY, cur = scrollY, raf = 0, lastT = 0, settling = false;

  const maxStep = () => innerHeight * .82;     // largest wheel step we honour, px
  const maxVel  = () => innerHeight * 1.5;     // cap, px per second

  function tick(now) {
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    const d = target - cur;
    /* ease toward the target but never faster than the velocity cap */
    let step = d * Math.min(1, dt * 7);
    const cap = maxVel() * dt;
    if (Math.abs(step) > cap) step = Math.sign(step) * cap;
    cur += step;
    if (Math.abs(target - cur) < .6) { cur = target; settling = false; }
    settling = Math.abs(target - cur) >= .6;
    scrollTo(0, Math.round(cur));
    if (settling) raf = requestAnimationFrame(tick);
    else raf = 0;
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
    dy = clamp(dy, -140, 140);                              // tame violent flicks
    const docH = document.documentElement.scrollHeight - innerHeight;
    if (!settling) { cur = scrollY; target = scrollY; }     // resync after native scrolls
    target = clamp(target + dy * 1.1, 0, docH);
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
  }, { passive: false });

  /* a scroll we didn't cause (keyboard, scrollbar, anchor jump) resyncs us */
  addEventListener("scroll", () => {
    if (!settling) { cur = scrollY; target = scrollY; }
  }, { passive: true });

  return { get active() { return settling; } };
})();
