/* Hidden Rivers v2 — Phase 5: the daylighting run.
   Drive the dozer along Garrison Creek's buried alignment; the crew convoy
   behind you converts the trail into open water and parkland. Four gauges
   must cross their safe thresholds before the storm's 120-second ETA. */
"use strict";
(() => {
  const U = HR.u;
  const WORLD = { w: 2400, h: 1500 };
  const PATH = [[260, 180], [420, 330], [380, 520], [560, 660], [760, 700],
                [900, 880], [1150, 940], [1320, 1100], [1600, 1160],
                [1850, 1300], [2150, 1360]];
  /* arc-length parameterization */
  const ARC = [0];
  for (let i = 1; i < PATH.length; i++)
    ARC.push(ARC[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]));
  const TOTAL = ARC[ARC.length - 1];
  function pointAt(s) {
    s = U.clamp(s, 0, TOTAL);
    let i = 1;
    while (i < ARC.length - 1 && ARC[i] < s) i++;
    const t = (s - ARC[i - 1]) / (ARC[i] - ARC[i - 1] || 1);
    return [U.lerp(PATH[i - 1][0], PATH[i][0], t), U.lerp(PATH[i - 1][1], PATH[i][1], t)];
  }
  /* trees along the banks, spawned as the trail converts */
  const TREES = [];
  for (let s = 40, k = 0; s < TOTAL; s += 58, k++) {
    const [x, y] = pointAt(s);
    const [x2, y2] = pointAt(Math.min(TOTAL, s + 8));
    const nx = -(y2 - y), ny = x2 - x, L = Math.hypot(nx, ny) || 1;
    const side = k % 2 ? 1 : -1;
    TREES.push({ s, x: x + nx / L * 46 * side, y: y + ny / L * 46 * side, r: 9 + (k * 37 % 8) });
  }
  const STORM = 120, CREW = 42, CORRIDOR = 95;
  const SAFE = { heat: 31, flood: 25, cso: 40, species: 40 };
  const A = () => (window.HR && HR.audio) ? HR.audio : null;

  const cv = document.getElementById("dozer-cv");
  const radar = document.getElementById("dozer-radar");
  const etaEl = document.getElementById("dozer-eta");
  const gEls = {
    heat: document.getElementById("dz-heat"), flood: document.getElementById("dz-flood"),
    cso: document.getElementById("dz-cso"), species: document.getElementById("dz-species"),
  };
  const winEl = document.getElementById("dozer-win");
  const failEl = document.getElementById("dozer-fail");

  let dz, progress, elapsed, mode, auto, cam, announced;
  let running = false, paused = false, raf = 0, lastT = 0, flashA = 0;

  function init() {
    dz = { x: PATH[0][0] - 60, y: PATH[0][1] - 40, a: .6 };
    progress = 0; elapsed = 0; mode = "play"; cam = { x: 0, y: 0 };
    announced = {}; flashA = 0;
    winEl.classList.remove("on"); failEl.classList.remove("on");
  }

  function gauges() {
    const d = progress / TOTAL, t = elapsed / STORM;
    return {
      heat: 34 - 6 * d + .4 * t,
      flood: 78 - 70 * d + 6 * t,
      cso: 120 - 110 * d + 8 * t,
      species: 3 + 58 * d - 4 * t,
    };
  }
  const allSafe = g => g.heat < SAFE.heat && g.flood < SAFE.flood &&
                       g.cso < SAFE.cso && g.species > SAFE.species;

  function update(dt) {
    const speed = auto ? 2.4 : 1;
    elapsed += dt * speed;

    /* drive */
    const ax = auto ? autoAxes() : HR.input.axes;
    dz.a += ax.x * 1.92 * dt;
    const [fx, fy] = pointAt(Math.min(TOTAL, progress + 30));
    const nearPath = U.dist(dz.x, dz.y, fx, fy) < CORRIDOR;
    const v = (nearPath ? 185 : 145) * -ax.y;            // W = up = forward
    dz.x = U.clamp(dz.x + Math.cos(dz.a) * v * dt, 30, WORLD.w - 30);
    dz.y = U.clamp(dz.y + Math.sin(dz.a) * v * dt, 30, WORLD.h - 30);

    /* the dig advances while you lead the frontier */
    if (nearPath && progress < TOTAL)
      progress = Math.min(TOTAL, progress + CREW * dt * speed * (auto ? 3 : 1));

    /* the dozer engine bogs down harder while it's actually cutting channel */
    const aud = A();
    if (aud) aud.dozerLoad(nearPath && Math.abs(ax.y) > .1 ? .95 : .35);

    const g = gauges();
    for (const k of ["heat", "flood", "cso", "species"]) {
      const safe = k === "species" ? g[k] > SAFE[k] : g[k] < SAFE[k];
      if (safe && !announced[k]) { announced[k] = 1; if (aud) aud.sfx.success(); HR.live(HR.COPY.dozer.safe(k)); }
    }
    if (mode === "play") {
      if (allSafe(g) && progress > TOTAL * .5) {
        mode = "won"; if (aud) { aud.dozerStop(); aud.sfx.win(); }
        HR.live(HR.COPY.dozer.won);
        setTimeout(() => winEl.classList.add("on"), 900);
      } else if (elapsed >= STORM) {
        mode = "storm"; flashA = 1; if (aud) { aud.dozerStop(); aud.sfx.fail(); aud.sfx.thunder(); }
        HR.live(HR.COPY.dozer.storm);
        setTimeout(() => failEl.classList.add("on"), 1600);
      }
    }
  }
  function autoAxes() {
    const [fx, fy] = pointAt(Math.min(TOTAL, progress + 60));
    const want = Math.atan2(fy - dz.y, fx - dz.x);
    let da = want - dz.a;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    return { x: U.clamp(da * 3, -1, 1), y: -1 };
  }

  function render(t) {
    const dpr = U.sizeCanvas(cv);
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const Z = Math.max(W / 1500, H / 1000);              // zoom so the world feels big

    /* camera with deadzone */
    const dzx = dz.x * Z, dzy = dz.y * Z;
    const cxT = U.clamp(dzx - W / 2, 0, WORLD.w * Z - W);
    const cyT = U.clamp(dzy - H / 2, 0, WORLD.h * Z - H);
    cam.x += (cxT - cam.x) * .08; cam.y += (cyT - cam.y) * .08;
    const PX = (x, y) => [x * Z - cam.x, y * Z - cam.y];

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#171c22"; ctx.fillRect(0, 0, W, H);
    /* the modern grid */
    ctx.strokeStyle = "#22282f"; ctx.lineWidth = 10 * dpr / 1.6;
    for (let gx = 0; gx <= WORLD.w; gx += 200) {
      const [x1, y1] = PX(gx, 0), [, y2] = PX(gx, WORLD.h);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); ctx.stroke();
    }
    for (let gy = 0; gy <= WORLD.h; gy += 200) {
      const [x1, y1] = PX(0, gy), [x2] = PX(WORLD.w, gy);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
    }
    ctx.fillStyle = "#1d242c";
    for (let gx = 0; gx < WORLD.w; gx += 200)
      for (let gy = 0; gy < WORLD.h; gy += 200) {
        const [bx, by] = PX(gx + 18, gy + 18);
        if (bx > -200 && bx < W && by > -200 && by < H)
          ctx.fillRect(bx, by, 164 * Z, 164 * Z);
      }

    const trail = (a, b, width, style) => {
      ctx.strokeStyle = style; ctx.lineWidth = width;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      for (let s = a; s <= b; s += 24) {
        const [x, y] = PX(...pointAt(s));
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true;
      }
      if (started) { const [x, y] = PX(...pointAt(b)); ctx.lineTo(x, y); ctx.stroke(); }
    };

    /* the alignment still buried: the map remembers */
    if (progress < TOTAL) {
      ctx.setLineDash([12 * dpr, 14 * dpr]); ctx.lineDashOffset = -t * 26;
      trail(progress, TOTAL, 3 * dpr, "rgba(127,212,255,.4)");
      ctx.setLineDash([]);
    }
    /* converted: banks, water, sparkle */
    const conv = Math.max(0, progress - 120);
    if (conv > 4) {
      trail(0, conv, 52 * Z, "#3f7a38");
      trail(0, conv, 28 * Z, "#2e8d9e");
      trail(0, conv, 6 * Z, `rgba(180,240,235,${(.35 + .2 * Math.sin(t * 2)).toFixed(2)})`);
      ctx.fillStyle = "#356e2f";
      for (const tr of TREES) {
        if (tr.s > conv) break;
        const [x, y] = PX(tr.x, tr.y);
        ctx.beginPath(); ctx.arc(x, y, tr.r * Z, 0, 6.3); ctx.fill();
      }
    }
    /* crew convoy at the frontier */
    if (progress > 8 && progress < TOTAL) {
      for (let i = 0; i < 3; i++) {
        const [x, y] = PX(...pointAt(Math.max(0, progress - 18 - i * 38)));
        ctx.fillStyle = ["#e7a33b", "#cf7f2c", "#e7a33b"][i];
        ctx.fillRect(x - 9 * Z, y - 7 * Z + Math.sin(t * 5 + i) * 1.5, 18 * Z, 14 * Z);
      }
    }

    /* dozer */
    {
      const [x, y] = PX(dz.x, dz.y);
      ctx.save(); ctx.translate(x, y); ctx.rotate(dz.a);
      ctx.fillStyle = "#2b2f35";
      ctx.fillRect(-16 * Z, -13 * Z, 32 * Z, 6 * Z);
      ctx.fillRect(-16 * Z, 7 * Z, 32 * Z, 6 * Z);
      ctx.fillStyle = "#f2c12e";
      ctx.fillRect(-14 * Z, -8 * Z, 26 * Z, 16 * Z);
      ctx.fillStyle = "#d8d8d2";
      ctx.fillRect(14 * Z, -11 * Z, 5 * Z, 22 * Z);      // the blade
      ctx.fillStyle = "#1d2126";
      ctx.fillRect(-9 * Z, -4 * Z, 9 * Z, 8 * Z);
      ctx.restore();

      /* compass to the frontier when adrift */
      const [fx2, fy2] = pointAt(Math.min(TOTAL, progress + 30));
      if (U.dist(dz.x, dz.y, fx2, fy2) > CORRIDOR * 1.4 && progress < TOTAL) {
        const ang = Math.atan2(fy2 - dz.y, fx2 - dz.x);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.fillStyle = `rgba(127,212,255,${(.5 + .3 * Math.sin(t * 4)).toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(46 * Z, 0); ctx.lineTo(30 * Z, -9 * Z); ctx.lineTo(30 * Z, 9 * Z);
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }

    /* storm hit */
    if (mode === "storm") {
      flashA = Math.max(0, flashA - .015);
      ctx.fillStyle = `rgba(8,12,18,${(.55 * (1 - flashA)).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
      if (flashA > .7) { ctx.fillStyle = `rgba(234,242,255,${flashA - .7})`; ctx.fillRect(0, 0, W, H); }
    }

    /* HUD */
    const g = gauges();
    setGauge("heat", g.heat, 28, 35, true, "°C");
    setGauge("flood", g.flood, 0, 85, true, "%");
    setGauge("cso", g.cso, 0, 130, true, "M$/yr");
    setGauge("species", g.species, 0, 65, false, " species");
    if (etaEl) {
      const left = Math.max(0, STORM - elapsed);
      etaEl.textContent = mode === "storm" ? "STORM OVERHEAD"
        : `STORM ETA ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
      etaEl.classList.toggle("hot", left < 25 && mode === "play");
    }
    drawRadar(t);
  }

  function setGauge(key, val, lo, hi, lowerIsSafe, unit) {
    const el = gEls[key];
    if (!el) return;
    const fill = el.querySelector(".gfill"), num = el.querySelector(".gnum");
    const pct = U.c01((val - lo) / (hi - lo));
    fill.style.width = (pct * 100).toFixed(1) + "%";
    num.textContent = (key === "cso" ? "$" : "") + Math.round(val) + unit;
    const safe = lowerIsSafe ? val < SAFE[key] : val > SAFE[key];
    el.classList.toggle("safe", safe);
  }
  function drawRadar(t) {
    if (!radar) return;
    const dpr = U.sizeCanvas(radar, 2);
    const ctx = radar.getContext("2d");
    const W = radar.width, H = radar.height, cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(9,14,20,.85)"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(79,195,247,.3)";
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath(); ctx.arc(cx, cy, r * W / 7, 0, 6.3); ctx.stroke();
    }
    const d = Math.max(0, 1 - elapsed / STORM);
    const bx = cx + Math.cos(2.4) * d * W * .52, by = cy + Math.sin(2.4) * d * W * .52;
    ctx.fillStyle = `rgba(255,112,67,${(.5 + .3 * Math.sin(t * 3)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(bx, by, W * .12 + (1 - d) * W * .1, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#7cc46f";
    ctx.beginPath(); ctx.arc(cx, cy, 3 * dpr, 0, 6.3); ctx.fill();
  }

  function frame(now) {
    if (!running) return;
    const t = now / 1000, dt = Math.min(.05, t - lastT); lastT = t;
    if (!paused && (mode === "play")) update(dt);
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function begin(asAuto) {
    init(); auto = asAuto; running = true; paused = false;
    lastT = performance.now() / 1000;
    const a = A(); if (a) a.dozerStart();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  const game = {
    id: "dozer", sceneId: "sc-dozer",
    start: () => begin(false),
    skip: () => begin(true),
    restart: () => begin(auto),
    stop() { running = false; cancelAnimationFrame(raf); const a = A(); if (a) a.dozerStop(); },
    pause() { paused = true; const a = A(); if (a) a.dozerStop(); },
    resume() { paused = false; lastT = performance.now() / 1000;
               const a = A(); if (a && mode === "play") a.dozerStart(); },
  };
  HR.island.register(game);
  HR.input.dpad(document.getElementById("dozer-dpad"));
  const winDone = winEl.querySelector(".g-done");
  if (winDone) winDone.addEventListener("click", () =>
    HR.island.finish(game, "win", { marginSec: Math.round(STORM - elapsed) }));
  const retry = failEl.querySelector(".g-retry");
  if (retry) retry.addEventListener("click", () => { failEl.classList.remove("on"); begin(false); });
  const concede = failEl.querySelector(".g-concede");
  if (concede) concede.addEventListener("click", () => { failEl.classList.remove("on"); begin(true); });
})();
