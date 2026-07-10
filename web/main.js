/* Hidden Rivers — scroll story engine + scene art.
   No dependencies; everything procedural so the page works from file:// and
   stays light. Layout: each .scene is N×100vh tall with a sticky stage; the
   engine maps scroll position to a 0–1 progress per scene and hands it to
   that scene's update(p, t, dt). */
"use strict";

/* ── utils ────────────────────────────────────────────────────────────── */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const c01 = v => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const map = (p, a, b) => c01((p - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);                  // smoothstep
const easeIO = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const TAU = Math.PI * 2;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

function mulberry(seed) {                                // tiny seeded RNG
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
    z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}
function hexRGB(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mix(h1, h2, t) {
  const a = hexRGB(h1), b = hexRGB(h2);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(",")})`;
}
/* multi-stop colour ramp: stops = [[pos,"#hex"],…] */
function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++)
    if (t <= stops[i][0])
      return mix(stops[i - 1][1], stops[i][1], map(t, stops[i - 1][0], stops[i][0]));
  return stops[stops.length - 1][1];
}

/* ── engine ───────────────────────────────────────────────────────────── */
const SCENES = [];
function scene(id, update) {
  const el = document.getElementById(id);
  const beats = [...el.querySelectorAll(".beat,.step")].map(b => ({
    el: b, a: +b.dataset.a, b: +b.dataset.b,
  }));
  const sticky = el.querySelector(".sticky");
  /* edge veil: each sticky dips to dark as it pins/unpins, so the hard cut
     between consecutive scenes reads as a fade instead of a jump */
  let edge = null;
  if (sticky) {
    edge = document.createElement("div");
    edge.className = "edgefade";
    sticky.appendChild(edge);
  }
  SCENES.push({ el, sticky, edge, beats, update,
                name: el.dataset.name || "", top: 0, hgt: 0 });
}
function measure() {
  for (const s of SCENES) { s.top = s.el.offsetTop; s.hgt = s.el.offsetHeight; }
}
function beatAlpha(p, a, b) {
  const f = Math.max(.028, .16 * (b - a));
  return c01(Math.min((p - a) / f, (b - p) / f));
}

/* ── lightning ─────────────────────────────────────────────────────────── */
const flashEl = document.getElementById("flash");
let flashT = -9, lastThunder = -9;
const flash = pow => {
  if (!REDUCED) { flashT = perf(); flashEl.dataset.p = pow; }
  /* loud strikes rumble — throttled so a flurry of flashes doesn't stack */
  if (pow >= .5 && perf() - lastThunder > 1.4 && window.HR && HR.audio) {
    lastThunder = perf(); HR.audio.sfx.thunder();
  }
};
function perf() { return performance.now() / 1000; }
function drawFlash() {
  const x = perf() - flashT;
  const p = +(flashEl.dataset.p || 1);
  flashEl.style.opacity = x < 0 || x > 1 ? 0 :
    (p * Math.exp(-x * 7.5) * (.72 + .28 * Math.sin(x * 90))).toFixed(3);
}

/* ── rain (one canvas per scene that needs it) ────────────────────────── */
const rain = { target: 0, val: 0, drops: [], host: null, ctxs: new Map() };
const MAXDROPS = REDUCED ? 70 : 430;
for (let i = 0; i < MAXDROPS; i++)
  rain.drops.push({ x: Math.random(), y: Math.random(), v: lerp(.9, 1.7, Math.random()),
                    l: lerp(.012, .03, Math.random()), a: lerp(.25, .6, Math.random()) });
function rainCanvas(sceneId) {
  const sticky = document.querySelector(`#${sceneId} .sticky`);
  const c = document.createElement("canvas");
  c.className = "rainfx";
  sticky.appendChild(c);
  rain.ctxs.set(sceneId, c);
  return c;
}
function sizeCanvas(c) {
  const dpr = Math.min(devicePixelRatio || 1, 1.6);
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== (w * dpr | 0) || c.height !== (h * dpr | 0)) {
    c.width = w * dpr | 0; c.height = h * dpr | 0;
  }
  return dpr;
}
let lastRainHost = null;
function drawRain(dt, t) {
  rain.val += (rain.target - rain.val) * Math.min(1, dt * 4);
  const c = rain.host && rain.ctxs.get(rain.host);
  if (lastRainHost && lastRainHost !== rain.host) {     // wipe stale canvas
    const old = rain.ctxs.get(lastRainHost);
    if (old) old.getContext("2d").clearRect(0, 0, old.width, old.height);
  }
  lastRainHost = rain.host;
  if (!c) return;
  const dpr = sizeCanvas(c), ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const n = Math.round(MAXDROPS * c01(rain.val));
  if (n <= 0) return;
  const wind = -.16;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const d = rain.drops[i];
    d.y += d.v * dt * 1.35;
    d.x += wind * d.v * dt * .55;
    if (d.y > 1.05) { d.y = -.06; d.x = Math.random() * 1.25 - .08; }
    const x = d.x * W, y = d.y * H, l = d.l * H * (.7 + rain.val * .5);
    ctx.strokeStyle = `rgba(178,205,228,${(d.a * (.5 + .5 * rain.val)).toFixed(3)})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + wind * l, y - l); ctx.stroke();
  }
}

/* ════════════════════════════════════════════════════════════════════════
   I · THE CLOUD
   ═══════════════════════════════════════════════════════════════════════ */
const cloudSky = document.getElementById("cloud-sky");
const cloudVeil = document.getElementById("cloud-veil");
const cloudLayers = [
  { el: document.getElementById("cl-back"),  n: 7, y0: .04, y1: .42, s: 240, sp: 5,  o: .8 },
  { el: document.getElementById("cl-mid"),   n: 8, y0: .22, y1: .66, s: 330, sp: 9,  o: .9 },
  { el: document.getElementById("cl-front"), n: 8, y0: .42, y1: .92, s: 430, sp: 14, o: .96 },
];
{
  const rnd = mulberry(7);
  for (const L of cloudLayers) {
    for (let i = 0; i < L.n; i++) {
      const p = document.createElement("div");
      p.className = "puff";
      const s = L.s * lerp(.6, 1.5, rnd());
      p.style.width = s * 1.7 + "px";
      p.style.height = s + "px";
      p.style.left = lerp(2, 86, rnd()) + "%";
      p.style.top = lerp(L.y0, L.y1, rnd()) * 100 + "%";
      p.style.setProperty("--o", L.o * lerp(.8, 1, rnd()));
      L.el.appendChild(p);
    }
  }
}
const SKY_CLOUD_T = [[0, "#86b3d3"], [.45, "#6d8aa0"], [.8, "#3b4d60"], [1, "#2b3a4a"]];
const SKY_CLOUD_B = [[0, "#d9e8f1"], [.45, "#a9bcc8"], [.8, "#5d7081"], [1, "#506377"]];
const scrollHint = document.getElementById("scrollhint");
let cloudFlashes;
scene("sc-cloud", (p, t) => {
  cloudSky.style.setProperty("--c1", ramp(SKY_CLOUD_T, p));
  cloudSky.style.setProperty("--c2", ramp(SKY_CLOUD_B, p));
  const zoom = 1 + ease(map(p, .15, .62)) * 1.9;
  cloudLayers.forEach((L, i) => {
    const drift = (REDUCED ? 0 : t * L.sp) % 400 - 200;
    L.el.style.transform =
      `translate3d(${drift * .25}px,${ease(map(p, .1, .6)) * (i + 1) * -6}vh,0) scale(${1 + (zoom - 1) * (.4 + i * .3)})`;
    L.el.style.filter = `brightness(${lerp(1, .42, ease(map(p, .5, .82)))})`;
  });
  /* whiteout inside the cloud, then darken */
  const inside = ease(map(p, .34, .52)) * (1 - ease(map(p, .8, .96)));
  cloudVeil.style.opacity = (inside * .9).toFixed(3);
  cloudVeil.style.background = mix("#eef2f5", "#1b2530", ease(map(p, .52, .8)));
  if (p > .68 && !cloudFlashes[0]) { cloudFlashes[0] = 1; flash(.55); }
  if (p > .86 && !cloudFlashes[1]) { cloudFlashes[1] = 1; flash(.85); }
  if (p < .03) cloudFlashes = [0, 0];
  if (p > .7) { rain.target = map(p, .7, 1) * .3; rain.host = "sc-cloud"; }
  scrollHint.classList.toggle("off", p > .04);
});
cloudFlashes = [0, 0];
rainCanvas("sc-cloud");

/* ════════════════════════════════════════════════════════════════════════
   II · THE FALL — parallax skyline
   ═══════════════════════════════════════════════════════════════════════ */
function windowsRect(rnd, x, y, w, h, cols, rows, lit, color = "#ffd98c") {
  let s = "";
  const cw = w / cols, rh = h / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++)
      if (rnd() < lit)
        s += `<rect x="${(x + i * cw + cw * .22).toFixed(1)}" y="${(y + j * rh + rh * .2).toFixed(1)}"
               width="${(cw * .5).toFixed(1)}" height="${(rh * .55).toFixed(1)}" fill="${color}" opacity=".8"/>`;
  return s;
}
function skylineFar() {
  const rnd = mulberry(31); let b = "";
  let x = -20;
  while (x < 1620) {
    const w = lerp(46, 130, rnd()), h = lerp(80, 290, rnd());
    b += `<rect x="${x.toFixed(0)}" y="${(1000 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="#121922"/>`;
    if (rnd() < .25) b += `<rect x="${(x + w / 2).toFixed(0)}" y="${(1000 - h - 26).toFixed(0)}" width="2.5" height="26" fill="#121922"/>`;
    x += w + lerp(4, 26, rnd());
  }
  return `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice"><g opacity=".55">${b}</g></svg>`;
}
function skylineMid() {
  const rnd = mulberry(57); let s = "";
  /* condo slabs */
  for (const [x, w, h, f] of [[40, 120, 300, "#212a36"], [200, 90, 380, "#1c2530"],
      [330, 130, 250, "#222b37"], [480, 80, 330, "#1d2632"], [1290, 120, 330, "#202935"],
      [1450, 110, 270, "#1b2430"]]) {
    s += `<rect x="${x}" y="${1000 - h}" width="${w}" height="${h}" fill="${f}"/>`
       + windowsRect(rnd, x + 6, 1000 - h + 10, w - 12, h - 30, 5, Math.round(h / 46), .3);
  }
  /* First Canadian Place (pale slab) + TD black towers */
  s += `<rect x="585" y="365" width="100" height="635" fill="#3a434e"/>
        <rect x="585" y="365" width="100" height="10" fill="#49535f"/>`
     + windowsRect(rnd, 591, 385, 88, 590, 4, 14, .3, "#ffedb0");
  for (const [x, w, top] of [[710, 80, 520], [805, 92, 460], [912, 70, 560]]) {
    s += `<rect x="${x}" y="${top}" width="${w}" height="${1000 - top}" fill="#0e1217"/>`
       + windowsRect(rnd, x + 5, top + 12, w - 10, 1000 - top - 24, 4, 12, .26, "#f7cf6f");
  }
  /* Rogers Centre dome */
  s += `<path d="M985 1000 a95 78 0 0 1 190 0 Z" fill="#1a212b"/>
        <path d="M1000 1000 a80 64 0 0 1 160 0" fill="none" stroke="#2a3441" stroke-width="3"/>`;
  /* CN Tower */
  s += `<g id="cn-tower">
    <polygon points="1124,1000 1137,420 1163,420 1176,1000" fill="#232d39"/>
    <polygon points="1108,1000 1126,640 1132,640 1124,1000" fill="#1d2632"/>
    <polygon points="1192,1000 1174,640 1168,640 1176,1000" fill="#1d2632"/>
    <rect x="1098" y="392" width="104" height="62" rx="20" fill="#2b3642"/>
    <rect x="1104" y="414" width="92" height="13" fill="#ffd98c" opacity=".28"/>
    <line x1="1098" y1="408" x2="1202" y2="408" stroke="#46525f" stroke-width="2"/>
    <line x1="1100" y1="440" x2="1200" y2="440" stroke="#46525f" stroke-width="2"/>
    <polygon points="1144,392 1150,255 1156,392" fill="#232d39"/>
    <circle cx="1150" cy="268" r="11" fill="#2b3642"/>
    <rect x="1148" y="128" width="4" height="130" fill="#232d39"/>
    <circle id="cn-light" cx="1150" cy="124" r="4.5" fill="#ff5a5a"/>
  </g>`;
  return `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice">${s}</svg>`;
}
function skylineNear() {
  const rnd = mulberry(83); let s = "";
  for (const [x, w, h, f] of [[-40, 230, 420, "#2a3441"], [240, 170, 330, "#252e3a"],
      [560, 210, 480, "#2c3543"], [930, 190, 380, "#262f3b"], [1180, 230, 520, "#2a3340"],
      [1470, 180, 360, "#252e3a"]]) {
    s += `<rect x="${x}" y="${1000 - h}" width="${w}" height="${h}" fill="${f}"/>
          <rect x="${x}" y="${1000 - h}" width="${w}" height="7" fill="#39434f"/>`
       + windowsRect(rnd, x + 10, 1000 - h + 16, w - 20, h - 40, 6, Math.round(h / 62), .24, "#ffe3a1");
  }
  /* construction crane */
  s += `<g stroke="#161d26" stroke-width="7" fill="none">
    <line x1="900" y1="1000" x2="900" y2="560"/><line x1="820" y1="560" x2="1080" y2="560"/>
    <line x1="900" y1="520" x2="900" y2="560"/><line x1="900" y1="520" x2="1080" y2="560"/>
    <line x1="900" y1="520" x2="820" y2="560"/></g>
    <line x1="1040" y1="560" x2="1040" y2="660" stroke="#161d26" stroke-width="3"/>`;
  return `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice">${s}</svg>`;
}
document.getElementById("skyline-far").innerHTML = skylineFar();
document.getElementById("skyline-mid").innerHTML = skylineMid();
document.getElementById("skyline-near").innerHTML = skylineNear();

