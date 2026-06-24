/* Hidden Rivers v2 — HR.audio: procedural Web Audio engine.
   No asset files (keeps the "open index.html from file://" promise): every
   sound is synthesised at runtime. Two music beds — a calm, contemplative
   pad for scrolling/reading and an urgent, pulsing bed for games and the
   vote — crossfade seamlessly via HR.audio.mood(). A library of one-shot and
   looping SFX covers UI, the car, the dozer, rain/thunder and the burial dig.

   Browser autoplay policy forbids sound before a user gesture, so audio stays
   muted until the floating speaker button (or the first game Start) enables it;
   the choice persists in localStorage and re-arms on later gestures. */
"use strict";
window.HR = window.HR || {};

HR.audio = (() => {
  const PREF = "hr-v2-sound";
  let ctx = null, master = null;
  let musicBus = null, sfxBus = null;
  let beds = {}, mood = "calm", melodyTimer = 0, step = 0;
  let noiseBuf = null;
  let rainNode = null, engineNode = null, dozerNode = null;
  let enabled = false, built = false;

  const wantOn = () => { try { return localStorage.getItem(PREF) === "1"; } catch (e) { return false; } }

  /* ── graph construction (lazy: only after the user opts in) ───────────── */
  function build() {
    if (built) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.0; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.62; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);

    /* shared white-noise buffer (rain, thunder, dig, splash) */
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    buildBeds();
    built = true;
  }

  /* a chord pad: detuned oscillators + a slow tremolo, parked behind a bus.
     The intrinsic g.gain is the mood fader (driven by setMood); the LFO sums
     a tremolo wobble on top of it. */
  function pad(freqs, type, busGain, tremHz, tremDepth) {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(busGain);
    /* tremolo LFO modulating the pad gain */
    const lfo = ctx.createOscillator(); lfo.frequency.value = tremHz;
    const lfoG = ctx.createGain(); lfoG.gain.value = tremDepth;
    lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.value = f;
      o.detune.value = (Math.random() * 2 - 1) * 6;
      const og = ctx.createGain(); og.gain.value = 1 / freqs.length;
      o.connect(og); og.connect(g); o.start();
    }
    return g;                                              // park its gain at 0
  }

  function buildBeds() {
    /* calm: an open A-minor-ish pad, warm and slow */
    const calmBus = ctx.createGain(); calmBus.gain.value = 1; calmBus.connect(musicBus);
    const calmPad = pad([110, 164.81, 220, 329.63], "sine", calmBus, 0.12, 0.35);
    calmPad.gain.value = 0;
    /* tense: a low, close, dissonant drone */
    const tenseBus = ctx.createGain(); tenseBus.gain.value = 1; tenseBus.connect(musicBus);
    const tensePad = pad([82.41, 87.31, 123.47, 130.81], "sawtooth", tenseBus, 5.5, 0.5);
    const tenseFilt = ctx.createBiquadFilter(); tenseFilt.type = "lowpass";
    tenseFilt.frequency.value = 420; tenseFilt.Q.value = 2;
    tensePad.disconnect(); tensePad.connect(tenseFilt); tenseFilt.connect(tenseBus);
    tensePad.gain.value = 0;

    beds = {
      calm: { bus: calmBus, pad: calmPad, vol: 0.0 },
      tense: { bus: tenseBus, pad: tensePad, vol: 0.0 },
    };
    /* bring the active bed up */
    setMood(mood, 0.01);
    startMelody();
  }

  /* ── melodic motion: a tiny ahead-scheduling sequencer ───────────────── */
  const PENT = [440, 493.88, 587.33, 659.25, 880];        // calm bell tones
  function startMelody() {
    clearInterval(melodyTimer);
    melodyTimer = setInterval(() => {
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;
      if (mood === "calm") {
        if (Math.random() < 0.35) {
          const f = PENT[(Math.random() * PENT.length) | 0];
          blip(f, now + 0.05, 1.6, "sine", 0.06, beds.calm.bus);
        }
      } else {                                             // tense: steady low pulse
        const f = step % 4 === 0 ? 110 : 82.41;
        blip(f, now + 0.04, 0.18, "square", 0.05, beds.tense.bus);
        if (step % 8 === 6) blip(155.56, now + 0.04, 0.5, "sawtooth", 0.04, beds.tense.bus);
        step++;
      }
    }, 300);
  }
  function blip(freq, at, dur, type, peak, bus) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(bus || musicBus);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    o.start(at); o.stop(at + dur + 0.05);
  }

  /* ── mood crossfade ──────────────────────────────────────────────────── */
  function setMood(name, fade = 1.4) {
    mood = name;
    if (!ctx || !beds.calm) return;
    const now = ctx.currentTime;
    for (const k of ["calm", "tense"]) {
      const target = k === name ? (k === "tense" ? 0.5 : 0.6) : 0.0;
      const gn = beds[k].pad.gain;
      gn.cancelScheduledValues(now);
      gn.setValueAtTime(gn.value, now);
      gn.linearRampToValueAtTime(target, now + fade);
    }
  }

  /* ── enable / disable / toggle ───────────────────────────────────────── */
  function enable() {
    build();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    enabled = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 0.6);
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
  function tone(freq, dur, type = "sine", peak = 0.3, glideTo = null) {
    if (!enabled || !ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, now + dur);
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(sfxBus);
    g.gain.linearRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0006, now + dur);
    o.start(now); o.stop(now + dur + 0.03);
  }
  function noiseBurst(dur, filterType, freq, peak, q = 1) {
    if (!enabled || !ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(sfxBus);
    g.gain.linearRampToValueAtTime(peak, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0006, now + dur);
    src.start(now); src.stop(now + dur + 0.05);
    return { f, g, src };
  }

  const SFX = {
    click: () => tone(660, 0.06, "triangle", 0.16, 880),
    soft:  () => tone(520, 0.08, "sine", 0.12, 600),
    bump:  () => { tone(120, 0.16, "square", 0.18, 70); noiseBurst(0.14, "lowpass", 500, 0.12); },
    splash:() => { const n = noiseBurst(0.4, "bandpass", 1400, 0.22, 0.8); if (n) n.f.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.35); },
    thunder: () => {                                       // rumble + crack
      if (!enabled || !ctx) return;
      tone(46, 1.6, "sine", 0.32, 30);
      const n = noiseBurst(1.3, "lowpass", 900, 0.3, 0.6);
      if (n) n.f.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 1.2);
    },
    vote:  () => { tone(174.61, 0.5, "sine", 0.25); tone(261.63, 0.5, "sine", 0.18); }, // gavel-ish low knock
    gavel: () => { tone(150, 0.12, "square", 0.3, 70); noiseBurst(0.12, "lowpass", 400, 0.2); },
    win:   () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.7, "sine", 0.22 - i * 0.02)); },
    fail:  () => { [196, 155.56, 123.47].forEach((f, i) => tone(f, 0.8, "sawtooth", 0.16, f * 0.85)); },
    warp:  () => {                                         // time-machine sweep
      if (!enabled || !ctx) return;
      const now = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 1200;
      o.frequency.exponentialRampToValueAtTime(70, now + 1.8);
      const g = ctx.createGain(); g.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 800; f.Q.value = 6;
      f.frequency.exponentialRampToValueAtTime(180, now + 1.8);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      g.gain.linearRampToValueAtTime(0.22, now + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0006, now + 1.9);
      o.start(now); o.stop(now + 2);
    },
    build: () => { tone(90, 0.12, "square", 0.12, 60); noiseBurst(0.18, "lowpass", 700, 0.1); },
    success: () => tone(880, 0.22, "sine", 0.16, 1320),
  };

  /* ── continuous loops (engine, dozer, rain) ──────────────────────────── */
  function makeLoop(srcType, baseFreq, filterFreq, vol) {
    if (!enabled || !ctx) return null;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = srcType; o.frequency.value = baseFreq;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filterFreq; f.Q.value = 1.2;
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
  function engineStart() { if (!engineNode) engineNode = makeLoop("sawtooth", 64, 240, 0.10); }
  function engineStop()  { stopLoop(engineNode); engineNode = null; }
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

  /* rain bed: filtered noise whose level tracks the visual rain target */
  function rainSet(level) {
    if (!enabled || !ctx) { return; }
    if (!rainNode) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2200; f.Q.value = 0.5;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 400;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(hp); hp.connect(f); f.connect(g); g.connect(sfxBus);
      src.start();
      rainNode = { src, f, g };
    }
    rainNode.g.gain.setTargetAtTime(Math.min(0.18, level * 0.18), ctx.currentTime, 0.5);
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

  /* re-arm a previously-granted preference on the first gesture */
  function armReentry() {
    if (!wantOn()) return;
    const go = () => { enable(); removeEventListener("pointerdown", go); removeEventListener("keydown", go); };
    addEventListener("pointerdown", go); addEventListener("keydown", go);
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
    enable, disable, toggle, mood: setMood,
    sfx: SFX,
    engineStart, engineStop, engineRev,
    dozerStart, dozerStop, dozerLoad,
    rain: rainSet,
    get on() { return enabled; },
  };
})();
