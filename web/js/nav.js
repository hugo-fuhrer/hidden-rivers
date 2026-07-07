/* Hidden Rivers v2 — HR.nav: story navigation chrome.
   - Bookmark button (top-left, the mirror of the sound toggle) opens a
     dropdown of story sections to jump back to; the whole control hides
     while a game holds the input lock (html.hr-locked).
   - "Replay the story" button in the footer clears the cross-phase state
     (vote, game results) and restarts from the top.
   - Case-study photo dropdowns lazy-load their image on first open and
     degrade to a Wikimedia Commons link if the image can't be fetched. */
"use strict";
window.HR = window.HR || {};

HR.nav = (() => {
  const sfx = () => { if (window.HR && HR.audio && HR.audio.sfx) HR.audio.sfx.soft(); };

  /* ── bookmark button + section menu ─────────────────────────────────── */
  const btn = document.createElement("button");
  btn.id = "bookmark-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Bookmarks — jump to a section");
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1Z"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

  const menu = document.createElement("nav");
  menu.id = "bookmark-menu";
  menu.setAttribute("aria-label", "Story sections");
  const sections = [...document.querySelectorAll("section[data-name]")];
  menu.innerHTML = `<p class="bm-kick">Jump back to&hellip;</p>` + sections.map(s =>
    `<button type="button" data-target="${s.id}">${s.dataset.name}</button>`).join("");
  document.body.appendChild(btn);
  document.body.appendChild(menu);

  let openY = 0;
  function setOpen(on) {
    menu.classList.toggle("on", on);
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) {
      openY = scrollY;
      /* mark the section currently on screen */
      const vh = innerHeight;
      let cur = "";
      for (const s of sections) {
        const r = s.getBoundingClientRect();
        if (r.top < vh * .5 && r.bottom > vh * .5) cur = s.id;
      }
      menu.querySelectorAll("button[data-target]").forEach(b =>
        b.classList.toggle("cur", b.dataset.target === cur));
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

  /* ── case-study photos: fetch on first open, degrade to a source link ── */
  document.querySelectorAll("details.case-photo").forEach(d => {
    d.addEventListener("toggle", () => {
      if (!d.open) return;
      const img = d.querySelector("img[data-src]");
      if (!img) return;
      img.addEventListener("error", () => {
        const fig = img.closest("figure");
        const page = img.dataset.page;
        if (fig) fig.innerHTML = `<p class="cp-fail">The photo couldn't be loaded here — ` +
          (page ? `<a href="${page}" target="_blank" rel="noopener">view it on Wikimedia Commons ↗</a>`
                : `check your connection`) + `.</p>`;
      }, { once: true });
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    });
  });

  return { openMenu: () => setOpen(true), closeMenu: () => setOpen(false) };
})();