const fallSky = document.getElementById("fall-sky");
const droplet = document.getElementById("droplet");
const altim = document.getElementById("altimeter");
const layFar = document.getElementById("skyline-far");
const layMid = document.getElementById("skyline-mid");
const layNear = document.getElementById("skyline-near");
const cnLight = document.getElementById("cn-light");
scene("sc-fall", (p, t) => {
  fallSky.style.setProperty("--c1", mix("#2b3a4a", "#1f2835", p));
  fallSky.style.setProperty("--c2", mix("#506377", "#39465a", p));
  const vh = innerHeight, e = p;                        // linear fall
  layFar.style.transform = `translate3d(0,${((1 - e) * .58 * vh).toFixed(1)}px,0)`;
  layMid.style.transform = `translate3d(0,${((1 - e) * .95 * vh).toFixed(1)}px,0)`;
  layNear.style.transform = `translate3d(0,${((1 - e) * 1.38 * vh).toFixed(1)}px,0)`;
  const sway = REDUCED ? 0 : Math.sin(t * 1.15) * 26;
  droplet.style.transform =
    `translate(${sway.toFixed(1)}px,${(Math.sin(t * 2.3) * 6).toFixed(1)}px) rotate(${(sway * .35).toFixed(1)}deg) scale(${(1 + p * .3).toFixed(2)})`;
  const alt = Math.max(0, Math.round(2400 * (1 - p) / 10) * 10);
  altim.textContent = alt > 0 ? alt.toLocaleString("en-CA") + " m" : "· splash ·";
  if (cnLight) cnLight.style.opacity = (Math.sin(t * 2.4) > 0 ? 1 : .15);
  rain.target = lerp(.25, 1, ease(p)); rain.host = "sc-fall";
});
rainCanvas("sc-fall");

/* ════════════════════════════════════════════════════════════════════════
   Shared street art (used by III · flood and VII · creek)
   ═══════════════════════════════════════════════════════════════════════ */
function person(x, y, { coat = "#c0392b", skin = "#e8c39e", umb = null, flip = false,
                        sit = false, scale = 1 } = {}) {
  const u = umb ? `
    <line x1="6" y1="-78" x2="6" y2="-30" stroke="#2b2f35" stroke-width="2.6"/>
    <path d="M-24 -64 Q6 -86 36 -64 Q28 -69 21 -64 Q13 -70 6 -64 Q-1 -70 -9 -64 Q-16 -69 -24 -64 Z"
          fill="${umb}"/>` : "";
  const legs = sit
    ? `<path d="M-5 -16 L8 -12 L8 2 M3 -16 L14 -10 L14 4" stroke="#23272e" stroke-width="5" fill="none" stroke-linecap="round"/>`
    : `<line x1="-4" y1="-16" x2="-6" y2="0" stroke="#23272e" stroke-width="5.5" stroke-linecap="round"/>
       <line x1="4" y1="-16" x2="7" y2="0" stroke="#23272e" stroke-width="5.5" stroke-linecap="round"/>`;
  return `<g transform="translate(${x},${y}) scale(${flip ? -scale : scale},${scale})">
    ${legs}
    <path d="M-9 -44 Q0 -50 9 -44 L7 -15 L-7 -15 Z" fill="${coat}"/>
    <circle cx="0" cy="-53" r="8.2" fill="${skin}"/>
    <path d="M-8 -57 Q0 -64 8 -57 L8 -53 L-8 -53 Z" fill="#3a3f46"/>
    ${u}</g>`;
}
function dog(x, y, c = "#7a5b3f") {
  return `<g transform="translate(${x},${y})">
    <ellipse cx="0" cy="-12" rx="14" ry="8" fill="${c}"/>
    <circle cx="14" cy="-18" r="6" fill="${c}"/>
    <path d="M17 -23 l4 -5 2 6" fill="${c}"/>
    <line x1="-7" y1="-6" x2="-7" y2="0" stroke="${c}" stroke-width="3.4"/>
    <line x1="6" y1="-6" x2="6" y2="0" stroke="${c}" stroke-width="3.4"/>
    <path d="M-13 -14 q-6 -2 -7 -9" stroke="${c}" stroke-width="3" fill="none"/></g>`;
}

