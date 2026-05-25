"""
fetch_data.py — download all Toronto infrastructure & flooding datasets via API.

Sources
-------
Toronto Open Data  https://open.toronto.ca  (CKAN API, no auth required)
Borealis Dataverse https://borealisdata.ca  (Dataverse API, no auth for public datasets)
Open-Meteo ERA5    https://open-meteo.com   (free, no API key, 1940-present)

Run once before pitch.py:
    python3 src/eda/fetch_data.py
"""

import io
import json
import zipfile
from pathlib import Path

import pandas as pd
import requests

DATA = Path(__file__).parents[2] / "data/raw"

CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca"
BOREALIS = "https://borealisdata.ca"
OPEN_METEO = "https://archive-api.open-meteo.com/v1/archive"

TORONTO_LAT = 43.7001
TORONTO_LON = -79.4163


# ── helpers ───────────────────────────────────────────────────────────────────

def _stream(url: str, dest: Path, desc: str = "") -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  ↓  {desc or dest.name}")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                f.write(chunk)
    print(f"     saved {dest.stat().st_size / 1e6:.1f} MB → {dest.relative_to(DATA.parent.parent)}")


def _extract_zip(url: str, dest_dir: Path, desc: str = "") -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    print(f"  ↓  {desc or url.split('/')[-1]}")
    with requests.get(url, timeout=120) as r:
        r.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            zf.extractall(dest_dir)
    names = [p.name for p in dest_dir.iterdir()]
    print(f"     extracted {len(names)} file(s) → {dest_dir.relative_to(DATA.parent.parent)}")


def _ckan_resource_url(dataset_slug: str, fragment: str, fmt: str = "") -> str:
    """Return download URL of the first CKAN resource whose name contains fragment.

    If fmt is given (e.g. 'GeoJSON', 'XLSX'), only resources with that format
    are considered, which avoids hitting a CSV/datastore-dump with the same name.
    """
    r = requests.get(f"{CKAN}/api/3/action/package_show",
                     params={"id": dataset_slug}, timeout=30)
    r.raise_for_status()
    resources = r.json()["result"]["resources"]
    candidates = [res for res in resources if fragment.lower() in res["name"].lower()]
    if fmt:
        fmt_filtered = [res for res in candidates
                        if res.get("format", "").lower() == fmt.lower()]
        if fmt_filtered:
            return fmt_filtered[0]["url"]
    if candidates:
        return candidates[0]["url"]
    raise ValueError(f"No resource matching '{fragment}' (fmt={fmt!r}) in '{dataset_slug}'")


# ── 1. Trunk sewers (Toronto Open Data) ──────────────────────────────────────

print("\n[1/6] Trunk sewers")
_stream(
    _ckan_resource_url("sewer-gravity-mains", "Trunk Sewer - 4326", fmt="GeoJSON"),
    DATA / "sewers/Trunk Sewer - 4326.geojson",
)

# ── 2. Neighbourhood flood reports (Toronto Open Data) ───────────────────────

print("\n[2/6] Neighbourhood flood reports (2013-2017)")
FLOOD_DIR = DATA / "floods/flood-reporting"
_extract_zip(
    _ckan_resource_url("flood-reporting-noted-by-toronto-water-districts", "wgs84", fmt="SHP"),
    FLOOD_DIR,
)

# ── 3. City ward boundaries (Toronto Open Data) ───────────────────────────────

print("\n[3/6] City ward boundaries")
_stream(
    _ckan_resource_url("city-wards", "4326.geojson", fmt="GeoJSON"),
    DATA / "floods/city-wards-4326.geojson",
)

# ── 4. Basement flooding by ward xlsx (Toronto Open Data) ────────────────────

print("\n[4/6] Basement flooding by ward")
_stream(
    _ckan_resource_url("basement-flooding-by-ward", "basement-flooding", fmt="XLSX"),
    DATA / "floods/basement-flooding-by-ward.xlsx",
)

# ── 5. Lost rivers (Borealis Dataverse — doi:10.5683/SP2/TSJSQZ) ─────────────

