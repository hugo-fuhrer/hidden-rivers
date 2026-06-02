"""
lib.py — shared feature-engineering helpers for the modelling notebooks.

Loads the raw Toronto datasets (sewers, lost rivers, ward boundaries, basement-flood
counts, precipitation), builds per-ward static infrastructure features, and assembles
the ward x year panel used by the susceptibility model.

The notebooks import this so they stay readable:

    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path.cwd().parents[0]))   # modelling/
    import lib

Caveats (draft)
---------------
* The basement-flooding xlsx is reported on Toronto's OLD 44-ward system; the only ward
  geometry we have is the CURRENT 25-ward boundaries. We build features on the 25-ward
  geometry and join flood counts by ward number for wards 1-25. Ward numbers are NOT
  geographically equivalent between the two systems, so this is an approximation pending
  44-ward boundaries / a crosswalk. `load_basement_floods_long` prints how many rows are
  dropped.
* Precipitation is a single city-wide series (varies in time, not space).
"""

from __future__ import annotations

import os
import warnings
from pathlib import Path

os.environ.setdefault("OGR_ORGANIZE_POLYGONS", "SKIP")
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import geopandas as gpd

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO = Path(__file__).resolve().parents[1]
RAW = REPO / "data" / "raw"
PROCESSED = REPO / "data" / "processed"

RIVER_GEOJSON = (
    RAW / "rivers/doi-10.5683-sp2-tsjsqz/LostRiversData/Webmaps_data"
    / "LR_Toronto_Comp_WAS_geojson/BI_Lost_Rivers_20170705_WAMS_qgis.geojson"
)

# ── Tunable constants (interpretable thresholds for the draft) ─────────────────
METRIC_CRS = 32617      # UTM zone 17N — metres, for lengths/areas/buffers
REF_YEAR = 2022         # "present" used for sewer age
OLD_YEAR = 1960         # sewers installed on/before this are "aging/weak"
SMALL_DIAM_MM = 750     # bottom-quartile diameter — "undersized" proxy
PROX_BUFFER_M = 100     # buried river within this distance of a sewer = "co-located"
PANEL_YEARS = list(range(2005, 2023))   # 2005-2022, matches the xlsx columns


def processed_dir() -> Path:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    return PROCESSED


def minmax(s: pd.Series) -> pd.Series:
    """Scale a series to 0-1 (constant series -> 0)."""
    s = pd.to_numeric(s, errors="coerce")
    lo, hi = s.min(), s.max()
    if pd.isna(lo) or hi == lo:
        return pd.Series(0.0, index=s.index)
    return (s - lo) / (hi - lo)


# ── Raw loaders ───────────────────────────────────────────────────────────────

def load_wards() -> gpd.GeoDataFrame:
    """Current 25-ward boundaries -> [ward_num, ward_name, geometry] in EPSG:4326."""
    w = gpd.read_file(RAW / "floods/city-wards-4326.geojson").to_crs(4326)
    w["ward_num"] = w["AREA_SHORT_CODE"].astype(int)
    w = w.rename(columns={"AREA_NAME": "ward_name"})
    return w[["ward_num", "ward_name", "geometry"]].copy()


def load_sewers() -> gpd.GeoDataFrame:
    """Trunk sewers -> [install_year, material, diameter, geometry] in EPSG:4326."""
    s = gpd.read_file(RAW / "sewers/Trunk Sewer - 4326.geojson").to_crs(4326)
    s["install_year"] = pd.to_datetime(
        s["Trunk Sewer Install Date"], errors="coerce"
    ).dt.year
    s["material"] = s["Trunk Sewer Material"].astype(str)
    s["diameter"] = pd.to_numeric(s["Trunk Sewer Diameter"], errors="coerce")
    return s[["install_year", "material", "diameter", "geometry"]].copy()


def load_rivers() -> gpd.GeoDataFrame:
    """Lost (buried) rivers -> [last_year, geometry] in EPSG:4326."""
    r = gpd.read_file(RIVER_GEOJSON).to_crs(4326)
    r["last_year"] = pd.to_datetime(r["LASTDATE"], errors="coerce").dt.year
    return r[["last_year", "geometry"]].copy()


