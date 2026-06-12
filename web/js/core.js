/* Hidden Rivers v2 — HR core: shared utils, cross-phase state, aria live region.
   Classic script (no modules) so the page keeps working from file://. */
"use strict";
window.HR = window.HR || {};

HR.REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

HR.u = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  c01: v => v < 0 ? 0 : v > 1 ? 1 : v,
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  /* distance from point to segment ab */
  segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? HR.u.clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  },
  sizeCanvas(c, cap = 1.6) {
    const dpr = Math.min(devicePixelRatio || 1, cap);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== (w * dpr | 0) || c.height !== (h * dpr | 0)) {
      c.width = w * dpr | 0; c.height = h * dpr | 0;
    }
    return dpr;
  },
};

/* cross-phase store (sessionStorage-backed: a reload mid-story resumes) */
HR.state = (() => {
  const KEY = "hr-v2-state";
  let s = {};
  try { s = JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch (e) { s = {}; }
  return {
    get: id => s[id],
    set(id, val) {
      s[id] = val;
      try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
      dispatchEvent(new CustomEvent("hr-state", { detail: { id, val } }));
    },
  };
})();

/* screen-reader narration for game-state changes */
HR.live = (() => {
  const el = document.createElement("div");
  el.setAttribute("aria-live", "polite");
  el.className = "sr-live";
  document.body.appendChild(el);
  let last = 0;
  return msg => {
    const now = performance.now();
    if (now - last < 900) return;                        // don't firehose the SR
    last = now;
    el.textContent = msg;
  };
})();
