# Hidden Rivers — Story Site v2 Specification

**Working title:** *Hidden Rivers: The Rigged City*
**Status:** Design spec — second iteration of `web/` (v1 shipped in `a78dfe9`)
**Scope:** Technical specification, architectural blueprint, and full UI copy for the
interactive scrollytelling experience on Toronto's lost rivers and urban flood mitigation.

---

## 0 · What changed from v1, and why

v1 (`web/index.html` + `main.js`) is a pure scroll-observer: the user falls as a droplet,
watches Queen St E flood, reads the buried-rivers map, reads about daylighting, and sees
the transformed street. It is linear and passive — beautiful, but the user is a witness.

v2 turns the witness into an **accomplice**. The emotional architecture is a
*complicity loop*:

1. **Lose** a game that was never winnable (the 2024 commute) — feel the unfairness.
2. **Cast the vote** that made it unwinnable (1882) — discover the unfairness had a date.
3. **Bury the rivers yourself** (1880–1930) — and be *right* to do it. That's the trap.
4. **Watch the bill come due** (1930–2024) — medicine fixed the sickness; nobody re-asked
   what the pipes were for.
5. **Dig the rivers back out** (present) — repair is a game you *can* win.
6. **Stand on the same street** from step 1, now alive — and be handed a real-world CTA.

Three retention levers drive every design decision below:

- **Ambient life.** Every scene runs infinite wall-clock loops (TTC streetcars, cars,
  cyclists, pedestrians, swimmers, wildlife) *independent of scroll position*. A paused
  scene is never a dead scene — the page rewards lingering.
- **Interactive islands.** Three high-stakes mini-games (Phases 1, 3, 5) and one
  pressure-vote (Phase 2) interrupt the scroll. Each is skippable, replayable, and
  feeds a persistent state store so later copy can reference what *you* did.
- **The honest rig.** Phase 1 is structurally rigged — but the rig is the thesis. The
  flood spreads along the *actual buried-creek alignments* from `rivers-data.js`. When
  the player loses and the loss screen overlays the creek map on the streets that
  betrayed them, the manipulation is *revealed*, not hidden. The game cheats the way
  the city was cheated.

---

## 1 · Architecture & engineering blueprint

### 1.1 Stack decision

**Keep the v1 stack: zero-build, vanilla JS, classic `<script>` tags, canvas + inline
SVG.** Rationale:

- v1's engine (`SCENES[]`, `scene(id, update)`, beats with `data-a`/`data-b`, the rain
  canvas, the seeded-RNG SVG builders) already does 60 fps scroll-bound scenes in ~1,000
  lines. The games need a *peer* system, not a framework.
- The README promise "`open web/index.html` — works straight from the filesystem" is
  worth keeping. ES modules break under `file://`; therefore new code ships as classic
  scripts exporting one namespaced global each (`HR.ambient`, `HR.island`, …), loaded in
  dependency order before `main.js`.
- No physics/game engine. All three games are grid/path logic + canvas rendering — a
  fixed-timestep loop (§1.5) is sufficient and keeps total JS under ~120 KB unminified.

### 1.2 File layout (v2)

```
web/
├── index.html              # scene markup, beats, game mounts, copy slots
├── style.css               # + HUD, modal, dashboard, game-overlay styles
├── rivers-data.js          # unchanged — feeds the map AND the Phase-1 flood rig
├── js/
│   ├── copy.js             # COPY deck — every user-facing string (§8.1)
│   ├── state.js            # HR.state — cross-phase store, sessionStorage-backed
│   ├── input.js            # HR.input — unified WASD/arrows/touch joystick
│   ├── ambient.js          # HR.ambient — wall-clock infinite-loop animator
│   ├── island.js           # HR.island — scroll-lock / input-handover controller
│   └── games/
│       ├── drive.js        # Phase 1 — the rigged commute
│       ├── vote.js         # Phase 2 — 1882 pressure vote (DOM, not canvas)
│       ├── bury.js         # Phase 3 — urbanization race
│       └── dozer.js        # Phase 5 — daylighting run
└── main.js                 # v1 scroll engine, extended with the new scenes
```

### 1.3 Core system: `HR.ambient` (infinite loops)

A registry of loopers driven by **wall-clock time**, never scroll progress:

```js
HR.ambient.add({
  el: "#p1-streetcar",        // SVG group or canvas-draw callback
  period: 22,                 // seconds for one full loop
  visible: "sc-descent",      // culled via IntersectionObserver on the scene
  fn(tNorm, tWall) { ... }    // tNorm ∈ [0,1) within the period
});
```

- One `requestAnimationFrame` drives both the scroll engine and the ambient registry;
  loopers whose host scene is off-screen are skipped (IntersectionObserver flags).