RIVER_GEOJSON = (
    DATA
    / "rivers/doi-10.5683-sp2-tsjsqz/LostRiversData/Webmaps_data"
    / "LR_Toronto_Comp_WAS_geojson/BI_Lost_Rivers_20170705_WAMS_qgis.geojson"
)

print("\n[5/6] Lost rivers (Borealis Dataverse)")
if RIVER_GEOJSON.exists():
    print("  ✓  already present, skipping")
else:
    DOI = "doi:10.5683/SP2/TSJSQZ"
    try:
        meta = requests.get(
            f"{BOREALIS}/api/datasets/:persistentId/versions/:latest/files",
            params={"persistentId": DOI},
            timeout=30,
        )
        meta.raise_for_status()
        files = meta.json().get("data", [])
        target = next(
            (f for f in files if "BI_Lost_Rivers" in f["dataFile"]["filename"]),
            None,
        )
        if target:
            fid = target["dataFile"]["id"]
            RIVER_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
            _stream(
                f"{BOREALIS}/api/access/datafile/{fid}",
                RIVER_GEOJSON,
                desc="BI_Lost_Rivers_20170705_WAMS_qgis.geojson",
            )
        else:
            print("  ! GeoJSON not found in Dataverse file listing.")
            print("    Available files:")
            for f in files:
                print(f"      {f['dataFile']['filename']}")
    except Exception as exc:
        print(f"  ! Borealis API unavailable ({exc})")

    if not RIVER_GEOJSON.exists():
        print("\n  ── Manual download required ──────────────────────────────────────")
        print("  1. Open  https://doi.org/10.5683/SP2/TSJSQZ")
        print("  2. Download 'LostRiversData' ZIP")
        print("  3. Extract so this path exists:")
        print(f"     {RIVER_GEOJSON}")
        print("  ──────────────────────────────────────────────────────────────────")

# ── 6. Precipitation — Open-Meteo ERA5 (1960-2022) ───────────────────────────

print("\n[6/6] Precipitation (Open-Meteo ERA5, 1960-2022)")
PRECIP_PATH = DATA / "precipitation/toronto_daily_precip.csv"
PRECIP_PATH.parent.mkdir(parents=True, exist_ok=True)

resp = requests.get(
    OPEN_METEO,
    params={
        "latitude": TORONTO_LAT,
        "longitude": TORONTO_LON,
        "start_date": "1960-01-01",
        "end_date": "2022-12-31",
        "daily": ",".join([
            "precipitation_sum",
            "rain_sum",
            "snowfall_sum",
            "precipitation_hours",  # hours with any rainfall — proxy for event intensity
        ]),
        "timezone": "America/Toronto",
    },
    timeout=120,
)
resp.raise_for_status()
daily = resp.json()["daily"]

df = pd.DataFrame({
    "date":          pd.to_datetime(daily["time"]),
    "precip_mm":     daily["precipitation_sum"],
    "rain_mm":       daily["rain_sum"],
    "snow_cm":       daily["snowfall_sum"],
    "precip_hours":  daily["precipitation_hours"],
})
df["year"] = df["date"].dt.year
df["heavy_day"] = df["precip_mm"] > 25  # >25 mm/day = heavy rainfall event

annual = (
    df.groupby("year")
    .agg(
        precip_mm=("precip_mm",    "sum"),
        rain_mm=("rain_mm",        "sum"),
        snow_cm=("snow_cm",        "sum"),
        heavy_days=("heavy_day",   "sum"),
        precip_hours=("precip_hours", "sum"),
    )
    .reset_index()
)

df.to_csv(PRECIP_PATH, index=False)
annual.to_csv(DATA / "precipitation/toronto_annual_precip.csv", index=False)
print(f"  saved {len(df):,} daily rows  → {PRECIP_PATH.relative_to(DATA.parent.parent)}")
print(f"  saved {len(annual)} annual rows → data/raw/precipitation/toronto_annual_precip.csv")

print("\n✓  All done. Re-run pitch.py to see precipitation data on the map.")
