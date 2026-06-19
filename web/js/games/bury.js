/* Hidden Rivers v2 — Phase 3: the urbanization race (1880–1930).
   Drag-paint brick culverts over five creeks before sickness outruns the
   population boom. 1 second of real time = 1 calendar year. The win screen
   is the trap: burying the rivers was the right call — that's the point. */
"use strict";
(() => {
  const U = HR.u;
  /* five creeks in normalized map coords (y down, lake at the bottom) */
  const CREEK_PTS = [
    [[.14,.02],[.18,.14],[.15,.27],[.21,.39],[.19,.52],[.24,.64],[.22,.76],[.27,.88]],
    [[.45,.04],[.42,.17],[.47,.31],[.44,.45],[.49,.59],[.46,.73],[.50,.88]],
    [[.36,.52],[.39,.62],[.36,.72],[.40,.80],[.38,.88]],
    [[.68,.03],[.65,.16],[.70,.30],[.67,.44],[.71,.58],[.68,.73],[.72,.88]],
    [[.84,.10],[.81,.24],[.85,.40],[.82,.56],[.86,.72],[.83,.88]],
  ];
  const SEGS = [];                                       // 28 of them
  for (const c of CREEK_PTS)
    for (let i = 0; i < c.length - 1; i++)
      SEGS.push({ a: c[i], b: c[i + 1],
                  mx: (c[i][0] + c[i + 1][0]) / 2, my: (c[i][1] + c[i + 1][1]) / 2 });
  const N = SEGS.length;

  /* Toronto's curve, thousands */
  const POP = [[1880, 86], [1890, 181], [1900, 208], [1910, 382], [1920, 522], [1930, 631]];
  function popAt(year) {
    for (let i = 1; i < POP.length; i++)
      if (year <= POP[i][0])
        return U.lerp(POP[i - 1][1], POP[i][1], (year - POP[i - 1][0]) / (POP[i][0] - POP[i - 1][0]));
    return 631;
  }
  const CENTER = [.5, .80];
  /* pre-generated sprawl blocks, sorted by distance from the old town */
  const BLOCKS = [];
  {
    let seed = 17;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 720; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * .66;
      BLOCKS.push({ x: CENTER[0] + Math.cos(a) * r * 1.25, y: CENTER[1] + Math.sin(a) * r * .9,
                    r, w: .010 + rnd() * .012, h: .008 + rnd() * .010 });
    }
    BLOCKS.sort((p, q) => p.r - q.r);
  }

  const K1 = .34, K2 = 2.0, RATE = .9, BUILD_T = .8;
  const A = () => (window.HR && HR.audio) ? HR.audio : null;
  const cv = document.getElementById("bury-cv");
  const yearEl = document.getElementById("bury-year");
  const popEl = document.getElementById("bury-pop");
  const sickEl = document.getElementById("bury-sickfill");
  const sickWrap = document.getElementById("bury-sick");
  const winEl = document.getElementById("bury-win");
  const failEl = document.getElementById("bury-fail");

  let segState, year, sick, budget, mode, auto, doneYear;
  let running = false, paused = false, raf = 0, lastT = 0, pointer = null;
  const blade = { x: .5, y: .5, vis: false, push: 0 };     // the dozer's blade

  function init() {
    segState = SEGS.map(() => ({ s: 0, b: 0 }));         // 0 open · 1 filling · 2 buried
    year = 1880; sick = 8; budget = 0; mode = "play"; doneYear = 0; pointer = null;
    blade.vis = false; blade.push = 0;
    winEl.classList.remove("on"); failEl.classList.remove("on");
  }

  const sprawlRadius = () => U.lerp(.10, .62, (popAt(year) - 86) / (631 - 86));
  const buriedCount = () => segState.reduce((a, s) => a + (s.s === 2 ? 1 : 0), 0);

  function tryBuild(nx, ny) {
    if (budget < 1) return;
    let best = -1, bestD = .055;
    for (let i = 0; i < N; i++) {
      if (segState[i].s !== 0) continue;
      const d = U.segDist(nx, ny, SEGS[i].a[0], SEGS[i].a[1], SEGS[i].b[0], SEGS[i].b[1]);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best !== -1) { segState[best].s = 1; budget -= 1; }
  }

  function update(dt) {
    const speed = auto ? 3 : 1;                          // skip mode shows it 3× faster
    if (mode === "play") {
      year = Math.min(1930, year + dt * speed);
      budget = Math.min(2.5, budget + dt * RATE * speed);
      if (pointer) tryBuild(pointer[0], pointer[1]);
      if (auto) {                                        // autopilot: next open segment
        const i = segState.findIndex(s => s.s === 0);
        if (i !== -1 && budget >= 1) { segState[i].s = 1; budget -= 1; }
      }
      let filling = 0;
      for (const s of segState) {
        if (s.s === 1) {
          filling++;
          if ((s.b += dt * speed / BUILD_T) >= 1) {
            s.s = 2; s.b = 1;
            const a = A(); if (a) a.sfx.build();          // gravel dumped, section sealed
          }
        }
      }
      const a = A(); if (a) a.dozerLoad(filling ? .9 : (pointer ? .5 : .15));

      /* sickness: exposed creeks × the people living on top of them */
      const sr = sprawlRadius();
      let exposed = 0;
      for (let i = 0; i < N; i++) {
        if (segState[i].s === 2) continue;
        const d = Math.hypot(SEGS[i].mx - CENTER[0], SEGS[i].my - CENTER[1]);
        exposed += d < sr * 1.1 ? 2 : 1;
      }
      const popF = U.lerp(.3, 1.5, (popAt(year) - 86) / (631 - 86));
      sick = Math.max(0, sick + dt * speed * (K1 * exposed * popF - K2 * buriedCount() / N * 3));
      if (sick > 75) HR.live("Sickness is nearing the epidemic line. " +
        (N - buriedCount()) + " creek sections remain.");

      if (sick >= 100 || (year >= 1930 && buriedCount() < N)) {
        mode = "lost";
        const fy = failEl.querySelector("[data-year]");
        if (fy) fy.textContent = Math.round(year);
        const a = A(); if (a) { a.dozerStop(); a.sfx.fail(); }
        HR.live(HR.COPY.bury.epidemic(Math.round(year)));
        failEl.classList.add("on");
      } else if (buriedCount() === N) {
        mode = "won"; doneYear = Math.round(year);
        HR.live(HR.COPY.bury.done(doneYear));
      }
    } else if (mode === "won") {
      year = Math.min(1930, year + dt * 10);             // montage to 1930
      sick = Math.max(0, sick - dt * 30);
      if (year >= 1930) {
        mode = "shown"; winEl.classList.add("on");
        const a = A(); if (a) { a.dozerStop(); a.sfx.win(); }
      }
    }
  }

  function render(t) {
    const dpr = U.sizeCanvas(cv);
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const S = Math.min(W, H * 1.1);
    const ox = (W - S) / 2, oy = (H - S * .94) / 2;
    const PX = (x, y) => [ox + x * S, oy + y * S * .94];

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#161209"; ctx.fillRect(0, 0, W, H); // sepia plan
    ctx.fillStyle = "#1c1810";
    ctx.fillRect(ox, oy, S, S * .94);
    /* the lake */
    const [, ly] = PX(0, .88);
    ctx.fillStyle = "#22414a"; ctx.fillRect(ox, ly, S, oy + S * .94 - ly + 2);
    ctx.fillStyle = "rgba(120,190,200,.25)";
    for (let i = 0; i < 9; i++)
      ctx.fillRect(ox + ((i * .117 + t * .01) % 1) * S, ly + 8 * dpr + (i % 3) * 14 * dpr, 26 * dpr, 2 * dpr);

    /* sprawl */
    const sr = sprawlRadius();
    ctx.fillStyle = "#2c2517";
    for (const b of BLOCKS) {
      if (b.r > sr) break;
      const [bx, by] = PX(b.x, b.y);
      if (by > ly - 4) continue;
      ctx.fillRect(bx, by, b.w * S, b.h * S);
    }
    ctx.fillStyle = "rgba(255,200,110,.5)";
    for (let i = 0; i < BLOCKS.length; i += 7) {
      const b = BLOCKS[i];
      if (b.r > sr) break;
      const [bx, by] = PX(b.x, b.y);
      if (by > ly - 4) continue;
      ctx.fillRect(bx + 2 * dpr, by + 2 * dpr, 1.6 * dpr, 1.6 * dpr);
    }

    /* creeks */
    ctx.lineCap = "round";
    for (let i = 0; i < N; i++) {
      const s = segState[i];
      const [x1, y1] = PX(SEGS[i].a[0], SEGS[i].a[1]);
      const [x2, y2] = PX(SEGS[i].b[0], SEGS[i].b[1]);
      if (s.s === 2) {                                   // buried: a street where water was
        ctx.strokeStyle = "#43392a"; ctx.lineWidth = 7 * dpr;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = "#574a35"; ctx.lineWidth = 1.4 * dpr;
        ctx.setLineDash([5 * dpr, 7 * dpr]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const a = s.s === 1 ? 1 - s.b : 1;
        ctx.strokeStyle = `rgba(79,195,247,${(.25 * a).toFixed(2)})`;
        ctx.lineWidth = 9 * dpr;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = `rgba(127,212,255,${((.6 + .3 * Math.sin(t * 2.4 + i)) * a).toFixed(2)})`;
        ctx.lineWidth = 2.6 * dpr;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (s.s === 1) {                                 // dirt + gravel pushed over it
          const fx = U.lerp(x1, x2, s.b), fy = U.lerp(y1, y2, s.b);
          ctx.lineCap = "round";
          ctx.strokeStyle = "#5a3d24"; ctx.lineWidth = 12 * dpr; // earth mound
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(fx, fy); ctx.stroke();
          ctx.strokeStyle = "#7a5836"; ctx.lineWidth = 6 * dpr;  // lighter crown
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(fx, fy); ctx.stroke();
          ctx.fillStyle = "rgba(196,176,144,.85)";              // gravel speckle
          for (let g = 0; g < 7; g++) {
            const tt = (g + 1) / 8 * s.b;
            ctx.fillRect(U.lerp(x1, x2, tt) + ((g * 53 % 7) - 3) * dpr,
                         U.lerp(y1, y2, tt) + ((g * 31 % 7) - 3) * dpr, 1.8 * dpr, 1.8 * dpr);
          }
          /* a heap of fill at the working face */
          ctx.fillStyle = "#6b4a2c";
          ctx.beginPath(); ctx.arc(fx, fy, 6 * dpr, 0, 6.3); ctx.fill();
        }
      }
    }

    /* the bulldozer the player drives — follows the cursor / touch, blade
       lowered and shoving a pile of fill while a section is being buried */
    blade.push += ((pointer ? 1 : 0) - blade.push) * .2;
    if (blade.vis && (mode === "play" || mode === "won")) {
      const [bx, by] = PX(blade.x, blade.y);
      const sgn = blade.x > .5 ? -1 : 1;                  // face toward mid-map
      ctx.save(); ctx.translate(bx, by); ctx.scale(sgn, 1);
      /* dirt being pushed */
      if (blade.push > .05) {
        ctx.fillStyle = `rgba(120,86,52,${(.8 * blade.push).toFixed(2)})`;
        ctx.beginPath(); ctx.ellipse(15 * dpr, 6 * dpr, 9 * dpr * blade.push, 5 * dpr, 0, 0, 6.3); ctx.fill();
      }
      ctx.fillStyle = "#2b2f35";                          // treads
      ctx.fillRect(-13 * dpr, -11 * dpr, 24 * dpr, 5 * dpr);
      ctx.fillRect(-13 * dpr, 6 * dpr, 24 * dpr, 5 * dpr);
      ctx.fillStyle = "#f2c12e";                          // body
      ctx.fillRect(-11 * dpr, -7 * dpr, 20 * dpr, 14 * dpr);
      ctx.fillStyle = "#1d2126";                          // cab
      ctx.fillRect(-7 * dpr, -4 * dpr, 8 * dpr, 8 * dpr);
      ctx.fillStyle = "#d8d8d2";                          // blade
      ctx.fillRect(11 * dpr, -10 * dpr, 4 * dpr, 20 * dpr);
      ctx.restore();
    }

    /* HUD */
    yearEl.textContent = Math.round(year);
    popEl.textContent = Math.round(popAt(year)) + ",000";
    const pct = U.c01(sick / 100);
    sickEl.style.height = (pct * 100).toFixed(1) + "%";
    sickWrap.classList.toggle("hot", pct > .72);
  }

  function frame(now) {
    if (!running) return;
    const t = now / 1000, dt = Math.min(.05, t - lastT); lastT = t;
    if (!paused && mode !== "lost" && mode !== "shown") update(dt);
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function begin(asAuto) {
    init(); auto = asAuto; running = true; paused = false;
    lastT = performance.now() / 1000;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  /* pointer → normalized map coords */
  function norm(e) {
    const r = cv.getBoundingClientRect();
    const dpr = cv.width / r.width;
    const W = cv.width, H = cv.height;
    const S = Math.min(W, H * 1.1);
    const ox = (W - S) / 2, oy = (H - S * .94) / 2;
    return [((e.clientX - r.left) * dpr - ox) / S,
            ((e.clientY - r.top) * dpr - oy) / (S * .94)];
  }
  cv.addEventListener("pointerdown", e => { pointer = norm(e); blade.x = pointer[0]; blade.y = pointer[1]; blade.vis = true; tryBuild(...pointer); });
  cv.addEventListener("pointermove", e => { const n = norm(e); blade.x = n[0]; blade.y = n[1]; blade.vis = true; if (pointer) pointer = n; });
  addEventListener("pointerup", () => { pointer = null; });

  function begin2() { const a = A(); if (a) a.dozerStart(); }
  const game = {
    id: "bury", sceneId: "sc-bury",
    start: () => { begin(false); begin2(); },
    skip: () => { begin(true); begin2(); },
    restart: () => { begin(auto); begin2(); },
    stop() { running = false; cancelAnimationFrame(raf); const a = A(); if (a) a.dozerStop(); },
    pause() { paused = true; const a = A(); if (a) a.dozerStop(); },
    resume() { paused = false; lastT = performance.now() / 1000;
               const a = A(); if (a && (mode === "play" || mode === "won")) a.dozerStart(); },
  };
  HR.island.register(game);
  const winDone = winEl.querySelector(".g-done");
  if (winDone) winDone.addEventListener("click", () =>
    HR.island.finish(game, "win", { finishYear: doneYear }));
  const retry = failEl.querySelector(".g-retry");
  if (retry) retry.addEventListener("click", () => { failEl.classList.remove("on"); begin(false); begin2(); });
  const concede = failEl.querySelector(".g-concede");
  if (concede) concede.addEventListener("click", () =>
    HR.island.finish(game, "epidemic", { finishYear: Math.round(year || 1894) }));
})();
