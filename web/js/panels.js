/* Hidden Rivers v2 — HR.panel: "dig deeper" side panels.
   Any element with [data-dig="key"] opens a slide-in drawer that expands a
   short claim in the story: a plain-language explanation, real reference
   photos (hot-linked from stable archives; a figure that fails to load
   removes itself so the panel degrades to text), and clickable sources.
   Keyboard accessible: Esc closes, focus is moved in and restored on close. */
"use strict";
window.HR = window.HR || {};

/* ── content registry ──────────────────────────────────────────────────── */
/* fig.src uses Wikimedia's stable Special:FilePath redirect where possible;
   every figure self-removes on error, so a moved file never breaks a panel. */
const WM = f => "https://commons.wikimedia.org/wiki/Special:FilePath/" +
                encodeURIComponent(f) + "?width=1000";

HR.PANELS = {

  warmair: {
    kick: "The physics of a loaded sky",
    title: "Why warm air carries more rain",
    body: `
      <p>Air's capacity to hold water vapour grows roughly <b>7&thinsp;% for every
      degree Celsius</b> of warming — a relationship physicists call the
      Clausius–Clapeyron equation. It's the reason a warmer climate doesn't just
      mean hotter days; it means <i>heavier bursts</i> when the sky finally lets go.</p>
      <p>Southern Ontario has warmed by about 1.5&nbsp;°C since the late 1800s, and
      Lake Ontario adds its own moisture on hot days. The same storm cell that
      would have been an inconvenience a century ago now arrives carrying
      measurably more water — and Toronto's drains were sized for the old sky.</p>`,
    sources: [
      { label: "Canada's Changing Climate Report — Government of Canada", url: "https://changingclimate.ca/CCCR2019/" },
      { label: "Clausius–Clapeyron relation — Wikipedia", url: "https://en.wikipedia.org/wiki/Clausius%E2%80%93Clapeyron_relation" },
    ],
  },

  combined: {
    kick: "One pipe, two jobs",
    title: "Toronto's combined sewers",
    body: `
      <p>In the old city — roughly everything built before the 1940s — a single
      Victorian pipe carries <b>both</b> sewage and stormwater. On a dry day it all
      flows to a treatment plant. In a cloudburst, the pipe fills in minutes:
      the surplus backs up into basements or discharges, raw, through overflow
      outfalls into the harbour and the Don.</p>
      <p>Many of these brick sewers are the very pipes the creeks were buried
      into in the 1880s. They still follow the old valleys — which is why the
      flooding does too.</p>`,
    figs: [
      { src: WM("CSO diagram US EPA.svg"),
        cap: "How a combined sewer works: one pipe for everything, with an overflow to the nearest water body when rain overwhelms it. (US EPA diagram.)" },
    ],
    sources: [
      { label: "Basement flooding — City of Toronto", url: "https://www.toronto.ca/services-payments/water-environment/managing-rain-melted-snow/basement-flooding/" },
      { label: "Combined sewer — Wikipedia", url: "https://en.wikipedia.org/wiki/Combined_sewer" },
    ],
  },

  storm2024: {
    kick: "July 16, 2024",
    title: "A month of rain in an afternoon",
    body: `
      <p>Three trains of thunderstorms crossed the city that day. Toronto Pearson
      recorded <b>97.8&nbsp;mm</b> — close to a full July's worth of rain, most of it
      in a few hours. The Don Valley Parkway went under water, Union Station's
      lower concourse flooded, and about <b>167,000</b> Toronto Hydro customers
      lost power when a lakeshore transformer station flooded.</p>
      <p>The Insurance Bureau of Canada put insured losses above
      <b>$940&nbsp;million</b> — and uninsured basement damage always runs far past
      the insured number. It was Toronto's third "hundred-year storm" since 2013.</p>`,
    sources: [
      { label: "July 2024 flooding — Insurance Bureau of Canada", url: "https://www.ibc.ca/news-insights/news/july-flash-floods-in-toronto-and-southern-ontario-caused-over-940-million-in-insured-damage" },
      { label: "Environment and Climate Change Canada — historical data", url: "https://climate.weather.gc.ca/" },
    ],
  },

  flood2013: {
    kick: "July 8, 2013 — the rehearsal",
    title: "The storm that showed the map",
    body: `
      <p>Eleven years earlier, an evening storm dropped <b>126&nbsp;mm</b> on parts of
      Toronto in about two hours — the city's wettest day on record, more than
      Hurricane Hazel delivered in 1954. A Richmond Hill GO train stalled in the
      Don Valley with 1,400 passengers aboard; police boats took them off over
      seven hours. At the time it was Ontario's costliest disaster, near
      <b>$1&nbsp;billion</b> insured.</p>
      <p>Look at the photographs of 2013 and 2024 side by side and the same
      streets keep appearing. That's not coincidence — the intersections that
      drown fastest sit in the shallow valleys of buried creeks, where water has
      collected since before the city existed.</p>`,
    figs: [
      { src: WM("Flooding in Dufferin Street underpass beneath railway tracks, 2013-07-08.JPG"),
        cap: "A rail underpass swallowed whole on July 8, 2013 — the same scene this story opens with, eleven years earlier." },
    ],
    sources: [
      { label: "The July 2013 GTA flood — History of flooding in Canada, Wikipedia", url: "https://en.wikipedia.org/wiki/History_of_flooding_in_Canada" },
      { label: "Lost Rivers of Toronto — walk the buried creeks", url: "https://www.lostrivers.ca/" },
    ],
  },

  ashbridges: {
    kick: "1882 · downwind of everything",
    title: "Ashbridge's Bay — \"the greatest plague-spot\"",
    body: `
      <p>Every creek in the old city — and the sewage of every privy that drained
      into them — emptied into the vast marsh at the mouth of the Don. By the
      1880s the cattle byres, distillery waste and raw sewage had turned
      Ashbridge's Bay septic; visiting health officials would later brand the
      marsh <b>"the greatest plague-spot in Christendom."</b></p>
      <p>This was the emergency the 1882 chamber could smell through its own
      windows. Miasma theory — disease carried on foul air — was still current
      medicine, and by that theory the stinking creeks themselves were the
      killers. Burying them wasn't malice; it was the treatment the science of
      the day prescribed. A century later, the same bay hosts Toronto's main
      wastewater treatment plant — the pipe network built that decade still
      terminates there.</p>`,
    sources: [
      { label: "Ashbridges Bay — Wikipedia", url: "https://en.wikipedia.org/wiki/Ashbridges_Bay" },
      { label: "Ashbridges Bay Wastewater Treatment Plant — Wikipedia", url: "https://en.wikipedia.org/wiki/Ashbridges_Bay_Wastewater_Treatment_Plant" },
    ],
  },

  garrison: {
    kick: "Buried 1884 · never left",
    title: "Garrison Creek, the ghost river",
    body: `
      <p>Garrison Creek once ran from north of St. Clair down to Fort York —
      the largest of the old town's creeks. Between 1884 and the 1920s it was
      swallowed, reach by reach, into what was then one of the largest brick
      sewers in Canada, and its ravine was filled with construction rubble
      (including, famously, the excavation spoil from the Bloor subway line).</p>
      <p>You can still walk it: <b>Christie Pits, Bickford Park and Trinity
      Bellwoods</b> are the unfilled pieces of its ravine, strung in a line down
      the map. An entire stone bridge — the Crawford Street bridge — stands
      buried whole under Trinity Bellwoods Park. When storms overwhelm the old
      sewer, the water resurfaces along exactly this alignment.</p>`,
    sources: [
      { label: "Garrison Creek — Wikipedia", url: "https://en.wikipedia.org/wiki/Garrison_Creek_(Ontario)" },
      { label: "Crawford Street Bridge, buried whole — Wikipedia", url: "https://en.wikipedia.org/wiki/Crawford_Street_Bridge" },
      { label: "Garrison Creek Discovery Walk — Lost Rivers", url: "https://www.lostrivers.ca/" },
    ],
  },

  lostmap: {
    kick: "How we know where they are",
    title: "The map of the lost rivers",
    body: `
      <p>Nobody alive has seen most of these creeks, yet the map in this story
      is real. The <b>Lost Rivers</b> project — volunteers with the Toronto Green
      Community — spent decades reconstructing them from 19th-century sources:
      the 1818 Phillpotts military survey, Goad's fire-insurance atlases, early
      engineering plans, and the tell-tale contours that still dent the street
      grid where ravines were filled.</p>
      <p>The result, published as open data, traces roughly <b>300&nbsp;km</b> of
      buried watercourses under the city. Every segment in this story's maps is
      drawn from that dataset. The old maps are worth a look on their own — the
      1884 Goad atlas still shows Garrison Creek winding, in blue, through
      blocks you may live on.</p>`,
    figs: [
      { src: WM("1910 Goad Toronto atlas map of Ward 1.jpg"),
        cap: "A plate from Goad's fire-insurance atlas of Toronto — the block-by-block surveys the Lost Rivers volunteers reconstructed the creeks from." },
    ],
    sources: [
      { label: "Lost Rivers of Toronto — the project", url: "https://www.lostrivers.ca/" },
      { label: "Lost Rivers dataset — Borealis Dataverse (doi:10.5683/SP2/TSJSQZ)", url: "https://doi.org/10.5683/SP2/TSJSQZ" },
      { label: "Goad's atlases of Toronto, plate by plate online", url: "http://goadstoronto.blogspot.com/" },
    ],
  },

  hazel: {
    kick: "October 15, 1954",
    title: "Hurricane Hazel and the lesson half-learned",
    body: `
      <p>Hazel stalled over a soaked city and dropped over 200&nbsp;mm of rain in
      parts of the region within 48 hours. Rivers rose ten metres. On <b>Raymore
      Drive</b>, beside the Humber, an entire block of houses was swept away at
      night — 35 of the storm's 81 Toronto-area deaths on a single street.</p>
      <p>The response was genuinely visionary in one way: the province banned
      building on floodplains, expropriated the valleys, and created the
      conservation authorities that keep the big river valleys green today.
      But for the <i>small</i> creeks — already underground — the lesson drawn was
      more pipes and more concrete. The paving of the watershed accelerated,
      and every hectare sealed sends its rain to the Victorian brick faster.</p>`,
    figs: [
      { src: WM("Hurricane Hazel -- October 15, 1954 (4893181009).jpg"),
        cap: "Hurricane Hazel's flooding, October 15, 1954 — the storm that rewrote how Toronto treats its big river valleys." },
    ],
    sources: [
      { label: "Effects of Hurricane Hazel in Canada — Wikipedia", url: "https://en.wikipedia.org/wiki/Effects_of_Hurricane_Hazel_in_Canada" },
      { label: "Hurricane Hazel's legacy — Toronto and Region Conservation Authority", url: "https://trca.ca/" },
    ],
  },

  medicine: {
    kick: "The cure that made the pipes obsolete",
    title: "Medicine beat the water-borne diseases — not the sewers",
    body: `
      <p>Burying the creeks in the 1880s <i>was</i> a public-health measure, and an
      honest one: the open creeks had become open sewers, and cholera and
      typhoid killed by the hundreds. But what actually ended those epidemics
      came a generation later — Toronto began <b>chlorinating</b> its drinking
      water in 1910 and filtering it in 1917, and typhoid deaths collapsed
      within a decade.</p>
      <p>Nobody went back to re-ask what the buried-creek sewers were for once
      the diseases were beaten. The pipes simply stayed — aging, undersized,
      and now doing a job (storm drainage for a paved megacity) they were
      never designed to do.</p>`,
    sources: [
      { label: "Toronto Water — Wikipedia", url: "https://en.wikipedia.org/wiki/Toronto_Water" },
      { label: "R.C. Harris Water Treatment Plant — Wikipedia", url: "https://en.wikipedia.org/wiki/R._C._Harris_Water_Treatment_Plant" },
    ],
  },

  cso: {
    kick: "When the pipe chokes",
    title: "Combined sewer overflows — and the $3-billion fix underway",
    body: `
      <p>When rain overwhelms a combined sewer, the designed relief valve is an
      <b>overflow outfall</b>: the mix of stormwater and raw sewage discharges
      straight to the nearest water body. Toronto still has dozens of these
      along the Don, the harbour and the western beaches — it's why swimming
      advisories follow big storms.</p>
      <p>The city is now building its way out: the <b>Don River &amp; Central
      Waterfront program</b> (the Coxwell Bypass tunnel and its successors) is a
      multi-decade, multi-billion-dollar network of deep tunnels and storage
      shafts to catch overflows before they reach the river. It is the direct,
      still-running bill for the 1882 decision — and every litre of stormwater
      kept <i>out</i> of the combined system (which is what daylighting does)
      shrinks the problem at the source.</p>`,
    sources: [
      { label: "Don River & Central Waterfront project — City of Toronto", url: "https://www.toronto.ca/services-payments/water-environment/managing-rain-melted-snow/the-don-river-and-central-waterfront-project/" },
      { label: "Combined sewer overflow — Wikipedia", url: "https://en.wikipedia.org/wiki/Combined_sewer#Combined_sewer_overflow" },
    ],
  },

  daylighting: {
    kick: "Restoration, not decoration",
    title: "What daylighting actually restores",
    body: `
      <p>Daylighting is best understood as <b>hydrological restoration</b>: taking
      a stream out of a pipe and giving it back the things a pipe amputates —
      a floodplain to spread into, banks that soak water into the ground,
      vegetation that slows the flow, and a channel that can carry sediment
      instead of clogging with it.</p>
      <p>A culvert has one fixed capacity, set the day it was poured; everything
      beyond that capacity becomes someone's basement. An open valley's capacity
      is <i>elastic</i> — it widens as the water rises. That's the storage this
      whole story turns on. The habitat, the cooling and the park are real
      benefits, but they're consequences of the hydrology coming back, not the
      point of it.</p>`,
    sources: [
      { label: "Daylighting streams — Wikipedia", url: "https://en.wikipedia.org/wiki/Daylighting_(streams)" },
      { label: "Daylighting streams: breathing life into urban streams — American Rivers", url: "https://www.americanrivers.org/" },
    ],
  },

  costs: {
    kick: "The honest ledger",
    title: "What daylighting costs — and where it doesn't fit",
    body: `
      <p>Daylighting is not free flood control. Opening a creek in a built city
      means <b>buying or borrowing land</b> in the most expensive real estate on
      the continent; <b>relocating a century of utilities</b> that were woven
      around the culvert; years of construction on streets people live on; and
      a maintenance bill — open channels collect litter, silt and invasive
      plants, and someone must tend them forever.</p>
      <p>Costs per kilometre range from modest (a culvert under a park) to
      enormous (Seoul spent about <b>US$280&nbsp;million</b> on 5.8&nbsp;km, in the
      densest district of the country). Some reaches under downtown towers will
      simply never come out of the pipe. And success has its own side effect:
      restored creeks raise nearby land values, which can push out the very
      residents who flooded — <i>green gentrification</i> is a documented pattern
      that has to be planned against, not discovered afterward.</p>
      <p>The fair comparison is never "daylighting vs. free". It's daylighting
      vs. the next-largest buried pipe — plus the flood damages, the overflow
      tunnels and the cooling the pipe will never provide.</p>`,
    sources: [
      { label: "Daylighting streams report — American Rivers (2016)", url: "https://www.americanrivers.org/" },
      { label: "Cheonggyecheon restoration cost & outcomes — Landscape Performance Series", url: "https://www.landscapeperformance.org/case-study-briefs/cheonggyecheon-stream-restoration" },
    ],
  },

  cheong: {
    kick: "Seoul · 2003–2005",
    title: "Cheonggyecheon: the expressway that became a river",
    body: `
      <p>Through central Seoul, a buried stream carried a four-lane elevated
      expressway on its back. In 2003 the city tore the expressway down and
      spent two years and about <b>US$280&nbsp;million</b> digging the
      Cheonggyecheon back into daylight — 5.8&nbsp;km of continuous public
      riverbank through the densest district in Korea.</p>
      <p>The measured results made it the world's reference project: summer air
      along the corridor runs <b>3–6&nbsp;°C cooler</b> than parallel streets;
      fish species rose from 4 to 25 and bird species from 6 to 36 within
      three years; and tens of thousands of people walk the banks daily.
      Traffic, predicted to seize, largely evaporated onto transit — the
      demolition itself became a landmark in transport planning.</p>`,
    figs: [
      { src: WM("Korea-Seoul-Cheonggyecheon-02.jpg"),
        cap: "The Cheonggyecheon today — a river walk where an elevated expressway stood." },
    ],
    sources: [
      { label: "Cheonggyecheon — Wikipedia", url: "https://en.wikipedia.org/wiki/Cheonggyecheon" },
      { label: "Measured outcomes — Landscape Performance Series", url: "https://www.landscapeperformance.org/case-study-briefs/cheonggyecheon-stream-restoration" },
    ],
  },

  quaggy: {
    kick: "London · 2003",
    title: "The Quaggy: a park that is allowed to flood",
    body: `
      <p>The River Quaggy spent the 20th century in concrete culverts under
      south-east London, and the neighbourhoods downstream flooded anyway.
      When engineers proposed <i>more</i> culvert in the 1990s, residents formed
      the <b>Quaggy Waterways Action Group</b> and pushed the opposite plan:
      let the river out, and give it somewhere to go.</p>
      <p><b>Sutcliffe Park</b> was regraded into a shallow basin around the
      reopened river. On dry days it's playing fields and wetland boardwalks;
      in a storm it becomes a lake, storing up to <b>85,000&nbsp;m³</b> of water
      that used to fill living rooms in Lewisham — hundreds of properties with
      measurably lower flood risk. The kingfishers found it on their own, and
      the park won national awards. The lesson Toronto keeps citing: the flood
      storage and the beloved park are <i>the same land</i>.</p>`,
    figs: [
      { src: WM("River Quaggy in Sutcliffe Park.JPG"),
        cap: "The Quaggy winding through Sutcliffe Park's floodable basin." },
    ],
    sources: [
      { label: "River Quaggy — Wikipedia", url: "https://en.wikipedia.org/wiki/River_Quaggy" },
      { label: "Quaggy Waterways Action Group", url: "https://www.qwag.org.uk/" },
    ],
  },

  zurich: {
    kick: "Zurich · since 1988",
    title: "The Bachkonzept: daylighting as sewer policy",
    body: `
      <p>Zurich's programme began with an accountant's observation: every litre
      of clean brook water flowing through the combined sewers was a litre the
      treatment plant processed for nothing. The 1988 <b>Bachkonzept</b>
      ("stream concept") made separating that water official policy — and the
      cheapest way to separate a brook from a sewer is often to put the brook
      back on the surface.</p>
      <p>More than <b>20&nbsp;km</b> of brooks have been reopened since, threaded
      between tram lines, schoolyards and apartment blocks. The programme paid
      for itself in reduced treatment load, and the city got the banks as pure
      surplus. It's the least romantic case for daylighting — and for a city
      staring at sewer bills, maybe the most persuasive.</p>`,
    sources: [
      { label: "Daylighting in Switzerland — Wikipedia", url: "https://en.wikipedia.org/wiki/Daylighting_(streams)#Switzerland" },
      { label: "The Bachkonzept — Architecture is Climate", url: "https://architectureisclimate.net/practice/bachkonzept/" },
    ],
  },

  portlands: {
    kick: "Toronto · opened 2025",
    title: "The Port Lands: Toronto already did this — at river scale",
    body: `
      <p>For a century the Don River ended in a right-angle concrete channel
      (the Keating Channel), and every serious storm threatened to put 240
      hectares of downtown under water. The <b>Port Lands Flood Protection
      Project</b> — about <b>$1.4&nbsp;billion</b>, funded three ways by city,
      province and federal government — carved an entirely <i>new, naturalized
      river mouth</i> for the Don through the old industrial fill, with wetlands,
      spawning habitat and a floodplain engineered to drown safely.</p>
      <p>Water flowed into the new valley in 2024–25, creating Villiers Island
      and the new <b>Biidaasige Park</b>. It's the largest river-restoration
      project in Canadian urban history, and it proves the thesis of this story
      at full scale: Toronto knows how to give a river room — when it decides
      to pay for it. The buried creeks are the same argument, one size down.</p>`,
    figs: [
      { src: WM("New Mouth of the Don River 2024.jpg"),
        cap: "The Don's new, naturalized mouth flowing through the Port Lands, 2024." },
    ],
    sources: [
      { label: "Don Mouth Naturalization &amp; Port Lands Flood Protection — Waterfront Toronto", url: "https://www.waterfrontoronto.ca/our-projects/don-mouth-naturalization-and-port-lands-flood-protection" },
      { label: "Port Lands — Wikipedia", url: "https://en.wikipedia.org/wiki/Port_Lands" },
    ],
  },
};