def load_basement_floods_long() -> pd.DataFrame:
    """Basement-flood service requests -> long [ward_num, year, flood_count].

    The xlsx (44-ward system) has ward number in col 0 and years 2005-2022 in cols 1-18.
    """
    raw = pd.read_excel(RAW / "floods/basement-flooding-by-ward.xlsx", header=None)
    df = raw.iloc[2:].copy()
    df.columns = list(range(raw.shape[1]))
    df = df[df[0].apply(lambda x: str(x).strip().isdigit())].copy()
    df[0] = df[0].astype(int)
    cols = list(range(1, 1 + len(PANEL_YEARS)))          # 1..18
    melt = df[[0] + cols].copy()
    melt.columns = ["ward_num"] + PANEL_YEARS
    long = melt.melt(id_vars="ward_num", var_name="year", value_name="flood_count")
    long["year"] = long["year"].astype(int)
    long["flood_count"] = pd.to_numeric(long["flood_count"], errors="coerce").fillna(0.0)
    return long


def load_precip_annual() -> pd.DataFrame:
    """Annual precipitation indices keyed by year (city-wide)."""
    p = pd.read_csv(RAW / "precipitation/toronto_annual_precip.csv")
    keep = [c for c in ["year", "precip_mm", "rain_mm", "snow_cm",
                        "heavy_days", "precip_hours"] if c in p.columns]
    return p[keep].copy()


# ── Spatial helpers ───────────────────────────────────────────────────────────

def _assign_lengths_to_wards(lines: gpd.GeoDataFrame, wards_m: gpd.GeoDataFrame,
                             extra: list[str] | None = None) -> pd.DataFrame:
    """Attribute each line's full length (m) to the ward containing its midpoint.

    A draft approximation that avoids fragile line/polygon overlay: a line that crosses
    a ward boundary is credited entirely to the ward holding its representative point.
    """
    extra = extra or []
    pts = gpd.GeoDataFrame(
        {"length_m": lines.geometry.length, **{c: lines[c].values for c in extra}},
        geometry=lines.geometry.representative_point(),
        crs=lines.crs,
    )
    j = gpd.sjoin(pts, wards_m[["ward_num", "geometry"]], predicate="within", how="left")
    j = j[~j.index.duplicated(keep="first")]
    return pd.DataFrame(j.drop(columns="geometry")).dropna(subset=["ward_num"])


def _river_sewer_overlap_km(rivers_m: gpd.GeoDataFrame, sewers_m: gpd.GeoDataFrame,
                            wards_m: gpd.GeoDataFrame) -> pd.Series:
    """Per-ward km of buried river lying within PROX_BUFFER_M of any trunk sewer."""
    try:
        sewer_zone = sewers_m.geometry.buffer(PROX_BUFFER_M).union_all()
        overlap = rivers_m.geometry.intersection(sewer_zone)
        rpts = gpd.GeoDataFrame(
            {"overlap_m": overlap.length.values},
            geometry=rivers_m.geometry.representative_point(), crs=rivers_m.crs,
        )
        j = gpd.sjoin(rpts, wards_m[["ward_num", "geometry"]],
                      predicate="within", how="left").dropna(subset=["ward_num"])
        return j.groupby("ward_num")["overlap_m"].sum() / 1000.0
    except Exception as exc:  # pragma: no cover - draft robustness
        print(f"  ! river-sewer overlap skipped ({exc}); using 0")
        return pd.Series(dtype=float)


# ── Feature builders ──────────────────────────────────────────────────────────

