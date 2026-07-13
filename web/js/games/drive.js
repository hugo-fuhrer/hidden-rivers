/* Hidden Rivers v2 — Phase 1: "Get Home" — a tutorial run, then the real one.
   Top-down grid driving across two Toronto maps as the July 16 storm builds.
   The tutorial (the Beaches) is honest and quick to win: the flood rises
   along the buried creek but a connected route home is always preserved,
   while the coach marks teach the controls. The real drive home crosses
   Garrison Creek's valley and is rigged by a Director — fairly: every
   blockage is telegraphed, the player is never trapped instantly, and the
   loss screen reveals that the failed routes trace the buried creek. The
   tutorial win exists so the loss lands as the map's fault, not the
   player's. */
"use strict";
(() => {
  const U = HR.u;
  const SPEED = 2.3;                                     // cells per second

  /* ── the two runs ───────────────────────────────────────────────────────
     Each level is its own map: grid size, start/home, the buried creeks the
     water follows, pacing, and the recognisable Toronto set dressing. */
  const LEVELS = [
    {
      name: "THE BEACHES", tag: "TUTORIAL · LIGHT RAIN",
      chip: "TUTORIAL · THE BEACHES",
      clock: [5, 41],                                    // 5:41 p.m.
      nx: 9, ny: 7, home: { x: 1, y: 1 }, start: { x: 7, y: 5 },
      creeks: [                                          // Small's Creek, roughly
        [[4.6, -.5], [4.15, .9], [4.55, 2.3], [4.05, 3.8], [4.5, 5.1], [4.2, 6.5]],
      ],
      floodT: 58, stormT: 62, rain: .35,
      thunder: [9, 16, .45], sirens: false,
      fair: true, rigged: false, tele: null,
      tram: { y: 3, label: "QUEEN ST E" },
      parks: [
        { cx: 1, cy: 3, w: 2, h: 2, n: "KEW GARDENS" },
        { cx: 6, cy: 0, w: 2, h: 2, n: "GLEN STEWART\nRAVINE" },
      ],
      specials: [],
      vlabels: [{ x: 2, n: "WOODBINE AVE" }, { x: 6, n: "BEECH AVE" }],
      margin: { lake: true, beach: true },
      win: {
        kick: "5:44 P.M. · HOME",
        title: "Made it — soaked, and fine.",
        body: "That was the easy part: an errand in the Beaches, short blocks, " +
              "the lake right there. Now the radar shows the real storm " +
              "stalling over the west end — and that's where the drive home " +
              "begins.",
        stats: "Rain so far: 31 mm · Streets lost: a handful · The 501: still running",
        btn: "The real run · the West End ↓",
      },
    },
    {
      name: "THE WEST END", tag: "THE DRIVE HOME · THE BAND THAT STALLS",
      chip: "THE DRIVE HOME · THE WEST END",
      clock: [6, 12],
      nx: 11, ny: 8, home: { x: 1, y: 1 }, start: { x: 9, y: 6 },
      creeks: [                                          // Garrison Creek + branch
        [[3.4, -.5], [3.0, 1.2], [3.6, 2.8], [2.8, 4.4], [3.4, 6.0], [2.9, 7.5]],
        [[7.6, -.5], [7.1, 1.5], [7.7, 3.2], [6.9, 5.0], [7.5, 7.5]],
      ],
      floodT: 90, stormT: 85, rain: .95,
      thunder: [4, 9, 1], sirens: true,
      fair: false, rigged: true, tele: null,
      tram: { y: 5, label: "QUEEN ST W" },
      parks: [                                           // the giveaway: parks ON the creek
        { cx: 2, cy: 0, w: 1, h: 1, n: "CHRISTIE PITS" },
        { cx: 2, cy: 2, w: 1, h: 1, n: "BICKFORD PARK" },
        { cx: 2, cy: 3, w: 2, h: 2, n: "TRINITY\nBELLWOODS" },
      ],
      specials: [{ cx: 4, cy: 6, k: "fort" }],
      vlabels: [{ x: 5, n: "BATHURST ST" }, { x: 8, n: "SPADINA AVE" }],
      margin: { lake: true, gardiner: true },
      win: null,                                         // there is no winning this one
    },
  ];
  const LAST = LEVELS.length - 1;

  /* ── per-level grid (rebuilt by loadLevel) ──────────────────────────── */
  let L = LEVELS[0], LVL = 0;
  let NX, NY, NH, NE, HOME, START, CREEKS;
  let elev, WIN, covered;                                // covered: cells art owns

  /* edge ids: H edge (x,y)-(x+1,y) → y*(NX-1)+x ; V edge (x,y)-(x,y+1) → NH+y*NX+x */
  const eH = (x, y) => y * (NX - 1) + x;
  const eV = (x, y) => NH + y * NX + x;
  function edgeEnds(e) {
    if (e < NH) { const y = (e / (NX - 1)) | 0, x = e % (NX - 1); return [x, y, x + 1, y]; }
    const i = e - NH, y = (i / NX) | 0, x = i % NX; return [x, y, x, y + 1];
  }
  function edgeBetween(ax, ay, bx, by) {
    if (ay === by) return eH(Math.min(ax, bx), ay);
    return eV(ax, Math.min(ay, by));
  }
  function incident(x, y) {
    const out = [];
    if (x > 0) out.push([eH(x - 1, y), x - 1, y]);
    if (x < NX - 1) out.push([eH(x, y), x + 1, y]);
    if (y > 0) out.push([eV(x, y - 1), x, y - 1]);
    if (y < NY - 1) out.push([eV(x, y), x, y + 1]);
    return out;
  }

  function loadLevel(i) {
    LVL = i; L = LEVELS[i];
    NX = L.nx; NY = L.ny;
    NH = (NX - 1) * NY; NE = NH + NX * (NY - 1);
    HOME = L.home; START = L.start; CREEKS = L.creeks;

    /* static elevation: distance from edge midpoint to the nearest creek,
       plus deterministic jitter so the creek "walls" keep gaps early on —
       the water closes them over the round instead of all at once */
    elev = new Float32Array(NE);
    for (let e = 0; e < NE; e++) {
      const [ax, ay, bx, by] = edgeEnds(e);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      let d = 99;
      for (const c of CREEKS)
        for (let k = 0; k < c.length - 1; k++)
          d = Math.min(d, U.segDist(mx, my, c[k][0], c[k][1], c[k + 1][0], c[k + 1][1]));
      const jit = ((e * 2654435761 >>> 0) % 1000) / 1000;
      elev[e] = d + jit * 1.1;
    }

    /* which cells the set dressing owns (no generic buildings there) */
    covered = new Set();
    for (const p of L.parks || [])
      for (let cy = p.cy; cy < p.cy + p.h; cy++)
        for (let cx = p.cx; cx < p.cx + p.w; cx++) covered.add(cx + "," + cy);
    for (const s of L.specials || []) covered.add(s.cx + "," + s.cy);
    if (L.rail) for (let cx = 0; cx < NX - 1; cx++) covered.add(cx + "," + L.rail.cy);

    /* window dots per block, deterministic per level */
    WIN = [];
    let seed = 5 + i * 97;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let cy = 0; cy < NY - 1; cy++) for (let cx = 0; cx < NX - 1; cx++) {
      const dots = [];
      const n = 2 + (rnd() * 4 | 0);
      for (let k = 0; k < n; k++) dots.push([rnd(), rnd()]);
      WIN.push(dots);
    }
    if (levelEl) levelEl.textContent = L.chip;
  }

  /* ── mutable game state ─────────────────────────────────────────────── */
  let st, tT, fT;                                        // edge state / telegraph deadline / flood time
  let player, elapsed, mode, dyingT, wonT, revealOn, auto, autoPath;
  let endgame, endT, Unode, lastSim, lastDir, raf = 0, running = false, paused = false, lastT = 0;
  let tut;                                               // per-run tutorial progress
  let tscale = 1;                                        // >1 while fast-forwarding to the end
  let totalT = 0;                                        // seconds driven across all runs
  let introT = 0, flashA = 0;                            // level banner / lightning flash
  let nextThunder = 0, nextSiren = 0, nextHorn = 0, lastSurge = -9, dingDone = false;
  let tram;                                              // the streetcar, poor thing
  const cv = document.getElementById("drive-cv");
  const clockEl = document.getElementById("drive-clock");
  const levelEl = document.getElementById("drive-level");
  const lossEl = document.getElementById("drive-loss");
  const winEl = document.getElementById("drive-win");
  const survEl = document.getElementById("drive-surv");
  const stormFill = document.getElementById("drive-stormfill");
  const stormWrap = document.getElementById("drive-storm");
  const dwKick = document.getElementById("dw-kick");
  const dwTitle = document.getElementById("dw-title");
  const dwBody = document.getElementById("dw-body");
  const dwStats = document.getElementById("dw-stats");
  const dwNext = document.getElementById("dw-next");
  const A = () => (window.HR && HR.audio) ? HR.audio : null;

  function init(lvl) {
    loadLevel(lvl);
    st = new Uint8Array(NE); tT = new Float32Array(NE); fT = new Float32Array(NE).fill(-1);
    player = { x: START.x, y: START.y, tx: START.x, ty: START.y, prog: 0, moving: false,
               bump: 0, bdx: 0, bdy: 0 };
    elapsed = 0; mode = "play"; dyingT = 0; wonT = 0; revealOn = false; endgame = false; endT = 0;
    Unode = null; lastSim = 0; lastDir = 0; autoPath = null;
    introT = 0; flashA = 0; lastSurge = -9; dingDone = false;
    nextThunder = 2.5 + Math.random() * 4;
    nextSiren = 6 + Math.random() * 6; nextHorn = 4 + Math.random() * 5;
    tram = L.tram ? { x: .2, dir: 1, stalled: false } : null;
    tut = { moved: false, bumped: false };
    lossEl.classList.remove("on");
    if (winEl) winEl.classList.remove("on");
    /* per-run weather: visual rain (main.js reads this) + wind bed */
    if (window.HR) HR._gameRain = L.rain;
    const a = A(); if (a) a.gameAmb({ wind: [.15, .5][lvl] || .2 });
    HR.live(`${L.chip}. Drive home.`);
  }

  /* sequential coach marks — the engage card no longer explains anything */
  const T = () => (window.HR && HR.tutor) ? HR.tutor : null;
  function tutStart() {
    const t = T(); if (!t || auto) return;
    if (LVL === 0) {
      t.hint("drive-move", t.COARSE
        ? "Touch and drag the <b>joystick</b> to drive"
        : `Drive with ${t.kbd("W")}${t.kbd("A")}${t.kbd("S")}${t.kbd("D")} or the arrow keys`,
        { ttl: 0 });
    } else {
      t.hint("drive-l3", "This is <b>Garrison Creek</b> country — the lowest ground in the west end", { ttl: 7 });
    }
  }
  function tutMoved() {
    const t = T(); if (!t || auto || tut.moved) return;
    tut.moved = true;
    if (LVL === 0) {
      t.clear("drive-move");
      setTimeout(() => t.hint("drive-goal",
        "Reach the green <b>HOME</b> pin — before the water finds you", { ttl: 7 }), 700);
    }
  }
  function tutBumped() {
    const t = T(); if (!t || auto || tut.bumped) return;
    tut.bumped = true;
    t.hint("drive-bump",
      "Dark water = street gone · flashing orange = about to flood", { ttl: 7 });
  }

  /* BFS over open edges (state 0 only — barricades already block) */
  function bfs(sx, sy) {
    const dist = new Int16Array(NX * NY).fill(-1);
    const par = new Int16Array(NX * NY).fill(-1);
    const q = [sy * NX + sx]; dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const n = q[h], x = n % NX, y = (n / NX) | 0;
      for (const [e, nx2, ny2] of incident(x, y)) {
        if (st[e] !== 0) continue;
        const m = ny2 * NX + nx2;
        if (dist[m] === -1) { dist[m] = dist[n] + 1; par[m] = n; q.push(m); }
      }
    }
    return { dist, par };
  }
  function pathTo(b, tx, ty) {
    const goal = ty * NX + tx;
    if (b.dist[goal] === -1) return null;
    const nodes = [];
    for (let n = goal; n !== -1; n = b.par[n]) nodes.push(n);
    return nodes.reverse();                              // [start … goal]
  }
  const playerEdge = () => player.moving
    ? edgeBetween(player.x, player.y, player.tx, player.ty) : -1;

  /* would closing e sever the player from home? (fair levels never allow it) */
  function homeStaysReachable(e) {
    const keep = st[e]; st[e] = 2;
    const sx = player.moving ? player.tx : player.x;
    const sy = player.moving ? player.ty : player.y;
    const ok = bfs(sx, sy).dist[HOME.y * NX + HOME.x] !== -1;
    st[e] = keep;
    return ok;
  }

  function telegraph(e, dur) {
    if (st[e] !== 0 || e === playerEdge()) return false;
    st[e] = 1; tT[e] = elapsed + dur;
    HR.live(HR.COPY.drive.blocked);
    return true;
  }
  function flood(e) {
    if (e === playerEdge()) { st[e] = 0; return; }       // G1: never under the car
    st[e] = 2; fT[e] = elapsed;
    /* water taking a street nearby is audible */
    const [ax, ay, bx, by] = edgeEnds(e);
    const d = Math.hypot((ax + bx) / 2 - player.x, (ay + by) / 2 - player.y);
    if (d < 2.4 && elapsed - lastSurge > 1.5 && mode === "play") {
      lastSurge = elapsed;
      const a = A(); if (a) a.sfx.surge();
    }
  }

  /* ── simulation + director ──────────────────────────────────────────── */
  function update(dt) {
    elapsed += dt; introT += dt;
    /* telegraphs mature */
    for (let e = 0; e < NE; e++) if (st[e] === 1 && elapsed >= tT[e]) flood(e);

    /* honest sim: water rises along the creeks (2 Hz). On the fair runs an
       edge whose loss would sever the way home is postponed instead — the
       corridor narrows but never closes. Run 3 gets no such mercy. */
    if (elapsed - lastSim > .5) {
      lastSim = elapsed;
      const wl = .2 + (elapsed / L.floodT) * 2.0;
      for (let e = 0; e < NE; e++) {
        if (st[e] !== 0 || elev[e] > wl || e === playerEdge()) continue;
        if (L.fair && mode === "play" && !homeStaysReachable(e)) {
          elev[e] = wl + .6;                             // try again later
          continue;
        }
        flood(e);
      }
    }

    tramTick(dt);

    if (mode === "won") {                                // hold for the win card
      wonT += dt;
      if (auto && wonT > 2.6 && LVL < LAST) advance();
      return;
    }
    if (mode !== "play") return updateDying(dt);

    const b = bfs(player.x, player.y);
    let path = pathTo(b, HOME.x, HOME.y);

    if (L.rigged) {
      if (!path && !endgame) startEndgame(b);

      /* moat: home is never allowed closer than ~4 edges */
      let guard = 4;
      while (path && path.length - 1 <= 4 && guard--) {
        let pick = -1;
        for (let i = path.length - 2; i >= 0; i--) {     // nearest home first
          const e = edgeBetween(path[i] % NX, (path[i] / NX) | 0,
                                path[i + 1] % NX, (path[i + 1] / NX) | 0);
          const dA = b.dist[path[i]], okFar = dA >= 2;
          if (st[e] === 0 && okFar) { pick = e; break; }
        }
        if (pick === -1) break;
        telegraph(pick, .8);
        const b2 = bfs(player.x, player.y);
        path = pathTo(b2, HOME.x, HOME.y);
        if (!path && !endgame) startEndgame(b2);
      }

      /* director beat */
      const grace = auto ? 5 : 12;
      const interval = elapsed > 70 ? 1.6 : (auto ? 2.5 : 4);
      if (!endgame && elapsed > grace && elapsed - lastDir > interval && path && path.length > 5) {
        lastDir = elapsed;
        const cands = [];
        for (let i = 2; i <= Math.min(4, path.length - 2); i++) {
          const e = edgeBetween(path[i] % NX, (path[i] / NX) | 0,
                                path[i + 1] % NX, (path[i + 1] / NX) | 0);
          if (st[e] === 0 && b.dist[path[i]] >= 2) cands.push(e);
        }
        cands.sort((a, c) => elev[a] - elev[c]);         // prefer the low ground
        if (cands.length) telegraph(cands[0], 1.2);
      }

      /* endgame funnel: shrink the dry pocket toward the underpass U */
      if (endgame) {
        endT += dt;
        if (endT > (Unode ? 1.0 : 0) && (endT % 1.0) < dt && Unode) {
          const b3 = bfs(Unode.x, Unode.y);
          const keep = pathTo(bfs(player.x, player.y), Unode.x, Unode.y);
          const keepSet = new Set();
          if (keep) for (let i = 0; i < keep.length - 1; i++)
            keepSet.add(edgeBetween(keep[i] % NX, (keep[i] / NX) | 0,
                                    keep[i + 1] % NX, (keep[i + 1] / NX) | 0));
          let far = -1, farD = -1;
          for (let e = 0; e < NE; e++) {
            if (st[e] !== 0 || keepSet.has(e) || e === playerEdge()) continue;
            const [ax, ay, bx2, by2] = edgeEnds(e);
            const d = Math.max(b3.dist[ay * NX + ax], b3.dist[by2 * NX + bx2]);
            if (d > farD) { farD = d; far = e; }
          }
          if (far !== -1) flood(far);
        }
        /* G4: never lose before the round has had time to feel winnable */
        const minT = auto ? 18 : 42;
        const atU = Unode && player.x === Unode.x && player.y === Unode.y && !player.moving;
        if ((atU || endT > 8) && elapsed >= minT) beginDying();
      }
    } else if (L.tele && elapsed > L.tele.after && elapsed - lastDir > L.tele.every
               && path && path.length > 3) {
      /* fair-level pressure: block a street a couple of moves ahead so the
         run needs detours — but only cuts that leave a way home */
      lastDir = elapsed;
      for (let i = 1; i <= Math.min(3, path.length - 2); i++) {
        const e = edgeBetween(path[i] % NX, (path[i] / NX) | 0,
                              path[i + 1] % NX, (path[i + 1] / NX) | 0);
        if (st[e] === 0 && b.dist[path[i]] >= 1 && homeStaysReachable(e)) {
          telegraph(e, 1.1);
          break;
        }
      }
    }

    weather(dt);
    movePlayer(dt);

    /* the fair runs end the honest way: at the front door */
    if (mode === "play" && !L.rigged && !player.moving
        && player.x === HOME.x && player.y === HOME.y && elapsed > .5) beginWin();
  }

  /* thunder, sirens, horns, the streetcar bell — the city as a soundtrack */
  function weather(dt) {
    const a = A();
    if (elapsed >= nextThunder) {
      const [g0, g1, pow] = L.thunder;
      nextThunder = elapsed + g0 + Math.random() * (g1 - g0);
      flashA = 1;
      /* light first, sound after — nearby strikes arrive almost at once */
      const pw = pow * (.75 + Math.random() * .35);
      if (a) a.sfx.thunder(pw, pw > .65 ? .05 + Math.random() * .15
                                        : .35 + Math.random() * .9);
    }
    if (!a) return;
    if (!dingDone && tram && elapsed > 1.2) { dingDone = true; a.sfx.ding(); }
    let flooded = 0;
    for (let e = 0; e < NE; e++) if (st[e] === 2) flooded++;
    if (L.sirens && flooded > NE * .1 && elapsed >= nextSiren) {
      nextSiren = elapsed + 9 + Math.random() * 8;
      a.sfx.siren();
    }
    if (flooded > NE * .06 && elapsed >= nextHorn) {
      nextHorn = elapsed + 5 + Math.random() * 7;
      a.sfx.horn();
    }
  }

  function tramTick(dt) {
    if (!tram || tram.stalled) return;
    tram.x += tram.dir * dt * .5;
    if (tram.x > NX - 1.2) { tram.x = NX - 1.2; tram.dir = -1; }
    if (tram.x < .2) { tram.x = .2; tram.dir = 1; }
    const e = eH(Math.max(0, Math.min(NX - 2, tram.x | 0)), L.tram.y);
    if (st[e] !== 0) tram.stalled = true;                // dead in the water
  }

  function startEndgame(b) {
    endgame = true; endT = 0;
    let best = null, bestScore = 1e9;
    for (let n = 0; n < NX * NY; n++) {
      if (b.dist[n] < 1) continue;                       // reachable, not where we stand
      const x = n % NX, y = (n / NX) | 0;
      let lo = 99;
      for (const [e] of incident(x, y)) lo = Math.min(lo, elev[e]);
      const score = lo * 3 - b.dist[n] * .2;             // low ground, a little way off
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
    Unode = best || { x: player.x, y: player.y };
    HR.live(HR.COPY.drive.trapped);
  }

  function beginWin() {
    mode = "won"; wonT = 0;
    totalT += elapsed;
    const a = A(); if (a) { a.engineStop(); a.sfx.clear(); }
    HR.live(HR.COPY.drive.home);
    const wn = L.win;
    if (dwKick) dwKick.textContent = wn.kick;
    if (dwTitle) dwTitle.textContent = wn.title;
    if (dwBody) dwBody.textContent = wn.body;
    if (dwStats) dwStats.textContent = wn.stats;
    if (dwNext) dwNext.textContent = wn.btn;
    setTimeout(() => {                                   // let the arrival read first
      if (mode === "won" && winEl) winEl.classList.add("on");
    }, 750);
  }
  function advance() {
    if (LVL >= LAST) return;
    if (winEl) winEl.classList.remove("on");
    if (window.HR && HR.tutor) HR.tutor.clear();
    begin(auto, LVL + 1);
  }

  function beginDying() {
    mode = "dying"; dyingT = 0;
    totalT += elapsed;
    const a = A(); if (a) { a.engineStop(); a.sfx.fail(); }
    HR.live(HR.COPY.drive.dead);
  }
  function updateDying(dt) {
    dyingT += dt;
    if (mode === "dying" && dyingT > 2.6) {
      mode = "lost";
      survEl && (survEl.textContent = Math.round(totalT) + " seconds");
      lossEl.classList.add("on");
      setTimeout(() => { revealOn = true; }, 1200);
    }
  }

  /* ── movement ───────────────────────────────────────────────────────── */
  function movePlayer(dt) {
    /* quantize: the joystick feeds analog axes, the grid needs -1/0/1 */
    const raw = auto ? autoAxes() : HR.input.axes;
    const qx = Math.abs(raw.x) > .35 ? Math.sign(raw.x) : 0;
    const qy = Math.abs(raw.y) > .35 ? Math.sign(raw.y) : 0;
    const aud = A(); if (aud && mode === "play") aud.engineRev(player.moving ? .55 : .12);
    if (player.bump > 0) { player.bump -= dt; return; }
    if (player.moving) {
      /* allow mid-edge reverse */
      const dx = Math.sign(player.tx - player.x), dy = Math.sign(player.ty - player.y);
      if ((dx && qx === -dx) || (dy && qy === -dy)) {
        const ox = player.x, oy = player.y;
        player.x = player.tx; player.y = player.ty;
        player.tx = ox; player.ty = oy; player.prog = 1 - player.prog;
      }
      player.prog += dt * SPEED;
      if (player.prog >= 1) {
        player.x = player.tx; player.y = player.ty;
        player.prog = 0; player.moving = false;
      }
      return;
    }
    let dx = 0, dy = 0;
    if (qx) dx = qx; else if (qy) dy = qy;
    if (!dx && !dy) return;
    tutMoved();
    const nx = player.x + dx, ny = player.y + dy;
    if (nx < 0 || nx >= NX || ny < 0 || ny >= NY) return;
    const e = edgeBetween(player.x, player.y, nx, ny);
    if (st[e] === 0) {
      player.tx = nx; player.ty = ny; player.prog = 0; player.moving = true;
    } else {
      player.bump = .45; player.bdx = dx; player.bdy = dy;  // nose in, back out
      tutBumped();
      const a = A(); if (a) { a.sfx.splash(); a.engineRev(.15); }
    }
  }
  function autoAxes() {
    const b = bfs(player.x, player.y);
    let goal = pathTo(b, HOME.x, HOME.y);
    if (!goal && Unode) goal = pathTo(b, Unode.x, Unode.y);
    if (!goal || goal.length < 2) return { x: 0, y: 0 };
    const n = goal[1], x = n % NX, y = (n / NX) | 0;
    return { x: Math.sign(x - player.x), y: Math.sign(y - player.y) };
  }

  /* ── render ─────────────────────────────────────────────────────────── */
  const label = (ctx, txt, x, y, dpr, size = 8.5, alpha = .55, weight = 600) => {
    ctx.fillStyle = `rgba(159,178,199,${alpha})`;
    ctx.font = `${weight} ${size * dpr}px ui-monospace,Menlo,monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const lines = txt.split("\n");
    lines.forEach((ln, i) =>
      ctx.fillText(ln, x, y + (i - (lines.length - 1) / 2) * size * 1.25 * dpr));
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  };

  function drawParks(ctx, PX, cs, dpr) {
    for (const p of L.parks || []) {
      const [x, y] = PX(p.cx, p.cy);
      const w = p.w * cs, h = p.h * cs;
      const inset = cs * .12;
      ctx.fillStyle = "#18271d";
      ctx.fillRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
      ctx.strokeStyle = "#28422f"; ctx.lineWidth = dpr;
      ctx.strokeRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
      /* trees, deterministic */
      let s = (p.cx * 31 + p.cy * 57 + 11) | 0;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const n = 4 + p.w * p.h * 3;
      ctx.fillStyle = "#2c4a33";
      for (let k = 0; k < n; k++) {
        const tx = x + inset + rnd() * (w - 2.6 * inset), ty = y + inset + rnd() * (h - 2.6 * inset);
        ctx.beginPath(); ctx.arc(tx + inset * .3, ty + inset * .3, (2.2 + rnd() * 2.4) * dpr, 0, 6.3);
        ctx.fill();
      }
      if (p.oval) {                                      // the pink legislature
        ctx.fillStyle = "#6e4a44";
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w * .24, h * .17, 0, 0, 6.3); ctx.fill();
        ctx.strokeStyle = "#8a5f57"; ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w * .13, h * .09, 0, 0, 6.3); ctx.stroke();
      }
    }
  }

  /* names go on after the roads, so an intersection never paints over one */
  const SPECIAL_LY = { cn: .88, dome: .92, cityhall: .92, union: .84, fort: .92 };
  function drawNames(ctx, PX, cs, dpr) {
    for (const p of L.parks || []) {
      const [x, y] = PX(p.cx, p.cy);
      label(ctx, p.n, x + p.w * cs / 2, y + p.h * cs / 2 + (p.oval ? p.h * cs * .3 : 0),
            dpr, 7.5, .6);
    }
    for (const sp of L.specials || []) {
      const [x, y] = PX(sp.cx, sp.cy);
      const names = { cn: "CN TOWER", dome: "ROGERS CTR", cityhall: "CITY HALL",
                      union: "UNION STATION", fort: "FORT YORK" };
      label(ctx, names[sp.k] || "", x + cs / 2, y + cs * (SPECIAL_LY[sp.k] || .9), dpr, 7, .6);
    }
  }

  function drawRail(ctx, PX, cs, dpr) {
    if (!L.rail) return;
    const cy = L.rail.cy;
    const [x1, y1] = PX(0, cy), [x2] = PX(NX - 1, cy);
    const top = y1 + cs * .3, bot = y1 + cs * .7, mid = y1 + cs * .5;
    ctx.fillStyle = "#12161b";
    ctx.fillRect(x1, top, x2 - x1, bot - top);
    ctx.strokeStyle = "#2a2f36"; ctx.lineWidth = dpr;
    for (let x = x1; x < x2; x += 7 * dpr) {             // ties
      ctx.beginPath(); ctx.moveTo(x, top + 2 * dpr); ctx.lineTo(x, bot - 2 * dpr); ctx.stroke();
    }
    ctx.strokeStyle = "#454d57"; ctx.lineWidth = 1.4 * dpr;
    for (const off of [-4 * dpr, 4 * dpr]) {
      ctx.beginPath(); ctx.moveTo(x1, mid + off); ctx.lineTo(x2, mid + off); ctx.stroke();
    }
    label(ctx, "RAIL CORRIDOR", (x1 + x2) / 2, top - 5 * dpr, dpr, 7, .4);
  }

  function drawSpecials(ctx, PX, cs, dpr, t) {
    for (const sp of L.specials || []) {
      const [x, y] = PX(sp.cx, sp.cy);
      const cxm = x + cs / 2, cym = y + cs / 2;
      if (sp.k === "cn") {                               // the tower, from above
        ctx.strokeStyle = "rgba(20,24,29,.8)"; ctx.lineWidth = 3 * dpr;   // shadow east
        ctx.beginPath(); ctx.moveTo(cxm, cym); ctx.lineTo(cxm + cs * .42, cym + cs * .18); ctx.stroke();
        ctx.fillStyle = "#39424c";
        ctx.beginPath(); ctx.arc(cxm, cym, cs * .2, 0, 6.3); ctx.fill();
        ctx.strokeStyle = "#5b6570"; ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath(); ctx.arc(cxm, cym, cs * .13, 0, 6.3); ctx.stroke();
        ctx.beginPath(); ctx.arc(cxm, cym, cs * .06, 0, 6.3); ctx.stroke();
        ctx.fillStyle = Math.sin(t * 2.4) > 0 ? "#ff5a5a" : "#7a2a2a";    // aircraft light
        ctx.beginPath(); ctx.arc(cxm, cym, 1.8 * dpr, 0, 6.3); ctx.fill();
      } else if (sp.k === "dome") {                      // Rogers Centre
        ctx.fillStyle = "#c9cfd4";
        ctx.beginPath(); ctx.arc(cxm, cym, cs * .3, 0, 6.3); ctx.fill();
        ctx.strokeStyle = "#9aa2aa"; ctx.lineWidth = 1.4 * dpr;
        for (const r of [.22, .13]) {
          ctx.beginPath(); ctx.arc(cxm, cym, cs * r, 0, 6.3); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(cxm - cs * .3, cym); ctx.lineTo(cxm + cs * .3, cym); ctx.stroke();
      } else if (sp.k === "cityhall") {                  // two arcs + the chamber
        ctx.fillStyle = "#1e242c";
        ctx.fillRect(x + cs * .1, y + cs * .1, cs * .8, cs * .8);
        ctx.fillStyle = "#333d48";                       // Nathan Phillips reflecting pool
        ctx.fillRect(x + cs * .16, y + cs * .6, cs * .38, cs * .2);
        ctx.strokeStyle = "#7e8894"; ctx.lineWidth = 3.2 * dpr; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(cxm - cs * .07, cym - cs * .08, cs * .26, -1.1, 1.15); ctx.stroke();
        ctx.beginPath(); ctx.arc(cxm + cs * .07, cym - cs * .08, cs * .2, Math.PI - 1.05, Math.PI + 1.1); ctx.stroke();
        ctx.fillStyle = "#8f99a5";
        ctx.beginPath(); ctx.arc(cxm, cym - cs * .08, cs * .07, 0, 6.3); ctx.fill();
        ctx.lineCap = "butt";
      } else if (sp.k === "union") {                     // the great hall + columns
        ctx.fillStyle = "#3a3f47";
        ctx.fillRect(x + cs * .08, y + cs * .3, cs * .84, cs * .4);
        ctx.fillStyle = "#565e69";
        for (let k = 0; k < 7; k++)
          ctx.fillRect(x + cs * (.14 + k * .11), y + cs * .34, 2.4 * dpr, cs * .1);
        ctx.fillStyle = "rgba(255,217,140,.5)";
        ctx.fillRect(x + cs * .12, y + cs * .56, cs * .76, 2 * dpr);
      } else if (sp.k === "fort") {                      // Fort York's star
        ctx.fillStyle = "#1d2a20";
        ctx.fillRect(x + cs * .1, y + cs * .1, cs * .8, cs * .8);
        ctx.strokeStyle = "#8f855f"; ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath();
        const R1 = cs * .3, R2 = cs * .16;
        for (let k = 0; k <= 10; k++) {
          const ang = -Math.PI / 2 + k * Math.PI / 5;
          const r = k % 2 ? R2 : R1;
          const px2 = cxm + Math.cos(ang) * r, py2 = cym + Math.sin(ang) * r;
          k ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
  }

  function drawMargin(ctx, W, H, dpr, t, gridBottom) {
    const Mg = L.margin; if (!Mg) return;
    let y = gridBottom + 12 * dpr;
    if (Mg.gardiner) {                                   // the expressway on stilts
      const gh = 13 * dpr;
      ctx.fillStyle = "#20262e"; ctx.fillRect(0, y, W, gh);
      ctx.strokeStyle = "rgba(210,220,230,.16)"; ctx.lineWidth = dpr;
      ctx.setLineDash([9 * dpr, 11 * dpr]);
      ctx.beginPath(); ctx.moveTo(0, y + gh / 2); ctx.lineTo(W, y + gh / 2); ctx.stroke();
      ctx.setLineDash([]);
      for (let k = 0; k < 5; k++) {                      // crawling traffic
        const cx2 = (t * (26 + k * 7) * dpr + k * W / 5) % W;
        ctx.fillStyle = k % 2 ? "rgba(255,222,160,.55)" : "rgba(255,120,90,.5)";
        ctx.fillRect(k % 2 ? cx2 : W - cx2, y + (k % 2 ? 2.4 : gh - 5) * dpr, 6 * dpr, 2.6 * dpr);
      }
      label(ctx, "GARDINER EXPY", 64 * dpr, y + gh / 2, dpr, 6.5, .45);
      y += gh + 5 * dpr;
    }
    if (Mg.beach) {                                      // sand + boardwalk
      const bh = 12 * dpr;
      ctx.fillStyle = "#4d4433"; ctx.fillRect(0, y, W, bh);
      ctx.strokeStyle = "rgba(140,120,80,.55)"; ctx.lineWidth = 1.6 * dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(0, y + 3 * dpr); ctx.lineTo(W, y + 3 * dpr); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, "THE BOARDWALK", W - 90 * dpr, y + bh * .55, dpr, 6.5, .45);
      y += bh;
    }
    if (Mg.lake) {                                       // Lake Ontario, always
      ctx.fillStyle = "#0d2033"; ctx.fillRect(0, y, W, H - y);
      for (let k = 0; k < 2; k++) {
        ctx.strokeStyle = `rgba(110,170,210,${.18 - k * .07})`;
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        const wy = y + (5 + k * 9) * dpr;
        for (let x = 0; x <= W; x += 12 * dpr)
          ctx.lineTo(x, wy + Math.sin(x / (34 * dpr) + t * (1.1 + k * .4)) * 2 * dpr);
        ctx.stroke();
      }
      if (H - y > 26 * dpr)
        label(ctx, "LAKE ONTARIO", W / 2, y + (H - y) / 2 + 4 * dpr, dpr, 8, .4);
    }
  }

  function drawTram(ctx, PX, cs, dpr, t) {
    if (!tram) return;
    const y = L.tram.y;
    const [x1, ry] = PX(0, y), [x2] = PX(NX - 1, y);
    ctx.strokeStyle = "rgba(200,210,220,.13)"; ctx.lineWidth = dpr;
    for (const off of [-2.6 * dpr, 2.6 * dpr]) {
      ctx.beginPath(); ctx.moveTo(x1, ry + off); ctx.lineTo(x2, ry + off); ctx.stroke();
    }
    label(ctx, L.tram.label, x1 + 40 * dpr, ry - 8 * dpr, dpr, 6.5, .5);
    const [px, py] = PX(tram.x, y);
    ctx.save(); ctx.translate(px, py);
    if (tram.dir < 0) ctx.scale(-1, 1);
    ctx.fillStyle = "#b3352f";                           // the red rocket
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-15 * dpr, -5.5 * dpr, 30 * dpr, 11 * dpr, 3 * dpr)
                  : ctx.rect(-15 * dpr, -5.5 * dpr, 30 * dpr, 11 * dpr);
    ctx.fill();
    ctx.fillStyle = "#ded8ca";
    ctx.fillRect(-12 * dpr, -1.4 * dpr, 24 * dpr, 2.8 * dpr);
    if (tram.stalled) {                                  // hazards, like everyone else
      ctx.fillStyle = Math.sin(t * 6) > 0 ? "rgba(255,158,27,.95)" : "rgba(255,158,27,.15)";
      ctx.fillRect(-15 * dpr, -5.5 * dpr, 2.4 * dpr, 3 * dpr);
      ctx.fillRect(-15 * dpr, 2.5 * dpr, 2.4 * dpr, 3 * dpr);
      ctx.fillRect(12.6 * dpr, -5.5 * dpr, 2.4 * dpr, 3 * dpr);
      ctx.fillRect(12.6 * dpr, 2.5 * dpr, 2.4 * dpr, 3 * dpr);
    } else {
      ctx.fillStyle = "rgba(255,243,196,.8)";
      ctx.fillRect(13.4 * dpr, -2 * dpr, 2 * dpr, 4 * dpr);
    }
    ctx.restore();
  }

  function render(t) {
    const dpr = U.sizeCanvas(cv);
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const mTop = 46 * dpr, mSide = 46 * dpr;
    const mBot = L.margin ? 96 * dpr : 46 * dpr;
    const cs = Math.min((W - 2 * mSide) / (NX - 1), (H - mTop - mBot) / (NY - 1));
    const ox = (W - cs * (NX - 1)) / 2;
    const oy = mTop + (H - mTop - mBot - cs * (NY - 1)) / 2;
    const PX = (x, y) => [ox + x * cs, oy + y * cs];

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#10151b"; ctx.fillRect(0, 0, W, H);

    drawMargin(ctx, W, H, dpr, t, oy + cs * (NY - 1));

    /* blocks + windows (cells the set dressing doesn't own) */
    const blackout = (mode === "dying" || mode === "lost") ? Math.min(1, dyingT / 1.5) : 0;
    for (let cy = 0; cy < NY - 1; cy++) for (let cx = 0; cx < NX - 1; cx++) {
      if (covered.has(cx + "," + cy)) continue;
      const [bx, by] = PX(cx, cy);
      const inset = cs * .14;
      ctx.fillStyle = "#1a212b";
      ctx.fillRect(bx + inset, by + inset, cs - 2 * inset, cs - 2 * inset);
      ctx.fillStyle = `rgba(255,217,140,${(.75 * (1 - blackout)).toFixed(2)})`;
      for (const [wx, wy] of WIN[cy * (NX - 1) + cx])
        ctx.fillRect(bx + inset + wx * (cs - 2.4 * inset), by + inset + wy * (cs - 2.4 * inset),
                     2.2 * dpr, 2.2 * dpr);
    }
    drawParks(ctx, PX, cs, dpr);
    drawRail(ctx, PX, cs, dpr);
    drawSpecials(ctx, PX, cs, dpr, t);

    /* roads */
    const rw = Math.max(8 * dpr, cs * .2);
    ctx.lineCap = "butt";
    for (let e = 0; e < NE; e++) {
      const [ax, ay, bx2, by2] = edgeEnds(e);
      const [x1, y1] = PX(ax, ay), [x2, y2] = PX(bx2, by2);
      ctx.strokeStyle = "#272d35"; ctx.lineWidth = rw;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (st[e] === 2) {                                  // flooded
        const age = U.c01((elapsed - fT[e]) / .9);
        ctx.strokeStyle = `rgba(70,61,47,${(.95 * age).toFixed(2)})`;
        ctx.lineWidth = rw;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = `rgba(150,170,180,${(.16 + .1 * Math.sin(t * 3 + e)).toFixed(2)})`;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      } else {
        ctx.strokeStyle = "#3a424b"; ctx.lineWidth = dpr;
        ctx.setLineDash([6 * dpr, 8 * dpr]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (st[e] === 1) {                                  // telegraphed barricade
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const blink = Math.sin(t * 9) > 0;
        ctx.save(); ctx.translate(mx, my);
        ctx.rotate(ay === by2 ? 0 : Math.PI / 2);
        ctx.fillStyle = blink ? "#ff9e1b" : "#b86d12";
        ctx.fillRect(-rw * .8, -3 * dpr, rw * 1.6, 6 * dpr);
        ctx.fillStyle = "#10151b";
        for (let s = -rw * .7; s < rw * .7; s += 9 * dpr) ctx.fillRect(s, -3 * dpr, 4 * dpr, 6 * dpr);
        ctx.restore();
      }
    }

    /* street + place names (over the roads, under the traffic) */
    for (const vl of L.vlabels || []) {
      const [lx, ly] = PX(vl.x, (NY - 1) / 2);
      ctx.save(); ctx.translate(lx + 7 * dpr, ly); ctx.rotate(-Math.PI / 2);
      label(ctx, vl.n, 0, 0, dpr, 6.5, .4);
      ctx.restore();
    }
    drawNames(ctx, PX, cs, dpr);

    drawTram(ctx, PX, cs, dpr, t);

    /* gridlock: stalled, hazard-blinking cars jam the flooded streets — the
       city seizing up around you (cosmetic; the rig still lives in `st`) */
    {
      const blink = Math.sin(t * 6) > 0;
      const carAt = (x1, y1, x2, y2, hue) => {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
        ctx.fillStyle = hue;
        ctx.fillRect(-9 * dpr, -5 * dpr, 18 * dpr, 10 * dpr);
        ctx.fillStyle = "#10151b"; ctx.fillRect(-2 * dpr, -4 * dpr, 6 * dpr, 8 * dpr);
        ctx.fillStyle = blink ? "rgba(255,158,27,.95)" : "rgba(255,158,27,.12)";
        ctx.fillRect(-9 * dpr, -5 * dpr, 2 * dpr, 3 * dpr);
        ctx.fillRect(-9 * dpr, 2 * dpr, 2 * dpr, 3 * dpr);
        ctx.restore();
      };
      const HUES = ["#7d8893", "#5c6b78", "#8a6d5a", "#6d7d8a"];
      for (let e = 0; e < NE; e++) {
        if (st[e] !== 2) continue;
        const hsh = (e * 2654435761 >>> 0) % 100;
        if (hsh >= 36) continue;                          // ~1 in 3 flooded edges jams
        const [ax, ay, bx2, by2] = edgeEnds(e);
        const k = .32 + (hsh % 5) * .09;                  // park it along the edge
        const [x1, y1] = PX(U.lerp(ax, bx2, k), U.lerp(ay, by2, k));
        const [x2, y2] = PX(U.lerp(ax, bx2, k + .12), U.lerp(ay, by2, k + .12));
        carAt(x1, y1, x2, y2, HUES[hsh % 4]);
      }
    }

    /* HOME pin */
    {
      const [hx, hy] = PX(HOME.x, HOME.y);
      const pulse = 1 + .12 * Math.sin(t * 2.4);
      /* a wider beacon halo so the goal reads at a glance */
      ctx.strokeStyle = `rgba(124,196,111,${(.3 + .2 * Math.sin(t * 2.4)).toFixed(2)})`;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(hx, hy, 26 * dpr * pulse, 0, 6.3); ctx.stroke();
      ctx.strokeStyle = "rgba(124,196,111,.85)"; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(hx, hy, 13 * dpr * pulse, 0, 6.3); ctx.stroke();
      ctx.fillStyle = "#7cc46f";
      ctx.beginPath();
      ctx.moveTo(hx, hy - 8 * dpr); ctx.lineTo(hx + 7 * dpr, hy - 1 * dpr);
      ctx.lineTo(hx + 4 * dpr, hy - 1 * dpr); ctx.lineTo(hx + 4 * dpr, hy + 6 * dpr);
      ctx.lineTo(hx - 4 * dpr, hy + 6 * dpr); ctx.lineTo(hx - 4 * dpr, hy - 1 * dpr);
      ctx.lineTo(hx - 7 * dpr, hy - 1 * dpr); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(124,196,111,.95)";
      ctx.font = `700 ${11 * dpr}px ui-monospace,Menlo,monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText("HOME", hx, hy - 16 * dpr);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
      /* the arrival: rings spreading from the door */
      if (mode === "won") {
        for (let k = 0; k < 3; k++) {
          const rr = ((wonT * .9 + k * .33) % 1);
          ctx.strokeStyle = `rgba(124,196,111,${(.5 * (1 - rr)).toFixed(2)})`;
          ctx.lineWidth = 2.4 * dpr;
          ctx.beginPath(); ctx.arc(hx, hy, (14 + rr * 46) * dpr, 0, 6.3); ctx.stroke();
        }
      }
    }

    /* player car */
    {
      let cxp = player.x, cyp = player.y, hd = 0;
      if (player.moving) {
        const e = HR.u.c01(player.prog);
        cxp = U.lerp(player.x, player.tx, e); cyp = U.lerp(player.y, player.ty, e);
        hd = Math.atan2(player.ty - player.y, player.tx - player.x);
      } else if (player.bump > 0) {
        const k = Math.sin((1 - player.bump / .45) * Math.PI) * .16;
        cxp += player.bdx * k; cyp += player.bdy * k;
        hd = Math.atan2(player.bdy, player.bdx);
      }
      const [px, py] = PX(cxp, cyp);
      ctx.save(); ctx.translate(px, py); ctx.rotate(hd);
      const flicker = mode === "dying" ? (Math.sin(t * 31) > -.2 ? .2 : .02) : .22;
      if (mode !== "won") {
        ctx.fillStyle = `rgba(255,243,196,${flicker})`;   // headlight cone
        ctx.beginPath(); ctx.moveTo(10 * dpr, 0);
        ctx.lineTo(46 * dpr, -13 * dpr); ctx.lineTo(46 * dpr, 13 * dpr); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#b8c2cc";
      ctx.beginPath();
      const r = 3 * dpr;
      ctx.roundRect ? ctx.roundRect(-11 * dpr, -6 * dpr, 22 * dpr, 12 * dpr, r)
                    : ctx.rect(-11 * dpr, -6 * dpr, 22 * dpr, 12 * dpr);
      ctx.fill();
      ctx.fillStyle = "#1f2730";
      ctx.fillRect(-3 * dpr, -5 * dpr, 7 * dpr, 10 * dpr);
      ctx.restore();

      if (mode === "dying" || mode === "lost") {          // water closing over the car
        const rr = Math.min(1, dyingT / 2.2) * cs * 1.2;
        ctx.fillStyle = `rgba(54,47,36,${(Math.min(.85, dyingT / 2)).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(px, py, rr, 0, 6.3); ctx.fill();
      }
    }

    /* reveal: the creeks under the streets */
    if (revealOn) {
      ctx.fillStyle = "rgba(6,20,38,.78)"; ctx.fillRect(0, 0, W, H);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.setLineDash([10 * dpr, 12 * dpr]);
      ctx.lineDashOffset = -t * 30 * dpr;
      for (const c of CREEKS) {
        ctx.strokeStyle = "rgba(79,195,247,.18)"; ctx.lineWidth = 16 * dpr;
        ctx.beginPath();
        c.forEach(([x, y], i) => { const [qx, qy] = PX(x, y); i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); });
        ctx.stroke();
        ctx.strokeStyle = "rgba(127,212,255,.95)"; ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        c.forEach(([x, y], i) => { const [qx, qy] = PX(x, y); i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); });
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    /* level banner: which run this is, while the round settles in */
    if (introT < 3 && mode === "play") {
      const a = introT < .4 ? introT / .4 : introT > 2.3 ? U.c01((3 - introT) / .7) : 1;
      ctx.fillStyle = `rgba(9,14,20,${(.75 * a).toFixed(2)})`;
      const bw = Math.min(W * .8, 360 * dpr), bh = 52 * dpr;
      ctx.fillRect((W - bw) / 2, H * .16, bw, bh);
      ctx.fillStyle = `rgba(127,212,255,${(.9 * a).toFixed(2)})`;
      ctx.font = `700 ${15 * dpr}px ui-monospace,Menlo,monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(L.name, W / 2, H * .16 + 20 * dpr);
      ctx.fillStyle = `rgba(159,178,199,${(.85 * a).toFixed(2)})`;
      ctx.font = `600 ${8.5 * dpr}px ui-monospace,Menlo,monospace`;
      ctx.fillText(L.tag, W / 2, H * .16 + 38 * dpr);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }

    /* lightning: the whole board blinks */
    if (flashA > .02) {
      ctx.fillStyle = `rgba(222,236,255,${(.16 * flashA * L.thunder[2]).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    /* HUD clock: 10 real seconds ≈ 1 city minute */
    if (clockEl) {
      const mins = L.clock[1] + Math.floor(elapsed / 10);
      const h = L.clock[0] + Math.floor(mins / 60);
      clockEl.textContent = `${h}:${String(mins % 60).padStart(2, "0")} p.m.`;
    }
    /* storm meter: fills as the flood gathers; turns hot near the endgame */
    if (stormFill) {
      const sp = U.c01(elapsed / L.stormT);
      stormFill.style.width = (sp * 100).toFixed(0) + "%";
      if (stormWrap) stormWrap.classList.toggle("hot", endgame || sp > .8);
    }
  }

  /* ── loop / lifecycle ───────────────────────────────────────────────── */
  function frame(now) {
    if (!running) return;
    const t = now / 1000;
    const dt = Math.min(.05, t - lastT) * tscale; lastT = t;
    if (!paused && mode !== "lost") update(dt);
    if (!paused) flashA = Math.max(0, flashA - dt * 1.6);
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function begin(asAuto, lvl) {
    init(lvl); auto = asAuto; tscale = tscale > 1 ? tscale : 1;
    running = true; paused = false;
    lastT = performance.now() / 1000;
    const a = A(); if (a) a.engineStart();
    tutStart();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  const game = {
    id: "drive", sceneId: "sc-drive",
    keys: { w: "up", a: "left", s: "down", d: "right" },
    start: () => { totalT = 0; tscale = 1; begin(false, 0); },
    skip: () => { totalT = 0; tscale = 1; begin(true, 0); },
    restart: () => { tscale = 1; begin(auto, LVL); },     // this run again
    ff() {                                               // autopilot races to the final loss
      if (mode === "lost") return;
      auto = true; tscale = 7; paused = false;
      lastT = performance.now() / 1000;
      const a = A(); if (a && mode === "play") a.engineStart();
    },
    stop() {
      running = false; cancelAnimationFrame(raf);
      if (window.HR) HR._gameRain = null;
      const a = A(); if (a) { a.engineStop(); a.gameAmbClear(); }
    },
    pause() { paused = true; const a = A(); if (a) a.engineStop(); },
    resume() { paused = false; lastT = performance.now() / 1000;
               const a = A(); if (a && mode === "play") a.engineStart(); },
  };
  HR.island.register(game);
  HR.input.dpad(document.getElementById("drive-dpad"));
  HR._drive = () => ({ level: LVL + 1, elapsed, mode, endgame, endT, running, paused,
    px: player && player.x, py: player && player.y,
    flooded: st ? st.reduce((a, v) => a + (v === 2 ? 1 : 0), 0) : 0,
    tele: st ? st.reduce((a, v) => a + (v === 1 ? 1 : 0), 0) : 0,
    pathLen: (() => { try { const b = bfs(player.x, player.y);
      const p = pathTo(b, HOME.x, HOME.y); return p ? p.length - 1 : null; } catch (e) { return "ERR"; } })() });
  if (dwNext) dwNext.addEventListener("click", () => {
    if (mode !== "won") return;
    const a = A(); if (a) a.sfx.click();
    advance();
  });
  const done = lossEl && lossEl.querySelector(".g-done");
  if (done) done.addEventListener("click", () =>
    HR.island.finish(game, "totaled", { survivedSec: Math.round(totalT || 0) }));
})();
