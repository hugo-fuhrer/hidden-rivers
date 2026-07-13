/* Hidden Rivers v2 — HR.compare: before/after sliders for the case studies.
   Each .ba-frame holds a "before" layer (a real archival/contextual photo
   over an illustrated placeholder) and a photo "after" layer clipped by
   --cut (the divider position, % from the left). Both photos lazy-load when
   the figure scrolls into view — no click needed — and the divider
   auto-sweeps from all-before to mostly-after so the comparison
   demonstrates itself. Drag / touch / arrow keys move the divider after
   that. A before photo that fails to load falls back to the illustration
   (tag reverts to "illustrated"); a failed after photo collapses the frame
   to the before layer plus a source link, so nothing breaks offline. */
"use strict";
window.HR = window.HR || {};

HR.compare = (() => {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setCut(frame, pct, announce = true) {
    pct = clamp(pct, 0, 100);
    frame.style.setProperty("--cut", pct + "%");
    if (announce) frame.setAttribute("aria-valuenow", Math.round(pct));
    frame.dataset.cut = pct;
  }

  function sweep(frame, from, to, dur) {
    if (REDUCED) { setCut(frame, to); return; }
    const t0 = performance.now();
    frame.dataset.sweeping = "1";
    (function step(now) {
      if (!frame.dataset.sweeping) return;                 // user grabbed the handle
      const k = Math.min(1, (now - t0) / dur);
      const e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      setCut(frame, from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
      else delete frame.dataset.sweeping;
    })(t0);
  }

  function arm(frame) {
    setCut(frame, 100, true);                              // start all-"before"
    const onDrag = e => {
      delete frame.dataset.sweeping;
      const r = frame.getBoundingClientRect();
      setCut(frame, ((e.clientX - r.left) / r.width) * 100);
    };
    frame.addEventListener("pointerdown", e => {
      e.preventDefault();
      frame.setPointerCapture && frame.setPointerCapture(e.pointerId);
      onDrag(e);
      const mv = ev => onDrag(ev);
      const up = () => {
        frame.removeEventListener("pointermove", mv);
        frame.removeEventListener("pointerup", up);
        frame.removeEventListener("pointercancel", up);
      };
      frame.addEventListener("pointermove", mv);
      frame.addEventListener("pointerup", up);
      frame.addEventListener("pointercancel", up);
    });
    frame.addEventListener("keydown", e => {
      const cur = +frame.dataset.cut || 50;
      if (e.key === "ArrowLeft") { e.preventDefault(); setCut(frame, cur - 6); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setCut(frame, cur + 6); }
    });
  }

  function open(fig) {
    const frame = fig.querySelector(".ba-frame");
    if (!frame) return;

    /* the before photo layers over its illustration; the drawing is only
       the loading state / offline fallback */
    const before = fig.querySelector(".ba-before img[data-src]");
    if (before) {
      const tag = fig.querySelector(".ba-before .ba-tag");
      before.addEventListener("load", () => {
        before.classList.add("on");
        if (tag && tag.dataset.loaded) tag.textContent = tag.dataset.loaded;
      }, { once: true });
      before.addEventListener("error", () => before.remove(), { once: true });
      before.src = before.dataset.src;
      before.removeAttribute("data-src");
    }

    const img = fig.querySelector(".ba-after img[data-src]");
    const go = () => sweep(frame, 100, 42, 2600);          // the reveal: wipe to "after"
    if (!img) { go(); return; }
    img.addEventListener("load", go, { once: true });
    img.addEventListener("error", () => {
      const page = img.dataset.page;
      const after = img.closest(".ba-after");
      if (after) after.remove();
      const handle = frame.querySelector(".ba-handle");
      if (handle) handle.remove();
      frame.classList.add("ba-flat");
      const cap = fig.querySelector("figcaption");
      if (cap && page) cap.innerHTML =
        `The photo couldn't be loaded here — <a href="${page}" target="_blank" rel="noopener">view it on Wikimedia Commons ↗</a>.`;
    }, { once: true });
    img.src = img.dataset.src;
    img.removeAttribute("data-src");
  }

  function boot() {
    const figs = [...document.querySelectorAll("figure.ba")];
    figs.forEach(f => { const fr = f.querySelector(".ba-frame"); fr && arm(fr); });
    const io = new IntersectionObserver(es => {
      for (const e of es)
        if (e.isIntersecting) { open(e.target); io.unobserve(e.target); }
    }, { threshold: .45 });
    figs.forEach(f => io.observe(f));
  }
  if (document.readyState !== "loading") boot();
  else addEventListener("DOMContentLoaded", boot);

  return {};
})();
