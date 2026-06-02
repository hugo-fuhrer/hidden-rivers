"""
hotspots.py — the "Risk Hotspots" tab.

Reads the artifacts written by the modelling notebooks (data/processed/) and builds the
choropleth + driver bar chart. Degrades gracefully: if the artifacts are missing (notebooks
not run yet) it renders a placeholder so the Dash app still boots.

Artifacts consumed
------------------
* ward_risk_scores.geojson  (notebook 02) — coincidence_index + component scores per ward
* ward_susceptibility.csv   (notebook 03) — modelled flood susceptibility per ward
* shap_importances.csv      (notebook 03) — driver importances
"""

import json
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
from dash import dcc, html, Input, Output

PROCESSED = Path(__file__).parents[1] / "data" / "processed"

DARK = "#0d1117"
MAP_CENTER = {"lat": 43.72, "lon": -79.37}
MAP_ZOOM = 9.2

# Metric → (label, hover label, number format)
METRICS = {
    "coincidence_index": ("Hidden-river × weak-sewer coincidence", "Coincidence", ".2f"),
    "risk_index": ("Overall risk index", "Risk", ".2f"),
    "susceptibility": ("Modelled flood susceptibility", "Susceptibility", ".0f"),
}


# ── Load artifacts once at import ─────────────────────────────────────────────

def _load():
    try:
        import geopandas as gpd
        risk = gpd.read_file(PROCESSED / "ward_risk_scores.geojson")
    except Exception:
        return None, None
    susc_path = PROCESSED / "ward_susceptibility.csv"
    if susc_path.exists():
        susc = pd.read_csv(susc_path)[["ward_num", "susceptibility"]]
        risk = risk.merge(susc, on="ward_num", how="left")
    imp_path = PROCESSED / "shap_importances.csv"
    imp = pd.read_csv(imp_path) if imp_path.exists() else None
    return risk, imp


_RISK, _IMP = _load()
AVAILABLE = _RISK is not None


def available_metrics():
    """Metric keys we actually have columns for."""
    if _RISK is None:
        return []
    return [k for k in METRICS if k in _RISK.columns]


# ── Figures ───────────────────────────────────────────────────────────────────

def build_map(metric: str) -> go.Figure:
    label, hover, fmt = METRICS[metric]
    gdf = _RISK
    geojson = json.loads(gdf.to_json())
    for f in geojson["features"]:
        f["id"] = f["properties"]["ward_num"]

    cols = ["ward_name", "river_score", "weaksewer_score", "flood_score"]
    customdata = gdf[cols].values

    fig = go.Figure(go.Choroplethmap(
        geojson=geojson, locations=gdf["ward_num"], z=gdf[metric], featureidkey="id",
        colorscale="YlOrRd", zmin=float(gdf[metric].min()), zmax=float(gdf[metric].max()),
        marker=dict(opacity=0.72, line=dict(width=0.6, color="#666")),
        customdata=customdata,
        hovertemplate=(
            "<b>%{customdata[0]}</b><br>"
            + hover + ": %{z:" + fmt + "}<br>"
            "<span style='font-size:10px'>buried-river %{customdata[1]:.2f} · "
            "weak-sewer %{customdata[2]:.2f} · floods %{customdata[3]:.2f}</span>"
            "<extra></extra>"
        ),
        colorbar=dict(title=dict(text=hover, font=dict(color="white")),
                      thickness=12, len=0.5, x=0.98, tickfont=dict(color="white")),
    ))
    fig.update_layout(
        map_style="carto-darkmatter", map_center=MAP_CENTER, map_zoom=MAP_ZOOM,
        paper_bgcolor=DARK, margin=dict(l=0, r=0, t=0, b=0), uirevision="hotspots",
    )
    return fig


def build_importance_bar() -> go.Figure:
    top = _IMP.sort_values("importance", ascending=False).head(12).iloc[::-1]
    method = top["method"].iloc[0] if "method" in top else "importance"
    fig = go.Figure(go.Bar(
        x=top["importance"], y=top["feature"], orientation="h",
        marker_color="#fd8d3c",
        hovertemplate="%{y}: %{x:.3f}<extra></extra>",
    ))
    fig.update_layout(
        title=dict(text=f"Top flood drivers · {method}", font=dict(color="#ddd", size=12)),
        paper_bgcolor=DARK, plot_bgcolor=DARK,
        font=dict(color="#bbb", size=10),
        xaxis=dict(gridcolor="#222"), yaxis=dict(automargin=True),
        margin=dict(l=4, r=10, t=30, b=20),
    )
    return fig


# ── Panel layout ──────────────────────────────────────────────────────────────

def _placeholder() -> html.Div:
    return html.Div(
        style={"flex": "1", "display": "flex", "alignItems": "center",
               "justifyContent": "center", "padding": "40px"},
        children=html.Div(
            style={"maxWidth": "560px", "color": "#bbb", "fontSize": "14px",
                   "lineHeight": "1.7", "textAlign": "center"},
            children=[
                html.Div("🌊 Risk Hotspots", style={"fontSize": "20px", "color": "#4fc3f7",
                                                    "marginBottom": "12px"}),
                html.P("The modelling artifacts haven't been generated yet."),
                html.P([
                    "Run the notebooks in ", html.Code("modelling/notebooks/"),
                    " in order (01 → 02 → 03); they write ",
                    html.Code("data/processed/ward_risk_scores.geojson"),
                    " and the susceptibility / driver files this tab reads.",
                ], style={"fontSize": "12px", "color": "#888"}),
            ],
        ),
    )


def panel_children():
    """Children for the #panel-hotspots Div."""
    metrics = available_metrics()
    if not metrics:
        return [_placeholder()]

    options = [{"label": METRICS[k][0], "value": k} for k in metrics]
    children = [
        html.Div(
            style={"flexShrink": "0", "display": "flex", "alignItems": "center",
                   "gap": "16px", "padding": "8px 16px", "backgroundColor": "#161b22"},
            children=[
                html.Span("Layer:", style={"color": "#888", "fontSize": "12px"}),
                dcc.RadioItems(
                    id="hotspot-metric", options=options, value=metrics[0],
                    inline=True,
                    style={"color": "#ddd", "fontSize": "12px"},
                    inputStyle={"marginRight": "5px", "marginLeft": "14px"},
                ),
            ],
        ),
        html.Div(
            style={"flex": "1", "display": "flex", "overflow": "hidden", "minHeight": "0"},
            children=[
                dcc.Graph(id="hotspot-map", figure=build_map(metrics[0]),
                          style={"flex": "3", "minWidth": "0"},
                          config={"scrollZoom": True}),
            ] + ([
                dcc.Graph(id="hotspot-importance", figure=build_importance_bar(),
                          style={"flex": "2", "minWidth": "0",
                                 "borderLeft": "1px solid #222"})
            ] if _IMP is not None else []),
        ),
    ]
    return children


def register_callbacks(app):
    """Wire the layer radio → choropleth (only if artifacts exist)."""
    if not available_metrics():
        return

    @app.callback(Output("hotspot-map", "figure"), Input("hotspot-metric", "value"))
    def _update_hotspot_map(metric):
        return build_map(metric)
