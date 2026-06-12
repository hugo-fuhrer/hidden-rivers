/* Hidden Rivers v2 — unified input: WASD + arrows + on-screen d-pad (touch).
   Games read HR.input.axes ({x,y} ∈ {-1,0,1}) every frame. */
"use strict";
window.HR = window.HR || {};

HR.input = (() => {
  const axes = { x: 0, y: 0 };
  const held = new Set();
  const MAPX = { a: -1, arrowleft: -1, d: 1, arrowright: 1 };
  const MAPY = { w: -1, arrowup: -1, s: 1, arrowdown: 1 };

  function recompute() {
    axes.x = 0; axes.y = 0;
    for (const k of held) {
      if (k in MAPX) axes.x = MAPX[k];
      if (k in MAPY) axes.y = MAPY[k];
    }
  }
  addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (k in MAPX || k in MAPY) { held.add(k); recompute(); }
  });
  addEventListener("keyup", e => {
    const k = e.key.toLowerCase();
    if (held.delete(k)) recompute();
  });
  addEventListener("blur", () => { held.clear(); recompute(); });

  /* on-screen d-pad for coarse pointers; container gets 4 buttons */
  function dpad(container) {
    if (!container || container.childElementCount) return;
    const dirs = [["▲", "w"], ["◀", "a"], ["▶", "d"], ["▼", "s"]];
    for (const [label, key] of dirs) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dp dp-" + key;
      b.textContent = label;
      b.setAttribute("aria-label", { w: "up", a: "left", d: "right", s: "down" }[key]);
      const on = e => { e.preventDefault(); held.add(key); recompute(); };
      const off = () => { held.delete(key); recompute(); };
      b.addEventListener("pointerdown", on);
      b.addEventListener("pointerup", off);
      b.addEventListener("pointercancel", off);
      b.addEventListener("pointerleave", off);
      container.appendChild(b);
    }
  }
  return { axes, dpad };
})();
