"""Generate web/risk-data.js from the modelling artifacts.

Reads the per-ward risk/susceptibility scores written by the modelling notebooks
(`data/processed/ward_risk_scores.geojson` + `ward_susceptibility.csv`) and the
25-ward polygons, projects them into the *same* local-meter coordinate space the
story site already uses for the Lost Rivers network (so the predictive choropleth
and the buried creeks line up pixel-for-pixel), simplifies the polygons, and writes
a compact JS file the story site loads with a plain <script> tag (works from file://).

Projection constants (lonMin / latMax / kx / ky) are read straight out of the
generated `web/rivers-data.js` so the two layers share one coordinate frame.

Usage:  python web/tools/build_risk_data.py
        (run `python web/tools/build_rivers_data.py` first if rivers-data.js is stale)
"""
import csv
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RISK_GEOJSON = ROOT / "data/processed/ward_risk_scores.geojson"
SUSC_CSV = ROOT / "data/processed/ward_susceptibility.csv"
SHAP_CSV = ROOT / "data/processed/shap_importances.csv"
RIVERS_JS = ROOT / "web/rivers-data.js"
OUT = ROOT / "web/risk-data.js"

SIMPLIFY_TOL_M = 30.0              # Douglas-Peucker tolerance (true meters) — wards are big
MIN_RING_M = 400.0                # drop sliver rings (islands, geometry noise)

# Friendlier labels + one-line plain-language gloss for the model's top drivers.
DRIVER_LABELS = {
    "precip_hours":           ("hours of rain", "how long the rain falls, not just how much"),
    "pct_small_diam":         ("undersized sewers", "share of pipes too narrow for a cloudburst"),
    "rain_mm":                ("annual rainfall", "total rain the ward sees in a year"),
    "river_sewer_overlap_km": ("creek under pipe", "km of buried creek running beside a trunk sewer"),
    "river_len_km":           ("buried creek length", "km of lost river under the ward"),
    "weaksewer_x_heavy":      ("old pipe × storms", "aging sewer hit by heavy-rain days"),
    "heavy_days":             ("heavy-rain days", "days with intense downpours"),
    "area_km2":               ("ward size", "land area of the ward"),
    "river_density":          ("buried creek density", "km of lost river per km²"),
    "sewer_len_km":           ("sewer length", "total trunk sewer in the ward"),
    "sewer_age":              ("sewer age", "average age of the trunk sewers"),
    "mean_install_year":      ("sewer vintage", "average year the sewers were laid"),
    "sewer_density":          ("sewer density", "km of trunk sewer per km²"),
    "river_x_heavy":          ("creek × storms", "buried creek hit by heavy-rain days"),
    "riveroverlap_x_heavy":   ("creek-under-pipe × storms", "co-located creek/sewer in heavy rain"),
    "mean_diameter":          ("pipe size", "average trunk-sewer diameter"),
    "precip_mm":              ("annual precip", "total precipitation depth"),
    "pct_old_sewer":          ("share of old sewer", "fraction of sewer laid before 1960"),
    "weak_sewer_km":          ("aging sewer length", "km of pre-1960 trunk sewer"),
    "river_x_weaksewer":      ("creek × old sewer", "buried creek over aging sewer"),
}


def read_proj():
    """Pull lonMin / latMax / kx / ky out of the generated rivers-data.js."""
    txt = RIVERS_JS.read_text()
    m = re.search(r'"meta":\s*(\{.*?\})', txt)
    meta = json.loads(m.group(1))
    return meta["lonMin"], meta["latMax"], meta["kx"], meta["ky"]


def dp_simplify(pts, tol):
    """Iterative Douglas-Peucker on [(x, y), …] in meters."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i0, i1 = stack.pop()
        ax, ay = pts[i0]
        bx, by = pts[i1]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        dmax, imax = 0.0, -1
        for i in range(i0 + 1, i1):
            px, py = pts[i]
            if seg2 == 0.0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > dmax:
                dmax, imax = d, i
        if dmax > tol:
            keep[imax] = True
            stack.append((i0, imax))
            stack.append((imax, i1))
    return [p for p, k in zip(pts, keep) if k]


def ring_len(xy):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(xy, xy[1:]))


def iter_polygons(geom):
    """Yield each polygon's exterior ring (list of [lon, lat]) for Polygon/MultiPolygon."""
    if geom["type"] == "Polygon":
        yield geom["coordinates"][0]
    elif geom["type"] == "MultiPolygon":
        for poly in geom["coordinates"]:
            yield poly[0]


