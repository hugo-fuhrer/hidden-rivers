/* Hidden Rivers v2 — Phase 1: "Get Home", the rigged commute.
   Top-down grid driving. An honest flood simulation rises along the buried
   creek alignments while a Director guarantees the game is lost — fairly:
   every blockage is telegraphed, the player is never trapped instantly, and
   the loss screen reveals that the failed routes trace Garrison Creek. */
"use strict";
(() => {
  const U = HR.u;
  const NX = 11, NY = 8;                                 // intersection grid
  const NH = (NX - 1) * NY, NE = NH + NX * (NY - 1);
  const HOME = { x: 1, y: 1 }, START = { x: 9, y: 6 };
  const SPEED = 2.3;                                     // cells per second

  /* buried creeks, in cell coordinates — the flood follows these */
  const CREEKS = [
    [[3.4, -.5], [3.0, 1.2], [3.6, 2.8], [2.8, 4.4], [3.4, 6.0], [2.9, 7.5]],
    [[7.6, -.5], [7.1, 1.5], [7.7, 3.2], [6.9, 5.0], [7.5, 7.5]],
  ];

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

  /* static elevation: distance from edge midpoint to the nearest creek,
     plus deterministic jitter so the creek "walls" keep gaps early on —
     the water closes them over the round instead of all at once */
  const elev = new Float32Array(NE);
  for (let e = 0; e < NE; e++) {
    const [ax, ay, bx, by] = edgeEnds(e);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    let d = 99;
    for (const c of CREEKS)
      for (let i = 0; i < c.length - 1; i++)
        d = Math.min(d, U.segDist(mx, my, c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]));
    const jit = ((e * 2654435761 >>> 0) % 1000) / 1000;
    elev[e] = d + jit * 1.1;
  }

  /* window dots per block, precomputed */
  const WIN = [];
  {
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let cy = 0; cy < NY - 1; cy++) for (let cx = 0; cx < NX - 1; cx++) {
      const dots = [];
      const n = 2 + (rnd() * 4 | 0);
      for (let i = 0; i < n; i++) dots.push([rnd(), rnd()]);
      WIN.push(dots);
    }
  }

  /* ── mutable game state ─────────────────────────────────────────────── */
  let st, tT, fT;                                        // edge state / telegraph deadline / flood time
  let player, elapsed, mode, dyingT, revealOn, auto, autoPath;
  let endgame, endT, Unode, lastSim, lastDir, raf = 0, running = false, paused = false, lastT = 0;
  let tut;                                               // per-run tutorial progress
  let tscale = 1;                                        // >1 while fast-forwarding to the end
  const cv = document.getElementById("drive-cv");
  const clockEl = document.getElementById("drive-clock");
  const lossEl = document.getElementById("drive-loss");
  const survEl = document.getElementById("drive-surv");
  const stormFill = document.getElementById("drive-stormfill");
  const stormWrap = document.getElementById("drive-storm");
  const A = () => (window.HR && HR.audio) ? HR.audio : null;

  function init() {
    st = new Uint8Array(NE); tT = new Float32Array(NE); fT = new Float32Array(NE).fill(-1);
    player = { x: START.x, y: START.y, tx: START.x, ty: START.y, prog: 0, moving: false,
               bump: 0, bdx: 0, bdy: 0 };
    elapsed = 0; mode = "play"; dyingT = 0; revealOn = false; endgame = false; endT = 0;
    Unode = null; lastSim = 0; lastDir = 0; autoPath = null;
    tut = { moved: false, bumped: false };
    lossEl.classList.remove("on");
  }

  /* sequential coach marks — the engage card no longer explains anything */
  const T = () => (window.HR && HR.tutor) ? HR.tutor : null;
  function tutStart() {
    const t = T(); if (!t || auto) return;
    t.hint("drive-move", t.COARSE
      ? "Touch and drag the <b>joystick</b> to drive"
      : `Drive with ${t.kbd("W")}${t.kbd("A")}${t.kbd("S")}${t.kbd("D")} or the arrow keys`,
      { ttl: 0 });
  }
  function tutMoved() {
    const t = T(); if (!t || auto || tut.moved) return;
    tut.moved = true;
    t.clear("drive-move");
    setTimeout(() => t.hint("drive-goal",
      "Reach the green <b>HOME</b> pin — before the water finds you", { ttl: 7 }), 700);
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

  function telegraph(e, dur) {
    if (st[e] !== 0 || e === playerEdge()) return false;
    st[e] = 1; tT[e] = elapsed + dur;
    HR.live(HR.COPY.drive.blocked);
    return true;
  }
  function flood(e) {
    if (e === playerEdge()) { st[e] = 0; return; }       // G1: never under the car
    st[e] = 2; fT[e] = elapsed;
  }

  /* ── simulation + director ──────────────────────────────────────────── */
  function update(dt) {
    elapsed += dt;
    /* telegraphs mature */
    for (let e = 0; e < NE; e++) if (st[e] === 1 && elapsed >= tT[e]) flood(e);

    /* honest sim: water rises along the creeks (2 Hz) */
    if (elapsed - lastSim > .5) {
      lastSim = elapsed;
      const wl = .2 + (elapsed / 90) * 2.0;
      for (let e = 0; e < NE; e++)
        if (st[e] === 0 && elev[e] <= wl && e !== playerEdge()) flood(e);
    }

    if (mode !== "play") return updateDying(dt);

    const b = bfs(player.x, player.y);
    let path = pathTo(b, HOME.x, HOME.y);

    if (!path && !endgame) startEndgame(b);

    /* moat: home is never allowed closer than ~4 edges */
    let guard = 4;
    while (path && path.length - 1 <= 4 && guard--) {
      let pick = -1;
      for (let i = path.length - 2; i >= 0; i--) {       // nearest home first
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
      cands.sort((a, c) => elev[a] - elev[c]);           // prefer the low ground
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

    movePlayer(dt);
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

  function beginDying() {
    mode = "dying"; dyingT = 0;
    const a = A(); if (a) { a.engineStop(); a.sfx.fail(); }
    HR.live(HR.COPY.drive.dead);
  }
  function updateDying(dt) {
    dyingT += dt;
    if (mode === "dying" && dyingT > 2.6) {
      mode = "lost";
      survEl && (survEl.textContent = Math.round(elapsed) + " seconds");
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
  function render(t) {
    const dpr = U.sizeCanvas(cv);
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const m = 46 * dpr;
    const cs = Math.min((W - 2 * m) / (NX - 1), (H - 2 * m) / (NY - 1));
    const ox = (W - cs * (NX - 1)) / 2, oy = (H - cs * (NY - 1)) / 2;
    const PX = (x, y) => [ox + x * cs, oy + y * cs];

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#10151b"; ctx.fillRect(0, 0, W, H);

    /* blocks + windows */
    const blackout = mode !== "play" ? Math.min(1, dyingT / 1.5) : 0;
    for (let cy = 0; cy < NY - 1; cy++) for (let cx = 0; cx < NX - 1; cx++) {
      const [bx, by] = PX(cx, cy);
      const inset = cs * .14;
      ctx.fillStyle = "#1a212b";
      ctx.fillRect(bx + inset, by + inset, cs - 2 * inset, cs - 2 * inset);
      ctx.fillStyle = `rgba(255,217,140,${(.75 * (1 - blackout)).toFixed(2)})`;
      for (const [wx, wy] of WIN[cy * (NX - 1) + cx])
        ctx.fillRect(bx + inset + wx * (cs - 2.4 * inset), by + inset + wy * (cs - 2.4 * inset),
                     2.2 * dpr, 2.2 * dpr);
    }

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
      ctx.fillStyle = `rgba(255,243,196,${flicker})`;     // headlight cone
      ctx.beginPath(); ctx.moveTo(10 * dpr, 0);
      ctx.lineTo(46 * dpr, -13 * dpr); ctx.lineTo(46 * dpr, 13 * dpr); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#b8c2cc";
      ctx.beginPath();
      const r = 3 * dpr;
      ctx.roundRect ? ctx.roundRect(-11 * dpr, -6 * dpr, 22 * dpr, 12 * dpr, r)
                    : ctx.rect(-11 * dpr, -6 * dpr, 22 * dpr, 12 * dpr);
      ctx.fill();
      ctx.fillStyle = "#1f2730";
      ctx.fillRect(-3 * dpr, -5 * dpr, 7 * dpr, 10 * dpr);
      ctx.restore();

      if (mode !== "play") {                              // water closing over the car
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

    /* HUD clock: 10 real seconds ≈ 1 city minute */
    if (clockEl) {
      const mins = 12 + Math.floor(elapsed / 10);
      clockEl.textContent = `6:${String(mins).padStart(2, "0")} p.m.`;
    }
    /* storm meter: fills as the flood gathers; turns hot near the endgame */
    if (stormFill) {
      const sp = U.c01(elapsed / 85);
      stormFill.style.width = (sp * 100).toFixed(0) + "%";
      if (stormWrap) stormWrap.classList.toggle("hot", endgame || sp > .62);
    }
  }

  /* ── loop / lifecycle ───────────────────────────────────────────────── */
  function frame(now) {
    if (!running) return;
    const t = now / 1000;
    const dt = Math.min(.05, t - lastT) * tscale; lastT = t;
    if (!paused && mode !== "lost") update(dt);
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function begin(asAuto) {
    init(); auto = asAuto; tscale = 1; running = true; paused = false;
    lastT = performance.now() / 1000;
    const a = A(); if (a) a.engineStart();
    tutStart();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  const game = {
    id: "drive", sceneId: "sc-drive",
    keys: { w: "up", a: "left", s: "down", d: "right" },
    start: () => begin(false),
    skip: () => begin(true),
    restart: () => begin(auto),
    ff() {                                               // hand to autopilot and race to the end
      if (mode === "lost") return;
      auto = true; tscale = 7; paused = false;
      lastT = performance.now() / 1000;
      const a = A(); if (a && mode === "play") a.engineStart();
    },
    stop() { running = false; cancelAnimationFrame(raf); const a = A(); if (a) a.engineStop(); },
    pause() { paused = true; const a = A(); if (a) a.engineStop(); },
    resume() { paused = false; lastT = performance.now() / 1000;
               const a = A(); if (a && mode === "play") a.engineStart(); },
  };
  HR.island.register(game);
  HR.input.dpad(document.getElementById("drive-dpad"));
  HR._drive = () => ({ elapsed, mode, endgame, endT, running, paused,
    flooded: st ? st.reduce((a, v) => a + (v === 2 ? 1 : 0), 0) : 0,
    tele: st ? st.reduce((a, v) => a + (v === 1 ? 1 : 0), 0) : 0,
    pathLen: (() => { try { const b = bfs(player.x, player.y);
      const p = pathTo(b, HOME.x, HOME.y); return p ? p.length - 1 : null; } catch (e) { return "ERR"; } })() });
  const done = lossEl && lossEl.querySelector(".g-done");
  if (done) done.addEventListener("click", () =>
    HR.island.finish(game, "totaled", { survivedSec: Math.round(elapsed || 0) }));
})();