/* ── drawer UI ─────────────────────────────────────────────────────────── */
HR.panel = (() => {
  let scrim, drawer, openKey = null, opener = null;

  function build() {
    if (drawer) return;
    scrim = document.createElement("div");
    scrim.className = "hp-scrim";
    scrim.addEventListener("click", close);
    drawer = document.createElement("aside");
    drawer.className = "hp-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "false");           // page stays scrollable
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
  }

  function figHTML(f) {
    return `<figure class="hp-fig">
      <img loading="lazy" referrerpolicy="no-referrer" src="${f.src}" alt="">
      <figcaption>${f.cap || ""}</figcaption>
    </figure>`;
  }

  function open(key, fromEl) {
    const P = HR.PANELS[key];
    if (!P) return;
    build();
    openKey = key; opener = fromEl || document.activeElement;
    drawer.setAttribute("aria-label", P.title);
    drawer.innerHTML = `
      <button class="hp-close" type="button" aria-label="Close panel">✕</button>
      <p class="hp-kick">${P.kick || "Dig deeper"}</p>
      <h3>${P.title}</h3>
      <div class="hp-body">${P.body}</div>
      ${(P.figs || []).map(figHTML).join("")}
      ${P.sources && P.sources.length ? `
        <p class="hp-srck">Sources — read further</p>
        <ul class="hp-srcs">${P.sources.map(s =>
          `<li><a href="${s.url}" target="_blank" rel="noopener">${s.label} ↗</a></li>`).join("")}
        </ul>` : ""}`;
    /* a photo that can't load removes itself: panel degrades to text */
    drawer.querySelectorAll(".hp-fig img").forEach(img => {
      img.addEventListener("error", () => { const f = img.closest(".hp-fig"); f && f.remove(); });
    });
    drawer.querySelector(".hp-close").addEventListener("click", close);
    scrim.classList.add("on");
    drawer.classList.add("on");
    drawer.scrollTop = 0;
    drawer.querySelector(".hp-close").focus({ preventScroll: true });
    if (window.HR && HR.audio) HR.audio.sfx.soft();
  }

  function close() {
    if (!drawer || !openKey) return;
    openKey = null;
    scrim.classList.remove("on");
    drawer.classList.remove("on");
    if (opener && opener.focus) opener.focus({ preventScroll: true });
    opener = null;
  }

  /* delegated open: works for triggers added at any time (incl. game cards) */
  addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("[data-dig]");
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    open(el.dataset.dig, el);
  }, true);
  /* Esc closes the panel first — registered at load so it runs before the
     game island's key trap and can swallow the event while a panel is open */
  addEventListener("keydown", e => {
    if (e.key === "Escape" && openKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      close();
    }
  }, true);

  /* the inline trigger chip: a pulsing spade instead of a flat "i" — it
     should read as "there's treasure buried under this sentence" */
  const DIG_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 3v6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M9 3.6h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M7.2 9.6h9.6v3.6a4.8 4.8 0 0 1-9.6 0Z" fill="currentColor"/></svg>`;

  /* affordance + keyboard access for non-button triggers */
  function scan(root = document) {
    root.querySelectorAll("[data-dig]").forEach(el => {
      if (el.dataset.digBound) return;
      el.dataset.digBound = "1";
      if (el.tagName === "BUTTON" && el.classList.contains("dig")) {
        el.innerHTML = DIG_ICON;
        if (!el.title) el.title = "Dig deeper";
      }
      if (el.tagName !== "BUTTON" && el.tagName !== "A") {
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(el.dataset.dig, el); }
        });
      }
    });
  }
  function boot() { scan(); }
  if (document.body) boot();
  else addEventListener("DOMContentLoaded", boot);

  return { open, close, scan };
})();