- `prefers-reduced-motion`: each looper declares a `staticPose()` used instead.
- **Loop inventory** (shared sprites reuse v1 builders `streetcar()`, `sedan()`,
  `hatchback()`, `person()`, `dog()`):

| Loop | Scenes | Period | Notes |
|---|---|---|---|
| TTC streetcar crossing | 1, 6 | 22 s | v1 `streetcar()`; bell flash at midpoint |
| Car traffic (2 lanes, offset) | 1 | 9 s / 13 s | sedan + hatchback, headlight cones in rain |
| Pedestrians w/ umbrellas | 1 | 6–11 s ea. | 5 walkers, randomized phase, umbrella bob |
| Cyclist | 1, 6 | 9 s | v1 future-scene cyclist, pedal rotation |
| Rain sheets + gutter flow | 1 | continuous | extends v1 rain canvas with gutter streaks |
| Construction crew march | 5 | follows player | convoy lag = 2.5 s behind dozer |
| Swimmers (crawl, ring kid, wader) | 6 | 1.1 s arm stroke | v1 `fu-swim*` groups, now looping |
| Ducks drift + heron flyby | 6 | 30 s / 45 s | heron is a rare event — reward for lingering |
| Creek sparkle + willow sway | 6 | 4 s / 7 s | v1 `fu-sparkle`, `fu-willow` |

### 1.4 Core system: `HR.island` (scroll-lock & input handover)

Scrollytelling and games fight over the same inputs. The island pattern resolves it:

1. Each game lives inside a normal scene section (with `--len`) so the progress bar
   stays truthful. The sticky viewport hosts the game canvas behind an **engage card**.
2. When scene progress enters `[entry, entry+ε]` and `HR.state` has no result for this
   game, the engage card appears. **Scroll is never stolen implicitly** — the user
   presses *Start* (or any of WASD/arrows/Enter, or taps).
3. `HR.island.lock()`: records `scrollY`; sets `overflow:hidden` on `<html>`;
   `preventDefault()`s wheel/touchmove/keydown(arrows, space) at the document level;
   moves focus into the canvas (focus-trapped); shows a persistent `Esc — pause` chip.
4. On **complete / fail-acknowledged / skip**: write result to `HR.state`, unlock,
   `scrollTo` the section's resume anchor (just past the game beat), restore focus.
5. `Esc` always opens a pause sheet: *Resume · Restart · Skip this part*. Tab-out/blur
   auto-pauses. Scrolling back to a finished game shows a *Replay* chip, never a re-lock.

### 1.5 Game loop standard (all canvas games)

```js
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(now - last, 250); last = now;        // clamp tab-switch spikes
  while (acc >= 16.67) { update(1 / 60); acc -= 16.67; } // fixed 60 Hz simulation
  render(acc / 16.67);                                   // interpolated draw
  if (!done) requestAnimationFrame(frame);
}
```

### 1.6 `HR.state` (persistence & personalization)

```js
HR.state = {
  drive:  { result: "totaled", survivedSec: 71, routesBlocked: 4 },
  vote:   { ballot: "A" | "B", hesitatedMs: 8200, warningsSeen: 2 },
  bury:   { result: "win" | "epidemic", finishYear: 1913, retries: 1 },
  dozer:  { result: "win" | "unprepared", marginSec: 14, retries: 0 },
}
```

Backed by `sessionStorage` (a reload mid-story resumes). Later copy reads it — the
finale literally answers your 1882 ballot (§7.3).

### 1.7 Input, mobile, accessibility

- `HR.input` maps WASD + arrows + on-screen **virtual joystick** (touch) to one
  `{x, y}` axis pair; build-game uses pointer events (click *and* drag-paint) which are
  touch-native already.
- Every game has **"Skip — watch it play out"**: an autopilot plays the game to its
  scripted outcome in ~12 s. Nobody is gated from the story by dexterity.
