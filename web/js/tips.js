/* Hidden Rivers v2 — HR.tips: interactive fact tooltips.
   Any element with [data-tip] grows a hover/tap popover that expands the fact
   with deeper context and an optional [data-link] "read further" anchor.
   Keyboard- and touch-accessible: the host becomes a focusable button-like
   element; Enter/Space and tap toggle a pinned popover, hover previews it. */
"use strict";
window.HR = window.HR || {};

HR.tips = (() => {
  let pop = null, pinned = null, host = null;

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "hr-tip-pop";
    pop.setAttribute("role", "tooltip");
    document.body.appendChild(pop);
    /* a tap inside the popover (e.g. the link) shouldn't dismiss it */
    pop.addEventListener("pointerdown", e => e.stopPropagation());
    return pop;
  }

  function place(el) {
    const p = ensurePop();
    const tip = el.dataset.tip || "";
    const link = el.dataset.link || "";
    const label = el.dataset.tiplabel || "Read further →";
    p.innerHTML = `<p>${tip}</p>` +
      (link ? `<a href="${link}" target="_blank" rel="noopener">${label}</a>` : "");
    p.classList.add("on");
    /* hover previews must never intercept the pointer (they'd cover the next
       card and eat its hover); only a pinned popover is interactive */
    p.classList.toggle("pinned", pinned === el);
    /* position: prefer below, flip above if it would overflow */
    const r = el.getBoundingClientRect();
    p.style.left = "0px"; p.style.top = "0px";       // reset to measure
    const pr = p.getBoundingClientRect();
    let x = r.left + r.width / 2 - pr.width / 2;
    x = Math.max(10, Math.min(x, innerWidth - pr.width - 10));
    let y = r.bottom + 10;
    if (y + pr.height > innerHeight - 10) y = r.top - pr.height - 10;
    p.style.left = x + "px";
    p.style.top = Math.max(10, y) + "px";
    host = el;
  }
  function hide() {
    if (pop) pop.classList.remove("on", "pinned");
    host = null;
  }

  function bind(el) {
    if (el.dataset.tipBound) return;
    el.dataset.tipBound = "1";
    el.classList.add("hr-tip");
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", (el.textContent || "").trim() + " — more context");

    el.addEventListener("pointerenter", () => { if (!pinned) place(el); });
    el.addEventListener("pointerleave", () => { if (!pinned) hide(); });
    el.addEventListener("click", e => {
      e.stopPropagation();
      if (pinned === el) { pinned = null; hide(); }
      else { pinned = el; place(el); HR.audio && HR.audio.sfx.soft(); }
    });
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
      else if (e.key === "Escape" && pinned === el) { pinned = null; hide(); el.blur(); }
    });
  }

  /* dismiss a pinned popover on outside tap / scroll-away */
  addEventListener("pointerdown", () => { if (pinned) { pinned = null; hide(); } });
  addEventListener("scroll", () => { if (pinned && host) place(host); else if (!pinned) hide(); }, { passive: true });
  addEventListener("resize", () => { if (host) place(host); });

  function scan(root = document) {
    root.querySelectorAll("[data-tip]").forEach(bind);
  }
  function boot() { scan(); }
  if (document.body) boot();
  else addEventListener("DOMContentLoaded", boot);

  return { scan, bind };
})();
