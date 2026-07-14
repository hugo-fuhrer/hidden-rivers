/* Hidden Rivers v2 — Phase 5: the daylighting run.
   Drive the dozer along Garrison Creek's buried alignment; the crew convoy
   behind you converts the trail — in layers, over time: first a raw earth cut,
   then water that clears from mud-brown to (exaggerated) blue, banks that
   green up, trees that grow in, and finally wildlife moving back to the river.
   Each layer's first appearance posts a real-world daylighting stat. There is
   no clock: the four gauges cross their safe thresholds as the dig advances.
   The frame is static — the whole alignment fits on screen at once, so the
   healing river is always in view and nothing ever scrolls. */
"use strict";
(() => {
  const U = HR.u;
  const WORLD = { w: 1600, h: 900 };
  const PATH = [[150, 140], [330, 260], [300, 430], [520, 540], [760, 560],
                [930, 700], [1180, 740], [1360, 820]];
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
  function normalAt(s) {                                  // unit normal to the path
    const [x, y] = pointAt(s);
    const [x2, y2] = pointAt(Math.min(TOTAL, s + 8));
    const nx = -(y2 - y), ny = x2 - x, L = Math.hypot(nx, ny) || 1;
    return [x, y, nx / L, ny / L];
  }
  /* trees along the banks: an inner row, then a later outer row of saplings */
  const TREES = [];
  for (let s = 40, k = 0; s < TOTAL; s += 44, k++) {
    const [x, y, nx, ny] = normalAt(s);
    const side = k % 2 ? 1 : -1;
    TREES.push({ s, x: x + nx * 46 * side, y: y + ny * 46 * side,
                 r: 9 + (k * 37 % 8), delay: 11 + (k * 13 % 5) });
  }
  for (let s = 64, k = 0; s < TOTAL; s += 76, k++) {
    const [x, y, nx, ny] = normalAt(s);
    const side = k % 2 ? -1 : 1;
    TREES.push({ s, x: x + nx * 76 * side, y: y + ny * 76 * side,
                 r: 6 + (k * 29 % 6), delay: 19 + (k * 11 % 6) });
  }
  TREES.sort((a, b) => a.s - b.s);

  /* the tail converts in DS-long buckets; each remembers when it converted,
     so every reach ages through the restoration stages independently */
  const DS = 24, NB = Math.ceil(TOTAL / DS) + 1;
  /* colour helpers (exaggerated on purpose — the story wants you to SEE it) */
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function cmix(h1, h2, t) {
    const a = hex(h1), b = hex(h2);
    t = U.c01(t);
    return `rgb(${Math.round(U.lerp(a[0], b[0], t))},${Math.round(U.lerp(a[1], b[1], t))},${Math.round(U.lerp(a[2], b[2], t))})`;
  }
  const bankCol = age => age < 4 ? "#6b4a2c"
    : age < 12 ? cmix("#6b4a2c", "#4e6c33", (age - 4) / 8)
    : cmix("#4e6c33", "#2f9e46", (age - 12) / 13);
  const waterCol = age => age < 3 ? "#5a4630"
    : age < 8 ? cmix("#7d6b4a", "#4c8d80", (age - 3) / 5)
    : cmix("#4c8d80", "#17c1f0", (age - 8) / 12);

  /* restoration milestones: each layer's debut posts a stat blurb */
  const BLURBS = [
    { key: "cut", kick: "channel open · storage returns", txt:
      "A pipe’s capacity is fixed the day it’s poured. An open channel with floodable banks holds several times more storm water — this is the room the city lost in 1884." },
    { key: "water", kick: "the water clears", txt:
      "Gravel beds and sunlight restart a stream’s self-cleaning. Seoul’s daylighted Cheonggyecheon went from 4 fish species to 25 within three years of reopening." },
    { key: "banks", kick: "the banks take root", txt:
      "Rooted banks drink the storm: vegetated soil soaks up rain that pavement sheds instantly — and keeps feeding the creek between storms." },
    { key: "trees", kick: "the trees come back", txt:
      "Hundreds of native trees line a restored kilometre; each mature canopy intercepts thousands of litres of rain a year and cools the corridor by degrees. Toronto’s ravines are ~17% of the city but hold most of its wild biodiversity — this is how the network knits back together." },
    { key: "wildlife", kick: "the animals vote first", txt:
      "Herons, kingfishers and dragonflies recolonize daylighted reaches within a few seasons. London’s Quaggy got its kingfishers back unaided; Seoul’s bird count rose from 6 species to 36." },
    { key: "done", kick: "a connected valley", txt:
      "Half a creek helps nobody downstream of the other half. Connected, the corridor moves water, wildlife and people end to end — and the storm finally has somewhere to land." },
  ];

  const CREW = 42, CORRIDOR = 95;
  const SAFE = { heat: 31, flood: 25, cso: 40, species: 40 };
  const A = () => (window.HR && HR.audio) ? HR.audio : null;

  const cv = document.getElementById("dozer-cv");
  const gEls = {
    heat: document.getElementById("dz-heat"), flood: document.getElementById("dz-flood"),
    cso: document.getElementById("dz-cso"), species: document.getElementById("dz-species"),
  };
  const winEl = document.getElementById("dozer-win");
  const blurbEl = document.getElementById("dz-blurb");

  let dz, progress, elapsed, mode, auto, announced;
  let convT, blurbSeen, blurbQ, blurbUntil, bonusAge;
  let running = false, paused = false, raf = 0, lastT = 0, tscale = 1;
  let tut;                                               // per-run tutorial progress

  function init() {
    dz = { x: PATH[0][0] - 60, y: PATH[0][1] - 40, a: .6 };
    progress = 0; elapsed = 0; mode = "play";
    announced = {}; bonusAge = 0;
    convT = new Float32Array(NB).fill(-1);
    blurbSeen = {}; blurbQ = []; blurbUntil = 0;
    tut = { rolled: false, dug: false, looked: false };
    if (blurbEl) { blurbEl.classList.remove("on"); blurbEl.innerHTML = ""; }
    winEl.classList.remove("on");
  }

  /* sequential coach marks */
  const T = () => (window.HR && HR.tutor) ? HR.tutor : null;
  function tutStart() {
    const t = T(); if (!t || auto) return;
    t.hint("dozer-roll", t.COARSE
      ? "Drag the <b>joystick</b> up to roll forward"
      : `Hold ${t.kbd("W")} to roll forward · ${t.kbd("A")}${t.kbd("D")} steer`,
      { ttl: 0 });
  }
  function tutTick(nearPath) {
    const t = T(); if (!t || auto || mode !== "play") return;
    if (!tut.rolled && progress > 30) {
      tut.rolled = true;
      t.clear("dozer-roll");
      t.hint("dozer-line",
        "Follow the dashed <b>creek line</b> — the crew digs behind you", { ttl: 8 });
    }
    if (!tut.dug && progress > TOTAL * .3) {
      tut.dug = true;
      t.hint("dozer-look",
        "Glance back — the river is coming to life in your wake", { ttl: 8 });
    }
    if (tut.rolled && progress < TOTAL && !nearPath) {
      t.nag("dozer-stray", "You’ve drifted — follow the <b>blue arrow</b> back to the line");
    } else {
      t.clear("dozer-stray");
    }
  }

  /* ── milestone blurbs: queued, one at a time ─────────────────────────── */
  function pushBlurb(key) {
    if (blurbSeen[key]) return;
    blurbSeen[key] = 1;
    const b = BLURBS.find(x => x.key === key);
    if (b) { blurbQ.push(b); HR.live(b.kick + ". " + b.txt); }
  }
  function tickBlurbs() {
    if (!blurbEl) return;
    const now = performance.now() / 1000;
    if (blurbQ.length && now >= blurbUntil) {
      while (blurbQ.length > 2) blurbQ.shift();           // fast-forward: keep it current
      const b = blurbQ.shift();
      blurbEl.innerHTML = `<p class="bk">🌿 ${b.kick}</p><p>${b.txt}</p>`;
      blurbEl.classList.add("on");
      blurbUntil = now + 9;                               // no storm clock: let it breathe
    } else if (!blurbQ.length && now >= blurbUntil && blurbEl.classList.contains("on")) {
      blurbEl.classList.remove("on");
    }
  }
  /* age (seconds since conversion) of a reach; bonusAge keeps the tail
     healing cosmetically behind the win screen without touching the clock */
  const eAge = () => elapsed + bonusAge;
  const age0 = () => convT[0] >= 0 ? eAge() - convT[0] : -1;
  const ageAt = s => { const i = Math.min(NB - 1, s / DS | 0); return convT[i] >= 0 ? eAge() - convT[i] : -1; };

  function gauges() {
    const d = progress / TOTAL;                           // restoration alone moves the needles
    return {
      heat: 34 - 6 * d,
      flood: 78 - 70 * d,
      cso: 120 - 110 * d,
      species: 3 + 58 * d,
    };
  }
  const allSafe = g => g.heat < SAFE.heat && g.flood < SAFE.flood &&
                       g.cso < SAFE.cso && g.species > SAFE.species;

  function update(dt) {
    const speed = auto ? 2.4 : 1;
    elapsed += dt * speed;

    /* drive — the cap is deliberately low: this run is a stroll, not a race */
    const ax = auto ? autoAxes() : HR.input.axes;
    dz.a += ax.x * 1.7 * dt;
    const [fx, fy] = pointAt(Math.min(TOTAL, progress + 30));
    const nearPath = U.dist(dz.x, dz.y, fx, fy) < CORRIDOR;
    const v = (nearPath ? 105 : 85) * -ax.y;             // W = up = forward
    dz.x = U.clamp(dz.x + Math.cos(dz.a) * v * dt, 30, WORLD.w - 30);
    dz.y = U.clamp(dz.y + Math.sin(dz.a) * v * dt, 30, WORLD.h - 30);

    /* the dig advances while you lead the frontier */
    if (nearPath && progress < TOTAL)
      progress = Math.min(TOTAL, progress + CREW * dt * speed * (auto ? 3 : 1));

    /* the crew's finished tail: stamp conversion times per reach */
    const convNow = Math.max(0, progress - 120);
    for (let i = 0; i * DS <= convNow && i < NB; i++)
      if (convT[i] < 0) convT[i] = elapsed;
    if (progress >= TOTAL)                                 // the crew catches up at the end
      for (let i = 0; i < NB; i++) if (convT[i] < 0) convT[i] = elapsed;

    /* layer debuts → stat blurbs */
    const a0 = age0();
    if (convNow > 30) pushBlurb("cut");
    if (a0 > 8) pushBlurb("water");
    if (a0 > 13) pushBlurb("banks");
    if (a0 > 17) pushBlurb("trees");
    if (a0 > 22) pushBlurb("wildlife");
    if (progress >= TOTAL) pushBlurb("done");

    /* the dozer engine bogs down harder while it's actually cutting channel */
    const aud = A();
    if (aud) {
      aud.dozerLoad(nearPath && Math.abs(ax.y) > .1 ? .95 : .35);
      /* the soundscape heals with the river: streamflow grows with the open
         channel, birds arrive with the trees, fish plop in the oldest water */
      aud.gameAmb({
        stream: .12 + .78 * (convNow / TOTAL),
        birds: U.c01((a0 - 13) / 8) * .85,
      });
      if (a0 > 13 && Math.random() < dt * .3) aud.sfx.bloop();
    }
    tutTick(nearPath);

    const g = gauges();
    for (const k of ["heat", "flood", "cso", "species"]) {
      const safe = k === "species" ? g[k] > SAFE[k] : g[k] < SAFE[k];
      if (safe && !announced[k]) { announced[k] = 1; if (aud) aud.sfx.success(); HR.live(HR.COPY.dozer.safe(k)); }
    }
    if (mode === "play" && allSafe(g) && progress > TOTAL * .5) {
      mode = "won"; if (aud) { aud.dozerStop(); aud.sfx.win(); }
      HR.live(HR.COPY.dozer.won);
      setTimeout(() => winEl.classList.add("on"), 900);
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
    /* static frame: the whole alignment fits on screen at once — no camera.
       Leave a band at the bottom clear for the gauge bar. */
    const pad = 12 * dpr, hudH = 92 * dpr;
    const Z = Math.min((W - 2 * pad) / WORLD.w, (H - hudH - pad) / WORLD.h);
    const ox = (W - WORLD.w * Z) / 2;
    const oy = pad + (H - hudH - pad - WORLD.h * Z) / 2;
    const PX = (x, y) => [x * Z + ox, y * Z + oy];

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
    /* the crew's working zone: torn-up earth between the tail and the dozer */
    const conv = progress >= TOTAL ? TOTAL : Math.max(0, progress - 120);
    if (progress > conv + 8) {
      trail(conv, progress, 40 * Z, "rgba(90,70,48,.55)");
      trail(conv, progress, 16 * Z, "#5a4630");
    }

    /* the finished tail, layered by age: each DS-long reach remembers when it
       was converted and ages through the stages on its own — dirt cut →
       water clearing brown→blue → banks greening → trees → wildlife */
    if (conv > 4) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      /* quantize each bucket's age into a colour band, then stroke runs of
         equal-band buckets as single smooth paths (per-bucket strokes read
         as scalloped blobs because the trail is wider than a bucket) */
      const nBuck = Math.min(NB, Math.ceil(conv / DS));
      const band = i => {
        const age = convT[i] >= 0 ? eAge() - convT[i] : 0;
        return Math.min(26, age / 1.1 | 0);
      };
      const runs = [];
      for (let i = 0; i < nBuck;) {
        const b0 = band(i);
        let j = i + 1;
        while (j < nBuck && band(j) === b0) j++;
        runs.push([i * DS, Math.min(conv, j * DS + 2), b0 * 1.1 + .55]);
        i = j;
      }
      for (const [a, b, age] of runs) trail(a, b, 52 * Z, bankCol(age));
      for (const [a, b, age] of runs) trail(a, b, 28 * Z, waterCol(age));
      for (const [a, b, age] of runs)
        if (age > 9)                                        // sparkle on clear water
          trail(a, b, 6 * Z, `rgba(190,244,255,${((.2 + .25 * Math.sin(t * 2 + a)) * U.c01((age - 9) / 4)).toFixed(2)})`);
      /* trees: appear per-reach, grow from sapling to canopy */
      for (const tr of TREES) {
        if (tr.s > conv) break;
        const ta = ageAt(tr.s);
        const grow = U.c01((ta - tr.delay) / 5);
        if (grow <= 0) continue;
        const [x, y] = PX(tr.x, tr.y);
        const r = tr.r * Z * (.25 + .75 * grow);
        ctx.fillStyle = cmix("#55703a", "#2e8d3e", grow);
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.12)";            // canopy highlight
        ctx.beginPath(); ctx.arc(x - r * .3, y - r * .3, r * .45, 0, 6.3); ctx.fill();
      }
      drawWildlife(t, Z, PX, conv);
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

    /* HUD */
    const g = gauges();
    setGauge("heat", g.heat, 28, 35, true, "°C");
    setGauge("flood", g.flood, 0, 85, true, "%");
    setGauge("cso", g.cso, 0, 130, true, "M$/yr");
    setGauge("species", g.species, 0, 65, false, " species");
  }

  /* wildlife returns to the oldest reaches: ducks ride the clear water, fish
     jump, herons fish from the banks, songbirds circle the canopy and
     dragonflies dart over the shallows. All deterministic per reach. */
  function drawWildlife(t, Z, PX, conv) {
    const ctx = cv.getContext("2d");
    /* ducks: a trio cruising the oldest clear water */
    let sLim = 0;
    for (let i = 0; i * DS < conv; i++) if (convT[i] >= 0 && eAge() - convT[i] > 12) sLim = (i + 1) * DS;
    if (sLim > 180) {
      const sd = 40 + (t * 24) % (Math.min(sLim, conv) - 80);
      for (let k = 0; k < 3; k++) {
        const [x, y] = PX(...pointAt(Math.max(0, sd - k * 22)));
        const bob = Math.sin(t * 2.2 + k) * 1.4 * Z;
        ctx.fillStyle = "#6b4f2f";
        ctx.beginPath(); ctx.ellipse(x, y + bob, 6.5 * Z * (1 - k * .12), 4 * Z, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = "#2e5e3a";
        ctx.beginPath(); ctx.arc(x + 5 * Z, y + bob - 3.5 * Z, 2.8 * Z, 0, 6.3); ctx.fill();
        /* wake */
        ctx.strokeStyle = "rgba(230,250,255,.25)"; ctx.lineWidth = Z;
        ctx.beginPath(); ctx.moveTo(x - 7 * Z, y + bob + 2 * Z); ctx.lineTo(x - 14 * Z, y + bob + 4 * Z); ctx.stroke();
      }
    }
    for (let i = 0; i * DS < conv; i++) {
      const age = convT[i] >= 0 ? eAge() - convT[i] : 0;
      const s = i * DS + 10;
      /* fish jump — a silver flash and a ripple, on a slow cycle */
      if (age > 13 && i % 23 === 7) {
        const ph = ((t * .55 + i * .41) % 3) / .45;         // 0..~6.7, jump when <1
        if (ph < 1) {
          const [x, y] = PX(...pointAt(s));
          const hop = Math.sin(ph * Math.PI) * 12 * Z;
          ctx.strokeStyle = "rgba(220,238,248,.9)"; ctx.lineWidth = 2.4 * Z;
          ctx.beginPath();
          ctx.arc(x, y - hop, 4.5 * Z, .4, 2.6);            // little silver arc
          ctx.stroke();
          ctx.strokeStyle = "rgba(230,250,255,.4)"; ctx.lineWidth = Z;
          ctx.beginPath(); ctx.ellipse(x, y + 2 * Z, (6 + ph * 8) * Z, 2.5 * Z, 0, 0, 6.3); ctx.stroke();
        }
      }
      /* heron: stalking the bank of a mature reach */
      if (age > 16 && i % 37 === 5) {
        const [px, py, nx, ny] = normalAt(s);
        const side = i % 2 ? 1 : -1;
        const [x, y] = PX(px + nx * 24 * side, py + ny * 24 * side);
        ctx.strokeStyle = "#9fb6c8"; ctx.lineWidth = 1.6 * Z; ctx.lineCap = "round";
        ctx.beginPath();                                     // legs
        ctx.moveTo(x - 2 * Z, y); ctx.lineTo(x - 2 * Z, y - 9 * Z);
        ctx.moveTo(x + 2 * Z, y); ctx.lineTo(x + 1.5 * Z, y - 9 * Z);
        ctx.stroke();
        ctx.fillStyle = "#9fb6c8";                           // body
        ctx.beginPath(); ctx.ellipse(x, y - 12 * Z, 7 * Z, 4.5 * Z, -.3, 0, 6.3); ctx.fill();
        ctx.strokeStyle = "#9fb6c8"; ctx.lineWidth = 2 * Z;  // S-neck
        ctx.beginPath(); ctx.moveTo(x + 5 * Z, y - 14 * Z);
        ctx.quadraticCurveTo(x + 10 * Z, y - 20 * Z, x + 7 * Z, y - 24 * Z); ctx.stroke();
        ctx.fillStyle = "#e8b93d";                           // beak
        ctx.beginPath(); ctx.moveTo(x + 7 * Z, y - 25 * Z);
        ctx.lineTo(x + 14 * Z, y - 23.5 * Z); ctx.lineTo(x + 7 * Z, y - 22.5 * Z);
        ctx.closePath(); ctx.fill();
      }
      /* songbirds circling the canopy */
      if (age > 18 && i % 29 === 11) {
        const [x0, y0] = PX(...pointAt(s));
        ctx.strokeStyle = "rgba(46,62,74,.85)"; ctx.lineWidth = 1.6 * Z;
        for (let k = 0; k < 2; k++) {
          const bx = x0 + Math.cos(t * .9 + i + k * 2.4) * 34 * Z;
          const by = y0 - 34 * Z + Math.sin(t * 1.3 + i + k * 1.7) * 12 * Z;
          const w = Math.sin(t * 9 + k * 2) * 2.5 * Z;
          ctx.beginPath();
          ctx.moveTo(bx - 5 * Z, by); ctx.quadraticCurveTo(bx - 2.5 * Z, by - 4 * Z + w, bx, by);
          ctx.quadraticCurveTo(bx + 2.5 * Z, by - 4 * Z + w, bx + 5 * Z, by);
          ctx.stroke();
        }
      }
      /* dragonfly darting over the shallows */
      if (age > 15 && i % 31 === 17) {
        const [px, py, nx, ny] = normalAt(s);
        const dxs = Math.sin(t * 1.7 + i) * 26, dys = Math.cos(t * 2.3 + i) * 12;
        const [x, y] = PX(px + nx * dxs, py + ny * dys);
        ctx.strokeStyle = "#2c8ca8"; ctx.lineWidth = 1.4 * Z;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5 * Z, y + Z); ctx.stroke();
        ctx.fillStyle = `rgba(154,223,238,${Math.sin(t * 22 + i) > 0 ? .85 : .35})`;
        ctx.beginPath(); ctx.ellipse(x - Z, y - Z, 3.6 * Z, 1.3 * Z, -.4, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x - .5 * Z, y + Z, 3.6 * Z, 1.3 * Z, .4, 0, 6.3); ctx.fill();
      }
    }
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
  function frame(now) {
    if (!running) return;
    const t = now / 1000, dt = Math.min(.05, t - lastT) * tscale; lastT = t;
    if (!paused && (mode === "play")) update(dt);
    else if (!paused && mode === "won") bonusAge += dt;    // the tail keeps healing behind the win
    if (!paused) tickBlurbs();
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function begin(asAuto) {
    init(); auto = asAuto; tscale = 1; running = true; paused = false;
    lastT = performance.now() / 1000;
    const a = A(); if (a) a.dozerStart();
    tutStart();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  const game = {
    id: "dozer", sceneId: "sc-dozer",
    keys: { w: "forward", a: "steer left", s: "reverse", d: "steer right" },
    start: () => begin(false),
    skip: () => begin(true),
    restart: () => begin(auto),
    ff() {                                               // crew finishes the run, fast
      if (mode !== "play") return;
      auto = true; tscale = 6; paused = false;
      lastT = performance.now() / 1000;
      const a = A(); if (a) a.dozerStart();
    },
    stop() { running = false; cancelAnimationFrame(raf);
             const a = A(); if (a) { a.dozerStop(); a.gameAmbClear(); } },
    pause() { paused = true; const a = A(); if (a) { a.dozerStop(); a.gameAmbClear(); } },
    resume() { paused = false; lastT = performance.now() / 1000;
               const a = A(); if (a && mode === "play") a.dozerStart(); },
  };
  HR.island.register(game);
  HR.input.dpad(document.getElementById("dozer-dpad"));
  const winDone = winEl.querySelector(".g-done");
  if (winDone) winDone.addEventListener("click", () =>
    HR.island.finish(game, "win", { runSec: Math.round(elapsed) }));
})();