- `aria-live="polite"` region narrates game-state changes ("Route blocked at Shaw
  Street", "Sickness rising — 3 creeks remain"). All modals are focus-trapped with
  labelled buttons. Reduced motion ⇒ games default to the autopilot.
- Performance budget: ≤ 4 ms script per frame mid-scroll; flood BFS and metric updates
  tick at 2 Hz, not per-frame; ambient loopers are transform-only (no layout).

### 1.8 Scene index (v2 page structure)

| § | Scene id | Mode | `--len` |
|---|---|---|---|
| 1a | `sc-descent` | scroll (cloud → skyline → street, ambient traffic) | 4.5 |
| 1b | `sc-drive` | **game island** — rigged commute | 2.0 |
| 1c | `sc-walkhome` | scroll (dark walk, plaque) | 1.6 |
| 2 | `sc-rewind` → `sc-vote` | scroll fx → **DOM island** (vote) | 1.2 + 1.0 |
| 3 | `sc-bury` | **game island** — urbanization race | 2.0 |
| 4 | `sc-century` | scroll (fast-forward, split maps) | 6.0 |
| 5 | `sc-dozer` | **game island** — daylighting run | 2.0 |
| 6 | `sc-home` | scroll (the street, alive) + footer CTA | 4.6 |

---

## 2 · Phase 1 — The Descent & The Rigged Commute

### 2.1 Visual scene (`sc-descent`)

Reuses the v1 cloud → fall → street pipeline with the ambient layer switched on:

- **p ∈ [0, .30]** — inside the cloud (v1 `cloudlayer` parallax). First beats establish
  date and heat dome. Rain target ramps 0 → 0.3.
- **p ∈ [.30, .70]** — descent through the skyline (v1 parallax layers). The altimeter
  ticks down; thunder + lightning `flash()` on beat boundaries.
- **p ∈ [.70, 1.0]** — arrival at the Queen St E streetscape (`streetBase("p1", false)`)
  **fully alive**: streetcar loop, two car loops, five pedestrians, a cyclist, gutter
  flow. Rain target → 0.8. Water has *not* risen yet — the city is coping. The last
  beat hands over to the game.

**Beats copy (`sc-descent`):**

> *kicker* — `TORONTO · JULY 16 · LATE AFTERNOON`
> **"The third storm cell of the day stalls over the core."**
> "Down there, rush hour is still pretending this is an ordinary Tuesday."
> "You're in the grey sedan. Your apartment — and your basement — is twelve blocks
> northwest."
> **"Get home before the city stops letting you."**

### 2.2 The game — *Get Home* (`sc-drive`)

**Genre:** top-down 2D grid driving. (Top-down over isometric: it matches the flat v1
art language, halves sprite work, and — critically — reads as a *map*, which makes the
final creek-overlay reveal land.)

**Engage card:**

> `6:12 P.M. · QUEEN ST E`
> **Get home.**
> "WASD or arrow keys to drive. Avoid flooded streets. That's it. That's the whole game."
> `[ Start driving ]`   `[ Skip — let it happen ]`

#### Board & rendering

- 11 × 8 intersection grid (city blocks between), one screen, no camera scroll.
  Player car starts bottom-right (Queen & River); **HOME** pin glows top-left.
- Each street *edge* has `elev` = scaled distance to the nearest buried-creek polyline
  (sampled from `rivers-data.js`, Garrison + Taddle alignments warped onto the grid).
  Low-`elev` edges flood first. **The rig is the real map.**
- HUD: top-left minimap with HOME pin and flooded edges in orange; top-right rain
  meter + elapsed clock; bottom-center controls hint (fades after first input);
  `Esc — pause` chip.

#### Movement

Car travels edge-to-edge between intersections; input chooses the exit edge at each
node (8 px/frame, eased). Holding a direction queues the next turn — forgiving, no
twitch skill required. Driving into a flooded edge is impossible: the car noses in,
sprays water, and backs out (1 s penalty, splash audio, controller "no").

#### The Flood Director (the rig)

Two cooperating processes — an honest simulation and a dramaturg:

```text
SIMULATION  (tick: 0.5 s)
  waterLevel += rate                       # rate eases up over 90 s
  for edge in edges:
      if edge.elev <= waterLevel and touches floodedSet: flood(edge)
  # seeds: edges on the creek alignments flood from t = 0

DIRECTOR  (tick: 4 s)
  path = BFS(player → HOME, avoiding floodedSet)
  if path is None:            beginEndgame()
  elif t < GRACE (12 s):      pass                       # let them feel competent
  else:
      edge = pick(path, lookahead = 2..4 nodes ahead of player,
                  never adjacent to player, prefer low elev)
      telegraph(edge, 1.5 s)   # barricade slides in / streetcar stalls across
                               # the box / water sheet glides over the asphalt
      flood(edge)

GUARANTEES (fairness of the rig)
  G1  never flood the player's current edge or the one being entered
  G2  ≥ 1 legal move exists at all times until endgame
  G3  every blockage is telegraphed on-screen ≥ 1.5 s before it lands
  G4  no full trap before T_MIN = 45 s; forced funnel completes by T_MAX = 90 s
  G5  the funnel's last open edges descend monotonically in elev
      toward U, the underpass node           # the player drives *downhill to die*

ENDGAME
  all remaining routes funnel into U (a rail underpass — Toronto's classic
  flood trap). Player enters U → water rises around the car in 3 s →
  headlights flicker → engine sputter (2 audio pops) → screen dims to the
  dashboard glow → HUD stamps "ENGINE DEAD" → cut to loss screen.
  If the player refuses to move, the water closes from behind: same endgame.
```

Ambient NPC loops (streetcar, other cars, pedestrians running for awnings) continue
*inside* the game board — the city is failing around you, not just at you.

#### Loss screen — full UI copy

Black card, dashboard-glow amber type, rain audible:

> `ENGINE DEAD · 6:13 P.M.`
> # The city is dark. You're walking.
> "You did nothing wrong. Replay it in your head: every route you tried was already
> blocked, or about to be."
>
> **`[ Why every route failed ]`** *(auto-plays after 4 s)* — the game board fades to
> blueprint blue; glowing cyan lines rise through the streets you just drove;
> caption: **"The routes that failed you trace Garrison Creek. It was buried in
> 1884. It never left."**
>
> *stat strip* — `Water at your intersection: 1.4 m and rising · 167,000 customers
> without power · DVP closed · Union Station flooding`
> *footnote* — "Insured damage tonight: $940 million and counting. Toronto's third
> '100-year storm' since 2013."
>
> `[ Get out and walk → ]`

### 2.3 Walk home in the dark (`sc-walkhome`) — bridge to Phase 2

Short scroll scene: silhouetted player wades along the sidewalk, ambient loops reduced
to emergency-light pulses and one passing TTC bus replacement shuttle. Beats:

> "Twelve blocks. Knee-deep at the corners that shouldn't be deep at all."
> "Feel cheated? Good. **Hold that thought for 142 years.**"
> *(the player passes a heritage plaque — `GARRISON CREEK · BURIED 1884` — it catches
> the flashlight beam and the screen begins to* ***rewind***)*

---

## 3 · Phase 2 — Historical Pivot & The False Choice (1882)

### 3.1 "Rewind Time" transition (`sc-rewind`)

Scroll-bound, ~1.2 viewport-heights:

1. **Scrub artifacts** — the frame judders; the v1 rain canvas runs *upward*
   (negative velocity); ambient loops reverse (`tNorm = 1 − tNorm`).
2. **Date wheel** — a flip-counter spins `2024 → 1954 → 1924 → 1884 → 1882`,
   easing into each stop with a one-line flash caption (Hazel; the annexations; the
   sewer; the vote).
3. **Palette regression** — CSS filter ramp: desaturate → sepia → lamplight; buildings
   *unbuild* (window rows wipe out bottom-to-top); asphalt fades to mud; the buried
   creek line **rises into the street** as open water; the streetcar loop swaps for a
   horse-drawn omnibus loop.
4. Lands in the **council chamber**: a gaslit DOM overlay (this island is HTML/CSS,
   not canvas — it's a form, and screen readers should eat it whole).

### 3.2 The vote — full UI copy (strict constraints honored)

**Setup text (the required 2–3 sentences):**

> `CITY COUNCIL CHAMBER · TORONTO · 1882 · SPECIAL SESSION`
> # The ravines are killing people. Choose.
> "Garrison Creek runs grey with the waste of ten thousand privies, and the physicians
> say the next cholera season will not knock before it enters. The ledger is bled
> white — the old debts have come due, and the treasury cannot pay for both beauty and
> survival. Tonight, council decides what becomes of Toronto's creeks — and yours is
> the deciding ballot."

**Option A — the Parks Plan** *(beautiful, reckless, idealistic, slow)*:

> ### A System of Parks & Boulevards
> *the beautiful gamble*
> "Save the ravines as a chain of public gardens — promenades, footbridges, the creeks
> cleansed and kept in daylight for every generation after us. Twenty years of work, a
> fortune in land the city must buy back, and nothing — *nothing* — for the families
> burying their children this summer. A magnificent city, someday. If the city lives
> that long."
> `[ Vote for the Parks Plan — costly · slow · unproven ]`

**Option B — the Development Plan** *(urgent, pragmatic, robust, immediately safe)*:

> ### Sanitary Improvement & Industrial Expansion
> *the responsible choice*
> "Entomb the creeks in brick sewers, fill the ravines, and sell the level land for
> factories, rail yards and homes. The Engineer's crews break ground within the month;
> the land sales refill the treasury by spring; the stench — and the sickness it
> carries — goes underground for good. London has proven it. Toronto can afford it.
> Your constituents will live to thank you."
> `[ Vote to Bury the Creeks — immediate · funded · safe ]`

### 3.3 The Pressure UI — mechanism spec

The interface is a character in this scene: it is the room, and the room wants B.

1. **Ambient dread.** A small ticker in the chamber's corner counts upward:
   `FEVER DEATHS THIS SEASON: 211… 212…`. Every tick, Option B's button warms one shade
   and its drop-shadow deepens; Option A's card stays gaslight-dim. A faint gallery
   murmur (visual: flickering silhouettes) swells whenever the cursor nears A.
2. **Hover interrupt (Option A).** On hover/focus of A (300 ms dwell), an interjection
   toast slides across the card and *physically covers its button* for 1.2 s:
   > *"The City Engineer interjects: 'With respect, Councillor — the parks plan costs
   > $1.1 million we do not have, and cholera does not wait for gardens.'"*
3. **Click interrupt (Option A).** Clicking A does not register the vote; it opens a
   focus-trapped modal:
   > `POINT OF ORDER`
   > **"City Council warns this will bankrupt your ward and leave the cholera outbreak
   > unchecked. The Medical Officer of Health is on his feet. The gallery is shouting.
   > Are you certain?"**
   > `[ Reconsider — vote to bury the creeks ]` *(large, lit, default focus)*
   > <small>`I am certain. Parks.`</small> *(small grey text link, bottom corner)*
4. **The override (if they insist on A).** The ballot is accepted — and then the
   chamber votes. Tally animation, names scrolling:
   > "Your ballot: **PARKS**. The chamber: **18–3** for the sewers. **Motion carries.**"
   > *"History didn't need your permission. It only needed your neighbours'."*
   `HR.state.vote.ballot = "A"` — the finale will answer this (§7.3).
5. **The confirmation (if they choose B).**
   > "Motion carries, **21–0**. The gallery cheers."
   > *"Somewhere under the cheering, a creek keeps running."*

Either way the outcome is identical — that *is* the false choice — but the user who
fought for A earns a different ending line. Forcing the click without the override
option tested as "the page is broken"; the override preserves the rails *and* the rage.

---

## 4 · Phase 3 — The Urbanization Race (Burying Garrison Creek)

### 4.1 Frame

> `1880 → 1930 · ONE SECOND = ONE YEAR`
> # Bury them. All of them. Faster.
> "Council voted. You're the City Engineer now. Lay culverts and fill the ravines
> before the sickness outruns the city's growth."
> `[ Break ground ]`   `[ Let the engineers handle it — skip ]`

### 4.2 Core mechanics

- **Board:** a stylized plan-view map of 1880s Toronto. Five creeks as segmented
  polylines (Garrison, Taddle, Russell, Castle Frank, Yellow) — **28 segments** total,
  each ~1 creek-km. Creeks shimmer cyan; the lake sits at the bottom.
- **Interaction:** *drag-paint or click.* Holding the pointer and dragging along a
  creek stitches brick-culvert tile sprites under the cursor (capped at build rate
  `R = 0.9 segments/s` so dragging isn't an instant win); a click queues one segment.
  A queued/painted segment runs a 0.8 s build animation: brick arch → dirt fill →
  gravel → street grid paints over it, and the city's building-sprawl layer
  immediately grows around it (instant gratification = retention).
- **Clock:** wall time maps 1 s = 1 year, 1880 → 1930 (a 50-second round).
- **Population engine:** lookup of Toronto's curve (86 k in 1881 → 631 k in 1931),
  rendered as a rising counter *and* as the sprawl layer auto-painting outward.
  Sprawl that reaches an **unburied** segment doubles that segment's sickness
  contribution (the city is drinking its own ditch).

### 4.3 Dashboard UI (top bar, three instruments)

| Instrument | Render | Behaviour |
|---|---|---|
| **YEAR** | big flip counter, center | 1880 → 1930, 1 yr/s |
| **POPULATION** | counter + sprawl minimap, left | historical curve; accelerates visually after 1900 |
| **SICKNESS** | vertical thermometer, right, red line at `EPIDEMIC` | see formula |

```text
exposed   = Σ unburied segment-km, weighted ×2 where sprawl has reached them
sickness += dt · k1 · exposed · popDensity(year)   −   dt · k2 · buriedFraction
EPIDEMIC at sickness ≥ 100
```

Tuning targets: an attentive player finishes all 28 segments around **1912–1925** with
sickness peaking at 70–85 (the needle should *graze* the red line at least once — fear
is the mechanic). Ignoring the fast-growing east-end creeks while sprawl reaches them
is the canonical losing line.

### 4.4 State conditions

- **VICTORY** — all 28 segments buried before sickness hits 100. The remaining years
  fast-montage to 1930. Full-screen card:

  > # THE CITY IS SAFE.
  > ## It cost you every river it had.
  > `293 km of creeks now run in the dark · Sickness: collapsing · Population: 631,000
  > and climbing`
  > "This was the right call in 1882. **Hold both of those thoughts.**"
  > `[ Fast-forward a century → ]`

- **FAIL — `GAME OVER: EPIDEMIC OUTBREAK`** — sickness reaches 100:

  > # EPIDEMIC — {year}
  > "Typhoid swept the wards faster than your crews could lay brick. The creeks you
  > spared became the sewers that killed."
  > `[ Try again ]`   `[ Let the engineers take over → ]` *(autopilot finishes the burial)*

The fail state is the spec's quiet thesis: **in 1882 you genuinely could not afford to
keep the rivers.** The player must *feel* that burying them was correct, or Phase 4's
irony has nothing to land on.

---

## 5 · Phase 4 — The Century Fast-Forward (The Consequences)

### 5.1 Scroll-bound animation logic (`sc-century`, `--len: 6`)

One sticky viewport; scroll progress `p` maps linearly to **year = 1930 + 94·p**.

- **Backdrop:** split-screen map. Left pane: the 1880s plan-view from Phase 3 (now
  sepia, static). Right pane: the modern city, drawn live — sprawl polygons keyed to
  `year`, expressways stroke in at their build dates, the shoreline extends with
  landfill. Both panes carry the **lost-rivers overlay** from `rivers-data.js`
  (cyan = surface, grey = buried — same encoding as v1's `rivermap`), so the constant
  between the two maps is *the water*. A vertical comparison handle is welded to `p`
  (scroll = wipe), echoing lost-river mapping projects.
- **Counters (top-right, interpolated from lookup tables, 2 Hz):** `YEAR · POPULATION ·
  KM OF CREEK BURIED · % IMPERVIOUS SURFACE · COMBINED-SEWER OUTFALLS`.
- **Event flashes:** at fixed years the frame interrupts — `1954 HURRICANE HAZEL`
  (screen tilts, 81 lives caption), `2005 FINCH WASHOUT`, `2013`, `2018`, `2024` —
  each a 0.5 s lightning `flash()` + stamp.
- Steps use v1's `data-a/data-b` beat machinery; each step below gets ~0.14 of `p`.

### 5.2 Narrative copy (six steps)

1. **"The pipes won."** — "By 1930 the city above forgot the water below. The creeks
   ran in brick, under streets named for them — and the brick was already forty years
   old."
2. **"Then medicine solved the wrong half."** — "Chlorination. Vaccines. Treatment
   plants. By mid-century the diseases that justified burying the rivers were beaten —
   by *medicine*, not by the pipes. Nobody went back to ask what the pipes were for
   now. They just kept getting older."
3. **"One pipe, two jobs."** — "The old city still drains through *combined* sewers:
   sewage and stormwater share one Victorian tunnel. Dry day — it all reaches the
   treatment plant. Cloudburst — the tunnel chokes, and the overflow goes straight to
   the lake, raw. They built outfalls for exactly this. Toronto still has dozens."
   *(diagram beat: animated CSO cutaway — household line + storm drain merging, weir
   spilling at high flow)*
4. **"And the city sealed the sponge."** — "Hurricane Hazel, 1954: 81 dead, and the
   lesson learned was *more concrete*. Every decade paved more of the watershed.
   Rain that once soaked into ravine soil now arrives at the old brick all at once,
   carrying the whole sky with it."
5. **"A solution becomes a time bomb."** — "Here is the trap in one sentence: we cured
   the sickness with medicine but kept the cure we'd built for it — and that cure,
   aging and undersized and locked under a century of city, is now the *cause* of the
   flooding. Page one of this story was not weather. It was plumbing."
6. **"You've seen what happens next."** — "July 16, 2024. 97.8 mm at Pearson. A grey
   sedan at a rail underpass." *(the right-hand map quietly highlights the Phase-1
   game grid's footprint)* "Which is where you came in. So — what would it take to
   take it back?"

---

## 6 · Phase 5 — The Reconstruction (Daylighting Run)

### 6.1 Frame

> `GARRISON CREEK ALIGNMENT · PRESENT DAY`
> # Dig it back up.
> "Drive the dozer along the old creek path. The crew behind you does the rest —
> channel, banks, parkland. A storm cell is forming over the lake. **Beat it.**"
> `[ Start the dozer ]`   `[ Skip — watch the crews work ]`

### 6.2 Controls configuration

| Input | Action |
|---|---|
| `W / ↑` | throttle forward |
| `S / ↓` | reverse |
| `A / ← · D / →` | steer (tank-style turn, 110°/s) |
| touch | virtual joystick (bottom-left) |
| `Esc` | pause sheet |

Top-down camera, soft-follow with 80 px deadzone. Dozer speed 140 px/s on streets,
180 px/s **on the glowing path** (the route itself rewards you).

### 6.3 Mechanics

- **The path:** Garrison Creek's true buried alignment, rendered as a faint dashed
  glow through the modern grid — and it runs through **Christie Pits → Bickford Park →
  Trinity Bellwoods → Fort York**, because those parks *are* the buried creek's
  footprint. (Caption on entry: "These parks were never a coincidence.")
- **Progress:** while the dozer is on-path, `daylit%` accrues. Behind it, the
  **construction-crew convoy** (excavator, planting truck, surveyors — an ambient
  looper bound to the player's trail at 2.5 s lag) converts the trail: culvert crack →
  open water flows in → banks green → trees pop → park furniture spawns → first
  pedestrians arrive. The trail *fills with life in your mirror* — that view is the
  game's pleasure and the reason the camera deadzone is generous.
- **Off-path driving** is allowed (streets only) but accrues nothing; a soft compass
  arrow points back to the alignment.
- **Pressure:** a radar blob (the storm) crosses a minimap of Lake Ontario on a
  **120-second ETA**. All negative gauges also drift slowly *upward* over time —
  standing still actively loses.

### 6.4 Dashboard UI — four live gauges + storm clock

Bottom HUD strip; every gauge has a marked **SAFE** threshold tick; gauges tween at
2 Hz from `daylit%` (d ∈ [0,1]):

| Gauge | Formula | Safe when |
|---|---|---|
| 🌡 **Urban heat island** | `34 − 6d` °C | `< 31 °C` |
| 🌊 **Local flooding risk** | `78 − 70d` % | `< 25 %` |
| 💸 **Sewage-treatment overload** | `$120M − 110d` /yr | `< $40M` |
| 🐦 **Biodiversity count** | `3 + 58d` species | `> 40` |
| ⛈ **STORM ETA** | 120 s countdown + radar blob | — |

(Constants are tuning starts: finishing ~85 % of the path flips all four gauges with
~15 s margin for a focused player.)

### 6.5 Success / failure copy

**WIN — all four gauges past safe before ETA 0:** the storm arrives *anyway* — and
breaks harmlessly over the finished creek (rain loop on, gauges hold):

> # THE CREEK RUNS IN DAYLIGHT
> "Four gauges green. The storm still came — storms always come now. But it landed on
> a city with somewhere to put it."
> `Heat: −3 °C · Flood risk: 11 % · Treatment overload: −$83M/yr · Species: 61 and
> counting`
> `[ See it rain on this street → ]`

**FAIL — `COMMUNITY UNPREPARED`:** sudden cell, screen darkens, sirens of light:

> # COMMUNITY UNPREPARED
> "The storm beat you to it."
> `FLASH FLOOD WARNING — Toronto & East York · Heat-stroke admissions: 312 ·
> Wetland species count: collapsing · Basement flooding reports: 4,100 and rising`
> "Half a creek helps nobody downstream of the other half."
> `[ Run it back ]`   `[ Watch the crews finish — skip ]`

Retry keeps the storm at 120 s but the player keeps route knowledge; second runs
almost always win, which is the intended arc — *repair is learnable*.

---

## 7 · Phase 6 — The Visionary Future (The Loop Closes)

### 7.1 Visual scene & ambient loops (`sc-home`)

**The same scene graph as Phase 1's street** — literally `streetBase("fu", true)` at
the identical camera/viewBox — with the diff layers swapped:

| Phase 1 layer | Phase 6 replacement |
|---|---|
| flooded lanes + drift debris | open creek channel (`fu-creek`, `fu-sparkle`) + ducks |
| stalled sedan, hazards blinking | bike-share rack + the cyclist loop |
| geysering manhole | a small riffle of rapids over rocks |
| pedestrians sheltering | strollers, dog-walker, bench sitters on the boardwalk |
| — | **swimmers**: front-crawl loop, kid on ring, wader (v1 `fu-swim*`, looping) |
| streetcar (same loop, same bell) | streetcar (same loop, same bell) — *transit kept* |
| heron flyby (45 s rare event) | |

Mid-scene, the sky **rains again** (rain target 0.5) while the swimmers shelter under
the willow and the creek simply… carries it. Beats:

> "Same street. Same storm."
> "Different map."
> "A creek that swallows the cloudburst in April —"
> "— and holds the whole neighbourhood in July."

### 7.2 Sidebar data-viz panels (slide in on beats, right rail)

1. **Zurich — the *Bachkonzept*** · counter viz: `20+ km daylighted since 1988`.
   "Zurich opens its buried brooks partly as *sewer policy* — clean stream water out
   of the treatment plant, beauty as a by-product. On hot days, the whole city swims."
2. **London — the River Quaggy** · before/after section: culvert vs Sutcliffe Park
   wetland. "Regraded as a park that is *allowed* to flood, it stores the storm water
   that once filled living rooms — protecting hundreds of homes. The kingfishers came
   back on their own."
3. **Seoul — Cheonggyecheon** · bar viz: corridor summer temps, several degrees cooler.
   "Seoul demolished an elevated expressway to free this river. No city that has
   opened one has wanted to bury it again."
4. **Toronto — your move** · the lost-rivers map once more, pulsing: `293 km buried ·
   0 km daylighted — so far`.

### 7.3 Closing narrative + the personalized echo

The finale reads `HR.state.vote.ballot`:

- **If A (they fought the rig):**
  > "In 1882 you voted for the parks. You lost, 18 to 3."
  > **"The vote comes around again. This one isn't rigged."**
- **If B (they took the safe choice):**
  > "In 1882, you buried them — and you were right to, then."
  > **"Being right has a renewal date. It's due."**

### 7.4 CTA block — full copy

> # Daylight the rivers.
> ### The maps still know where they are.
> `[ Explore the data — interactive map ]` → `/` (the Dash app)
> `[ Walk a lost river this weekend ]` → lostrivers.ca guided walks
> `[ Read the research / GitHub ]` → repo README + notebooks
> `[ Share this story ]` → native share / copy-link
> *footer source block carried over from v1 (ECCC, Toronto Hydro, IBC, Borealis
> Dataverse, Stadt Zürich, QWAG/Environment Agency) + game-tuning disclosure:*
> "Phase-game numbers are illustrative simulations; map data and storm statistics are
> real and computed from the cited datasets."

### 7.5 Structural tie-back (how the loop closes mechanically)

- **Same DOM skeleton:** `sc-home`'s SVG is built by the same `streetBase()` /
  `railsBand()` / `streetcar()` calls with the same coordinates as Phase 1's street —
  the diff table in §7.1 is implemented as sibling layer groups toggled per scene, so
  the "it's the same street" recognition is pixel-true, not approximate.
- **Same ambient registry entries**, re-keyed: the streetcar looper is one shared
  instance with two host scenes — its bell rings on the same period at the start and
  the end of the story.
- **Same rain system:** the v1 rain canvas (`rain.target`) is the instrument in both
  bookends; Phase 1 ends at target 0.9 and the story ends at 0.5 *with the water in
  the channel* — the storm didn't change; the map did. That sentence is the site.

---

## 8 · Cross-cutting specifications

### 8.1 Copy deck

All strings above live in `js/copy.js` as a single `COPY` object keyed by
`phase.screen.slot` (e.g. `COPY.vote.modal.body`). No user-facing literal may appear in
game code — this keeps tone-editing and future localization one-file.

### 8.2 Analytics events (retention instrumentation)

`phase_enter`, `game_start`, `game_complete {ms, retries}`, `game_fail {reason}`,
`game_skip`, `vote_cast {ballot, hesitatedMs, warningsSeen}`, `reveal_viewed`
(Phase 1 creek overlay), `cta_click {target}`, max-scroll-depth heartbeat.
Funnel of record: `drive_start → vote_cast → bury_complete → dozer_complete → cta_click`.

### 8.3 QA risk register

| Risk | Mitigation |
|---|---|
| Scroll-jacking jank / trapped users | islands never auto-lock; `Esc` always exits; resume anchor restores position exactly |
| iOS Safari URL-bar resize thrash | `100dvh` units; canvas resize debounced 250 ms |
| Game unwinnable on retry RNG | Director guarantees G1–G5 are asserted in a headless sim test (1,000 seeded runs per tuning change) |
| Reduced-motion users hit a wall | autopilot path renders every outcome as a narrated sequence |
| Perf on low-end mobile | drop ambient loopers below 45 fps (priority field per looper); MAXDROPS already adapts |

### 8.4 Build plan (suggested milestones)

1. **M1** — `HR.island` + `HR.ambient` + `HR.state` scaffolding; Phase 1 street made
   ambient; engage/skip/pause flow proven end-to-end with a stub game.
2. **M2** — Phase 1 drive game (sim + director + loss reveal). Hardest piece; do first.
3. **M3** — Phase 2 rewind + vote (pure DOM — fast); Phase 6 echo wiring.
4. **M4** — Phase 3 bury game; Phase 4 scroll scene (reuses map code).
5. **M5** — Phase 5 dozer game; Phase 6 ambient dress; copy pass; a11y + perf audit.