def main():
    lon_min, lat_max, kx, ky = read_proj()

    def to_xy(lon, lat):
        return ((lon - lon_min) * kx, (lat_max - lat) * ky)

    susc = {}
    if SUSC_CSV.exists():
        for row in csv.DictReader(SUSC_CSV.open()):
            susc[int(row["ward_num"])] = float(row["susceptibility"])

    gj = json.loads(RISK_GEOJSON.read_text())
    wards = []
    minx = miny = math.inf
    maxx = maxy = -math.inf
    pts_in = pts_out = 0
    for f in gj["features"]:
        pr = f["properties"]
        rings = []
        for ext in iter_polygons(f["geometry"]):
            xy = [to_xy(c[0], c[1]) for c in ext]
            pts_in += len(xy)
            if ring_len(xy) < MIN_RING_M:
                continue
            xy = dp_simplify(xy, SIMPLIFY_TOL_M)
            pts_out += len(xy)
            flat = []
            for x, y in xy:
                flat.append(round(x))
                flat.append(round(y))
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
            rings.append(flat)
        wards.append({
            "num": int(pr["ward_num"]),
            "name": pr["ward_name"],
            "coin": round(float(pr["coincidence_index"]), 3),
            "risk": round(float(pr["risk_index"]), 3),
            "river": round(float(pr["river_score"]), 3),
            "weak": round(float(pr["weaksewer_score"]), 3),
            "flood": round(float(pr["flood_score"]), 3),
            "susc": round(susc.get(int(pr["ward_num"]), 0.0), 1),
            "rings": rings,
        })

    drivers = []
    if SHAP_CSV.exists():
        rows = list(csv.DictReader(SHAP_CSV.open()))
        method = rows[0]["method"] if rows else "importance"
        for row in rows[:8]:
            label, gloss = DRIVER_LABELS.get(row["feature"], (row["feature"], ""))
            drivers.append({"label": label, "gloss": gloss,
                            "imp": round(float(row["importance"]), 4)})
    else:
        method = "importance"

    # susceptibility range for colour scaling on the client
    sv = [w["susc"] for w in wards if w["susc"]]
    meta = {
        "lonMin": lon_min, "latMax": lat_max, "kx": kx, "ky": ky,
        "minx": round(minx), "miny": round(miny),
        "w": round(maxx - minx), "h": round(maxy - miny),
        "ox": round(minx), "oy": round(miny),         # subtract to get 0-based coords
        "suscMin": round(min(sv), 1) if sv else 0.0,
        "suscMax": round(max(sv), 1) if sv else 1.0,
        "nWards": len(wards),
        "method": method,
        "source": ("Modelled flood susceptibility & hidden-river × weak-sewer coincidence — "
                   "gradient-boosting model + SHAP, City of Toronto Open Data + Lost Rivers "
                   "(doi:10.5683/SP2/TSJSQZ)"),
    }
    # shift coords to be 0-based against meta.ox/oy on the client (keeps numbers small)
    for w in wards:
        w["rings"] = [[v - (meta["ox"] if i % 2 == 0 else meta["oy"])
                       for i, v in enumerate(r)] for r in w["rings"]]

    body = json.dumps({"meta": meta, "wards": wards, "drivers": drivers},
                      separators=(",", ":"))
    OUT.write_text("// Generated by web/tools/build_risk_data.py — do not edit.\n"
                   "window.RISK_DATA=" + body + ";\n")
    print(f"{RISK_GEOJSON.name}: {len(gj['features'])} wards, {pts_in} pts → {pts_out} pts")
    print(f"susceptibility range {meta['suscMin']}–{meta['suscMax']} · {len(drivers)} drivers ({method})")
    print(f"wrote {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