/* the building row + sidewalk + poles — identical in both eras */
function streetBase(px, day) {
  const rnd = mulberry(11);
  const litP = day ? .08 : .62;                          // lights on in the storm
  const glass = day ? "#9ec3d8" : "#1b2531";
  let w = "";                                            // windows accumulator
  const win = (x, y, ww, hh, arch) => {
    const lit = rnd() < litP;
    w += `${arch ? `<path d="M${x} ${y + 8} a${ww / 2} ${ww / 2} 0 0 1 ${ww} 0 V${y + hh} H${x} Z"`
                 : `<rect x="${x}" y="${y}" width="${ww}" height="${hh}"`}
          fill="${lit ? "#ffd98c" : glass}" ${lit ? 'opacity=".9"' : ""}/>`;
  };
  for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) win(34 + i * 74, 268 + r * 118, 38, 62, true);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 2; i++) win(300 + i * 170, 312 + r * 112, 52, 70);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) win(596 + i * 62, 196 + r * 86, 36, 56);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) win(942 + i * 82, 320 + r * 96, 44, 60);
  for (let i = 0; i < 4; i++) win(1292 + i * 82, 312, 46, 96, true);
  const neon = day ? "#3c5666" : "#7fd4ff";
  const alleySky = day ? "" : `<rect x="1180" y="330" width="76" height="290" fill="#0e141c"/>`;
  return `
  <defs>
    <linearGradient id="${px}-awn" x1="0" x2="1" y1="0" y2="0">
      ${[0,.125,.25,.375,.5,.625,.75,.875].map((o,i) =>
        `<stop offset="${o}" stop-color="${i%2?"#efe9df":"#b8392f"}"/>
         <stop offset="${o+.124}" stop-color="${i%2?"#efe9df":"#b8392f"}"/>`).join("")}
    </linearGradient>
  </defs>
  ${alleySky}
  <g opacity="${day ? .5 : .85}">
    <polygon points="1206,620 1211,392 1219,392 1224,620" fill="${day ? "#9db8cc" : "#1a2330"}"/>
    <rect x="1198" y="382" width="34" height="20" rx="8" fill="${day ? "#9db8cc" : "#1a2330"}"/>
    <rect x="1213" y="330" width="3" height="52" fill="${day ? "#9db8cc" : "#1a2330"}"/>
  </g>
  <!-- B1 laundromat -->
  <rect x="0" y="200" width="260" height="420" fill="#6e4a3a"/>
  <rect x="0" y="196" width="260" height="16" fill="#503628"/>
  <rect x="14" y="505" width="232" height="36" fill="#233140"/>
  <text x="130" y="530" font-family="Georgia,serif" font-size="20" fill="#cfe3f0" text-anchor="middle" letter-spacing="4">WASH &amp; FOLD</text>
  <rect x="14" y="541" width="232" height="79" fill="${glass}"/>
  <rect x="14" y="541" width="232" height="79" fill="none" stroke="#3b2b22" stroke-width="5"/>
  <!-- B2 café -->
  <rect x="260" y="250" width="300" height="370" fill="#7d4034"/>
  <rect x="260" y="244" width="300" height="14" fill="#5a2c23"/>
  <rect x="272" y="505" width="276" height="34" fill="#1d2b26"/>
  <text x="410" y="529" font-family="Georgia,serif" font-size="19" fill="#ffd9a0" text-anchor="middle" letter-spacing="5">CAFÉ DON</text>
  <rect x="272" y="576" width="276" height="44" fill="${glass}"/>
  <polygon points="268,540 552,540 570,578 250,578" fill="url(#${px}-awn)"/>
  <!-- B3 hardware + stoop door -->
  <rect x="560" y="150" width="345" height="470" fill="#8a6d3b"/>
  <rect x="560" y="144" width="345" height="14" fill="#6b5430"/>
  <rect x="572" y="470" width="321" height="34" fill="#20303c"/>
  <text x="732" y="494" font-family="Georgia,serif" font-size="18" fill="#f0e6c8" text-anchor="middle" letter-spacing="3">RIVERSIDE HARDWARE</text>
  <rect x="660" y="510" width="233" height="110" fill="${glass}"/>
  <rect x="660" y="510" width="233" height="110" fill="none" stroke="#4a3a24" stroke-width="5"/>
  <rect x="676" y="566" width="26" height="40" fill="#b8552f"/><rect x="710" y="556" width="26" height="50" fill="#3d6b8e"/>
  <rect x="744" y="572" width="30" height="34" fill="#5b7444"/><rect x="782" y="560" width="24" height="46" fill="#b8972f"/>
  <rect x="585" y="500" width="58" height="120" fill="#3b2f26"/>
  <rect x="592" y="512" width="44" height="50" fill="${day ? "#b9d6e6" : "#2c3947"}"/>
  <!-- B4 books -->
  <rect x="905" y="280" width="275" height="340" fill="#4f5b66"/>
  <rect x="905" y="274" width="275" height="12" fill="#39434c"/>
  <rect x="918" y="520" width="250" height="32" fill="#14202b"/>
  <text x="1043" y="543" font-family="Georgia,serif" font-size="19" fill="${neon}" text-anchor="middle" letter-spacing="8">BOOKS</text>
  <rect x="918" y="552" width="250" height="68" fill="${glass}"/>
  <rect x="918" y="552" width="250" height="68" fill="none" stroke="#2c333b" stroke-width="5"/>
  <!-- B5 bank -->
  <rect x="1256" y="200" width="344" height="420" fill="#5d6470"/>
  <rect x="1256" y="192" width="344" height="18" fill="#454b55"/>
  <rect x="1256" y="252" width="344" height="30" fill="#4a505b"/>
  <text x="1428" y="274" font-family="Georgia,serif" font-size="17" fill="#cfd6dd" text-anchor="middle" letter-spacing="6">DOMINION TRUST</text>
  ${[1280,1356,1432,1508].map(x => `<rect x="${x}" y="282" width="13" height="280" fill="#6a727f"/>`).join("")}
  <path d="M1395 620 V500 a35 35 0 0 1 70 0 V620 Z" fill="#343b46"/>
  ${w}
  <!-- sidewalk -->
  <rect x="0" y="620" width="1600" height="40" fill="#565d66"/>
  <rect x="0" y="656" width="1600" height="12" fill="#41474f"/>
  ${[120,420,720,1020,1320].map(x => `<line x1="${x}" y1="620" x2="${x}" y2="656" stroke="#41474f" stroke-width="2"/>`).join("")}
  <!-- stoop steps up to the hardware door -->
  <rect x="575" y="600" width="78" height="20" fill="#4a4f57"/>
  <rect x="583" y="584" width="62" height="16" fill="#555b64"/>
  <rect x="591" y="568" width="46" height="16" fill="#60666f"/>
  <!-- street furniture -->
  <g stroke="#23282e" stroke-width="7" fill="none">
    <line x1="180" y1="660" x2="180" y2="408"/><line x1="1340" y1="660" x2="1340" y2="408"/>
  </g>
  <line x1="0" y1="470" x2="1600" y2="470" stroke="#383d44" stroke-width="2.6"/>
  <line x1="180" y1="412" x2="330" y2="470" stroke="#383d44" stroke-width="2"/>
  <line x1="1340" y1="412" x2="1190" y2="470" stroke="#383d44" stroke-width="2"/>
  <path d="M180 430 q60 -8 86 22" stroke="#23282e" stroke-width="6" fill="none"/>
  <path d="M1340 430 q-60 -8 -86 22" stroke="#23282e" stroke-width="6" fill="none"/>
  <ellipse cx="270" cy="452" rx="17" ry="8" fill="${day ? "#3a4148" : "#ffe9b0"}"/>
  <ellipse cx="1250" cy="452" rx="17" ry="8" fill="${day ? "#3a4148" : "#ffe9b0"}"/>
  ${day ? "" : `<polygon points="270,456 212,660 328,660" fill="#ffe9b0" opacity=".1"/>
               <polygon points="1250,456 1192,660 1308,660" fill="#ffe9b0" opacity=".1"/>`}
  <!-- street signs -->
  <line x1="78" y1="660" x2="78" y2="486" stroke="#2c3138" stroke-width="6"/>
  <rect x="40" y="486" width="148" height="24" rx="4" fill="#1c5e3c"/>
  <text x="114" y="503" font-family="system-ui,sans-serif" font-size="14" fill="#fff" text-anchor="middle" letter-spacing="1">QUEEN ST E</text>
  <rect x="52" y="514" width="120" height="22" rx="4" fill="#1c5e3c"/>
  <text x="112" y="530" font-family="system-ui,sans-serif" font-size="13" fill="#fff" text-anchor="middle" letter-spacing="1">RIVER ST</text>
  <!-- TTC stop -->
  <line x1="430" y1="660" x2="430" y2="520" stroke="#b0b6bd" stroke-width="5"/>
  <rect x="420" y="520" width="20" height="42" rx="3" fill="#d6342c"/>
  <circle cx="430" cy="534" r="6" fill="#fff"/>
  <!-- hydrant -->
  <g transform="translate(1230,656)">
    <rect x="-11" y="-30" width="22" height="30" rx="6" fill="#f2b630"/>
    <rect x="-15" y="-12" width="30" height="6" fill="#d89c1d"/>
    <circle cx="0" cy="-32" r="7" fill="#c0392b"/>
  </g>
  <!-- bench + bin (sidewalk) -->
  <g transform="translate(840,656)">
    <rect x="-40" y="-22" width="80" height="7" rx="3" fill="#6b4a2f"/>
    <rect x="-40" y="-34" width="80" height="7" rx="3" fill="#6b4a2f"/>
    <line x1="-32" y1="-22" x2="-32" y2="0" stroke="#2c3138" stroke-width="5"/>
    <line x1="32" y1="-22" x2="32" y2="0" stroke="#2c3138" stroke-width="5"/>
  </g>
  <g transform="translate(1130,656)">
    <rect x="-13" y="-34" width="26" height="34" rx="4" fill="#37424c"/>
    <rect x="-15" y="-38" width="30" height="7" rx="3" fill="#2a333c"/>
  </g>`;
}
function railsBand(y0) {                                 // streetcar right-of-way
  return `
  <rect x="0" y="${y0}" width="1600" height="86" fill="#3a4047"/>
  <line x1="0" y1="${y0 + 22}" x2="1600" y2="${y0 + 22}" stroke="#21262c" stroke-width="4"/>
  <line x1="0" y1="${y0 + 26}" x2="1600" y2="${y0 + 26}" stroke="#828c96" stroke-width="2"/>
  <line x1="0" y1="${y0 + 64}" x2="1600" y2="${y0 + 64}" stroke="#21262c" stroke-width="4"/>
  <line x1="0" y1="${y0 + 68}" x2="1600" y2="${y0 + 68}" stroke="#828c96" stroke-width="2"/>`;
}
function streetcar(px) {
  let wins = "";
  for (const x of [26, 96, 218, 288, 396, 466, 588]) {
    if (x === 218 || x === 466) {                        // doors
      wins += `<rect x="${x}" y="-206" width="58" height="180" fill="#2b333d"/>
        <line x1="${x + 29}" y1="-206" x2="${x + 29}" y2="-26" stroke="#1a2026" stroke-width="2.5"/>
        <rect x="${x + 6}" y="-196" width="46" height="74" class="${px}-tcwin" fill="#ffe2a0" opacity=".85"/>`;
    } else {
      wins += `<rect x="${x}" y="-200" width="58" height="92" rx="6" class="${px}-tcwin" fill="#ffe2a0" opacity=".85"/>`;
    }
  }
  return `
  <g stroke="#454e59" stroke-width="3.6" fill="none">
    <path d="M250 -244 L320 -312 L272 -350"/><line x1="238" y1="-350" x2="306" y2="-350" stroke-width="5"/>
  </g>
  <rect x="60" y="-20" width="110" height="20" fill="#14181d"/>
  <rect x="500" y="-20" width="110" height="20" fill="#14181d"/>
  ${[84,146,524,586].map(x => `<circle cx="${x}" cy="-2" r="15" fill="#0c0f13"/><circle cx="${x}" cy="-2" r="5.5" fill="#3c454f"/>`).join("")}
  <path d="M0 -230 Q0 -244 16 -244 L646 -244 Q716 -240 736 -160 Q744 -96 730 -34 Q724 -18 704 -18 L16 -18 Q0 -18 0 -32 Z" fill="#d6342c"/>
  <path d="M0 -230 Q0 -244 16 -244 L646 -244 L700 -240 L700 -222 L0 -218 Z" fill="#b9251a"/>
  <path d="M646 -160 Q716 -156 728 -110 Q734 -70 724 -34 Q720 -22 702 -22 L646 -22 Z" fill="#f4f4f2"/>
  <path d="M652 -238 Q716 -230 732 -160 L652 -160 Z" fill="#1c232b"/>
  <rect x="14" y="-206" width="620" height="104" fill="#232a33"/>
  ${wins}
  <rect x="332" y="-244" width="34" height="226" fill="#20262e"/>
  ${[338,346,354,362].map(x => `<line x1="${x}" y1="-240" x2="${x}" y2="-22" stroke="#161b21" stroke-width="2"/>`).join("")}
  <rect x="556" y="-240" width="84" height="24" rx="4" fill="#0e1115"/>
  <text x="598" y="-223" font-family="ui-monospace,monospace" font-size="14" fill="#ff9e1b" text-anchor="middle">501 QUEEN</text>
  <circle cx="734" cy="-58" r="7" fill="#fff8d9"/>
  <circle cx="6" cy="-58" r="6" fill="#e74c3c"/>
  <rect x="100" y="-216" width="430" height="5" fill="#8d1d14"/>`;
}
function sedan() {
  return `
  <path d="M0 -24 Q0 -15 9 -14 L238 -14 Q247 -15 247 -24 L245 -45 Q243 -52 234 -53 L196 -56 Q166 -76 120 -76 Q74 -76 48 -56 L13 -52 Q2 -50 1 -42 Z" fill="#97a1ac"/>
  <path d="M58 -56 L112 -70 L116 -56 Z M124 -70 L168 -68 L186 -56 L124 -56 Z" fill="#1f2730"/>
  <rect x="120" y="-72" width="5" height="16" fill="#7b858f"/>
  <circle cx="56" cy="-12" r="17" fill="#11151a"/><circle cx="56" cy="-12" r="6.5" fill="#3c454f"/>
  <circle cx="194" cy="-12" r="17" fill="#11151a"/><circle cx="194" cy="-12" r="6.5" fill="#3c454f"/>
  <rect x="240" y="-46" width="7" height="8" rx="2" fill="#fff3c4"/>
  <rect x="0" y="-44" width="6" height="8" rx="2" fill="#c0392b"/>`;
}
function hatchback() {
  return `
  <path d="M0 -22 Q0 -13 8 -13 L196 -13 Q204 -13 204 -22 L203 -42 Q202 -50 192 -52 L160 -55 Q140 -72 96 -72 L60 -72 Q34 -70 22 -52 L10 -50 Q1 -48 1 -40 Z" fill="#3f6f74"/>
  <path d="M62 -54 L96 -66 L130 -66 L142 -54 Z" fill="#1d262e"/>
  <circle cx="48" cy="-11" r="15" fill="#11151a"/><circle cx="48" cy="-11" r="5.5" fill="#39434d"/>
  <circle cx="162" cy="-11" r="15" fill="#11151a"/><circle cx="162" cy="-11" r="5.5" fill="#39434d"/>
  <rect x="0" y="-42" width="6" height="7" rx="2" fill="#fff3c4"/>
  <rect x="198" y="-40" width="6" height="7" rx="2" fill="#c0392b"/>`;
}
function wavePath(width, amp, lam) {
  let d = `M0 0`;
  for (let x = 0; x < width; x += lam)
    d += ` q${lam / 4} ${-amp} ${lam / 2} 0 q${lam / 4} ${amp} ${lam / 2} 0`;
  return d + ` V 320 H 0 Z`;
}

/* ════════════════════════════════════════════════════════════════════════
   III · THE FLOOD
   ═══════════════════════════════════════════════════════════════════════ */
{
  const svg = document.getElementById("street-flood");
  svg.innerHTML = `
  ${streetBase("sf", false)}
  <!-- refuge: the bank's raised entrance steps (right of the sedan, stays dry) -->
  <rect x="1382" y="600" width="96" height="20" fill="#4a505b"/>
  <rect x="1390" y="584" width="80" height="16" fill="#555b66"/>
  <rect x="1398" y="568" width="64" height="16" fill="#606771"/>
  <g id="sf-peds-a">
    ${person(88, 656, { coat: "#b03a2e", umb: "#c0392b" })}
    ${person(128, 656, { coat: "#34495e", umb: "#23272b" })}
    ${person(158, 656, { coat: "#7d6608", umb: "#23272b", flip: true })}
    ${person(1092, 656, { coat: "#1f618d", umb: "#196f3d" })}
    ${dog(1126, 656)}
    ${person(1308, 656, { coat: "#f1c40f", flip: true })}
  </g>
  <rect x="0" y="668" width="1600" height="232" fill="#2a2f36"/>
  ${railsBand(745)}
  <ellipse cx="1050" cy="858" rx="27" ry="7.5" fill="#171b20"/>
  <g id="sf-hatch" transform="translate(120,736) scale(-1,1) translate(-204,0)">${hatchback()}</g>
  <g id="sf-tc" transform="translate(310,818)">${streetcar("sf")}
    <polygon id="sf-tc-cone" points="744,-58 856,-26 856,-84" fill="#fff3c4" opacity="0"/>
  </g>
  <g id="sf-sedan" transform="translate(1120,886)">${sedan()}
    <circle class="sf-haz" cx="22" cy="-66" r="5" fill="#ff9e1b"/>
    <circle class="sf-haz" cx="226" cy="-68" r="5" fill="#ff9e1b"/>
    <polygon id="sf-sedan-cone" points="247,-40 332,-16 332,-58" fill="#fff3c4" opacity="0"/>
  </g>
  <g id="sf-geyser" opacity="0">
    <g id="sf-geyser-inner" transform="translate(1050,852)">
      <path d="M-8 0 Q-14 -60 -30 -88 L-14 -78 Q-6 -50 -2 0 Z" fill="#dfe9ee" opacity=".75"/>
      <path d="M8 0 Q14 -64 32 -94 L18 -80 Q8 -52 3 0 Z" fill="#dfe9ee" opacity=".75"/>
      <path d="M-3 0 Q0 -70 0 -104 Q4 -72 5 0 Z" fill="#f2f7f9" opacity=".9"/>
      <circle cx="-22" cy="-96" r="4" fill="#dfe9ee" opacity=".8"/>
      <circle cx="26" cy="-102" r="5" fill="#dfe9ee" opacity=".8"/>
      <ellipse cx="34" cy="-6" rx="22" ry="6" fill="#14171c"
               transform="rotate(-18 34 -6)"/>
    </g>
  </g>
  <g id="sf-water" transform="translate(0,905)">
    <path id="sf-waveB" d="${wavePath(3400, 8, 150)}" fill="#6a5e4b" opacity=".66"/>
    <path id="sf-waveA" d="${wavePath(3400, 7, 124)}" fill="#4e4435" opacity=".93"/>
    <rect x="-200" y="14" width="2000" height="900" fill="#463d2f" opacity=".95"/>
    <g id="sf-drift" fill="#3a3226" opacity=".8">
      <ellipse cx="300" cy="70" rx="150" ry="7"/><ellipse cx="900" cy="130" rx="220" ry="9"/>
      <ellipse cx="1400" cy="60" rx="130" ry="6"/><ellipse cx="600" cy="210" rx="260" ry="11"/>
      <ellipse cx="1200" cy="250" rx="180" ry="9"/><ellipse cx="1850" cy="120" rx="210" ry="8"/>
      <ellipse cx="2150" cy="240" rx="170" ry="10"/><ellipse cx="2050" cy="55" rx="140" ry="6"/>
    </g>
    <g id="sf-debris">
      <g class="sf-bob"><polygon points="0,0 11,-34 22,0" fill="#e67e22"/>
        <rect x="-4" y="-3" width="30" height="6" rx="2" fill="#d35400"/></g>
      <g class="sf-bob"><rect x="0" y="-30" width="34" height="30" rx="4" fill="#2563a8"/>
        <rect x="3" y="-26" width="28" height="12" fill="#173f6b"/></g>
      <g class="sf-bob"><rect x="0" y="-26" width="40" height="26" rx="6" fill="#d23f2f"/>
        <rect x="6" y="-20" width="28" height="10" rx="2" fill="#8e2418"/></g>
      <g class="sf-bob"><path d="M0 -6 Q14 -22 30 -8 Q16 -14 8 -4 Z" fill="#23272b"/>
        <line x1="14" y1="-12" x2="20" y2="2" stroke="#4a4f55" stroke-width="2.4"/></g>
    </g>
  </g>
  <g id="sf-peds-b" opacity="0">
    ${person(1414, 568, { coat: "#34495e", umb: "#23272b" })}
    ${person(1444, 568, { coat: "#7d6608", flip: true })}
    ${person(1404, 590, { coat: "#f1c40f", umb: "#c0392b" })}
    ${person(1452, 596, { coat: "#1f618d" })}
    ${dog(1432, 568, "#7a5b3f")}
  </g>`;

  const g = id => svg.querySelector(id);
  const water = g("#sf-water"), waveA = g("#sf-waveA"), waveB = g("#sf-waveB");
  const drift = g("#sf-drift");
  const geyser = g("#sf-geyser"), geyserIn = g("#sf-geyser-inner");
  const pedsA = g("#sf-peds-a"), pedsB = g("#sf-peds-b");
  const tcCone = g("#sf-tc-cone"), sedCone = g("#sf-sedan-cone");
  const bobs = [...svg.querySelectorAll(".sf-bob")];
  const hazards = [...svg.querySelectorAll(".sf-haz")];
  const tcWins = [...svg.querySelectorAll(".sf-tcwin")];
  const bobX = [220, 700, 1240, 1450];
  const floodSkyEl = document.getElementById("flood-sky");
  let floodFlashes = [0, 0, 0];

  scene("sc-flood", (p, t) => {
    floodSkyEl.style.setProperty("--c1", mix("#1f2835", "#161d27", ease(map(p, .2, .7))));
    floodSkyEl.style.setProperty("--c2", mix("#39465a", "#2b3646", ease(map(p, .2, .7))));
    /* water level in three phases: sheet across the road → up the doors → surge */
    const lvl = p < .5 ? lerp(902, 800, ease(map(p, .07, .5)))
              : p < .78 ? lerp(800, 736, map(p, .5, .78))
              : lerp(736, 640, ease(map(p, .78, .94)));
    water.setAttribute("transform", `translate(0,${lvl.toFixed(1)})`);
    const ph = REDUCED ? 0 : t * 46;
    waveA.setAttribute("transform", `translate(${(-(ph % 124)).toFixed(1)},0)`);
    waveB.setAttribute("transform", `translate(${((ph * .6 % 150) - 150).toFixed(1)},0)`);
    drift.setAttribute("transform", `translate(${(-(ph * .3 % 400)).toFixed(1)},0)`);
    bobs.forEach((b, i) => {
      const bb = Math.sin(t * 1.4 + i * 1.7) * 4.5, dx = Math.sin(t * .5 + i * 2.4) * 9;
      b.setAttribute("transform",
        `translate(${(bobX[i] + dx).toFixed(1)},${(bb - 2).toFixed(1)}) rotate(${(Math.sin(t * 1.1 + i) * 6).toFixed(1)})`);
      b.setAttribute("opacity", map(p, .3, .42).toFixed(2));
    });
    /* manhole geyser — until it drowns */
    const gey = map(p, .22, .32) * (1 - map(p, .52, .62));
    geyser.setAttribute("opacity", gey.toFixed(2));
    geyserIn.setAttribute("transform",
      `translate(1050,852) scale(1,${(gey * (1 + (REDUCED ? 0 : Math.sin(t * 7) * .14))).toFixed(2)})`);
    /* people retreat to the stoop */
    pedsA.setAttribute("opacity", (1 - map(p, .26, .38)).toFixed(2));
    pedsB.setAttribute("opacity", map(p, .34, .46).toFixed(2));
    /* lights */
    const lightsOn = map(p, .12, .2);
    tcCone.setAttribute("opacity", (lightsOn * .3).toFixed(2));
    sedCone.setAttribute("opacity", (lightsOn * .3).toFixed(2));
    hazards.forEach(h => h.setAttribute("opacity",
      p > .3 && Math.sin(t * 7) > 0 ? .95 : .08));
    const flick = p > .78 ? (Math.sin(t * 31) + Math.sin(t * 47) > -.5 ? .85 : .2) : .85;
    tcWins.forEach(wn => wn.setAttribute("opacity", flick.toFixed(2)));
    if (p > .1 && !floodFlashes[0]) { floodFlashes[0] = 1; flash(.5); }
    if (p > .45 && !floodFlashes[1]) { floodFlashes[1] = 1; flash(.8); }
    if (p > .8 && !floodFlashes[2]) { floodFlashes[2] = 1; flash(.6); }
    if (p < .03) floodFlashes = [0, 0, 0];
    rain.target = lerp(1, .75, p); rain.host = "sc-flood";
  });
  rainCanvas("sc-flood");
}

/* ════════════════════════════════════════════════════════════════════════
   ⏮ REWIND — 2024 → 1882
   ═══════════════════════════════════════════════════════════════════════ */
{
  const yEl = document.getElementById("rw-year");
  const sticky = document.getElementById("rw-sticky");
  const flux = document.getElementById("rw-flux");
  const burst = document.getElementById("rw-burst");
  const STOPS = [[0, 2024], [.22, 1954], [.46, 1924], [.72, 1884], [.92, 1882], [1, 1882]];
  let crossed = new Set(), warped = false;
  /* light-streak field for the time-tunnel — seeded so it's stable */
  const STREAKS = [];
  { const rnd = mulberry(91);
    for (let i = 0; i < 90; i++) STREAKS.push({ a: rnd() * TAU, r0: lerp(.05, 1, rnd()), len: lerp(.06, .2, rnd()), hue: rnd() }); }

  scene("sc-rewind", (p, t) => {
    let year = 1882;
    for (let i = 1; i < STOPS.length; i++) {
      if (p <= STOPS[i][0]) {
        year = Math.round(lerp(STOPS[i - 1][1], STOPS[i][1], map(p, STOPS[i - 1][0], STOPS[i][0])));
        break;
      }
    }
    yEl.textContent = year;
    /* fire the time-machine sweep once on entry */
    if (p > .04 && !warped) { warped = true; if (window.HR && HR.audio) HR.audio.sfx.warp(); }
    for (const [pp] of STOPS) {
      if (pp > 0 && pp < 1 && p > pp && !crossed.has(pp)) { crossed.add(pp); flash(.4); }
    }
    if (p < .02) { crossed = new Set(); warped = false; }
    const j = REDUCED ? 0 : Math.sin(t * 57) * 2.4 * map(p, .03, .12) * (1 - map(p, .85, .98));
    yEl.style.transform = `translate(-50%,-50%) translateX(${j.toFixed(1)}px)`;
    sticky.style.filter = `sepia(${(ease(p) * .75).toFixed(2)}) saturate(${(1 - ease(p) * .35).toFixed(2)})`;

    /* Back-to-the-Future light tunnel: streaks tear outward from the centre,
       brightest mid-flight, then a white burst as we land in 1882 */
    const dpr = sizeCanvas(flux), ctx = flux.getContext("2d");
    const W = flux.width, H = flux.height, cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);
    const intensity = ease(map(p, .04, .55)) * (1 - ease(map(p, .82, .98)));
    if (!REDUCED && intensity > .01) {
      const maxR = Math.hypot(cx, cy);
      ctx.lineCap = "round";
      for (const s of STREAKS) {
        const phase = (t * .9 + s.r0 + s.hue) % 1;          // travel outward, wrap
        const r1 = phase * 1.05;
        const r0 = Math.max(0, r1 - s.len * (.5 + intensity));
        const x1 = cx + Math.cos(s.a) * r0 * maxR, y1 = cy + Math.sin(s.a) * r0 * maxR;
        const x2 = cx + Math.cos(s.a) * r1 * maxR, y2 = cy + Math.sin(s.a) * r1 * maxR;
        const warm = year > 1930 ? "120,200,255" : "255,210,150";
        ctx.strokeStyle = `rgba(${warm},${(intensity * (.25 + .55 * phase)).toFixed(3)})`;
        ctx.lineWidth = dpr * (1 + 2 * phase) * (.6 + intensity);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      /* a small bright core that pulses with the flight */
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * .25);
      core.addColorStop(0, `rgba(200,230,255,${(intensity * .4).toFixed(3)})`);
      core.addColorStop(1, "rgba(200,230,255,0)");
      ctx.fillStyle = core; ctx.fillRect(0, 0, W, H);
    }
    /* arrival burst */
    if (burst) burst.style.opacity = (ease(map(p, .86, .93)) * (1 - ease(map(p, .93, .99)))).toFixed(2);

    rain.target = (1 - p) * .3; rain.host = p < .5 ? "sc-rewind" : rain.host;
  });
  rainCanvas("sc-rewind");
}

/* ════════════════════════════════════════════════════════════════════════
   IV · THE STINK — Ashbridge's Bay, 1882 ("Great Stink" tableau)
   ═══════════════════════════════════════════════════════════════════════ */
{
  const svg = document.getElementById("stink-bay");
  svg.innerHTML = `
  <defs>
    <linearGradient id="st-water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5c5a26"/><stop offset=".45" stop-color="#45441e"/>
      <stop offset="1" stop-color="#2a2a12"/>
    </linearGradient>
    <radialGradient id="st-sun" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#d8c86a" stop-opacity=".8"/>
      <stop offset="1" stop-color="#d8c86a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- a sickly sun through the haze -->
  <circle cx="1180" cy="170" r="180" fill="url(#st-sun)"/>
  <circle cx="1180" cy="170" r="44" fill="#e6d47c" opacity=".85"/>
  <!-- 1882 skyline across the bay: chimneys, spires, the Gooderham windmill -->
  <g fill="#3b3720">
    <rect x="0" y="470" width="1600" height="60"/>
    <rect x="60" y="404" width="120" height="70"/><rect x="95" y="330" width="16" height="80"/>
    <rect x="230" y="420" width="150" height="54"/><rect x="262" y="348" width="14" height="76"/>
    <rect x="308" y="360" width="14" height="64"/>
    <polygon points="450,474 450,392 470,392 470,352 480,326 490,352 490,392 510,392 510,474"/>
    <rect x="560" y="430" width="180" height="44"/><rect x="600" y="352" width="15" height="82"/>
    <rect x="680" y="368" width="15" height="66"/>
    <polygon points="820,474 820,380 860,342 900,380 900,474"/>
    <rect x="852" y="300" width="16" height="52"/><polygon points="845,304 875,304 860,272"/>
    <g id="st-mill">
      <rect x="1046" y="380" width="26" height="94"/>
      <polygon points="1042,384 1076,384 1064,330 1054,330"/>
      <g id="st-sails" stroke="#3b3720" stroke-width="9" stroke-linecap="round">
        <line x1="1059" y1="332" x2="1059" y2="266"/><line x1="1059" y1="332" x2="1059" y2="398"/>
        <line x1="1026" y1="332" x2="1092" y2="332"/>
      </g>
    </g>
    <rect x="1180" y="416" width="200" height="58"/>
    <rect x="1224" y="336" width="16" height="84"/><rect x="1300" y="352" width="16" height="68"/>
    <rect x="1460" y="430" width="140" height="44"/><rect x="1500" y="360" width="15" height="74"/>
  </g>
  <!-- chimney smoke, drifting -->
  <g id="st-smoke" fill="#565137" opacity=".55">
    <ellipse cx="102" cy="312" rx="26" ry="10"/><ellipse cx="130" cy="292" rx="34" ry="12"/>
    <ellipse cx="607" cy="336" rx="24" ry="9"/><ellipse cx="636" cy="318" rx="30" ry="11"/>
    <ellipse cx="1232" cy="318" rx="26" ry="10"/><ellipse cx="1262" cy="298" rx="34" ry="12"/>
  </g>
  <!-- the bay -->
  <rect x="0" y="524" width="1600" height="376" fill="url(#st-water)"/>
  <path id="st-wave" d="${wavePath(3400, 6, 140)}" fill="#6a6630" opacity=".5" transform="translate(0,524)"/>
  <!-- oily sheen + scum mats -->
  <g fill="#7a7434" opacity=".45">
    <ellipse cx="300" cy="600" rx="180" ry="12"/><ellipse cx="760" cy="650" rx="240" ry="14"/>
    <ellipse cx="1240" cy="610" rx="200" ry="12"/><ellipse cx="500" cy="730" rx="300" ry="18"/>
    <ellipse cx="1100" cy="780" rx="340" ry="20"/>
  </g>
  <g stroke="#8d8449" stroke-width="2.5" opacity=".5" fill="none">
    <path d="M180 640 q60 -10 120 0 q40 8 90 0"/>
    <path d="M900 700 q80 -12 160 0"/>
    <path d="M1240 660 q60 -8 120 0"/>
  </g>
  <!-- outfall sewers discharging at the shore -->
  <g>
    <rect x="0" y="560" width="150" height="80" fill="#4a3520"/>
    <path d="M150 560 v80 h-40 a52 40 0 0 1 40 -80 Z" fill="#241a0c"/>
    <path d="M118 600 a34 26 0 0 1 64 0 Z" fill="#120d06" transform="rotate(90 150 600)"/>
    <path id="st-sludge1" d="M148 596 q60 10 120 26 q60 16 100 30 l0 14 q-60 -18 -110 -30 q-60 -16 -110 -26 Z" fill="#33301a" opacity=".9"/>
    <rect x="0" y="700" width="90" height="70" fill="#4a3520"/>
    <path d="M90 700 v70 h-34 a44 35 0 0 1 34 -70 Z" fill="#241a0c"/>
    <path id="st-sludge2" d="M88 736 q70 12 130 30 l0 14 q-70 -20 -130 -30 Z" fill="#33301a" opacity=".9"/>
  </g>
  <!-- cattle byres + privy on stilts over the water -->
  <g>
    <g fill="#4c3a22">
      <rect x="1290" y="536" width="150" height="64"/>
      <polygon points="1282,536 1448,536 1365,498"/>
      <rect x="1300" y="600" width="10" height="42"/><rect x="1350" y="600" width="10" height="46"/>
      <rect x="1420" y="600" width="10" height="42"/>
    </g>
    <rect x="1306" y="556" width="26" height="30" fill="#241a0c"/>
    <g fill="#4c3a22">
      <rect x="1490" y="560" width="54" height="58"/>
      <polygon points="1484,560 1550,560 1517,534"/>
      <rect x="1500" y="618" width="8" height="34"/><rect x="1530" y="618" width="8" height="34"/>
    </g>
    <rect x="1506" y="576" width="20" height="42" fill="#241a0c"/>
    <path d="M1440 604 q40 14 60 30 l0 12 q-30 -18 -60 -30 Z" fill="#3a3218" opacity=".85"/>
  </g>
  <!-- flotsam: barrel, plank, bottle, and the fish that didn't make it -->
  <g id="st-flotsam">
    <g class="st-bob"><ellipse cx="0" cy="0" rx="26" ry="10" fill="#4a3520"/>
      <line x1="-22" y1="-4" x2="22" y2="-4" stroke="#2c2010" stroke-width="3"/></g>
    <g class="st-bob"><rect x="-38" y="-5" width="76" height="8" rx="2" fill="#4a3a24"/></g>
    <g class="st-bob"><ellipse cx="0" cy="0" rx="7" ry="11" fill="#3a4a34" transform="rotate(70)"/></g>
    <g class="st-fish"><ellipse cx="0" cy="0" rx="17" ry="6" fill="#c9c4a0"/>
      <polygon points="15,0 24,-5 24,5" fill="#c9c4a0"/><circle cx="-8" cy="-1" r="1.6" fill="#55502e"/></g>
    <g class="st-fish"><ellipse cx="0" cy="0" rx="13" ry="5" fill="#c9c4a0"/>
      <polygon points="11,0 19,-4 19,4" fill="#c9c4a0"/></g>
    <g class="st-fish"><ellipse cx="0" cy="0" rx="15" ry="5.5" fill="#c9c4a0"/>
      <polygon points="13,0 21,-4 21,4" fill="#c9c4a0"/></g>
  </g>
  <!-- a rowboat: the health inspector, handkerchief pressed to his face -->
  <g id="st-boat">
    <path d="M-70 0 Q0 26 70 0 L54 -14 L-54 -14 Z" fill="#3a2c18"/>
    <line x1="24" y1="-12" x2="58" y2="6" stroke="#2c2010" stroke-width="4"/>
    <circle cx="-8" cy="-34" r="9" fill="#0e0a05"/>
    <path d="M-24 -14 Q-8 -30 8 -14 Z" fill="#0e0a05"/>
    <rect x="-4" y="-32" width="12" height="9" rx="2" fill="#c9c4a0"/>
  </g>
  <!-- bubbles of marsh gas -->
  <g fill="#8d8449">
    <circle class="st-bub" cx="380" cy="700" r="4"/><circle class="st-bub" cx="620" cy="760" r="5"/>
    <circle class="st-bub" cx="840" cy="690" r="3.5"/><circle class="st-bub" cx="1060" cy="740" r="4.5"/>
    <circle class="st-bub" cx="1320" cy="700" r="4"/><circle class="st-bub" cx="240" cy="770" r="5"/>
  </g>
  <!-- fly swarms -->
  <g class="st-flies" fill="#1c1a0c">
    <circle cx="0" cy="0" r="3"/><circle cx="14" cy="-8" r="2.4"/><circle cx="-12" cy="-14" r="2.6"/>
    <circle cx="6" cy="-22" r="2.2"/><circle cx="-6" cy="8" r="2.4"/>
  </g>
  <g class="st-flies" fill="#1c1a0c">
    <circle cx="0" cy="0" r="2.6"/><circle cx="-14" cy="-6" r="2.2"/><circle cx="10" cy="-16" r="2.8"/>
    <circle cx="18" cy="4" r="2"/><circle cx="-8" cy="-24" r="2.2"/>
  </g>
  <g class="st-flies" fill="#1c1a0c">
    <circle cx="0" cy="0" r="2.8"/><circle cx="12" cy="-10" r="2.2"/><circle cx="-10" cy="-6" r="2.4"/>
    <circle cx="4" cy="-20" r="2"/>
  </g>
  <!-- gulls that know better than to land -->
  <g id="st-gulls" fill="none" stroke="#2e2b16" stroke-width="3.5" stroke-linecap="round">
    <path d="M0 0 q10 -10 20 0 q10 -10 20 0"/>
    <path d="M56 -26 q8 -8 16 0 q8 -8 16 0"/>
  </g>
  <!-- miasma rising off the water -->
  <g fill="#a3a06a">
    <path class="st-fog" d="M120 640 q90 -34 220 -16 q140 18 260 -8 q90 -18 170 0 l0 44 q-160 -22 -320 0 q-180 24 -330 -20 Z" opacity=".14"/>
    <path class="st-fog" d="M700 720 q120 -40 280 -18 q160 22 300 -10 l0 48 q-180 -20 -340 4 q-140 20 -240 -24 Z" opacity=".12"/>
    <path class="st-fog" d="M300 800 q160 -36 340 -12 q200 26 420 -12 l0 56 q-260 -24 -480 0 q-180 18 -280 -32 Z" opacity=".1"/>
  </g>`;

  const q = s => svg.querySelector(s);
  const qa = s => [...svg.querySelectorAll(s)];
  const stinkSky = document.getElementById("stink-sky");
  const sails = q("#st-sails"), smoke = q("#st-smoke"), wave = q("#st-wave");
  const boat = q("#st-boat"), gulls = q("#st-gulls");
  const bobs = qa("#st-flotsam .st-bob"), fish = qa("#st-flotsam .st-fish");
  const bubs = qa(".st-bub"), swarms = qa(".st-flies"), fogs = qa(".st-fog");
  const sludge1 = q("#st-sludge1"), sludge2 = q("#st-sludge2");
  const bobX = [420, 940, 1180], fishX = [560, 720, 1420];
  const swarmBase = [[190, 560], [1360, 520], [820, 660]];

  scene("sc-stink", (p, t) => {
    /* the light goes from jaundiced noon to a bruised evening as the vote nears */
    stinkSky.style.setProperty("--c1", mix("#8f8348", "#5b5330", ease(p)));
    stinkSky.style.setProperty("--c2", mix("#c2b374", "#7d744a", ease(p)));
    const ph = REDUCED ? 0 : t * 12;
    wave.setAttribute("transform", `translate(${(-(ph % 140)).toFixed(1)},524)`);
    if (!REDUCED) {
      sails.setAttribute("transform", `rotate(${(t * 9 % 360).toFixed(1)} 1059 332)`);
      smoke.setAttribute("transform",
        `translate(${(Math.sin(t * .4) * 14 - 10).toFixed(1)},${(-(t * 5 % 26)).toFixed(1)})`);
      smoke.setAttribute("opacity", (.4 + .18 * Math.sin(t * .9)).toFixed(2));
      boat.setAttribute("transform",
        `translate(${(1030 + Math.sin(t * .22) * 40).toFixed(1)},${(636 + Math.sin(t * 1.3) * 3.5).toFixed(1)}) rotate(${(Math.sin(t * 1.1) * 2).toFixed(1)})`);
      gulls.setAttribute("transform",
        `translate(${(500 + Math.sin(t * .3) * 180).toFixed(1)},${(210 + Math.sin(t * .8) * 24).toFixed(1)})`);
      bobs.forEach((b, i) => b.setAttribute("transform",
        `translate(${(bobX[i] + Math.sin(t * .4 + i * 2.2) * 10).toFixed(1)},${(628 + i * 52 + Math.sin(t * 1.3 + i * 1.7) * 4).toFixed(1)}) rotate(${(Math.sin(t * .9 + i) * 5).toFixed(1)})`));
      fish.forEach((f, i) => f.setAttribute("transform",
        `translate(${(fishX[i] + Math.sin(t * .3 + i * 2.8) * 8).toFixed(1)},${(672 + (i * 61 % 110) + Math.sin(t * 1.1 + i * 2.1) * 3).toFixed(1)}) rotate(${(180 + Math.sin(t * .8 + i) * 4).toFixed(1)})`));
      bubs.forEach((b, i) => {
        const c = ((t * .22 + i * .37) % 1);
        b.setAttribute("transform", `translate(0,${(-c * 30).toFixed(1)})`);
        b.setAttribute("opacity", (c < .82 ? .5 : .5 * (1 - (c - .82) / .18)).toFixed(2));
      });
      swarms.forEach((s, i) => s.setAttribute("transform",
        `translate(${(swarmBase[i][0] + Math.sin(t * (1.7 + i * .3)) * 26).toFixed(1)},${(swarmBase[i][1] + Math.sin(t * (2.3 + i * .4) + 1) * 18).toFixed(1)}) rotate(${(Math.sin(t * 3 + i) * 14).toFixed(1)})`));
      fogs.forEach((f, i) => {
        f.setAttribute("transform", `translate(${(Math.sin(t * .16 + i * 2.1) * 60).toFixed(1)},${(Math.sin(t * .3 + i) * 6).toFixed(1)})`);
        f.setAttribute("opacity", (.09 + .06 * (0.5 + 0.5 * Math.sin(t * .5 + i * 1.9)) + .08 * ease(p)).toFixed(3));
      });
      const gush = .85 + .15 * Math.sin(t * 2.6);
      sludge1.setAttribute("opacity", (gush * .9).toFixed(2));
      sludge2.setAttribute("opacity", (gush * .85).toFixed(2));
    }
    rain.target = 0; rain.host = "sc-stink";
  });
}

/* ── game islands: engage cards + atmosphere; the games own their input ── */
for (const gid of ["drive", "bury", "dozer"]) {
  const sid = "sc-" + gid;
  if (!document.getElementById(sid)) continue;
  scene(sid, p => {
    if (window.HR && HR.island) HR.island.maybeShow(gid, p);
    if (gid === "drive") { rain.target = .6; rain.host = sid; }
  });
}
rainCanvas("sc-drive");

/* ════════════════════════════════════════════════════════════════════════
   V · THE CENTURY — 1930 → 2024 over the real lost-rivers map
   ═══════════════════════════════════════════════════════════════════════ */
{
  const D = window.RIVERS_DATA, M = D.meta;
  const cnv = document.getElementById("cmap");
  const yearEl = document.getElementById("cy-year");
  const buried = D.segs.filter(s => s.y < 9999);        // sorted by year already
  const cumKm = []; { let a = 0; for (const s of buried) { a += s.km; cumKm.push(a); } }

  /* ── qualitative HUD tiles (top-left) ─────────────────────────────────
     population: a crowd of figures, 1 figure = 100,000 people.
     creek buried: a miniature Line 1 — the buried length equals riding
     Finch↔Vaughan again and again (≈7.5 trips, ≈9 hours, by today).
     paved surface: ground cells sealing over, soil → asphalt. */
  const peopleEl = document.getElementById("cy-people");
  const trainEl = document.getElementById("cy-train");
  const kmCapEl = document.getElementById("cy-km-cap");
  const pavedEl = document.getElementById("cy-paved");
  const impCapEl = document.getElementById("cy-imp-cap");
  const PERSON = `<svg viewBox="0 0 10 20" aria-hidden="true">
    <circle cx="5" cy="3.2" r="2.5"/>
    <path d="M2.2 7h5.6l-.7 6.4H6l-.3 6H4.3l-.3-6H2.9Z"/></svg>`;
  const PERSON_K = 200;                                  // 1 figure = 200,000 people
  const NPEOPLE = 14;                                    // 2024 ≈ 2.8 M
  if (peopleEl) peopleEl.innerHTML =
    Array.from({ length: NPEOPLE }, () => `<i class="cy-person">${PERSON}</i>`).join("");
  const personEls = peopleEl ? [...peopleEl.children] : [];
  const NPAVE = 30;                                      // 10 × 3 ground cells
  if (pavedEl) pavedEl.innerHTML =
    Array.from({ length: NPAVE }, () => "<i></i>").join("");
  const paveEls = pavedEl ? [...pavedEl.children] : [];
  const LINE1_KM = 38.8, TRIP_MIN = 72;                  // Finch↔Vaughan, one way

  const POPC = [[1930, 631], [1951, 1117], [1971, 2089], [1991, 2275], [2011, 2615], [2024, 2800]];
  function popC(year) {
    for (let i = 1; i < POPC.length; i++)
      if (year <= POPC[i][0])
        return lerp(POPC[i - 1][1], POPC[i][1], map(year, POPC[i - 1][0], POPC[i][0]));
    return 2800;
  }

  const LABELS = [
    { n: "Garrison Creek", lat: 43.649, lon: -79.4115, from: 1886 },
    { n: "Taddle Creek", lat: 43.6645, lon: -79.396, from: 1860 },
    { n: "Russell Creek", lat: 43.645, lon: -79.3995, from: 1878 },
    { n: "Mud Creek", lat: 43.6905, lon: -79.3775, from: 1902 },
    { n: "Castle Frank Brook", lat: 43.6775, lon: -79.3705, from: 1902 },
    { n: "Black Creek", lat: 43.698, lon: -79.487, from: 1934 },
    { n: "Don River", lat: 43.673, lon: -79.355, from: 0, alive: true },
    { n: "Humber River", lat: 43.648, lon: -79.4935, from: 0, alive: true },
    { n: "Lake Ontario", lat: 43.636, lon: -79.387, from: 0, lake: true },
    /* landmarks: fixed points so the map reads as a real city, not a diagram
       (positions nudged where a creek label already owns the exact spot) */
    { n: "CN TOWER", lat: 43.6396, lon: -79.3871, from: 1976, mark: true },
    { n: "FORT YORK", lat: 43.6371, lon: -79.4032, from: 0, mark: true },
    { n: "CASA LOMA", lat: 43.6781, lon: -79.4094, from: 0, mark: true },
    { n: "HIGH PARK", lat: 43.6435, lon: -79.4637, from: 0, mark: true },
    { n: "YORK U", lat: 43.7735, lon: -79.5019, from: 1965, mark: true },
    { n: "SCARBOROUGH TOWN CTR", lat: 43.7764, lon: -79.2573, from: 1973, mark: true },
  ].map(L => ({ ...L, mx: (L.lon - M.lonMin) * M.kx, my: (M.latMax - L.lat) * M.ky }));

  let fit = null;
  function refit() {
    const dpr = sizeCanvas(cnv);
    const W = cnv.width, H = cnv.height;
    const wide = innerWidth > 760;
    const sc = Math.min(W * (wide ? .62 : .94) / M.w, H * .9 / M.h);
    const ox = wide ? W * .60 - M.w * sc / 2 : (W - M.w * sc) / 2;
    const oy = (H - M.h * sc) / 2 - H * .02;
    fit = { sc, ox, oy, dpr, W, H };
  }
  const FLASH_YEARS = [1954, 2005, 2013, 2018, 2024];
  /* activity-weighted clock: scroll time is spent on the years where the
     map actually changes (km buried, milestone storms); the quiet decades
     flick past instead of dragging */
  const yearAt = (() => {
    const Y0 = 1930, Y1 = 2024;
    const kmY = new Float32Array(Y1 - Y0 + 1);           // km buried per year
    for (const s of buried)
      if (s.y >= Y0 && s.y <= Y1) kmY[s.y - Y0] += s.km;
    /* weight = idle drift + capped burial activity: the dataset bins whole
       campaigns onto single years (109 km on "1931"), so uncapped km would
       freeze the clock there instead of giving it a beat */
    const w = new Float32Array(kmY.length).fill(.35);
    for (let i = 0; i < w.length; i++)
      w[i] += Math.min(kmY[i], 14) * .5 + (kmY[i] > .5 ? 1.2 : 0);
    for (const fy of FLASH_YEARS)
      if (fy >= Y0 && fy <= Y1) w[fy - Y0] += 2.4;
    const cum = [0];
    for (let i = 0; i < w.length; i++) cum.push(cum[i] + w[i]);
    const total = cum[cum.length - 1];
    return p => {
      const tgt = c01(p) * total;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; cum[mid] < tgt ? lo = mid + 1 : hi = mid; }
      const i = Math.max(1, lo);
      const f = (tgt - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return Math.min(Y1, Y0 + (i - 1) + f);
    };
  })();
  let flashed = new Set();

  scene("sc-century", (p, t) => {
    if (!fit) refit();
    const f = fit, ctx = cnv.getContext("2d");
    ctx.clearRect(0, 0, f.W, f.H);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const year = yearAt(p);
    const ghost = ease(map(p, .80, .92));               // "you've seen what happens next"
    const dprS = f.dpr;

    for (const fy of FLASH_YEARS)
      if (year >= fy && !flashed.has(fy)) { flashed.add(fy); flash(fy === 1954 ? .8 : .5); }
    if (p < .01) flashed = new Set();

    /* buried */
    ctx.lineWidth = 1.1 * dprS;
    ctx.strokeStyle = "rgba(140,128,168,.5)";
    for (const s of D.segs) {
      if (s.y >= year) continue;
      const d = year - s.y;
      if (d <= 8) continue;                              // drawn in orange pass
      ctx.stroke(seg2pathP(s, f));
    }
    /* ghost pulse along the buried network */
    if (ghost > 0 && !REDUCED) {
      ctx.save();
      ctx.setLineDash([5 * dprS, 9 * dprS]);
      ctx.lineDashOffset = -t * 26 * dprS;
      ctx.lineWidth = 1.3 * dprS;
      for (let i = 0; i < buried.length; i++) {
        const a = .08 + .16 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * .61));
        ctx.strokeStyle = `rgba(79,195,247,${(a * ghost).toFixed(3)})`;
        ctx.stroke(seg2pathP(buried[i], f));
      }
      ctx.restore();
    } else if (ghost > 0) {
      ctx.lineWidth = 1.3 * dprS;
      ctx.strokeStyle = `rgba(79,195,247,${(.22 * ghost).toFixed(3)})`;
      for (const s of buried) ctx.stroke(seg2pathP(s, f));
    }
    /* freshly buried (orange flash) */
    for (const s of D.segs) {
      if (s.y >= year) continue;
      const d = year - s.y;
      if (d > 8) continue;
      ctx.lineWidth = 2.6 * dprS;
      ctx.strokeStyle = `rgba(255,112,67,${(1 - d / 9).toFixed(2)})`;
      ctx.stroke(seg2pathP(s, f));
    }
    /* alive: halo + core */
    ctx.lineWidth = 4.6 * dprS;
    ctx.strokeStyle = "rgba(79,195,247,.14)";
    for (const s of D.segs) if (s.y >= year) ctx.stroke(seg2pathP(s, f));
    ctx.lineWidth = 1.5 * dprS;
    ctx.strokeStyle = "rgba(127,212,255,.95)";
    for (const s of D.segs) if (s.y >= year) ctx.stroke(seg2pathP(s, f));

    /* labels */
    ctx.font = `${11.5 * dprS}px ui-monospace,Menlo,monospace`;
    ctx.textBaseline = "middle";
    for (const L of LABELS) {
      let a = L.from === 0 ? 1 : c01((year - L.from) / 8);
      if (a <= 0) continue;
      a *= ease(map(p, .01, .05));
      const x = L.mx * f.sc + f.ox, y = L.my * f.sc + f.oy;
      if (L.lake) {
        ctx.fillStyle = `rgba(93,107,124,${(a * .9).toFixed(2)})`;
        ctx.font = `italic ${13 * dprS}px Georgia,serif`;
        ctx.fillText(L.n, x, y);
        ctx.font = `${11.5 * dprS}px ui-monospace,Menlo,monospace`;
        continue;
      }
      if (L.mark) {                                       // landmark: warm square + tag
        ctx.strokeStyle = `rgba(255,214,140,${(a * .8).toFixed(2)})`;
        ctx.lineWidth = 1.2 * dprS;
        ctx.strokeRect(x - 2.6 * dprS, y - 2.6 * dprS, 5.2 * dprS, 5.2 * dprS);
        ctx.fillStyle = `rgba(255,214,140,${(a * .6).toFixed(2)})`;
        ctx.font = `${8.5 * dprS}px ui-monospace,Menlo,monospace`;
        ctx.textAlign = "center";                         // label under the square,
        ctx.fillText(L.n, x, y + 9 * dprS);               // clear of the creek names
        ctx.textAlign = "start";
        ctx.font = `${11.5 * dprS}px ui-monospace,Menlo,monospace`;
        continue;
      }
      const col = L.alive ? "127,212,255" : "190,178,215";
      ctx.fillStyle = `rgba(${col},${(a * .95).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x, y, 2.4 * dprS, 0, TAU); ctx.fill();
      ctx.fillText(" " + L.n, x + 3 * dprS, y);
    }

    /* counters → the qualitative tiles */
    yearEl.textContent = p > .95 ? "today" : Math.floor(year);
    const nP = Math.round(popC(year) / PERSON_K);        // 1 figure = 200k
    for (let i = 0; i < personEls.length; i++)
      personEls[i].classList.toggle("on", i < nP);
    let km = 0;
    if (buried.length) {
      let lo = 0, hi = buried.length;                    // count segments with y < year
      while (lo < hi) { const mid = lo + hi >> 1; buried[mid].y < year ? lo = mid + 1 : hi = mid; }
      km = lo ? cumKm[lo - 1] : 0;
    }
    const trips = km / LINE1_KM;
    if (trainEl) {
      const ph = trips % 2;                              // ping-pong Vaughan ↔ Finch
      const xf = ph < 1 ? ph : 2 - ph;
      trainEl.style.left = (xf * 100).toFixed(1) + "%";
    }
    if (kmCapEl) kmCapEl.textContent =
      `${Math.round(km)} km ≈ riding Line 1 end-to-end ${trips.toFixed(1)}× · ` +
      `${(trips * TRIP_MIN / 60).toFixed(0)} h on the subway`;
    const imp = lerp(24, 64, map(year, 1930, 2024));
    const nC = Math.round(imp / 100 * paveEls.length);
    for (let i = 0; i < paveEls.length; i++)
      paveEls[i].classList.toggle("paved", i < nC);
    if (impCapEl) impCapEl.textContent =
      `${Math.round(imp / 10)} of 10 raindrops can’t soak in`;
  });
  /* Path2D cache (per segment per fit) */
  let pathCache = new WeakMap(), cacheKey = null;
  function seg2pathP(s, f) {
    if (cacheKey !== f) { pathCache = new WeakMap(); cacheKey = f; }
    let p2 = pathCache.get(s);
    if (!p2) {
      p2 = new Path2D();
      const P = s.p;
      p2.moveTo(P[0] * f.sc + f.ox, P[1] * f.sc + f.oy);
      for (let i = 2; i < P.length; i += 2)
        p2.lineTo(P[i] * f.sc + f.ox, P[i + 1] * f.sc + f.oy);
      pathCache.set(s, p2);
    }
    return p2;
  }
  addEventListener("resize", () => { fit = null; });
}

