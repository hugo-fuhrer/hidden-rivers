/* Hidden Rivers v2 — HR.tutor: in-game teaching layer.
   Two pieces, both game-agnostic:

   1. A persistent controls overlay (bottom-left while a game runs): WASD
      keycaps labelled with what each does in THIS game, lighting up live as
      the player presses them (keyboard, d-pad or joystick all feed
      HR.input.axes, which is what the lights read). Esc/F chips ride along.
      On coarse pointers the keycaps give way to the joystick, so the overlay
      shows only the Esc/F chips.

   2. Sequential hints: games push short, one-at-a-time coach marks
      ("press W to start", "out of gravel — go to a SPOIL pile") that appear
      bottom-centre with animated keycaps. Each hint id shows once per run;
      HR.tutor.reset() re-arms them on restart. */
"use strict";
window.HR = window.HR || {};

HR.tutor = (() => {
  const COARSE = matchMedia("(pointer:coarse)").matches;

  /* ── controls overlay ─────────────────────────────────────────────────── */
  const wrap = document.createElement("div");
  wrap.id = "hr-keys";
  wrap.setAttribute("aria-hidden", "true");
  document.body.appendChild(wrap);
  let keyEls = null, raf = 0;

  function showKeys(labels) {
    if (COARSE) return;         // touch: the joystick + pause chip cover this
    const L = Object.assign({ w: "up", a: "left", s: "down", d: "right" }, labels || {});
    wrap.innerHTML = `
      <div class="hk-grid">
        <span class="hk-cell hk-w"><kbd data-k="w">W</kbd><small>${L.w}</small></span>
        <span class="hk-cell hk-a"><kbd data-k="a">A</kbd><small>${L.a}</small></span>
        <span class="hk-cell hk-s"><kbd data-k="s">S</kbd><small>${L.s}</small></span>
        <span class="hk-cell hk-d"><kbd data-k="d">D</kbd><small>${L.d}</small></span>
      </div>
      <div class="hk-meta">
        <span><kbd data-k="esc">Esc</kbd><small>pause</small></span>
        <span><kbd data-k="f">F</kbd><small>skip to end</small></span>
      </div>`;
    keyEls = {
      w: wrap.querySelector('[data-k="w"]'), a: wrap.querySelector('[data-k="a"]'),
      s: wrap.querySelector('[data-k="s"]'), d: wrap.querySelector('[data-k="d"]'),
    };
    wrap.classList.add("on");
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(pollKeys);
  }
  function hideKeys() {
    wrap.classList.remove("on");
    cancelAnimationFrame(raf); raf = 0;
    keyEls = null;
  }
  function pollKeys() {
    if (keyEls && window.HR && HR.input) {
      const ax = HR.input.axes;
      keyEls.w && keyEls.w.classList.toggle("lit", ax.y < -.2);
      keyEls.s && keyEls.s.classList.toggle("lit", ax.y > .2);
      keyEls.a && keyEls.a.classList.toggle("lit", ax.x < -.2);
      keyEls.d && keyEls.d.classList.toggle("lit", ax.x > .2);
    }
    if (wrap.classList.contains("on")) raf = requestAnimationFrame(pollKeys);
  }

  /* ── sequential hints ─────────────────────────────────────────────────── */
  const toast = document.createElement("div");
  toast.id = "hr-hint";
  toast.setAttribute("role", "status");
  document.body.appendChild(toast);
  let seen = {}, curId = null, hideT = 0;

  /* a locked game stage (.gfix) is its own stacking context above the body,
     so the overlay + hints must live inside it to be seen */
  function mount(host) {
    const h = host || document.body;
    h.appendChild(wrap);
    h.appendChild(toast);
  }

  /* keycap markup helper for hint copy: HR.tutor.kbd("W") */
  const kbd = k => `<kbd class="hh-key">${k}</kbd>`;
  /* on touch, key talk becomes joystick talk */
  const stick = () => COARSE ? "drag the joystick" : null;

  function hint(id, html, opts = {}) {
    if (seen[id]) return;
    seen[id] = 1;
    curId = id;
    toast.innerHTML = html;
    toast.classList.add("on");
    clearTimeout(hideT);
    if (opts.ttl !== 0)                                    // ttl 0 = sticky until clear()
      hideT = setTimeout(() => { if (curId === id) dismiss(); }, (opts.ttl || 7) * 1000);
    if (window.HR && HR.live) HR.live(toast.textContent);
  }
  /* re-show an already-seen sticky hint (e.g. "out of gravel" can recur) */
  function nag(id, html) {
    if (curId === id && toast.classList.contains("on")) return;
    curId = id;
    toast.innerHTML = html;
    toast.classList.add("on");
    clearTimeout(hideT); hideT = 0;
  }
  function clear(id) {
    if (id && curId !== id) { seen[id] = 1; return; }
    dismiss();
  }
  function dismiss() { curId = null; toast.classList.remove("on"); }
  function reset() { seen = {}; dismiss(); }

  return { showKeys, hideKeys, hint, nag, clear, reset, mount, kbd, stick, COARSE };
})();
