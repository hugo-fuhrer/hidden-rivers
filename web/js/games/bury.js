/* Hidden Rivers v2 — Phase 3: the urbanization race (1880–1930).
   Played on the REAL lost-rivers map (window.RIVERS_DATA). You drive the
   dozer with WASD/arrows: load gravel at a spoil heap, then crawl a glowing
   creek section end-to-end while your hopper drains into it. 28 major
   sections are yours; the rest of the network is buried around you by the
   city's crews on each segment's true historical year. 1 second = 1 year.
   The win screen is the trap: burying the rivers was the right call — that's
   the point. */
"use strict";
(() => {
  const U = HR.u;

  /* ── the real map, normalized so 1 world-unit = map height (~17.5 km) ── */
  const D = window.RIVERS_DATA, M = D.meta;
  const AW = M.w / M.h;                                  // world is [0,AW]×[0,1]
  const OLDTOWN = [.604, .877];                          // King & Yonge, 1880
  const LAKE_Y = .945;

  function toPts(s) {
    const P = [];
    for (let i = 0; i < s.p.length; i += 2) P.push([s.p[i] / M.h, s.p[i + 1] / M.h]);
    return P;
  }
  function polyLen(P) {
    let L = 0;
    for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    return L;
  }
  function centroid(P) {
    let x = 0, y = 0;
    for (const p of P) { x += p[0]; y += p[1]; }
    return [x / P.length, y / P.length];
  }

  /* pick 28 playable sections: mid-length, spread out, biased to the old
     town where the story lives; everything else stays as living background */
  const buriedAll = D.segs.filter(s => s.y < 9999);
  const cands = buriedAll
    .map(s => { const P = toPts(s); return { s, P, L: polyLen(P), c: centroid(P) }; })
    .filter(o => o.L >= .025 && o.L <= .10)
    .sort((a, b) => b.L * (0.35 + b.c[1]) - a.L * (0.35 + a.c[1]));
  const SECS = [];
  for (const o of cands) {
    if (SECS.length >= 28) break;
    if (SECS.every(p => Math.hypot(p.c[0] - o.c[0], p.c[1] - o.c[1]) > .055)) SECS.push(o);
  }
  const N = SECS.length;
  const mainSet = new Set(SECS.map(o => o.s));
  const REST = buriedAll.filter(s => !mainSet.has(s)).map(s => ({ y: s.y, P: toPts(s) }));
  const ALIVE = D.segs.filter(s => s.y >= 9999).map(s => ({ P: toPts(s) }));

  /* arc-length parameterization per playable section */
  for (const o of SECS) {
    o.arc = [0];
    for (let i = 1; i < o.P.length; i++)
      o.arc.push(o.arc[i - 1] + Math.hypot(o.P[i][0] - o.P[i - 1][0], o.P[i][1] - o.P[i - 1][1]));
  }
  function arcPoint(o, s) {
    s = U.clamp(s, 0, o.L);
    let i = 1;
    while (i < o.arc.length - 1 && o.arc[i] < s) i++;
    const t = (s - o.arc[i - 1]) / (o.arc[i] - o.arc[i - 1] || 1);
    return [U.lerp(o.P[i - 1][0], o.P[i][0], t), U.lerp(o.P[i - 1][1], o.P[i][1], t)];
  }
  /* buried interval measured from the end the dozer started at */
  const workArc = o => o.dir === 1 ? o.f * o.L : o.L * (1 - o.f);
  const workPoint = o => arcPoint(o, workArc(o));

  /* spoil heaps: five borrow pits at cluster centres of the playable creeks */
  const PILES = (() => {
    const ks = [[.25, .55], [.5, .75], [.75, .6], [.95, .8], [.45, .4]].map(p => [p[0] * AW / 1.229, p[1]]);
    for (let it = 0; it < 8; it++) {
      const sum = ks.map(() => [0, 0, 0]);
      for (const o of SECS) {
        let bi = 0, bd = 9;
        ks.forEach((k, i) => { const d = Math.hypot(k[0] - o.c[0], k[1] - o.c[1]); if (d < bd) { bd = d; bi = i; } });
        sum[bi][0] += o.c[0]; sum[bi][1] += o.c[1]; sum[bi][2]++;
      }
      ks.forEach((k, i) => { if (sum[i][2]) { k[0] = sum[i][0] / sum[i][2]; k[1] = sum[i][1] / sum[i][2]; } });
    }
    /* nudge each pit off the creeks and away from the lake */
    return ks.map(k => [U.clamp(k[0] + .035, .04, AW - .04), U.clamp(k[1] - .028, .06, LAKE_Y - .05)]);
  })();

  /* Toronto's curve, thousands */
  const POP = [[1880, 86], [1890, 181], [1900, 208], [1910, 382], [1920, 522], [1930, 631]];
  function popAt(year) {
    for (let i = 1; i < POP.length; i++)
      if (year <= POP[i][0])
        return U.lerp(POP[i - 1][1], POP[i][1], (year - POP[i - 1][0]) / (POP[i][0] - POP[i - 1][0]));
    return 631;
  }

  /* the city: grid-aligned blocks radiating from the old town — Toronto
     grows along the shore first, north more slowly, like it actually did */
  const BLOCKS = [];
  {
    let seed = 41;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const CW = .034, CH = .027, GAP = .16;               // cells + street gap
    for (let gy = 0; gy * CH < LAKE_Y - .01; gy++) {
      for (let gx = 0; gx * CW < AW - .01; gx++) {
        const x = gx * CW + .006, y = gy * CH + .005;
        const cx = x + CW / 2, cy = y + CH / 2;
        const r = Math.hypot(cx - OLDTOWN[0], (cy - OLDTOWN[1]) * 1.55);
        if (r > .8) continue;                            // never reached by 1930
        const bs = [];
        const n = 2 + (rnd() * 3 | 0);
        for (let i = 0; i < n; i++)                      // axis-aligned houses in the cell
          bs.push([x + CW * (GAP / 2 + rnd() * (1 - GAP) * .55),
                   y + CH * (GAP / 2 + rnd() * (1 - GAP) * .5),
                   CW * (.16 + rnd() * .22), CH * (.2 + rnd() * .3), rnd() < .3]);
        BLOCKS.push({ x, y, cx, cy, r: r + (rnd() - .5) * .05, bs });
      }
    }
    BLOCKS.sort((a, b) => a.r - b.r);
  }

  /* ── tuning ─────────────────────────────────────────────────────────── */
  const SPEED = .19;                                     // dozer, world-units/s
  const CAP = .26;                                       // hopper, in wu of creek it can bury
  const LOADRATE = .30;                                  // wu/s gained on a heap
  const FILLRATE = .16;                                  // wu/s poured while on the work point
  const R_PILE = .05, R_END = .05, R_WORK = .06;
  const K1 = .34, K2 = 2.0;                              // sickness dynamics (as before)

  const A = () => (window.HR && HR.audio) ? HR.audio : null;
  const cv = document.getElementById("bury-cv");
  const yearEl = document.getElementById("bury-year");
  const popEl = document.getElementById("bury-pop");
  const dirtEl = document.getElementById("bury-dirt");
  const sickEl = document.getElementById("bury-sickfill");
  const sickWrap = document.getElementById("bury-sick");
  const winEl = document.getElementById("bury-win");
  const failEl = document.getElementById("bury-fail");

  let dz, hopper, year, sick, mode, auto, doneYear, wasFull;
  let running = false, paused = false, raf = 0, lastT = 0, tscale = 1;

  function init() {
    for (const o of SECS) { o.st = 0; o.f = 0; o.dir = 1; }  // 0 open · 1 working · 2 buried
    dz = { x: OLDTOWN[0], y: OLDTOWN[1] - .06, a: -Math.PI / 2, moving: 0 };
    hopper = CAP * .5; wasFull = false;
    year = 1880; sick = 8; mode = "play"; doneYear = 0;
    winEl.classList.remove("on"); failEl.classList.remove("on");
  }

  const sprawlRadius = () => U.lerp(.08, .62, (popAt(year) - 86) / (631 - 86));
  const buriedCount = () => SECS.reduce((a, o) => a + (o.st === 2 ? 1 : 0), 0);

  function nearestPile() {
    let best = PILES[0], bd = 9;
    for (const p of PILES) { const d = Math.hypot(p[0] - dz.x, p[1] - dz.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function nearestJob() {                                 // active section, else nearest open end
    let best = null, bd = 9;
    for (const o of SECS) {
      if (o.st === 1) { const w = workPoint(o), d = Math.hypot(w[0] - dz.x, w[1] - dz.y); if (d - .5 < bd) { bd = d - .5; best = w; } }
      else if (o.st === 0) {
        for (const e of [o.P[0], o.P[o.P.length - 1]]) {
          const d = Math.hypot(e[0] - dz.x, e[1] - dz.y);
          if (d < bd) { bd = d; best = e; }
        }
      }
    }
    return best;
  }

  function update(dt) {
    const spd = auto ? 3 : 1;                             // skip mode: the crews work triple-time
    if (mode === "play") {
      year = Math.min(1930, year + dt * spd);

      /* ── drive ── */
      let ax = auto ? autoAxes() : HR.input.axes;
      let mx = ax.x, my = ax.y;
      const mag = Math.hypot(mx, my);
      if (mag > 0) {
        mx /= mag; my /= mag;
        dz.x = U.clamp(dz.x + mx * SPEED * dt * (auto ? 2.2 : 1), .02, AW - .02);
        dz.y = U.clamp(dz.y + my * SPEED * dt * (auto ? 2.2 : 1), .02, .985);
        const want = Math.atan2(my, mx);
        let da = want - dz.a;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        dz.a += da * Math.min(1, dt * 10);
        dz.moving = 1;
      } else dz.moving = 0;

      /* ── load at a spoil heap ── */
      let loading = false;
      for (const p of PILES) {
        if (Math.hypot(p[0] - dz.x, p[1] - dz.y) < R_PILE && hopper < CAP) {
          hopper = Math.min(CAP, hopper + LOADRATE * dt * spd);
          loading = true;
          if (hopper >= CAP && !wasFull) { wasFull = true; const a = A(); if (a) a.sfx.bump(); HR.live("Hopper full."); }
        }
      }
      if (hopper < CAP * .98) wasFull = false;

      /* ── start a section from either end ── */
      if (hopper > 0) {
        for (const o of SECS) {
          if (o.st !== 0) continue;
          if (Math.hypot(o.P[0][0] - dz.x, o.P[0][1] - dz.y) < R_END) { o.st = 1; o.dir = 1; }
          else if (Math.hypot(o.P[o.P.length - 1][0] - dz.x, o.P[o.P.length - 1][1] - dz.y) < R_END) { o.st = 1; o.dir = -1; }
        }
      }

      /* ── dump along the working face ── */
      let dumping = false;
      for (const o of SECS) {
        if (o.st !== 1 || hopper <= 0) continue;
        const w = workPoint(o);
        if (Math.hypot(w[0] - dz.x, w[1] - dz.y) < R_WORK) {
          const adv = Math.min(FILLRATE * dt * spd, hopper, (1 - o.f) * o.L);
          o.f += adv / o.L; hopper -= adv; dumping = true;
          if (o.f >= .999) {
            o.st = 2; o.f = 1;
            const a = A(); if (a) a.sfx.build();          // gravel down, section sealed
            HR.live((N - buriedCount()) + " creek sections remain.");
          }
        }
      }
      const a = A(); if (a) a.dozerLoad(dumping ? .95 : loading ? .7 : dz.moving ? .45 : .15);

      /* ── sickness: exposed creeks × the people living on top of them ── */
      const sr = sprawlRadius();
      let exposed = 0;
      for (const o of SECS) {
        if (o.st === 2) continue;
        const d = Math.hypot(o.c[0] - OLDTOWN[0], (o.c[1] - OLDTOWN[1]) * 1.55);
        exposed += (1 - (o.st === 1 ? o.f : 0)) * (d < sr * 1.1 ? 2 : 1);
      }
      const popF = U.lerp(.3, 1.5, (popAt(year) - 86) / (631 - 86));
      sick = Math.max(0, sick + dt * spd * (K1 * exposed * popF - K2 * buriedCount() / N * 3));
      if (sick > 75) HR.live("Sickness is nearing the epidemic line. " +
        (N - buriedCount()) + " creek sections remain.");

      if (sick >= 100 || (year >= 1930 && buriedCount() < N)) {
        mode = "lost";
        const fy = failEl.querySelector("[data-year]");
        if (fy) fy.textContent = Math.round(year);
        if (a) { a.dozerStop(); a.sfx.fail(); }
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

  function autoAxes() {
    const tgt = hopper < CAP * .25 ? nearestPile()
      : (nearestJob() || nearestPile());
    const dx = tgt[0] - dz.x, dy = tgt[1] - dz.y;
    const d = Math.hypot(dx, dy) || 1;
    return d < .012 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
  }

  /* ── render ─────────────────────────────────────────────────────────── */
  function render(t) {
    const dpr = U.sizeCanvas(cv);
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const m = 14 * dpr;
    const sc = Math.min((W - 2 * m) / AW, (H - 2 * m) / 1);
    const ox = (W - AW * sc) / 2, oy = (H - sc) / 2;
    const PX = (x, y) => [ox + x * sc, oy + y * sc];
    const poly = (P, from, to) => {                       // draw a polyline (whole by default)
      ctx.beginPath();
      let started = false;
      for (const [x, y] of P) {
        const [px, py] = PX(x, y);
        started ? ctx.lineTo(px, py) : ctx.moveTo(px, py); started = true;
      }
      ctx.stroke();
    };
    const arcStroke = (o, s0, s1, step = .008) => {       // stroke an arc interval
      if (s1 - s0 < 1e-4) return;
      ctx.beginPath();
      let started = false;
      for (let s = s0; s < s1; s += step) {
        const [x, y] = PX(...arcPoint(o, s));
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true;
      }
      const [x, y] = PX(...arcPoint(o, s1));
      ctx.lineTo(x, y); ctx.stroke();
    };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#161209"; ctx.fillRect(0, 0, W, H);  // sepia plan
    ctx.fillStyle = "#1c1810"; ctx.fillRect(ox, oy, AW * sc, sc);
    /* the lake */
    const [, ly] = PX(0, LAKE_Y);
    ctx.fillStyle = "#22414a"; ctx.fillRect(ox, ly, AW * sc, oy + sc - ly + 2);
    ctx.fillStyle = "rgba(120,190,200,.25)";
    for (let i = 0; i < 11; i++)
      ctx.fillRect(ox + ((i * .093 + t * .01) % 1) * AW * sc, ly + 8 * dpr + (i % 3) * 12 * dpr, 24 * dpr, 2 * dpr);
    ctx.fillStyle = "rgba(120,190,200,.5)";
    ctx.font = `italic ${11 * dpr}px Georgia,serif`;
    ctx.fillText("Lake Ontario", ox + AW * sc * .42, ly + 30 * dpr);

    /* the city: grid blocks light up as the sprawl reaches them */
    const sr = sprawlRadius();
    for (const b of BLOCKS) {
      if (b.r > sr) break;
      const g = U.c01((sr - b.r) / .04);                  // new blocks fade in
      const [bx, by] = PX(b.x, b.y);
      ctx.fillStyle = `rgba(36,29,18,${(.85 * g).toFixed(2)})`;   // block ground
      ctx.fillRect(bx, by, .028 * sc, .022 * sc);
      for (const [hx, hy, hw, hh, lit] of b.bs) {
        const [px, py] = PX(hx, hy);
        ctx.fillStyle = `rgba(58,47,29,${(.9 * g).toFixed(2)})`;
        ctx.fillRect(px, py, hw * sc, hh * sc);
        if (lit && g > .6) {
          ctx.fillStyle = "rgba(255,200,110,.55)";
          ctx.fillRect(px + hw * sc * .3, py + hh * sc * .3, 1.4 * dpr, 1.4 * dpr);
        }
      }
    }

    /* background network: the crews bury the small culverts on their real years */
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const r of REST) {
      const buried = year >= r.y;
      const recent = buried && year - r.y < 6;
      if (recent) { ctx.strokeStyle = `rgba(255,112,67,${(1 - (year - r.y) / 6).toFixed(2)})`; ctx.lineWidth = 1.8 * dpr; }
      else if (buried) { ctx.strokeStyle = "rgba(120,105,80,.4)"; ctx.lineWidth = dpr; }
      else { ctx.strokeStyle = "rgba(79,195,247,.22)"; ctx.lineWidth = dpr; }
      poly(r.P);
    }
    /* rivers that were never buried */
    ctx.strokeStyle = "rgba(127,212,255,.6)"; ctx.lineWidth = 1.6 * dpr;
    for (const r of ALIVE) poly(r.P);

    /* the 28 sections that are YOUR job */
    for (const o of SECS) {
      const bur = o.st === 2 ? [0, o.L]
        : o.st === 1 ? (o.dir === 1 ? [0, o.f * o.L] : [o.L * (1 - o.f), o.L]) : null;
      /* open part: glowing creek */
      const openIv = o.st === 2 ? null
        : o.st === 1 ? (o.dir === 1 ? [o.f * o.L, o.L] : [0, o.L * (1 - o.f)]) : [0, o.L];
      if (openIv) {
        ctx.strokeStyle = "rgba(79,195,247,.3)"; ctx.lineWidth = 8 * dpr;
        arcStroke(o, openIv[0], openIv[1]);
        ctx.strokeStyle = `rgba(127,212,255,${(.6 + .3 * Math.sin(t * 2.4 + o.c[0] * 40)).toFixed(2)})`;
        ctx.lineWidth = 2.4 * dpr;
        arcStroke(o, openIv[0], openIv[1]);
      }
      /* buried part: an earth mound becoming a street */
      if (bur) {
        ctx.strokeStyle = "#5a3d24"; ctx.lineWidth = 9 * dpr;
        arcStroke(o, bur[0], bur[1]);
        ctx.strokeStyle = "#7a5836"; ctx.lineWidth = 4.5 * dpr;
        arcStroke(o, bur[0], bur[1]);
        if (o.st === 2) {
          ctx.strokeStyle = "#574a35"; ctx.lineWidth = 1.2 * dpr;
          ctx.setLineDash([4 * dpr, 6 * dpr]);
          arcStroke(o, 0, o.L);
          ctx.setLineDash([]);
        }
      }
      /* markers: entry ends for untouched sections, work point when active */
      if (o.st === 0) {
        for (const e of [o.P[0], o.P[o.P.length - 1]]) {
          const [x, y] = PX(e[0], e[1]);
          ctx.strokeStyle = `rgba(255,206,122,${(.4 + .3 * Math.sin(t * 3 + e[0] * 30)).toFixed(2)})`;
          ctx.lineWidth = 1.6 * dpr;
          ctx.beginPath(); ctx.arc(x, y, 6 * dpr, 0, 6.3); ctx.stroke();
        }
      } else if (o.st === 1) {
        const [x, y] = PX(...workPoint(o));
        const pulse = 1 + .25 * Math.sin(t * 5);
        ctx.strokeStyle = "rgba(255,158,27,.9)"; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.arc(x, y, 8 * dpr * pulse, 0, 6.3); ctx.stroke();
      }
    }

    /* spoil heaps */
    for (const p of PILES) {
      const [x, y] = PX(p[0], p[1]);
      ctx.fillStyle = "#4e3a22";
      ctx.beginPath(); ctx.moveTo(x - 14 * dpr, y + 7 * dpr);
      ctx.quadraticCurveTo(x, y - 15 * dpr, x + 14 * dpr, y + 7 * dpr);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#6b4a2c";
      ctx.beginPath(); ctx.moveTo(x - 9 * dpr, y + 7 * dpr);
      ctx.quadraticCurveTo(x, y - 9 * dpr, x + 9 * dpr, y + 7 * dpr);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(196,176,144,.8)";
      for (let g = 0; g < 5; g++)
        ctx.fillRect(x + ((g * 53 % 17) - 8) * dpr, y + ((g * 31 % 9) - 6) * dpr, 1.5 * dpr, 1.5 * dpr);
      ctx.fillStyle = "rgba(240,227,198,.75)";
      ctx.font = `${8.5 * dpr}px ui-monospace,Menlo,monospace`;
      ctx.textAlign = "center";
      ctx.fillText("SPOIL", x, y + 18 * dpr);
      ctx.textAlign = "start";
    }

    /* the dozer */
    if (mode === "play" || mode === "won") {
      const [x, y] = PX(dz.x, dz.y);
      ctx.save(); ctx.translate(x, y); ctx.rotate(dz.a);
      const load = hopper / CAP;
      if (load > .04) {                                   // the carried heap, ahead of the blade
        ctx.fillStyle = "#6b4a2c";
        ctx.beginPath();
        ctx.ellipse(16 * dpr, 0, (4 + 6 * load) * dpr, (5 + 3 * load) * dpr, 0, 0, 6.3);
        ctx.fill();
      }
      ctx.fillStyle = "#2b2f35";                          // treads
      ctx.fillRect(-12 * dpr, -10 * dpr, 22 * dpr, 4.5 * dpr);
      ctx.fillRect(-12 * dpr, 5.5 * dpr, 22 * dpr, 4.5 * dpr);
      ctx.fillStyle = "#f2c12e";                          // body
      ctx.fillRect(-10 * dpr, -6.5 * dpr, 18 * dpr, 13 * dpr);
      ctx.fillStyle = "#1d2126";                          // cab
      ctx.fillRect(-7 * dpr, -3.5 * dpr, 7 * dpr, 7 * dpr);
      ctx.fillStyle = "#d8d8d2";                          // blade
      ctx.fillRect(9 * dpr, -9.5 * dpr, 3.5 * dpr, 19 * dpr);
      ctx.restore();

      /* hopper pips above the dozer */
      const pips = 5;
      for (let i = 0; i < pips; i++) {
        ctx.fillStyle = i < Math.round(load * pips) ? "#e8b93d" : "rgba(255,255,255,.15)";
        ctx.fillRect(x - (pips * 5 / 2 - i * 5) * dpr, y - 20 * dpr, 3.5 * dpr, 3.5 * dpr);
      }

      /* compass: to spoil when empty, to the nearest job when loaded */
      const tgt = hopper < CAP * .18 ? nearestPile() : nearestJob();
      if (tgt && mode === "play") {
        const d = Math.hypot(tgt[0] - dz.x, tgt[1] - dz.y);
        if (d > .09) {
          const ang = Math.atan2(tgt[1] - dz.y, tgt[0] - dz.x);
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
          ctx.fillStyle = hopper < CAP * .18
            ? `rgba(232,185,61,${(.5 + .3 * Math.sin(t * 4)).toFixed(2)})`
            : `rgba(127,212,255,${(.5 + .3 * Math.sin(t * 4)).toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(34 * dpr, 0); ctx.lineTo(22 * dpr, -7 * dpr); ctx.lineTo(22 * dpr, 7 * dpr);
          ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
    }

    /* HUD */
    yearEl.textContent = Math.round(year);
    popEl.textContent = Math.round(popAt(year)) + ",000";
    if (dirtEl) dirtEl.textContent = Math.round(hopper / CAP * 100) + "%";
    const pct = U.c01(sick / 100);
    sickEl.style.height = (pct * 100).toFixed(1) + "%";
    sickWrap.classList.toggle("hot", pct > .72);
  }

  function frame(now) {
    if (!running) return;
    const t = now / 1000, dt = Math.min(.05, t - lastT) * tscale; lastT = t;
    if (!paused && mode !== "lost" && mode !== "shown") {
      /* substep so fast-forward can't tunnel past pile/work radii */
      let rem = dt;
      while (rem > 1e-4 && mode !== "lost" && mode !== "shown") {
        const h = Math.min(.03, rem); update(h); rem -= h;
      }
    }
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function begin(asAuto) {
    init(); auto = asAuto; tscale = 1; running = true; paused = false;
    lastT = performance.now() / 1000;
    const a = A(); if (a) a.dozerStart();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  const game = {
    id: "bury", sceneId: "sc-bury",
    start: () => begin(false),
    skip: () => begin(true),
    restart: () => begin(auto),
    ff() {                                               // let the engineers finish, fast
      if (mode === "lost" || mode === "shown") return;
      auto = true; tscale = 6; paused = false;
      lastT = performance.now() / 1000;
      const a = A(); if (a && (mode === "play" || mode === "won")) a.dozerStart();
    },
    stop() { running = false; cancelAnimationFrame(raf); const a = A(); if (a) a.dozerStop(); },
    pause() { paused = true; const a = A(); if (a) a.dozerStop(); },
    resume() { paused = false; lastT = performance.now() / 1000;
               const a = A(); if (a && (mode === "play" || mode === "won")) a.dozerStart(); },
  };
  HR.island.register(game);
  HR.input.dpad(document.getElementById("bury-dpad"));
  HR._bury = () => ({ year: Math.round(year || 0), sick: Math.round(sick || 0),
    buried: SECS.filter(o => o.st === 2).length, total: N, mode, hopper, running, paused,
    x: dz && +dz.x.toFixed(3), y: dz && +dz.y.toFixed(3) });
  const winDone = winEl.querySelector(".g-done");
  if (winDone) winDone.addEventListener("click", () =>
    HR.island.finish(game, "win", { finishYear: doneYear }));
  const retry = failEl.querySelector(".g-retry");
  if (retry) retry.addEventListener("click", () => { failEl.classList.remove("on"); begin(false); });
  const concede = failEl.querySelector(".g-concede");
  if (concede) concede.addEventListener("click", () =>
    HR.island.finish(game, "epidemic", { finishYear: Math.round(year || 1894) }));
})();
