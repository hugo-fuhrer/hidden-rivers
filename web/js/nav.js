/* Hidden Rivers v2 — HR.nav: story navigation chrome.
   - Chapters button (top-left): a pill that always shows "Chapters", the
     current chapter's numeral + title, and how much of the story has been
     read (%). Clicking opens the section menu to jump around; the whole
     control hides while a game holds the input lock (html.hr-locked).
   - "Replay the story" button in the footer clears the cross-phase state
     (vote, game results) and restarts from the top. */
"use strict";
window.HR = window.HR || {};

HR.nav = (() => {
  const sfx = () => { if (window.HR && HR.audio && HR.audio.sfx) HR.audio.sfx.soft(); };

  /* ── chapters button + section menu ─────────────────────────────────── */
  const btn = document.createElement("button");
  btn.id = "bookmark-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Chapters — jump to a section");
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round"/></svg>
    <span class="bm-word">Chapters</span>
    <span class="bm-cur" id="bm-cur"></span>
    <b class="bm-pct" id="bm-pct">0%</b>`;

  const menu = document.createElement("nav");
  menu.id = "bookmark-menu";
  menu.setAttribute("aria-label", "Story sections");
  const sections = [...document.querySelectorAll("section[data-name]")];
  menu.innerHTML = `<p class="bm-kick">Chapters — jump to&hellip;</p>` + sections.map(s =>
    `<button type="button" data-target="${s.id}">${s.dataset.name}</button>`).join("");
  document.body.appendChild(btn);
  document.body.appendChild(menu);

  const curEl = btn.querySelector("#bm-cur");
  const pctEl = btn.querySelector("#bm-pct");

  function currentSection() {
    const vh = innerHeight;
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top < vh * .5 && r.bottom > vh * .5) return s;
    }
    return null;
  }
  /* live readout: current chapter + % of the story completed */
  let navRaf = 0;
  function refresh() {
    navRaf = 0;
    const sec = currentSection();
    curEl.textContent = sec ? sec.dataset.name : "";
    curEl.classList.toggle("off", !sec);
    const docH = document.documentElement.scrollHeight - innerHeight;
    pctEl.textContent = (docH ? Math.min(100, Math.round(scrollY / docH * 100)) : 0) + "%";
  }
  addEventListener("scroll", () => {
    if (!navRaf) navRaf = requestAnimationFrame(refresh);
  }, { passive: true });
  addEventListener("resize", refresh);
  refresh();

  let openY = 0;
  function setOpen(on) {
    menu.classList.toggle("on", on);
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) {
      openY = scrollY;
      const cur = currentSection();
      menu.querySelectorAll("button[data-target]").forEach(b =>
        b.classList.toggle("cur", !!cur && b.dataset.target === cur.id));
    }
  }
  btn.addEventListener("click", e => {
    e.stopPropagation();
    sfx();
    setOpen(!menu.classList.contains("on"));
  });
  menu.addEventListener("click", e => {
    const b = e.target.closest("button[data-target]");
    if (!b) return;
    const sec = document.getElementById(b.dataset.target);
    if (!sec) return;
    sfx();
    setOpen(false);
    scrollTo({ top: sec.offsetTop + 8, behavior: "auto" });   // land just inside the section
  });
  addEventListener("pointerdown", e => {
    if (menu.classList.contains("on") && !menu.contains(e.target) && !btn.contains(e.target))
      setOpen(false);
  });
  addEventListener("keydown", e => {
    if (e.key === "Escape" && menu.classList.contains("on")) { setOpen(false); btn.focus(); }
  });
  addEventListener("scroll", () => {                          // drifted away: fold the menu
    if (menu.classList.contains("on") && Math.abs(scrollY - openY) > innerHeight)
      setOpen(false);
  }, { passive: true });

  /* ── footer replay ───────────────────────────────────────────────────── */
  const replay = document.getElementById("replay-story");
  if (replay) replay.addEventListener("click", () => {
    try { sessionStorage.removeItem("hr-v2-state"); } catch (e) { /* private mode */ }
    try { history.scrollRestoration = "manual"; } catch (e) { /* old browsers */ }
    scrollTo(0, 0);
    location.reload();
  });

  return { openMenu: () => setOpen(true), closeMenu: () => setOpen(false) };
})();