def build_ward_static_features(wards: gpd.GeoDataFrame | None = None,
                               sewers: gpd.GeoDataFrame | None = None,
                               rivers: gpd.GeoDataFrame | None = None) -> gpd.GeoDataFrame:
    """Per-ward static infrastructure features (geometry kept in EPSG:4326).

    Columns: area_km2, sewer_len_km, sewer_density, mean_install_year, sewer_age,
    pct_old_sewer, old_sewer_km, mean_diameter, pct_small_diam, river_len_km,
    river_density, river_sewer_overlap_km, weak_sewer_km, river_x_weaksewer.
    """
    wards = load_wards() if wards is None else wards
    sewers = load_sewers() if sewers is None else sewers
    rivers = load_rivers() if rivers is None else rivers

    wards_m = wards.to_crs(METRIC_CRS)
    sewers_m = sewers.to_crs(METRIC_CRS)
    rivers_m = rivers.to_crs(METRIC_CRS)

    feat = wards[["ward_num", "ward_name", "geometry"]].copy()
    feat["area_km2"] = wards_m.geometry.area.values / 1e6

    # Sewers attributed to wards (length-weighted aggregates)
    sew = _assign_lengths_to_wards(sewers_m, wards_m, extra=["install_year", "diameter"])
    sew["ward_num"] = sew["ward_num"].astype(int)
    sew["old"] = sew["install_year"] <= OLD_YEAR
    sew["small"] = sew["diameter"] <= SMALL_DIAM_MM

    def _wmean(g, col):
        w = g["length_m"]
        x = pd.to_numeric(g[col], errors="coerce")
        m = x.notna()
        return np.average(x[m], weights=w[m]) if m.any() and w[m].sum() else np.nan

    rows = []
    for ward, g in sew.groupby("ward_num"):
        tot = g["length_m"].sum()
        rows.append({
            "ward_num": ward,
            "sewer_len_km": tot / 1000.0,
            "mean_install_year": _wmean(g, "install_year"),
            "mean_diameter": _wmean(g, "diameter"),
            "old_sewer_km": g.loc[g["old"], "length_m"].sum() / 1000.0,
            "pct_old_sewer": g.loc[g["old"], "length_m"].sum() / tot if tot else 0.0,
            "pct_small_diam": g.loc[g["small"], "length_m"].sum() / tot if tot else 0.0,
        })
    feat = feat.merge(pd.DataFrame(rows), on="ward_num", how="left")

    # Rivers attributed to wards
    riv = _assign_lengths_to_wards(rivers_m, wards_m)
    riv["ward_num"] = riv["ward_num"].astype(int)
    river_km = riv.groupby("ward_num")["length_m"].sum() / 1000.0
    feat = feat.merge(river_km.rename("river_len_km"), on="ward_num", how="left")

    overlap = _river_sewer_overlap_km(rivers_m, sewers_m, wards_m)
    feat = feat.merge(overlap.rename("river_sewer_overlap_km"), on="ward_num", how="left")

    # Fill + derived
    fill0 = ["sewer_len_km", "old_sewer_km", "pct_old_sewer", "pct_small_diam",
             "river_len_km", "river_sewer_overlap_km"]
    feat[fill0] = feat[fill0].fillna(0.0)
    feat["sewer_density"] = feat["sewer_len_km"] / feat["area_km2"]
    feat["river_density"] = feat["river_len_km"] / feat["area_km2"]
    feat["sewer_age"] = REF_YEAR - feat["mean_install_year"]
    feat["weak_sewer_km"] = feat["old_sewer_km"]          # aging-capacity proxy
    feat["river_x_weaksewer"] = feat["river_density"] * feat["pct_old_sewer"]
    return gpd.GeoDataFrame(feat, geometry="geometry", crs=wards.crs)


# Static feature columns carried into the panel / used as model inputs
STATIC_FEATURES = [
    "area_km2", "sewer_len_km", "sewer_density", "sewer_age", "mean_install_year",
    "pct_old_sewer", "weak_sewer_km", "mean_diameter", "pct_small_diam",
    "river_len_km", "river_density", "river_sewer_overlap_km", "river_x_weaksewer",
]
PRECIP_FEATURES = ["precip_mm", "rain_mm", "heavy_days", "precip_hours"]


def build_panel(ward_static: gpd.GeoDataFrame | None = None) -> pd.DataFrame:
    """Ward x year panel: static infra features + that year's rainfall + interactions.

    Returns one row per (ward_num, year) for 2005-2022 with target `flood_count`.
    Only wards present in the 25-ward geometry are kept (see module caveat).
    """
    static = build_ward_static_features() if ward_static is None else ward_static
    static_df = pd.DataFrame(static.drop(columns="geometry"))
    floods = load_basement_floods_long()
    precip = load_precip_annual()

    valid = set(static_df["ward_num"])
    dropped = floods[~floods["ward_num"].isin(valid)]["ward_num"].nunique()
    if dropped:
        print(f"  note: dropped {dropped} ward(s) from flood data with no 25-ward "
              f"geometry (44->25 ward mismatch — see lib.py caveat)")
    floods = floods[floods["ward_num"].isin(valid)]

    panel = (floods
             .merge(static_df, on="ward_num", how="left")
             .merge(precip, on="year", how="left"))

    # Explicit interaction terms (hidden river / weak sewer x heavy rainfall)
    if "heavy_days" in panel:
        panel["river_x_heavy"] = panel["river_density"] * panel["heavy_days"]
        panel["weaksewer_x_heavy"] = panel["weak_sewer_km"] * panel["heavy_days"]
        panel["riveroverlap_x_heavy"] = panel["river_sewer_overlap_km"] * panel["heavy_days"]
    return panel


MODEL_FEATURES = STATIC_FEATURES + PRECIP_FEATURES + [
    "river_x_heavy", "weaksewer_x_heavy", "riveroverlap_x_heavy",
]
