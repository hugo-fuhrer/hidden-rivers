/* Hidden Rivers v2 — Phase 2: the 1882 council vote.
   Pure DOM (it's a form; screen readers should eat it whole). The room
   pressures the user toward Option B; insisting on A gets overridden by
   the chamber, 18–3 — the false choice is that the outcome never changes. */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const sec = $("sc-vote");
  if (!sec) return;
  const cardA = $("vote-a"), cardB = $("vote-b");
  const btnA = cardA.querySelector(".vbtn"), btnB = cardB.querySelector(".vbtn");
  const toast = $("vote-toast"), modal = $("vote-modal");
  const result = $("vote-result"), ticker = $("vote-ticker");
  const echo = $("vote-echo");

  /* ambient dread: the fever ticker climbs; B warms with every death */
  let deaths = 211, tickInt = 0, heat = 0;
  function tick() {
    deaths++;
    ticker.textContent = `FEVER DEATHS THIS SEASON: ${deaths}`;
    heat = Math.min(1, heat + .08);
    cardB.style.setProperty("--heat", heat.toFixed(2));
  }
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (e.isIntersecting && !tickInt && !voted()) tickInt = setInterval(tick, 2400);
      else if (!e.isIntersecting && tickInt) { clearInterval(tickInt); tickInt = 0; }
    }
  }, { threshold: .35 });
  io.observe(sec);

  const voted = () => !!(HR.state.get("vote") || {}).ballot;

  /* hover interrupt: the City Engineer interjects over A's button */
  let toastT = 0, dwell = 0, warnings = 0, lastToast = -9e9;
  cardA.addEventListener("pointerenter", () => {
    if (voted() || performance.now() - lastToast < 6000) return;
    dwell = setTimeout(() => {
      lastToast = performance.now();
      toast.classList.add("on"); warnings++;
      clearTimeout(toastT);
      toastT = setTimeout(() => toast.classList.remove("on"), 2600);
    }, 300);
  });
  cardA.addEventListener("pointerleave", () => clearTimeout(dwell));

  /* click interrupt: POINT OF ORDER */
  const tStart = performance.now();
  btnA.addEventListener("click", () => {
    if (voted()) return;
    warnings++;
    modal.classList.add("on");
    const rec = modal.querySelector(".v-reconsider");
    rec && rec.focus();
  });
  modal.querySelector(".v-reconsider").addEventListener("click", () => {
    modal.classList.remove("on");
    btnB.focus();
  });
  modal.querySelector(".v-certain").addEventListener("click", () => {
    modal.classList.remove("on");
    cast("A");
  });
  modal.addEventListener("keydown", e => {                // trap focus in the modal
    if (e.key !== "Tab") return;
    const f = [...modal.querySelectorAll("button")];
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  });
  btnB.addEventListener("click", () => { if (!voted()) cast("B"); });

  function cast(ballot) {
    clearInterval(tickInt); tickInt = 0;
    HR.state.set("vote", { ballot, hesitatedMs: Math.round(performance.now() - tStart),
                           warningsSeen: warnings });
    apply(ballot, true);
  }
  function apply(ballot, announce) {
    const C = HR.COPY.vote;
    sec.classList.add("voted");
    result.innerHTML = ballot === "A"
      ? `<p class="tally">${C.tallyA}</p><p class="quip">${C.tallyAQuip}</p>`
      : `<p class="tally">${C.tallyB}</p><p class="quip">${C.tallyBQuip}</p>`;
    result.classList.add("on");
    setEcho(ballot);
    if (announce) HR.live(ballot === "A"
      ? "Your ballot: parks. The chamber votes 18 to 3 for the sewers. Motion carries."
      : "Motion carries, 21 to 0. The creeks will be buried.");
  }
  function setEcho(ballot) {
    if (echo) echo.textContent = HR.COPY.echo[ballot] || HR.COPY.echo.none;
  }

  /* resume after a reload mid-story */
  const prior = HR.state.get("vote");
  if (prior && prior.ballot) apply(prior.ballot, false);
  else setEcho("none");
})();