/* ════════════════════════════════════════════════════════════════════════
   V½ · THE FORECAST — predictive ward map (modelling artifacts → choropleth)
   The same projection as the century map, so the buried-creek network overlays
   the model's risk surface pixel-for-pixel. Degrades silently if the modelling
   data file is absent (the section just stays dark).
   ═══════════════════════════════════════════════════════════════════════ */
if (window.RISK_DATA && document.getElementById("riskmap")) {
  const RK = window.RISK_DATA, RM = RK.meta;
  const RD = window.RIVERS_DATA;
  const cnv = document.getElementById("riskmap");
  const metricEl = document.getElementById("rk-metric");
  const topEl = document.getElementById("rk-topward");
  const driversEl = document.getElementById("rk-drivers");
  /* YlOrRd — matches the Dash "Risk Hotspots" tab */
  const RAMP = [[0, "#ffffb2"], [.25, "#fecc5c"], [.5, "#fd8d3c"],
                [.75, "#f03b20"], [1, "#bd0026"]];

  /* normalised metric values per ward (0–1) */
  const span = Math.max(1e-6, RM.suscMax - RM.suscMin);
  for (const w of RK.wards) {
    w.nSusc = c01((w.susc - RM.suscMin) / span);
    w.nCoin = c01(w.coin);                                // already 0–1
    let area = 0, cx = 0, cy = 0;                          // centroid of largest ring
    for (const r of w.rings) {
      let a = 0, x = 0, y = 0;
      for (let i = 0; i < r.length - 2; i += 2) {
        const cross = r[i] * r[i + 3] - r[i + 2] * r[i + 1];
        a += cross; x += (r[i] + r[i + 2]) * cross; y += (r[i + 1] + r[i + 3]) * cross;
      }
      a *= .5;
      if (Math.abs(a) > Math.abs(area)) { area = a; cx = x / (6 * a); cy = y / (6 * a); }
    }
    w.cx = cx; w.cy = cy;
  }

  /* drivers panel (built once) */
  const dlist = document.getElementById("rk-dlist");
  if (dlist && RK.drivers) {
    const max = Math.max(...RK.drivers.map(d => d.imp));
    dlist.innerHTML = RK.drivers.map(d =>
      `<li><span class="rk-dlabel">${d.label}</span>
       <i class="rk-dbar"><b style="width:${(100 * d.imp / max).toFixed(0)}%"></b></i></li>`
    ).join("");
  }

  /* rank every ward on both metrics for the tooltips */
  [...RK.wards].sort((a, b) => b.nSusc - a.nSusc).forEach((w, i) => { w.rkSusc = i + 1; });
  [...RK.wards].sort((a, b) => b.nCoin - a.nCoin).forEach((w, i) => { w.rkCoin = i + 1; });
  const N_W = RK.wards.length;

  /* ── hover: read any ward's numbers straight off the map ─────────────── */
  const tipEl = document.getElementById("rk-tip");
  let hoverW = null;
  function wardHTML(w, label) {
    return `${label ? `<em>${label}</em>` : ""}<b>${w.name}</b>
      <span>flood susceptibility <i>${Math.round(w.nSusc * 100)}/100</i> · #${w.rkSusc} of ${N_W}</span>
      <span>river × weak-sewer <i>${w.nCoin.toFixed(2)}</i> · #${w.rkCoin} of ${N_W}</span>`;
  }
  cnv.addEventListener("pointermove", e => {
    if (!fit || !tipEl) return;
    const r = cnv.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (cnv.width / r.width);
    const my = (e.clientY - r.top) * (cnv.height / r.height);
    const ctx = cnv.getContext("2d");
    let found = null;
    for (const w of RK.wards)
      if (ctx.isPointInPath(wardPath(w, fit), mx, my)) { found = w; break; }
    hoverW = found;
    if (found) {
      tipEl.innerHTML = wardHTML(found);
      tipEl.classList.add("on");
      const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
      tipEl.style.left = Math.min(innerWidth - tw - 10, e.clientX + 16) + "px";
      tipEl.style.top = Math.max(10, Math.min(innerHeight - th - 10, e.clientY + 14)) + "px";
    } else tipEl.classList.remove("on");
  });
  cnv.addEventListener("pointerleave", () => {
    hoverW = null;
    if (tipEl) tipEl.classList.remove("on");
  });

  /* ── "find my ward": postal code (FSA) → point → ward ────────────────── */
  const findForm = document.getElementById("rk-find");
  const findInput = document.getElementById("rk-post");
  const foundEl = document.getElementById("rk-found");
  let pinW = null, pinPt = null;
  function wardContains(w, x, y) {                        // even-odd over all rings
    let inside = false;
    for (const r of w.rings) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
          inside = !inside;
      }
    }
    return inside;
  }
  if (findForm) findForm.addEventListener("submit", e => {
    e.preventDefault();
    const raw = (findInput.value || "").trim().toUpperCase();
    pinW = null; pinPt = null;
    if (!raw) { foundEl.innerHTML = ""; return; }
    /* a typed ward name works too */
    const byName = RK.wards.find(w => w.name.toUpperCase().includes(raw) && raw.length >= 4);
    const fsa = (raw.replace(/\s+/g, "").match(/^M\d[A-Z]/) || [])[0];
    const ll = fsa && window.HR && HR.FSA ? HR.FSA[fsa] : null;
    if (!byName && !ll) {
      foundEl.innerHTML = raw[0] === "M" || /^\d/.test(raw)
        ? `<span class="rk-miss">Couldn’t place “${raw}” — Toronto postal codes start M1A–M9W.</span>`
        : `<span class="rk-miss">Enter a Toronto postal code (e.g. M5V) or a ward name.</span>`;
      return;
    }
    let w = byName;
    if (!byName) {
      const x = (ll[1] - RM.lonMin) * RM.kx - RM.ox;
      const y = (RM.latMax - ll[0]) * RM.ky - RM.oy;
      w = RK.wards.find(wd => wardContains(wd, x, y));
      if (!w) {                                           // fringe FSA: snap to nearest
        let bd = Infinity;
        for (const wd of RK.wards) {
          const d = (wd.cx - x) ** 2 + (wd.cy - y) ** 2;
          if (d < bd) { bd = d; w = wd; }
        }
      }
      pinPt = [x, y];
    }
    pinW = w;
    foundEl.innerHTML = wardHTML(w, fsa ? `${fsa} · approx.` : "your ward") +
      `<button type="button" id="rk-clear">clear</button>`;
    const clr = document.getElementById("rk-clear");
    if (clr) clr.addEventListener("click", () => {
      pinW = null; pinPt = null; foundEl.innerHTML = ""; findInput.value = "";
    });
    if (window.HR && HR.live) HR.live(`${w.name}: flood susceptibility ` +
      `${Math.round(w.nSusc * 100)} out of 100, rank ${w.rkSusc} of ${N_W}.`);
  });

  let fit = null;
  function refit() {
    const dpr = sizeCanvas(cnv);
    const W = cnv.width, H = cnv.height, wide = innerWidth > 760;
    const sc = Math.min(W * (wide ? .58 : .96) / RM.w, H * .82 / RM.h);
    const ox = wide ? W * .58 - RM.w * sc / 2 : (W - RM.w * sc) / 2;
    const oy = (H - RM.h * sc) / 2 + H * .015;
    fit = { sc, ox, oy, dpr, W, H };
  }
  /* Path2D cache (per ward per fit) */
  let wPaths = new WeakMap(), wKey = null;
  function wardPath(w, f) {
    if (wKey !== f) { wPaths = new WeakMap(); wKey = f; }
    let pp = wPaths.get(w);
    if (!pp) {
      pp = new Path2D();
      for (const r of w.rings) {
        pp.moveTo(r[0] * f.sc + f.ox, r[1] * f.sc + f.oy);
        for (let i = 2; i < r.length; i += 2) pp.lineTo(r[i] * f.sc + f.ox, r[i + 1] * f.sc + f.oy);
        pp.closePath();
      }
      wPaths.set(w, pp);
    }
    return pp;
  }
  /* river segs share the projection but live in rivers-origin space → shift by RM.ox/oy */
  let rPaths = new WeakMap(), rKey = null;
  function riverPath(s, f) {
    if (rKey !== f) { rPaths = new WeakMap(); rKey = f; }
    let pp = rPaths.get(s);
    if (!pp) {
      pp = new Path2D();
      const P = s.p;
      pp.moveTo((P[0] - RM.ox) * f.sc + f.ox, (P[1] - RM.oy) * f.sc + f.oy);
      for (let i = 2; i < P.length; i += 2)
        pp.lineTo((P[i] - RM.ox) * f.sc + f.ox, (P[i + 1] - RM.oy) * f.sc + f.oy);
      rPaths.set(s, pp);
    }
    return pp;
  }

  scene("sc-forecast", (p, t) => {
    if (!fit) refit();
    const f = fit, ctx = cnv.getContext("2d"), dprS = f.dpr;
    ctx.clearRect(0, 0, f.W, f.H);

    const appear = ease(map(p, .02, .16));                 // choropleth fades in
    const blend = ease(map(p, .56, .70));                  // susceptibility → coincidence
    const riversOn = ease(map(p, .36, .52));               // buried network overlay
    const driveOn = ease(map(p, .78, .9));                 // drivers panel

    /* choropleth */
    ctx.lineJoin = "round";
    let topW = null, topV = -1;
    for (const w of RK.wards) {
      const v = lerp(w.nSusc, w.nCoin, blend);
      if (v > topV) { topV = v; topW = w; }
      const path = wardPath(w, f);
      ctx.fillStyle = ramp(RAMP, v);
      ctx.globalAlpha = (.22 + .6 * v) * appear;            // hotter = more opaque
      ctx.fill(path);
      ctx.globalAlpha = .5 * appear;
      ctx.lineWidth = .8 * dprS;
      ctx.strokeStyle = "rgba(12,16,22,.9)";
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;

    /* buried-creek network on top */
    if (riversOn > 0 && RD) {
      ctx.lineCap = "round";
      ctx.lineWidth = 1 * dprS;
      ctx.strokeStyle = `rgba(120,110,150,${(.7 * riversOn).toFixed(3)})`;
      for (const s of RD.segs) { if (s.y < 9999) ctx.stroke(riverPath(s, f)); }
      ctx.lineWidth = 1.4 * dprS;
      ctx.strokeStyle = `rgba(127,212,255,${(.95 * riversOn).toFixed(3)})`;
      for (const s of RD.segs) { if (s.y >= 9999) ctx.stroke(riverPath(s, f)); }
    }

    /* highlight + label the worst ward for the active metric */
    if (topW && appear > .4) {
      const path = wardPath(topW, f);
      ctx.lineWidth = 2.2 * dprS;
      ctx.strokeStyle = `rgba(255,255,255,${(.85 * appear).toFixed(2)})`;
      ctx.stroke(path);
      const lx = topW.cx * f.sc + f.ox, ly = topW.cy * f.sc + f.oy;
      ctx.beginPath(); ctx.arc(lx, ly, 3 * dprS, 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${appear.toFixed(2)})`; ctx.fill();
      topEl.textContent = topW.name;
    }

    /* hovered ward + the looked-up "your ward" pin */
    if (hoverW && appear > .2) {
      ctx.lineWidth = 1.8 * dprS;
      ctx.strokeStyle = "rgba(127,212,255,.95)";
      ctx.stroke(wardPath(hoverW, f));
    }
    if (pinW && appear > .2) {
      const path = wardPath(pinW, f);
      ctx.lineWidth = 2.4 * dprS;
      ctx.strokeStyle = "rgba(124,196,111,.95)";
      ctx.stroke(path);
      const px2 = (pinPt ? pinPt[0] : pinW.cx) * f.sc + f.ox;
      const py2 = (pinPt ? pinPt[1] : pinW.cy) * f.sc + f.oy;
      const pulse = 1 + .2 * Math.sin(t * 3);
      ctx.strokeStyle = "rgba(124,196,111,.9)";
      ctx.lineWidth = 2 * dprS;
      ctx.beginPath(); ctx.arc(px2, py2, 7 * dprS * pulse, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#7cc46f";
      ctx.beginPath(); ctx.arc(px2, py2, 2.6 * dprS, 0, TAU); ctx.fill();
    }

    metricEl.textContent = blend < .5
      ? "modelled flood susceptibility" : "hidden-river × weak-sewer coincidence";
    if (driversEl) driversEl.style.opacity = driveOn.toFixed(2);

    rain.target = 0; rain.host = "sc-forecast";
  });
  addEventListener("resize", () => { fit = null; });
}

/* ════════════════════════════════════════════════════════════════════════
   VI · DAYLIGHTING — reveal-on-scroll + the inner-harbour hero
   ═══════════════════════════════════════════════════════════════════════ */
{
  const io = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) { e.target.classList.add("vis"); io.unobserve(e.target); }
  }, { threshold: .25 });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));
}

/* the hero: Toronto's inner harbour, drawn in the same hand as the street
   scenes — skyline across the water, and the Port Lands restoration
   (new Don mouth, wetlands, the twin arched bridges) in the foreground */
{
  const svg = document.getElementById("dl-harbour");
  if (svg) {
    const rnd = mulberry(23);
    /* hazy downtown silhouette across the water */
    let sky = "";
    for (const [x, w, h] of [[30, 80, 150], [125, 60, 200], [200, 90, 260], [305, 70, 175],
        [390, 95, 235], [500, 65, 185], [700, 80, 210], [795, 90, 150], [900, 60, 120]]) {
      sky += `<rect x="${x}" y="${400 - h}" width="${w}" height="${h}" fill="#8fadc2"/>
              <rect x="${x}" y="${400 - h}" width="${w}" height="6" fill="#a3bdd0"/>`;
      for (let i = 0; i < 4; i++)
        if (rnd() < .5) sky += `<rect x="${x + 8 + i * (w / 4)}" y="${404 - h + rnd() * (h - 40)}" width="${w / 9}" height="16" fill="#7d9cb4" opacity=".6"/>`;
    }
    svg.innerHTML = `
    <defs>
      <linearGradient id="dl-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6fb1d8"/><stop offset=".7" stop-color="#cfe4d9"/>
        <stop offset="1" stop-color="#ffe9c2"/>
      </linearGradient>
      <linearGradient id="dl-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4f93ae"/><stop offset="1" stop-color="#2a5f7e"/>
      </linearGradient>
      <linearGradient id="dl-river" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7fd4c9"/><stop offset="1" stop-color="#1f7f93"/>
      </linearGradient>
      <radialGradient id="dl-sun" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#fff4cf" stop-opacity=".95"/>
        <stop offset="1" stop-color="#ffe9ad" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="1600" height="640" fill="url(#dl-sky)"/>
    <circle cx="300" cy="110" r="120" fill="url(#dl-sun)"/>
    <circle cx="300" cy="110" r="36" fill="#fff2c4"/>
    <g opacity=".85" fill="#ffffff">
      <ellipse cx="620" cy="90" rx="90" ry="24"/><ellipse cx="695" cy="74" rx="60" ry="18"/>
      <ellipse cx="1120" cy="120" rx="80" ry="20"/><ellipse cx="1450" cy="70" rx="70" ry="18"/>
    </g>
    <!-- downtown across the water -->
    <g opacity=".92">${sky}
      <!-- Rogers Centre + CN Tower make it Toronto -->
      <path d="M540 400 a80 62 0 0 1 160 0 Z" fill="#8fadc2"/>
      <g fill="#7d9cb4">
        <polygon points="614,400 625,148 641,148 652,400"/>
        <polygon points="602,400 617,290 622,290 616,400"/>
        <polygon points="664,400 649,290 644,290 650,400"/>
        <rect x="601" y="128" width="64" height="38" rx="14"/>
        <polygon points="628,128 631,54 635,54 638,128"/>
      </g>
      <rect x="607" y="142" width="52" height="9" fill="#ffedb0" opacity=".55"/>
      <!-- island ferry mid-harbour -->
      <g transform="translate(470,452)">
        <path d="M-44 0 Q0 14 44 0 L36 -12 L-36 -12 Z" fill="#3d6b52"/>
        <rect x="-30" y="-26" width="60" height="15" rx="4" fill="#f0ede2"/>
        <rect x="-22" y="-23" width="10" height="7" fill="#2a5f7e"/><rect x="-4" y="-23" width="10" height="7" fill="#2a5f7e"/>
        <rect x="12" y="-23" width="10" height="7" fill="#2a5f7e"/>
      </g>
    </g>
    <!-- the harbour -->
    <rect x="0" y="398" width="1600" height="242" fill="url(#dl-water)"/>
    <g class="dl-sparkle" stroke="#dbf2f7" stroke-width="2.4" stroke-linecap="round" opacity=".5">
      ${Array.from({ length: 16 }, (_, i) =>
        `<line x1="${60 + i * 100}" y1="${430 + (i % 5) * 34}" x2="${86 + i * 100}" y2="${430 + (i % 5) * 34}"/>`).join("")}
    </g>
    <text x="380" y="440" font-family="Georgia,serif" font-style="italic" font-size="22"
          fill="#d6ecf4" opacity=".85">Inner Harbour</text>
    <!-- THE PORT LANDS: the restored foreground -->
    <g>
      <!-- the green headland -->
      <path d="M640 640 Q740 520 900 496 Q1100 468 1300 470 Q1470 472 1600 460 L1600 640 Z" fill="#5d9b4f"/>
      <path d="M640 640 Q740 520 900 496 Q1100 468 1300 470 Q1470 472 1600 460" fill="none" stroke="#79b864" stroke-width="6"/>
      <!-- sandy river-mouth spits -->
      <ellipse cx="836" cy="540" rx="60" ry="12" fill="#d8c89a"/>
      <ellipse cx="920" cy="590" rx="70" ry="13" fill="#d8c89a"/>
      <!-- the new Don, winding out of the land into the harbour -->
      <path d="M1600 520 Q1420 508 1300 528 Q1170 550 1060 542 Q950 534 880 556 Q830 572 828 640 L1030 640 Q1080 600 1160 596 Q1300 590 1440 600 L1600 588 Z"
            fill="url(#dl-river)"/>
      <path d="M1600 524 Q1420 512 1300 532 Q1170 554 1060 546 Q950 538 884 560" fill="none" stroke="#a9e6dd" stroke-width="5" opacity=".6"/>
      <!-- wetland shallows fringing the channel -->
      <g fill="#3f8a5f" opacity=".8">
        <ellipse cx="1002" cy="555" rx="46" ry="9"/><ellipse cx="1210" cy="540" rx="56" ry="10"/>
        <ellipse cx="1420" cy="546" rx="50" ry="9"/><ellipse cx="940" cy="600" rx="52" ry="10"/>
      </g>
      <!-- marsh grasses -->
      <g stroke="#3f7a38" stroke-width="3" fill="none" stroke-linecap="round">
        ${[880, 892, 904, 1090, 1102, 1114, 1330, 1342, 1354, 1500, 1512].map((x, i) =>
          `<path d="M${x} ${i < 3 ? 586 : i < 6 ? 560 : i < 9 ? 548 : 570} q${(i % 3 - 1) * 5} -18 ${(i % 3 - 1) * 8} -30"/>`).join("")}
      </g>
      <!-- young riverbank trees -->
      ${[[760, 520, 26], [700, 560, 32], [1160, 512, 22], [1260, 500, 26], [1520, 500, 24], [1560, 540, 30]].map(([x, y, r]) =>
        `<ellipse cx="${x + 4}" cy="${y + r * .9}" rx="4" ry="${r * .55}" fill="#6d4f2f"/>
         <circle cx="${x}" cy="${y}" r="${r}" fill="#549148"/>
         <circle cx="${x - r * .4}" cy="${y - r * .3}" r="${r * .5}" fill="#67a85b"/>`).join("")}
      <!-- the twin arched bridges over the new river -->
      <g>
        <rect x="1020" y="528" width="150" height="8" rx="3" fill="#e8e4da"/>
        <path d="M1026 530 Q1095 470 1164 530" fill="none" stroke="#f0ede2" stroke-width="9"/>
        <path d="M1026 530 Q1095 470 1164 530" fill="none" stroke="#d8552f" stroke-width="3" opacity=".8"/>
        ${[1040, 1062, 1084, 1106, 1128, 1150].map(x =>
          `<line x1="${x}" y1="${532 - Math.sin((x - 1026) / 138 * Math.PI) * 52}" x2="${x}" y2="530" stroke="#e8e4da" stroke-width="2.5"/>`).join("")}
        <rect x="1300" y="516" width="130" height="8" rx="3" fill="#e8e4da"/>
        <path d="M1306 518 Q1365 466 1424 518" fill="none" stroke="#f0ede2" stroke-width="8"/>
        ${[1320, 1340, 1360, 1380, 1400].map(x =>
          `<line x1="${x}" y1="${520 - Math.sin((x - 1306) / 118 * Math.PI) * 44}" x2="${x}" y2="518" stroke="#e8e4da" stroke-width="2.5"/>`).join("")}
      </g>
      <!-- kayaker on the new river -->
      <g transform="translate(1225,566)">
        <ellipse cx="0" cy="0" rx="26" ry="6" fill="#e07b39"/>
        <circle cx="0" cy="-13" r="6" fill="#e8c39e"/>
        <path d="M-3 -8 Q0 -4 3 -8 L2 0 L-2 0 Z" fill="#1f618d"/>
        <line x1="-18" y1="-16" x2="18" y2="-4" stroke="#4a3a24" stroke-width="3"/>
      </g>
      <!-- heron in the shallows -->
      <g transform="translate(955,588)">
        <line x1="-2" y1="0" x2="-2" y2="-14" stroke="#9fb6c8" stroke-width="2.5"/>
        <line x1="3" y1="0" x2="2" y2="-14" stroke="#9fb6c8" stroke-width="2.5"/>
        <ellipse cx="0" cy="-19" rx="10" ry="6" fill="#9fb6c8"/>
        <path d="M7 -22 Q13 -30 9 -36" fill="none" stroke="#9fb6c8" stroke-width="3"/>
        <polygon points="9,-37 20,-35 9,-33" fill="#e8b93d"/>
      </g>
      <!-- boardwalk + walkers -->
      <g>
        <rect x="680" y="606" width="240" height="10" rx="3" fill="#a07b4f"/>
        ${[700, 750, 800, 850, 900].map(x => `<line x1="${x}" y1="606" x2="${x}" y2="616" stroke="#7d5d39" stroke-width="3"/>`).join("")}
        <g transform="translate(760,606) scale(.7)">
          <circle cx="0" cy="-53" r="8" fill="#e8c39e"/>
          <path d="M-9 -44 Q0 -50 9 -44 L7 -15 L-7 -15 Z" fill="#c0392b"/>
          <line x1="-4" y1="-16" x2="-6" y2="0" stroke="#23272e" stroke-width="5.5" stroke-linecap="round"/>
          <line x1="4" y1="-16" x2="7" y2="0" stroke="#23272e" stroke-width="5.5" stroke-linecap="round"/>
        </g>
        <g transform="translate(796,606) scale(.62)">
          <circle cx="0" cy="-53" r="8" fill="#caa37e"/>
          <path d="M-9 -44 Q0 -50 9 -44 L7 -15 L-7 -15 Z" fill="#1f618d"/>
          <line x1="-4" y1="-16" x2="-6" y2="0" stroke="#23272e" stroke-width="5.5" stroke-linecap="round"/>
          <line x1="4" y1="-16" x2="7" y2="0" stroke="#23272e" stroke-width="5.5" stroke-linecap="round"/>
        </g>
      </g>
    </g>
    <!-- plaque-style labels: what changed here -->
    <g font-family="ui-monospace,Menlo,monospace" font-size="13" letter-spacing="2">
      <g>
        <rect x="906" y="490" width="196" height="24" rx="5" fill="#0d3a46" opacity=".88"/>
        <text x="1004" y="507" text-anchor="middle" fill="#bff0e8">NEW DON RIVER MOUTH</text>
        <line x1="960" y1="514" x2="905" y2="546" stroke="#bff0e8" stroke-width="1.5" opacity=".7"/>
      </g>
      <g>
        <rect x="1206" y="438" width="160" height="24" rx="5" fill="#1c5e3c" opacity=".88"/>
        <text x="1286" y="455" text-anchor="middle" fill="#e4f6e0">BIIDAASIGE PARK</text>
      </g>
      <g>
        <rect x="716" y="446" width="150" height="24" rx="5" fill="#1c5e3c" opacity=".88"/>
        <text x="791" y="463" text-anchor="middle" fill="#e4f6e0">VILLIERS ISLAND</text>
      </g>
      <g>
        <rect x="1284" y="608" width="302" height="24" rx="5" fill="#0d1a24" opacity=".82"/>
        <text x="1435" y="625" text-anchor="middle" fill="#9fd4e8">PORT LANDS FLOOD PROTECTION · 2025</text>
      </g>
    </g>`;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   VII · THE CREEK — same street, daylighted
   ═══════════════════════════════════════════════════════════════════════ */
{
  const svg = document.getElementById("street-future");
  svg.innerHTML = `
  <defs>
    <linearGradient id="fu-creek" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7fd4c9"/><stop offset=".45" stop-color="#3aa7ae"/>
      <stop offset="1" stop-color="#1f7f93"/>
    </linearGradient>
    <radialGradient id="fu-sun" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#fff4cf" stop-opacity=".95"/>
      <stop offset=".55" stop-color="#ffe9ad" stop-opacity=".4"/>
      <stop offset="1" stop-color="#ffe9ad" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g id="fu-sungrp" opacity="0">
    <circle cx="1310" cy="150" r="150" fill="url(#fu-sun)"/>
    <circle cx="1310" cy="150" r="44" fill="#fff2c4"/>
    <g id="fu-birds" fill="none" stroke="#3e4f5c" stroke-width="3" stroke-linecap="round">
      <path d="M880 170 q9 -9 18 0 q9 -9 18 0"/>
      <path d="M950 140 q7 -7 14 0 q7 -7 14 0"/>
      <path d="M1010 190 q8 -8 16 0 q8 -8 16 0"/>
    </g>
    <g opacity=".85" fill="#ffffff">
      <ellipse cx="320" cy="130" rx="90" ry="26"/><ellipse cx="395" cy="112" rx="60" ry="20"/>
      <ellipse cx="700" cy="80" rx="70" ry="20"/>
    </g>
  </g>
  ${streetBase("fu", true)}
  <rect x="0" y="668" width="1600" height="110" fill="#31373f"/>
  ${railsBand(682)}
  <g id="fu-tc" transform="translate(880,752) scale(.86)">${streetcar("fu")}</g>
  <g transform="translate(300,762)">
    <circle cx="0" cy="-16" r="16" fill="none" stroke="#23272e" stroke-width="3.4"/>
    <circle cx="44" cy="-16" r="16" fill="none" stroke="#23272e" stroke-width="3.4"/>
    <path d="M0 -16 L16 -42 L40 -42 L44 -16 M16 -42 L24 -16" fill="none" stroke="#c0392b" stroke-width="3.4"/>
    <g transform="translate(20,-40)">
      <circle cx="0" cy="-22" r="7" fill="#e8c39e"/>
      <path d="M-2 -16 Q8 -10 12 2" stroke="#1f618d" stroke-width="6" fill="none"/>
    </g>
  </g>
  <rect x="0" y="770" width="1600" height="56" fill="#3d362c"/>
  <g id="fu-green">
    <path d="M0 778 Q200 766 420 776 Q700 786 980 774 Q1300 764 1600 778 L1600 828 L0 828 Z" fill="#5d9b4f"/>
    <path d="M0 778 Q200 766 420 776 Q700 786 980 774 Q1300 764 1600 778" fill="none" stroke="#79b864" stroke-width="6"/>
    <g stroke="#3f7a38" stroke-width="3" fill="none" stroke-linecap="round">
      ${[150,165,180, 500,514,528, 1480,1494,1508].map((x, i) =>
        `<path d="M${x} 812 q${(i % 3 - 1) * 6} -34 ${(i % 3 - 1) * 10} -56"/>`).join("")}
    </g>
    ${[152,512,1496].map(x => `<ellipse cx="${x + 6}" cy="752" rx="5" ry="12" fill="#6d4f2f"/>`).join("")}
    <g id="fu-willow">
      <path d="M40 778 Q52 690 36 610 Q60 640 66 700 Q70 744 58 778 Z" fill="#5d4a33"/>
      <ellipse cx="60" cy="600" rx="120" ry="64" fill="#5d9b55"/>
      <ellipse cx="150" cy="640" rx="90" ry="46" fill="#549148"/>
      <g fill="none" stroke="#67a85b" stroke-width="4" stroke-linecap="round">
        <path d="M120 632 Q150 720 142 800"/><path d="M170 650 Q200 730 196 798"/>
        <path d="M70 648 Q86 730 78 802"/><path d="M220 668 Q240 740 238 794"/>
      </g>
    </g>
  </g>
  <g id="fu-waterg">
    <rect x="0" y="812" width="1600" height="88" fill="url(#fu-creek)"/>
    <path d="M0 812 Q200 806 420 812 Q700 818 980 810 Q1300 804 1600 812 L1600 820 L0 820 Z" fill="#a9e6dd" opacity=".55"/>
    <g id="fu-sparkle" stroke="#eafff7" stroke-width="2.6" stroke-linecap="round">
      ${Array.from({ length: 14 }, (_, i) =>
        `<line x1="${90 + i * 110}" y1="${826 + (i % 4) * 16}" x2="${112 + i * 110}" y2="${826 + (i % 4) * 16}"/>`).join("")}
    </g>
    ${[460, 760, 1130].map((x, i) =>
      `<ellipse cx="${x}" cy="${838 + i * 8}" rx="${26 - i * 4}" ry="${9 - i}" fill="#7b8794"/>`).join("")}
    <ellipse cx="408" cy="846" rx="30" ry="10" fill="#8d99a6"/>
  </g>
  <g id="fu-people" opacity="0">
    <!-- swimmer, front crawl -->
    <g id="fu-swim1" transform="translate(620,846)">
      <circle cx="0" cy="-8" r="9" fill="#e8c39e"/>
      <path d="M-4 -14 a9 9 0 0 1 9 -2" stroke="#2c3e50" stroke-width="5" fill="none"/>
      <path id="fu-arm" d="M6 -8 Q22 -30 38 -12" stroke="#e8c39e" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M-34 -4 Q-18 -10 -8 -5" stroke="#e8c39e" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M-44 0 q8 6 18 2 M28 0 q-8 6 -16 2" stroke="#d9f6ef" stroke-width="3" fill="none"/>
    </g>
    <!-- kid on a swim ring -->
    <g id="fu-swim2" transform="translate(910,852)">
      <ellipse cx="0" cy="0" rx="26" ry="10" fill="#ff8a65"/>
      <ellipse cx="0" cy="-2" rx="15" ry="6" fill="#1f7f93"/>
      <circle cx="0" cy="-16" r="8" fill="#e8c39e"/>
      <path d="M-7 -20 Q0 -27 7 -20" fill="#8e5b3a"/>
      <path d="M-12 -10 q-8 4 -12 0 M12 -10 q8 4 12 0" stroke="#e8c39e" stroke-width="5" fill="none" stroke-linecap="round"/>
    </g>
    <!-- wader by the rocks -->
    <g transform="translate(452,828)">
      <circle cx="0" cy="-34" r="8" fill="#caa37e"/>
      <path d="M-8 -28 Q0 -32 8 -28 L6 -6 L-6 -6 Z" fill="#16a085"/>
      <path d="M-8 -24 q-10 8 -14 16 M8 -24 q10 8 14 16" stroke="#caa37e" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <g id="fu-splash" stroke="#d9f6ef" stroke-width="2.6" stroke-linecap="round">
        <line x1="-20" y1="-4" x2="-26" y2="-12"/><line x1="20" y1="-4" x2="26" y2="-12"/>
        <line x1="0" y1="-2" x2="0" y2="-10"/>
      </g>
    </g>
    <!-- ducks -->
    <g id="fu-ducks">
      ${[0, 52, 96].map((dx, i) => `
      <g transform="translate(${236 + dx},${824 + i * 3}) scale(${1 - i * .22})">
        <ellipse cx="0" cy="0" rx="14" ry="8" fill="#6b4f2f"/>
        <circle cx="12" cy="-7" r="6" fill="#2e5e3a"/>
        <path d="M17 -7 l7 2 -7 2 Z" fill="#e8a33d"/>
      </g>`).join("")}
    </g>
    <!-- boardwalk + sitters -->
    <g>
      <rect x="1150" y="800" width="330" height="14" rx="3" fill="#a07b4f"/>
      ${[1170,1230,1290,1350,1410,1462].map(x => `<line x1="${x}" y1="800" x2="${x}" y2="814" stroke="#7d5d39" stroke-width="3"/>`).join("")}
      <rect x="1166" y="814" width="10" height="30" fill="#7d5d39"/>
      <rect x="1454" y="814" width="10" height="30" fill="#7d5d39"/>
      ${person(1250, 802, { coat: "#9b59b6", sit: true })}
      ${person(1420, 802, { coat: "#d35400", sit: true, flip: true })}
      <path d="M1262 790 a26 26 0 0 1 30 0" stroke="#c0392b" stroke-width="4" fill="none"/>
    </g>
    <!-- dragonfly -->
    <g id="fu-dfly" transform="translate(720,768)">
      <line x1="0" y1="0" x2="14" y2="2" stroke="#2c8ca8" stroke-width="2.6"/>
      <ellipse cx="-4" cy="-3" rx="9" ry="3" fill="#9adfee" opacity=".8"/>
      <ellipse cx="-2" cy="3" rx="9" ry="3" fill="#9adfee" opacity=".8"/>
    </g>
  </g>
  <!-- heritage plaque -->
  <g id="fu-plaque" opacity="0" transform="translate(1478,700)">
    <line x1="0" y1="78" x2="0" y2="0" stroke="#2c3138" stroke-width="5"/>
    <rect x="-58" y="-54" width="116" height="58" rx="8" fill="#1c5e8a"/>
    <text y="-32" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="#eaf4fb">GARRISON CREEK</text>
    <text y="-13" text-anchor="middle" font-family="Georgia,serif" font-size="10" fill="#bcd9ec">daylighted · returned</text>
  </g>
  <!-- receding flood overlay -->
  <g id="fu-flood" transform="translate(0,690)">
    <path id="fu-fwave" d="${wavePath(3400, 7, 130)}" fill="#4e4435" opacity=".95"/>
    <rect x="-200" y="5" width="2000" height="900" fill="#463d2f" opacity=".96"/>
  </g>`;

  const q = id => svg.querySelector(id);
  const futureSky = document.getElementById("future-sky");
  const flood = q("#fu-flood"), fwave = q("#fu-fwave");
  const green = q("#fu-green"), people = q("#fu-people"), sun = q("#fu-sungrp");
  const plaque = q("#fu-plaque"), sparkle = q("#fu-sparkle");
  const swim1 = q("#fu-swim1"), swim2 = q("#fu-swim2"), arm = q("#fu-arm");
  const ducks = q("#fu-ducks"), dfly = q("#fu-dfly"), splash = q("#fu-splash");
  const willow = q("#fu-willow");
  const SKY_FU_T = [[0, "#2f3a47"], [.4, "#577f9b"], [.75, "#6fb1d8"], [1, "#7cb9d6"]];
  const SKY_FU_B = [[0, "#3c4856"], [.4, "#9dc0cf"], [.75, "#e8e9c9"], [1, "#ffe9c2"]];

  scene("sc-future", (p, t) => {
    futureSky.style.setProperty("--c1", ramp(SKY_FU_T, ease(map(p, .04, .6))));
    futureSky.style.setProperty("--c2", ramp(SKY_FU_B, ease(map(p, .04, .6))));
    svg.style.filter =
      `saturate(${lerp(.3, 1, ease(map(p, .08, .5))).toFixed(2)}) brightness(${lerp(.6, 1, ease(map(p, .08, .5))).toFixed(2)})`;
    /* flood recedes into the creek channel */
    const fl = ease(map(p, .05, .48));
    flood.setAttribute("transform", `translate(0,${lerp(690, 916, fl).toFixed(1)})`);
    flood.setAttribute("opacity", (1 - map(p, .4, .52)).toFixed(2));
    fwave.setAttribute("transform", `translate(${(-(t * 30 % 130)).toFixed(1)},0)`);
    green.setAttribute("opacity", map(p, .3, .55).toFixed(2));
    sun.setAttribute("opacity", ease(map(p, .45, .72)).toFixed(2));
    people.setAttribute("opacity", map(p, .55, .75).toFixed(2));
    plaque.setAttribute("opacity", map(p, .6, .72).toFixed(2));
    /* life */
    if (!REDUCED) {
      const bob = Math.sin(t * 1.6) * 3;
      swim1.setAttribute("transform", `translate(${620 + Math.sin(t * .4) * 30},${846 + bob})`);
      arm.setAttribute("d", Math.sin(t * 3.4) > 0 ? "M6 -8 Q22 -30 38 -12" : "M6 -8 Q20 -2 36 -6");
      swim2.setAttribute("transform", `translate(910,${852 + Math.sin(t * 1.2 + 2) * 3.4})`);
      ducks.setAttribute("transform", `translate(${(t * 7 % 260) - 60},${Math.sin(t * 1.4) * 2})`);
      dfly.setAttribute("transform",
        `translate(${720 + Math.sin(t * .9) * 60},${768 + Math.sin(t * 2.7) * 14})`);
      splash.setAttribute("opacity", (Math.sin(t * 5) > .2 ? .9 : .15));
      sparkle.setAttribute("transform", `translate(${(t * 14 % 110) - 55},0)`);
      sparkle.setAttribute("opacity", (.35 + .3 * Math.sin(t * 2)).toFixed(2));
      willow.setAttribute("transform", `rotate(${(Math.sin(t * .7) * .8).toFixed(2)} 60 600)`);
    }
    rain.target = p < .3 ? .25 * (1 - p / .3) : 0;
    rain.host = p < .35 ? "sc-future" : rain.host;
  });
  rainCanvas("sc-future");
}

/* ── progress bar + main loop (the chapter readout lives in HR.nav) ───── */
const barEl = document.getElementById("bar");
const flowSections = [...document.querySelectorAll("section[data-name]")];
/* which music bed each scene wants while it owns the viewport */
const MOOD = {
  "sc-cloud": "calm", "sc-fall": "calm", "sc-flood": "tense", "sc-drive": "tense",
  "sc-rewind": "tense", "sc-stink": "tense", "sc-vote": "tense", "sc-bury": "tense",
  "sc-century": "calm", "sc-forecast": "calm", "sc-daylight": "calm",
  "sc-dozer": "tense", "sc-future": "calm",
};
let lastT = perf(), curMood = "", audioWasOn = false;
function loop() {
  const t = perf(), dt = Math.min(.05, t - lastT); lastT = t;
  const y = scrollY, vh = innerHeight;
  rain.target = 0;
  let activeId = "";
  for (const s of SCENES) {
    const p = (y - s.top) / (s.hgt - vh);
    /* edge veil: dark while the sticky pins/unpins (wider window than the
       update band so an entering scene is already veiled) */
    if (s.edge && p > -1.5 && p < 2.5) {
      const e = p < 0 ? c01(-p / .18) : p > 1 ? c01((p - 1) / .18) : 0;
      s.edge.style.opacity = e.toFixed(3);
    }
    if (p > -.12 && p < 1.12) {
      const pc = c01(p);
      for (const b of s.beats) {
        const a = beatAlpha(pc, b.a, b.b);
        b.el.style.opacity = a.toFixed(3);
        b.el.style.setProperty("--dy", ((1 - a) * 14).toFixed(1));
      }
      s.update && s.update(pc, t, dt);
    }
  }
  for (const sec of flowSections) {
    const r = sec.getBoundingClientRect();
    if (r.top < vh * .5 && r.bottom > vh * .5) { activeId = sec.id; }
  }
  const docH = document.documentElement.scrollHeight - vh;
  barEl.style.transform = `scaleX(${(docH ? y / docH : 0).toFixed(4)})`;
  drawRain(dt, t);
  drawFlash();
  /* audio: crossfade the music bed to the active scene, track the rain bed */
  if (window.HR && HR.audio) {
    if (HR.audio.on && !audioWasOn) { curMood = ""; audioWasOn = true; }   // just enabled → re-sync
    else if (!HR.audio.on) audioWasOn = false;
    const m = MOOD[activeId] || "calm";
    if (m !== curMood) { curMood = m; HR.audio.mood(m); }
    HR.audio.rain(rain.val);
  }
  requestAnimationFrame(loop);
}
measure();
addEventListener("resize", measure);
addEventListener("load", measure);
requestAnimationFrame(loop);
