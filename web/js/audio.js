/* Hidden Rivers v2 — HR.audio: procedural Web Audio engine.
   No asset files (keeps the "open index.html from file://" promise): every
   sound is synthesised at runtime. There is deliberately NO music bed — the
   piece plays on weather and place instead: layered rain, thunder, wind,
   streamflow and bird song, each an ambient channel that the story scenes
   and the mini-games drive independently (the louder of the two wins), plus
   a library of one-shot SFX (UI, car, dozer, sirens, splashes, dig).

   Browser autoplay policy forbids sound before a user gesture, so audio stays
   muted until the floating speaker button (or the first tap/keypress) enables
   it; the choice persists in localStorage and re-arms on later gestures. */
"use strict";
window.HR = window.HR || {};

HR.audio = (() => {
  const PREF = "hr-v2-sound";
  let ctx = null, master = null;
  let ambBus = null, sfxBus = null;
  let noiseBuf = null;
  let engineNode = null, dozerNode = null;
  let enabled = false, built = false, tickTimer = 0;

  /* ── graph construction (lazy: only after the first user gesture) ─────── */
  function build() {
    if (built) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.0; master.connect(ctx.destination);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.95; ambBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);

    /* shared white-noise buffer (rain, thunder, wind, stream, dig, splash) */
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    built = true;
    startTicker();
    applyAmbient();
  }
  const noiseSrc = () => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    return s;
  };
  /* small helper: noise → filter(s) → gain, started and parked at 0 */
  function noiseChain(filters) {
    const src = noiseSrc();
    let head = src;
    for (const f of filters) { head.connect(f); head = f; }
    const g = ctx.createGain(); g.gain.value = 0;
    head.connect(g); g.connect(ambBus);
    src.start();
    return g;
  }
  const biq = (type, freq, Q = 1) => {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = Q;
    return f;
  };

  /* ── ambient channels ──────────────────────────────────────────────────
     Two writers per channel — the scroll story ("story") and whichever
     mini-game is running ("game") — so a locked game can own the weather
     without fighting the scroll engine's per-frame updates. */
  const LVL = {
    rain:   { story: 0, game: 0 },
    stream: { story: 0, game: 0 },
    birds:  { story: 0, game: 0 },
    wind:   { story: 0, game: 0 },
  };
  const chLevel = k => Math.max(LVL[k].story, LVL[k].game);
  const AMB = {};                                        // lazily-built node groups

  function ensureRain() {
    if (AMB.rain || !ctx) return;
    /* three layers: high hiss (drops on leaves), mid patter (drops on
       pavement, wobbled so it never sounds like a fixed hiss), low drum
       (heavy rain on roofs — only audible in a downpour) */
    const hiss = noiseChain([biq("highpass", 1500), biq("bandpass", 3800, .4)]);
    const pat = noiseChain([biq("bandpass", 520, .7)]);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 2.1;
    const lg = ctx.createGain(); lg.gain.value = 0;
    lfo.connect(lg); lg.connect(pat.gain); lfo.start();
    const drum = noiseChain([biq("lowpass", 220)]);
    AMB.rain = { hiss, pat, patLfoG: lg, drum };
  }
  function ensureStream() {
    if (AMB.stream || !ctx) return;
    /* a brook: bandpassed noise whose centre frequency wanders (the babble),
       a low gurgle underneath, and a bright trickle on top */
    const bp = biq("bandpass", 900, 1.6);
    const babble = noiseChain([bp]);
    const wob = ctx.createOscillator(); wob.frequency.value = .45;
    const wobG = ctx.createGain(); wobG.gain.value = 260;
    wob.connect(wobG); wobG.connect(bp.frequency); wob.start();
    const wob2 = ctx.createOscillator(); wob2.frequency.value = 1.7;
    const wobG2 = ctx.createGain(); wobG2.gain.value = 120;
    wob2.connect(wobG2); wobG2.connect(bp.frequency); wob2.start();
    const gurgle = noiseChain([biq("lowpass", 380, .8)]);
    const trickle = noiseChain([biq("highpass", 2400), biq("bandpass", 5200, .5)]);
    AMB.stream = { babble, gurgle, trickle };
  }
  function ensureWind() {
    if (AMB.wind || !ctx) return;
    const bp = biq("bandpass", 280, .45);
    const body = noiseChain([biq("lowpass", 480), bp]);
    AMB.wind = { body, bp, gust: 0 };
  }

  /* smooth every layer toward its channel level (curved per layer) */
  function applyAmbient() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const set = (g, v, tc = .6) => g.gain.setTargetAtTime(v, now, tc);
    const r = chLevel("rain");
    if (r > 0) ensureRain();
    if (AMB.rain) {
      set(AMB.rain.hiss, Math.pow(r, 1.25) * .11);
      set(AMB.rain.pat, r * .07);
      AMB.rain.patLfoG.gain.setTargetAtTime(r * .022, now, .6);
      set(AMB.rain.drum, Math.max(0, r - .55) * .22);
    }
    const s = chLevel("stream");
    if (s > 0) ensureStream();
    if (AMB.stream) {
      set(AMB.stream.babble, s * .085, .9);
      set(AMB.stream.gurgle, s * .06, .9);
      set(AMB.stream.trickle, Math.pow(s, 1.6) * .035, .9);
    }
    const w = chLevel("wind");
    if (w > 0) ensureWind();
    if (AMB.wind) set(AMB.wind.body, w * .14, 1.1);
    /* birds are one-shots scheduled by the ticker — nothing to fade here */
  }
  function setAmbient(src, vals) {
    if (!vals) return;
    let changed = false;
    for (const k in vals) {
      if (!(k in LVL)) continue;
      const v = Math.max(0, Math.min(1, +vals[k] || 0));
      if (LVL[k][src] !== v) { LVL[k][src] = v; changed = true; }
    }
    if (changed && built && enabled) applyAmbient();
  }
  const storyAmb = vals => setAmbient("story", vals);
  const gameAmb = vals => setAmbient("game", vals);
  const gameAmbClear = () =>
    setAmbient("game", { rain: 0, stream: 0, birds: 0, wind: 0 });

  /* ── the ticker: scheduled life on top of the beds ─────────────────────
     bird calls when the birds channel is up, water bloops on a strong
     stream, and slow wind gusts. 260 ms resolution is plenty. */
  function startTicker() {
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (!enabled || !ctx || ctx.state !== "running") return;
      const b = chLevel("birds");
      if (b > 0 && Math.random() < .06 + b * .22) birdCall(b);
      const s = chLevel("stream");
      if (s > .25 && Math.random() < s * .1) bloopAt(.03 * s);
      const w = chLevel("wind");
      if (AMB.wind && w > 0) {                            // wandering gusts
        AMB.wind.gust = Math.max(-1, Math.min(1, AMB.wind.gust + (Math.random() - .5) * .5));
        AMB.wind.bp.frequency.setTargetAtTime(280 + AMB.wind.gust * 120, ctx.currentTime, .8);
        AMB.wind.body.gain.setTargetAtTime(w * (.11 + .06 * (AMB.wind.gust * .5 + .5)),
                                           ctx.currentTime, .8);
      }
    }, 260);
  }

  /* ── bird song: tiny synthesised species ──────────────────────────────── */
  function pipe() {                                        // osc → gain → bus (+pan)
    const o = ctx.createOscillator(); o.type = "sine";
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g);
    let out = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.random() * 1.4 - .7;
      g.connect(p); out = p;
    }
    out.connect(ambBus);
    return { o, g };
  }
  function note(P, at, f0, f1, dur, amp) {
    P.o.frequency.setValueAtTime(f0, at);
    P.o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), at + dur);
    P.g.gain.setValueAtTime(0, at);
    P.g.gain.linearRampToValueAtTime(amp, at + dur * .25);
    P.g.gain.exponentialRampToValueAtTime(.0004, at + dur);
  }
  function birdCall(level) {
    const t0 = ctx.currentTime + .02;
    const amp = .028 + level * .03;
    const kind = (Math.random() * 3) | 0;
    const P = pipe();
    let end = t0;
    if (kind === 0) {                                      // robin: burbled phrase
      const n = 3 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const f = 2100 + Math.random() * 900;
        note(P, t0 + i * .14, f, f * (Math.random() < .5 ? .78 : 1.22), .11, amp);
      }
      end = t0 + n * .14 + .2;
    } else if (kind === 1) {                               // chickadee: fee—bee
      note(P, t0, 3650, 3520, .18, amp);
      note(P, t0 + .26, 2950, 2830, .22, amp * .9);
      end = t0 + .6;
    } else {                                               // sparrow: dry trill
      const n = 7 + (Math.random() * 5 | 0);
      const f = 3400 + Math.random() * 700;
      for (let i = 0; i < n; i++)
        note(P, t0 + i * .045, f * (1 + (Math.random() - .5) * .04), f * .92, .035, amp * .8);
      end = t0 + n * .045 + .15;
    }
    P.o.start(t0); P.o.stop(end + .05);
  }
  function bloopAt(amp) {                                  // a plop in the current
    const t0 = ctx.currentTime + .01;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(520 + Math.random() * 260, t0);
    o.frequency.exponentialRampToValueAtTime(140, t0 + .16);
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(ambBus);
    g.gain.linearRampToValueAtTime(amp, t0 + .015);
    g.gain.exponentialRampToValueAtTime(.0004, t0 + .18);
    o.start(t0); o.stop(t0 + .25);
  }

  /* ── enable / disable / toggle ───────────────────────────────────────── */
  function enable() {
    build();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    enabled = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 0.6);
    applyAmbient();
    try { localStorage.setItem(PREF, "1"); } catch (e) {}
    reflectBtn();
  }
  function disable() {
    enabled = false;
    if (ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.4);
    }
    try { localStorage.setItem(PREF, "0"); } catch (e) {}
    reflectBtn();
  }
  function toggle() { enabled ? disable() : enable(); }

  /* ── one-shot SFX ────────────────────────────────────────────────────── */
  function tone(freq, dur, type = "sine", peak = 0.3, glideTo = null, at = 0) {
    if (!enabled || !ctx) return;
    const now = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, now + dur);
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(sfxBus);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0006, now + dur);
    o.start(now); o.stop(now + dur + 0.03);
  }
  function noiseBurst(dur, filterType, freq, peak, q = 1, at = 0) {
    if (!enabled || !ctx) return;
    const now = ctx.currentTime + at;
    const src = noiseSrc();
    const f = biq(filterType, freq, q);
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(sfxBus);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0006, now + dur);
    src.start(now); src.stop(now + dur + 0.05);
    return { f, g, src, at: now };
  }

  const SFX = {
    click: () => tone(660, 0.06, "triangle", 0.16, 880),
    soft:  () => tone(520, 0.08, "sine", 0.12, 600),
    bump:  () => { tone(120, 0.16, "square", 0.18, 70); noiseBurst(0.14, "lowpass", 500, 0.12); },
    splash: () => {                                        // wheels into water + droplets
      const n = noiseBurst(0.42, "bandpass", 1400, 0.22, 0.8);
      if (n) n.f.frequency.exponentialRampToValueAtTime(480, n.at + 0.36);
      for (let i = 0; i < 3; i++)
        noiseBurst(0.05, "highpass", 3600, 0.05, 1, 0.16 + i * 0.07 + Math.random() * .04);
    },
    surge: () => {                                         // water taking a street
      if (!enabled || !ctx) return;
      const n = noiseBurst(1.1, "bandpass", 300, 0.001, 0.9);
      if (n) {
        n.f.frequency.exponentialRampToValueAtTime(110, n.at + 1.0);
        n.g.gain.setValueAtTime(0, n.at);
        n.g.gain.linearRampToValueAtTime(0.16, n.at + 0.5);   // swell, not attack
        n.g.gain.exponentialRampToValueAtTime(0.0006, n.at + 1.1);
      }
      tone(65, 1.0, "sine", 0.1, 40);
    },
    /* thunder, with a personality per strike: close hits crack first, far
       ones only rumble; the tail wobbles as it decays. pow 0..1 = closeness */
    thunder: (pow = 1) => {
      if (!enabled || !ctx) return;
      const p = Math.max(.2, Math.min(1, pow));
      if (p > .55) {                                       // the crack
        noiseBurst(0.09, "highpass", 2400, 0.14 * p, 1, 0.0);
        noiseBurst(0.16, "bandpass", 900, 0.16 * p, 1.4, 0.02);
      }
      const dly = p > .55 ? .1 : .02;
      tone(44 + Math.random() * 8, 1.4 + p, "sine", 0.3 * p, 28, dly);
      const n = noiseBurst(1.1 + p * 1.2, "lowpass", 750, 0.28 * p, 0.6, dly);
      if (n) {
        n.f.frequency.exponentialRampToValueAtTime(90, n.at + 1 + p);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + Math.random() * 3;
        const lg = ctx.createGain(); lg.gain.value = 0.07 * p;
        lfo.connect(lg); lg.connect(n.g.gain);
        lfo.start(n.at); lfo.stop(n.at + 1.2 + p * 1.2);
      }
    },
    siren: () => {                                         // distant, behind the rain
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = "triangle";
      const f = biq("lowpass", 900, 1);
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(sfxBus);
      const T = 2.8;
      for (let k = 0; k <= 4; k++)
        o.frequency[k ? "linearRampToValueAtTime" : "setValueAtTime"](
          k % 2 ? 930 : 640, now + (k / 4) * T);
      g.gain.linearRampToValueAtTime(0.045, now + .5);
      g.gain.setValueAtTime(0.045, now + T - .7);
      g.gain.exponentialRampToValueAtTime(0.0004, now + T);
      o.start(now); o.stop(now + T + .05);
    },
    horn: () => {                                          // a stuck driver, leaning on it
      const d = .22 + Math.random() * .25;
      tone(349, d, "square", 0.045);
      tone(440, d, "square", 0.038);
    },
    ding: () => {                                          // streetcar bell, twice
      tone(1180, .4, "triangle", .12, 1140);
      tone(1180, .35, "triangle", .09, 1120, .18);
    },
    vote:  () => { tone(174.61, 0.5, "sine", 0.25); tone(261.63, 0.5, "sine", 0.18); },
    gavel: () => { tone(150, 0.12, "square", 0.3, 70); noiseBurst(0.12, "lowpass", 400, 0.2); },
    win:   () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.7, "sine", 0.22 - i * 0.02)); },
    clear: () => {                                         // level clear: quick rising run
      [392, 523.25, 659.25, 783.99].forEach((f, i) =>
        tone(f, 0.34, "triangle", 0.16, null, i * 0.09));
      tone(1046.5, 0.6, "sine", 0.14, null, 0.36);
    },
    fail:  () => { [196, 155.56, 123.47].forEach(f => tone(f, 0.8, "sawtooth", 0.16, f * 0.85)); },
    warp:  () => {                                         // time-machine sweep
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 1200;
      o.frequency.exponentialRampToValueAtTime(70, now + 1.8);
      const g = ctx.createGain(); g.gain.value = 0;
      const f = biq("bandpass", 800, 6);
      f.frequency.exponentialRampToValueAtTime(180, now + 1.8);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      g.gain.linearRampToValueAtTime(0.22, now + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0006, now + 1.9);
      o.start(now); o.stop(now + 2);
    },
    build: () => { tone(90, 0.12, "square", 0.12, 60); noiseBurst(0.18, "lowpass", 700, 0.1); },
    success: () => tone(880, 0.22, "sine", 0.16, 1320),
    bloop: () => { if (enabled && ctx) bloopAt(.06); },    // a fish, jumping
  };

  /* ── continuous loops (engine, dozer) ────────────────────────────────── */
  function makeLoop(srcType, baseFreq, filterFreq, vol) {
    if (!enabled || !ctx) return null;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = srcType; o.frequency.value = baseFreq;
    const f = biq("lowpass", filterFreq, 1.2);
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(sfxBus);
    g.gain.linearRampToValueAtTime(vol, now + 0.3);
    o.start(now);
    return { o, f, g };
  }
  function stopLoop(L, t = 0.4) {
    if (!L || !ctx) return;
    const now = ctx.currentTime;
    L.g.gain.cancelScheduledValues(now);
    L.g.gain.setValueAtTime(L.g.gain.value, now);
    L.g.gain.linearRampToValueAtTime(0, now + t);
    L.o.stop(now + t + 0.05);
  }
  function engineStart() {
    if (engineNode) return;
    engineNode = makeLoop("sawtooth", 64, 240, 0.10);
    if (engineNode) {                                      // idle lope
      const lfo = ctx.createOscillator(); lfo.frequency.value = 11;
      const lg = ctx.createGain(); lg.gain.value = 0.018;
      lfo.connect(lg); lg.connect(engineNode.g.gain); lfo.start();
      engineNode.lfo = lfo;
    }
  }
  function engineStop() {
    if (engineNode && engineNode.lfo) try { engineNode.lfo.stop(); } catch (e) {}
    stopLoop(engineNode); engineNode = null;
  }
  function engineRev(intensity) {                          // 0..1 → pitch/brightness
    if (!engineNode || !ctx) return;
    const now = ctx.currentTime;
    engineNode.o.frequency.setTargetAtTime(58 + intensity * 70, now, 0.08);
    engineNode.f.frequency.setTargetAtTime(220 + intensity * 600, now, 0.08);
  }
  function dozerStart() {
    if (dozerNode) return;
    dozerNode = makeLoop("square", 48, 180, 0.09);
    if (dozerNode) {                                        // add a clanking tremolo
      const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = 6;
      const lg = ctx.createGain(); lg.gain.value = 0.05;
      lfo.connect(lg); lg.connect(dozerNode.g.gain); lfo.start();
      dozerNode.lfo = lfo;
    }
  }
  function dozerStop() { if (dozerNode && dozerNode.lfo) try { dozerNode.lfo.stop(); } catch (e) {} stopLoop(dozerNode); dozerNode = null; }
  function dozerLoad(intensity) {                           // engine bogs down under load
    if (!dozerNode || !ctx) return;
    dozerNode.o.frequency.setTargetAtTime(44 + intensity * 26, ctx.currentTime, 0.1);
  }

  /* ── floating toggle button ──────────────────────────────────────────── */
  let btn = null;
  function makeBtn() {
    btn = document.createElement("button");
    btn.id = "sound-toggle"; btn.type = "button";
    btn.setAttribute("aria-label", "Toggle sound");
    btn.addEventListener("click", toggle);
    document.body.appendChild(btn);
    reflectBtn();
  }
  function reflectBtn() {
    if (!btn) return;
    btn.classList.toggle("on", enabled);
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    btn.innerHTML = enabled
      ? '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M22 9l-6 6M16 9l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }

  /* arm audio on the first user gesture. Sound is opt-OUT: unless the user
     has explicitly muted before (PREF === "0"), the first tap/keypress
     starts the soundscape. Autoplay policy is satisfied because the
     AudioContext is created inside the gesture handler. */
  function armReentry() {
    let pref = null;
    try { pref = localStorage.getItem(PREF); } catch (e) { /* private mode */ }
    if (pref === "0") return;
    const go = () => {
      enable();
      removeEventListener("pointerdown", go);
      removeEventListener("keydown", go);
      removeEventListener("touchend", go);
    };
    addEventListener("pointerdown", go);
    addEventListener("keydown", go);
    addEventListener("touchend", go);
  }

  function boot() { makeBtn(); armReentry(); }
  if (document.body) boot();
  else addEventListener("DOMContentLoaded", boot);
  /* pause the bus when the tab is hidden so muted tabs stay silent/cheap */
  addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend && ctx.suspend();
    else if (enabled) ctx.resume && ctx.resume();
  });

  return {
    enable, disable, toggle,
    sfx: SFX,
    engineStart, engineStop, engineRev,
    dozerStart, dozerStop, dozerLoad,
    rain: v => storyAmb({ rain: v }),                     // back-compat alias
    storyAmb, gameAmb, gameAmbClear,
    get on() { return enabled; },
  };
})();
