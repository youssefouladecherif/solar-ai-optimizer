"""
Solar AI-Optimizer V2 — FastAPI Backend
Run locally : uvicorn main:app --reload --port 8000
Deploy      : Render.com (free tier) — connect GitHub repo
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import pickle, json, os, numpy as np, requests
from datetime import date, datetime, timedelta
import pvlib, pandas as pd

app = FastAPI(
    title="Solar AI-Optimizer API",
    description="Soiling prediction + ROI engine for solar panels in Morocco",
    version="2.0.0"
)

# ── CORS — allow your Vercel frontend domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",        # Vite dev server
        "http://localhost:3000",        # CRA dev server
        "https://your-app.vercel.app",  # ← Replace with your Vercel URL
        "*",                            # Remove in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Model paths (place .pkl files next to main.py)
MODEL_PATHS = {
    "soiling":   "models/soiling_index__MLP_optimized.pkl",
    "breakeven": "models/jours_break_even__LightGBM_optimized.pkl",
    "alert":     "models/alerte_nettoyage__MLP_optimized.pkl",
}

FEATURE_ORDER = [
    "days_since_last_rain", "power_ratio", "days_since_last_cleaning",
    "irradiation_kwh_m2", "wind_speed_ms", "precipitation_mm",
    "humidity_pct", "temp_air_c", "p_theoretical_kwh", "installed_capacity_kwp",
]

# ── Load models on startup
models = {}

@app.on_event("startup")
async def load_models():
    global models
    for name, path in MODEL_PATHS.items():
        if os.path.exists(path):
            with open(path, "rb") as f:
                models[name] = pickle.load(f)
            print(f"  ✓ Model loaded: {name}")
        else:
            print(f"  ⚠ Model not found: {path}")


# ══════════════════════════════════════════════════════════
#  SCHEMAS
# ══════════════════════════════════════════════════════════

class PredictRequest(BaseModel):
    days_since_last_rain:      float
    power_ratio:               float
    days_since_last_cleaning:  float
    irradiation_kwh_m2:        float
    wind_speed_ms:             float
    precipitation_mm:          float
    humidity_pct:              float
    temp_air_c:                float
    p_theoretical_kwh:         float
    installed_capacity_kwp:    float
    # Optional for ROI
    cout_nettoyage_dh:         Optional[float] = 800.0
    tarif_onee:                Optional[float] = 1.20
    # For hybrid M1 calculation
    p_real_kwh:                Optional[float] = None

class FusionSolarConfig(BaseModel):
    username:    str
    system_code: str
    base_url:    Optional[str] = "https://intl.fusionsolar.huawei.com"


# ══════════════════════════════════════════════════════════
#  HEALTH CHECK
# ══════════════════════════════════════════════════════════

@app.get("/", tags=["Health"])
def root():
    return {
        "status": "online",
        "app":    "Solar AI-Optimizer API v2.0",
        "models": {k: "loaded" if k in models else "missing" for k in MODEL_PATHS},
        "docs":   "/docs"
    }

@app.get("/api/health", tags=["Health"])
def health():
    return {
        "status":      "ok",
        "timestamp":   datetime.now().isoformat(),
        "models_ready": len(models) == 3
    }


# ══════════════════════════════════════════════════════════
#  PREDICTION ENGINE
# ══════════════════════════════════════════════════════════

def run_prediction(features: dict, p_real_kwh: float | None,
                   cout_net: float, tarif_onee: float) -> dict:
    """
    Core prediction logic — used by both /predict and /dashboard.
    Returns full prediction result dict.
    """
    if "soiling" not in models:
        raise HTTPException(503, "Models not loaded. Check server logs.")

    X = np.array([[features[k] for k in FEATURE_ORDER]])
    p_theo = features["p_theoretical_kwh"]

    # ── M1: physics formula (if p_real provided)
    soiling_m1 = None
    if p_real_kwh is not None and p_theo > 0:
        soiling_m1 = max(0.0, min((p_theo - p_real_kwh) / p_theo, 0.60))

    # ── M2: MLP prediction
    m_soil = models["soiling"]
    Xs = m_soil["scaler"].transform(X) if m_soil.get("scaler") else X
    soiling_m2 = float(np.clip(m_soil["model"].predict(Xs)[0], 0, 0.60))

    # ── Hybrid decision
    if soiling_m1 is not None:
        gap = abs(soiling_m1 - soiling_m2)
        if   gap <= 0.05: alpha, conf, diag = 0.40, 95, "Accord M1/M2 — haute confiance"
        elif gap <= 0.15: alpha, conf, diag = 0.25, 80, "Divergence modérée — IA prioritaire"
        else:             alpha, conf, diag = 0.00, 70, "Grande divergence — IA seule"
        soiling_final = alpha * soiling_m1 + (1 - alpha) * soiling_m2
    else:
        soiling_m1 = soiling_m2
        gap, conf, diag = 0.0, 80, "IA seule — pas de données production réelle"
        soiling_final = soiling_m2

    # ── Break-even
    m_be = models["breakeven"]
    Xb = m_be["scaler"].transform(X) if m_be.get("scaler") else X
    jours_be = float(np.clip(m_be["model"].predict(Xb)[0], 0, 999))

    # ── Alert classification
    m_alert = models["alert"]
    Xa = m_alert["scaler"].transform(X) if m_alert.get("scaler") else X
    alert_enc = m_alert["model"].predict(Xa)[0]
    alerte_net = m_alert["label_encoder"].inverse_transform([alert_enc])[0]

    # ── Soiling alert level
    if   soiling_final < 0.12: alert_soil = "NORMAL"
    elif soiling_final < 0.20: alert_soil = "AVERTISSEMENT"
    elif soiling_final < 0.35: alert_soil = "ALERTE"
    else:                       alert_soil = "CRITIQUE"

    # ── ROI
    perte_kwh  = p_theo * soiling_final
    perte_dh   = perte_kwh * tarif_onee
    days_clean = features["days_since_last_cleaning"]
    perte_cum  = perte_dh * days_clean
    gain_net   = perte_cum - cout_net
    jours_rest = max(0.0, (cout_net - perte_cum) / perte_dh) if perte_dh > 0 else 999.0

    return {
        "soiling_m1_calcul":   round(soiling_m1, 4),
        "soiling_m2_ia":       round(soiling_m2, 4),
        "soiling_final":       round(soiling_final, 4),
        "soiling_pct":         round(soiling_final * 100, 2),
        "gap_m1_m2":           round(gap, 4),
        "confidence_pct":      conf,
        "diagnostic":          diag,
        "alert_soiling":       alert_soil,
        "p_theoretical_kwh":   round(p_theo, 3),
        "p_real_kwh":          round(p_real_kwh, 3) if p_real_kwh else None,
        "power_ratio":         round(features["power_ratio"], 4),
        "perte_kwh_jour":      round(perte_kwh, 3),
        "perte_dh_jour":       round(perte_dh, 2),
        "perte_cumulee_dh":    round(perte_cum, 2),
        "cout_nettoyage_dh":   cout_net,
        "gain_net_dh":         round(gain_net, 2),
        "rentable":            bool(gain_net >= 0),
        "jours_break_even":    round(jours_be, 1),
        "jours_restants":      round(jours_rest, 1),
        "alerte_nettoyage":    alerte_net,
    }


@app.post("/api/predict", tags=["Prediction"])
def predict(req: PredictRequest):
    """
    Run soiling prediction + ROI calculation.
    Call this with computed features to get full prediction.
    """
    features = req.model_dump(exclude={"cout_nettoyage_dh", "tarif_onee", "p_real_kwh"})
    result = run_prediction(
        features=features,
        p_real_kwh=req.p_real_kwh,
        cout_net=req.cout_nettoyage_dh,
        tarif_onee=req.tarif_onee
    )
    return {
        "timestamp":  datetime.now().isoformat(),
        "features":   features,
        "prediction": result
    }


# ══════════════════════════════════════════════════════════
#  PVLIB — THEORETICAL PRODUCTION
# ══════════════════════════════════════════════════════════

@app.get("/api/pvlib/theoretical", tags=["pvlib"])
def get_p_theoretical(
    lat: float, lon: float, irr_kwh: float,
    capacity_kwp: float, tilt: float = 30.0,
    azimuth: float = 180.0, pr: float = 0.80
):
    """Compute P_theoretical using pvlib for a given day."""
    try:
        query_date = date.today() - timedelta(days=1)
        location   = pvlib.location.Location(
            latitude=lat, longitude=lon, altitude=300, tz="Africa/Casablanca"
        )
        times = pd.date_range(
            start=f"{query_date} 06:00", end=f"{query_date} 20:00",
            freq="1h", tz="Africa/Casablanca"
        )
        solar_pos = location.get_solarposition(times)
        elev = solar_pos["elevation"].clip(lower=0)
        if elev.sum() == 0:
            return {"p_theoretical_kwh": 0.0}

        ghi_h = (elev / elev.sum()) * irr_kwh * 1000
        disc  = pvlib.irradiance.disc(ghi=ghi_h, solar_zenith=solar_pos["zenith"], datetime_or_doy=times)
        dni   = disc["dni"].fillna(0).clip(lower=0)
        dhi   = (ghi_h - dni * np.cos(np.radians(solar_pos["zenith"])).clip(lower=0)).clip(lower=0)
        poa   = pvlib.irradiance.get_total_irradiance(
            surface_tilt=tilt, surface_azimuth=azimuth,
            solar_zenith=solar_pos["zenith"], solar_azimuth=solar_pos["azimuth"],
            dni=dni, ghi=ghi_h, dhi=dhi,
            dni_extra=pvlib.irradiance.get_extra_radiation(times),
            model="haydavies"
        )
        p_theo = round(float(capacity_kwp * poa["poa_global"].fillna(0).clip(lower=0).sum() / 1000 * pr), 4)
        return {"p_theoretical_kwh": p_theo, "date": str(query_date)}
    except Exception as e:
        raise HTTPException(500, f"pvlib error: {e}")


# ══════════════════════════════════════════════════════════
#  NASA POWER — WEATHER DATA
# ══════════════════════════════════════════════════════════

@app.get("/api/nasa/weather", tags=["NASA POWER"])
def get_nasa_weather(lat: float, lon: float, query_date: Optional[str] = None):
    """Fetch daily weather from NASA POWER API."""
    if query_date is None:
        query_date = str(date.today() - timedelta(days=1))

    date_str = query_date.replace("-", "")
    url = "https://power.larc.nasa.gov/api/temporal/daily/point"
    params = {
        "parameters": "ALLSKY_SFC_SW_DWN,T2M,RH2M,WS10M,PRECTOTCORR",
        "community":  "RE",
        "longitude":  lon,
        "latitude":   lat,
        "start":      date_str,
        "end":        date_str,
        "format":     "JSON",
    }
    try:
        resp = requests.get(url, params=params, timeout=45)
        resp.raise_for_status()
        props = resp.json()["properties"]["parameter"]

        def val(key):
            v = float(list(props[key].values())[0])
            return 0.0 if v == -999.0 else v

        return {
            "date":               query_date,
            "irradiation_kwh_m2": val("ALLSKY_SFC_SW_DWN"),
            "temp_air_c":         val("T2M"),
            "humidity_pct":       val("RH2M"),
            "wind_speed_ms":      val("WS10M"),
            "precipitation_mm":   val("PRECTOTCORR"),
        }
    except Exception as e:
        raise HTTPException(503, f"NASA POWER unavailable: {e}")


# ══════════════════════════════════════════════════════════
#  FUSIONSOLAR API
# ══════════════════════════════════════════════════════════

fusionsolar_session = {"token": None, "base_url": None, "session": None}

@app.post("/api/fusionsolar/login", tags=["FusionSolar"])
def fusionsolar_login(cfg: FusionSolarConfig):
    """Authenticate with FusionSolar Northbound API."""
    url = f"{cfg.base_url}/thirdData/login"
    try:
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        resp = s.post(url, json={"userName": cfg.username, "systemCode": cfg.system_code}, timeout=30)
        data = resp.json()

        if not data.get("success", False):
            raise HTTPException(401, f"FusionSolar auth failed: {data.get('failCode')} {data.get('message')}")

        token = resp.headers.get("xsrf-token") or str(data.get("data", ""))
        s.headers.update({"xsrf-token": token})
        fusionsolar_session["token"]    = token
        fusionsolar_session["base_url"] = cfg.base_url
        fusionsolar_session["session"]  = s
        return {"status": "connected", "token_preview": token[:8] + "..." if token else "session-based"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Cannot reach FusionSolar: {e}")


@app.get("/api/fusionsolar/stations", tags=["FusionSolar"])
def fusionsolar_stations():
    """List all FusionSolar stations for this account."""
    s = fusionsolar_session.get("session")
    if not s:
        raise HTTPException(401, "Not authenticated. Call /api/fusionsolar/login first.")

    url = f"{fusionsolar_session['base_url']}/thirdData/getStationList"
    resp = s.post(url, json={"pageNo": 1, "pageSize": 100}, timeout=30)
    data = resp.json()

    if not data.get("success"):
        raise HTTPException(400, f"Failed: {data.get('failCode')} {data.get('message')}")

    stations = data.get("data", {}).get("list", [])
    return {"count": len(stations), "stations": stations}


@app.get("/api/fusionsolar/daily/{station_code}", tags=["FusionSolar"])
def fusionsolar_daily(station_code: str, query_date: Optional[str] = None):
    """Get daily production KPI for a station."""
    s = fusionsolar_session.get("session")
    if not s:
        raise HTTPException(401, "Not authenticated.")

    if query_date is None:
        query_date = str(date.today() - timedelta(days=1))

    dt = datetime.strptime(query_date, "%Y-%m-%d")
    ts_ms = int(dt.timestamp() * 1000)

    url  = f"{fusionsolar_session['base_url']}/thirdData/getKpiInfo"
    resp = s.post(url, json={"stationCodes": station_code, "collectTime": ts_ms}, timeout=30)
    data = resp.json()

    if not data.get("success"):
        raise HTTPException(400, f"Failed: {data.get('failCode')} {data.get('message')}")

    kpi_list = data.get("data", [])
    if not kpi_list:
        raise HTTPException(404, f"No data for {station_code} on {query_date}")

    kpi = kpi_list[0].get("dataItemMap", {})
    return {
        "date":             query_date,
        "station_code":     station_code,
        "day_power_kwh":    float(kpi.get("day_power", 0) or 0),
        "inverter_power_kw": float(kpi.get("inverter_power", 0) or 0),
        "day_on_grid_kwh":  float(kpi.get("day_on_grid_energy", 0) or 0),
    }


# ══════════════════════════════════════════════════════════
#  DASHBOARD — Combined endpoint (weather + prediction)
# ══════════════════════════════════════════════════════════

@app.get("/api/dashboard/{station_code}", tags=["Dashboard"])
def get_dashboard(
    station_code: str,
    lat: float, lon: float,
    capacity_kwp: float,
    days_since_cleaning: int = 0,
    cout_nettoyage: float = 800.0,
    query_date: Optional[str] = None
):
    """
    Full dashboard endpoint — fetches weather, computes pvlib,
    runs all 3 models, returns complete prediction.
    """
    if query_date is None:
        query_date = str(date.today() - timedelta(days=1))

    # 1. Weather from NASA POWER
    try:
        weather = get_nasa_weather(lat=lat, lon=lon, query_date=query_date)
    except Exception:
        weather = {
            "date": query_date, "irradiation_kwh_m2": 5.5, "temp_air_c": 22.0,
            "humidity_pct": 60.0, "wind_speed_ms": 3.5, "precipitation_mm": 0.0
        }

    # 2. P_theoretical via pvlib
    try:
        pvlib_result = get_p_theoretical(
            lat=lat, lon=lon, irr_kwh=weather["irradiation_kwh_m2"],
            capacity_kwp=capacity_kwp
        )
        p_theo = pvlib_result["p_theoretical_kwh"]
    except Exception:
        p_theo = capacity_kwp * weather["irradiation_kwh_m2"] * 0.80

    # 3. FusionSolar production (if authenticated)
    p_real = None
    power_ratio = 0.85  # default if no real data

    s = fusionsolar_session.get("session")
    if s:
        try:
            fs_data = fusionsolar_daily(station_code=station_code, query_date=query_date)
            p_real  = fs_data["day_power_kwh"]
            power_ratio = min(p_real / p_theo, 1.05) if p_theo > 0 else 0.85
        except Exception:
            pass

    # 4. days_since_last_rain from precipitation history
    days_since_rain = 1 if weather["precipitation_mm"] >= 1.0 else max(1, days_since_cleaning // 2)

    features = {
        "days_since_last_rain":      days_since_rain,
        "power_ratio":               round(power_ratio, 5),
        "days_since_last_cleaning":  days_since_cleaning,
        "irradiation_kwh_m2":        weather["irradiation_kwh_m2"],
        "wind_speed_ms":             weather["wind_speed_ms"],
        "precipitation_mm":          weather["precipitation_mm"],
        "humidity_pct":              weather["humidity_pct"],
        "temp_air_c":                weather["temp_air_c"],
        "p_theoretical_kwh":         p_theo,
        "installed_capacity_kwp":    capacity_kwp,
    }

    prediction = run_prediction(
        features=features,
        p_real_kwh=p_real,
        cout_net=cout_nettoyage,
        tarif_onee=1.20
    )

    return {
        "timestamp":  datetime.now().isoformat(),
        "date":       query_date,
        "station":    station_code,
        "weather":    weather,
        "features":   features,
        "prediction": prediction,
        "data_sources": {
            "nasa_power":   True,
            "pvlib":        True,
            "fusionsolar":  p_real is not None,
        }
    }


# ══════════════════════════════════════════════════════════
#  STATIC DATA — Partners, stations list
# ══════════════════════════════════════════════════════════

@app.get("/api/partners", tags=["Platform"])
def get_partners(lat: Optional[float] = None, lon: Optional[float] = None):
    """Return certified cleaning partners (sorted by distance if coords provided)."""
    partners = [
        {"id": 1, "name": "SolarClean Maroc", "city": "Casablanca",
         "lat": 33.57, "lon": -7.59, "rating": 4.8, "reviews": 142,
         "tarif_kwp_30": 800, "tarif_kwp_50": 1500, "availability": "demain",
         "phone": "+212 5 22 XX XX XX"},
        {"id": 2, "name": "CleanSolar Pro", "city": "Mohammédia",
         "lat": 33.68, "lon": -7.38, "rating": 4.6, "reviews": 89,
         "tarif_kwp_30": 800, "tarif_kwp_50": 1500, "availability": "dans 3 jours",
         "phone": "+212 5 23 XX XX XX"},
        {"id": 3, "name": "EcoPanel Services", "city": "Rabat",
         "lat": 34.02, "lon": -6.84, "rating": 4.9, "reviews": 217,
         "tarif_kwp_30": 800, "tarif_kwp_50": 1500, "availability": "dans 5 jours",
         "phone": "+212 5 37 XX XX XX"},
        {"id": 4, "name": "SunWash Marrakech", "city": "Marrakech",
         "lat": 31.63, "lon": -8.00, "rating": 4.5, "reviews": 74,
         "tarif_kwp_30": 750, "tarif_kwp_50": 1400, "availability": "dans 2 jours",
         "phone": "+212 5 24 XX XX XX"},
    ]

    if lat and lon:
        for p in partners:
            dx = (p["lat"] - lat) * 111
            dy = (p["lon"] - lon) * 111 * abs(np.cos(np.radians(lat)))
            p["distance_km"] = round(float(np.sqrt(dx**2 + dy**2)), 1)
        partners.sort(key=lambda x: x.get("distance_km", 9999))

    return {"partners": partners}


@app.post("/api/cleaning-request", tags=["Platform"])
def submit_cleaning_request(
    partner_id: int,
    station_code: str,
    client_name: str,
    soiling_pct: float,
    requested_date: str,
    note: Optional[str] = ""
):
    """Submit a cleaning request to a partner (logs it + would trigger notification)."""
    return {
        "status":       "sent",
        "request_id":   f"REQ-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "partner_id":   partner_id,
        "station":      station_code,
        "soiling_pct":  soiling_pct,
        "date":         requested_date,
        "message":      f"Demande envoyée au partenaire {partner_id}. Confirmation sous 2h.",
        "timestamp":    datetime.now().isoformat()
    }
