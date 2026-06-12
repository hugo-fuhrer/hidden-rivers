/* Hidden Rivers v2 — copy deck for strings set from game code.
   (Static copy lives in index.html where the scroll engine reads it.) */
"use strict";
window.HR = window.HR || {};

HR.COPY = {
  vote: {
    tallyA: "Your ballot: <b>PARKS</b>. The chamber: <b>18–3</b> for the sewers. <b>Motion carries.</b>",
    tallyAQuip: "History didn’t need your permission. It only needed your neighbours’.",
    tallyB: "Motion carries, <b>21–0</b>. The gallery cheers.",
    tallyBQuip: "Somewhere under the cheering, a creek keeps running.",
  },
  echo: {
    A: "In 1882 you voted for the parks. You lost, 18 to 3. The vote comes around again — this one isn’t rigged.",
    B: "In 1882, you buried them — and you were right to, then. Being right has a renewal date. It’s due.",
    none: "In 1882, council buried them — and it was right to, then. Being right has a renewal date. It’s due.",
  },
  drive: {
    blocked: "Route blocked ahead",
    trapped: "Every route is under water. The underpass is the only way.",
    dead: "Engine dead. The water won.",
  },
  bury: {
    epidemic: y => `Epidemic — ${y}. The creeks outran the culverts.`,
    done: y => `All creeks buried by ${y}. The city is safe — and riverless.`,
  },
  dozer: {
    safe: g => `${g} is in the safe zone`,
    won: "All four gauges green. The creek runs in daylight.",
    storm: "The storm beat you to it.",
  },
};
