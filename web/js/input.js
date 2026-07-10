/* Hidden Rivers v2 — unified input: WASD + arrows + a touch joystick.
   Games read HR.input.axes ({x,y}) every frame. Keyboard yields -1/0/1;
   the joystick yields analog values in [-1,1] (games that need discrete
   steps quantize with Math.sign). The old 4-button d-pad is replaced by a
   floating joystick: touch anywhere on the playfield and a stick appears
   under the thumb — far more playable on a phone. */
"use strict";
window.HR = window.HR || {};

HR.input = (() => {
  const axes = { x: 0, y: 0 };
  const held = new Set();
  const MAPX = { a: -1, arrowleft: -1, d: 1, arrowright: 1 };
  const MAPY = { w: -1, arrowup: -1, s: 1, arrowdown: 1 };
  let stickOn = false;                                     // joystick overrides keys

  function recompute() {
    if (stickOn) return;
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

  /* ── floating joystick for coarse pointers ─────────────────────────────
     The container (one per game, positioned over the whole stage by CSS)
     spawns the stick where the finger lands. Radius ~56px, deadzone 22%. */
  function dpad(container) {
    if (!container || container.childElementCount) return;
    container.classList.add("joyzone");
    const base = document.createElement("div");
    base.className = "joy-base";
    base.innerHTML = '<div class="joy-knob"></div>';
    container.appendChild(base);
    const knob = base.firstElementChild;
    const R = 56;
    let pid = null, cx = 0, cy = 0;

    const setAxes = (dx, dy) => {
      const d = Math.hypot(dx, dy);
      const k = d > R ? R / d : 1;
      knob.style.transform = `translate(${(dx * k).toFixed(1)}px,${(dy * k).toFixed(1)}px)`;
      const nx = (dx * k) / R, ny = (dy * k) / R;
      const dead = .22;
      axes.x = Math.abs(nx) < dead ? 0 : (nx - Math.sign(nx) * dead) / (1 - dead);
      axes.y = Math.abs(ny) < dead ? 0 : (ny - Math.sign(ny) * dead) / (1 - dead);
    };
    const end = () => {
      pid = null; stickOn = false;
      base.classList.remove("on");
      knob.style.transform = "";
      recompute();
    };
    container.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse") return;               // mouse users have keys
      if (pid !== null) return;
      pid = e.pointerId;
      container.setPointerCapture && container.setPointerCapture(pid);
      cx = e.clientX; cy = e.clientY;
      base.style.left = cx + "px"; base.style.top = cy + "px";
      base.classList.add("on");
      stickOn = true;
      setAxes(0, 0);
      e.preventDefault();
    });
    container.addEventListener("pointermove", e => {
      if (e.pointerId !== pid) return;
      setAxes(e.clientX - cx, e.clientY - cy);
      e.preventDefault();
    });
    container.addEventListener("pointerup", e => { if (e.pointerId === pid) end(); });
    container.addEventListener("pointercancel", e => { if (e.pointerId === pid) end(); });
  }
  return { axes, dpad };
})();
