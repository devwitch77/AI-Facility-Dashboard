# server/pyai/app.py
from __future__ import annotations

import os
import json
import math
from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import defaultdict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ML bits (Isolation Forest)
import numpy as np
from sklearn.ensemble import IsolationForest
import joblib

# --------------------- FastAPI ---------------------
app = FastAPI(title="Smart Facility AI", version="2.0")

origins = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5000", "http://127.0.0.1:5000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------- Schemas ---------------------
class Sample(BaseModel):
    sensor: str
    value: float
    time: Optional[str] = None       # ISO string
    facility: Optional[str] = None

class BodyWithSamples(BaseModel):
    facility: str = "Global"
    samples: List[Sample] = []
    thresholds: Optional[Dict[str, Dict[str, float]]] = None  # optional: { "Temp Sensor 1": {"min":18,"max":28}, ... }

# --------------------- Model store ---------------------
MODEL_PATH = os.environ.get("PYAI_MODEL_PATH", "iso_models.joblib")

class IsoStore:
    """
    Keeps one IsolationForest per sensor.
    Persistable via joblib.
    """
    def __init__(self):
        # name -> dict(model=IsolationForest, trained: bool, n: int)
        self.models: Dict[str, Dict[str, Any]] = {}

    def fit(self, rows: List[Dict[str, Any]], contamination: float = 0.08) -> int:
        by_sensor: Dict[str, list] = defaultdict(list)
        for r in rows:
            name = str(r.get("sensor") or r.get("sensor_name") or "")
            v = r.get("value")
            if not name:
                continue
            try:
                fv = float(v)
            except Exception:
                continue
            by_sensor[name].append([fv])

        updated = 0
        for name, arr in by_sensor.items():
            X = np.asarray(arr, dtype=float)
            if len(X) < 25:  # need a few points to fit meaningfully
                continue
            # Create or replace
            clf = IsolationForest(
                n_estimators=150,
                contamination=min(max(contamination, 0.01), 0.25),
                random_state=42,
                warm_start=False,
            )
            clf.fit(X)
            self.models[name] = {"model": clf, "trained": True, "n": len(X)}
            updated += 1
        return updated

    def score(self, rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """
        Returns per-sensor last value and anomaly score (lower = more anomalous).
        If model missing, will compute a quick z-score as a fallback.
        """
        by_sensor_vals: Dict[str, list] = defaultdict(list)
        by_sensor_times: Dict[str, list] = defaultdict(list)

        for r in rows:
            name = str(r.get("sensor") or r.get("sensor_name") or "")
            v = r.get("value")
            t = r.get("time")
            if not name:
                continue
            try:
                fv = float(v)
            except Exception:
                continue
            by_sensor_vals[name].append(fv)
            by_sensor_times[name].append(t)

        out: Dict[str, Dict[str, Any]] = {}
        for name, arr in by_sensor_vals.items():
            last = arr[-1] if arr else None
            t_last = by_sensor_times[name][-1] if by_sensor_times[name] else None

            if name in self.models and self.models[name].get("trained"):
                clf: IsolationForest = self.models[name]["model"]
                X = np.asarray([[v] for v in arr], dtype=float)
                try:
                    # decision_function: higher is more normal, lower more anomalous
                    dec = clf.decision_function(X)
                    score = float(dec[-1])
                except Exception:
                    score = 0.0
            else:
                # Fallback: z-score-ish
                mu = float(np.mean(arr)) if arr else 0.0
                sd = float(np.std(arr)) if arr else 0.0
                if sd < 1e-8: sd = 1.0
                score = float(-(abs((last - mu) / sd))) if last is not None else 0.0  # lower -> worse

            out[name] = {
                "last": round(float(last), 2) if last is not None else None,
                "score": round(score, 4),
                "time": t_last,
                "hasModel": bool(name in self.models and self.models[name].get("trained")),
            }
        return out

    def save(self, path: str = MODEL_PATH):
        joblib.dump(self.models, path)

    def load(self, path: str = MODEL_PATH):
        if os.path.exists(path):
            try:
                self.models = joblib.load(path) or {}
            except Exception:
                self.models = {}

STORE = IsoStore()
STORE.load()

# --------------------- helpers ---------------------
def to_rows(samples: List[Sample]) -> List[Dict[str, Any]]:
    return [s.model_dump() for s in samples]

def annotate_with_thresholds(
    per_sensor: Dict[str, Dict[str, Any]],
    thresholds: Optional[Dict[str, Dict[str, float]]] = None
) -> Dict[str, Dict[str, Any]]:
    if not thresholds:
        return per_sensor
    out = {}
    for name, info in per_sensor.items():
        last = info.get("last")
        status = None
        if last is not None and name in thresholds:
            t = thresholds[name]
            mn = t.get("min", -math.inf)
            mx = t.get("max", math.inf)
            if last < mn: status = "low"
            elif last > mx: status = "high"
        out[name] = dict(info, status=status)
    return out

def rank_issues(per_sensor: Dict[str, Dict[str, Any]]) -> list:
    # Sort: threshold breaches first, then by anomaly severity (lower score = worse)
    def key(x):
        info = per_sensor[x]
        breach = 1 if info.get("status") in ("low", "high") else 0
        return (-breach, info.get("score", 0.0))  # breach first; then smaller score (more anomalous)
    names = sorted(per_sensor.keys(), key=key)
    return [
        {"sensor": n, "last": per_sensor[n].get("last"), "score": per_sensor[n].get("score"),
         "status": per_sensor[n].get("status")}
        for n in names
    ]

def earliest_breach_time(rows: List[Dict[str, Any]], thresholds: Dict[str, Dict[str, float]]) -> Optional[str]:
    if not thresholds:
        return None
    t_min = None
    for r in rows:
        name = r.get("sensor")
        v = r.get("value")
        ts = r.get("time")
        if name not in thresholds or ts is None:
            continue
        try:
            v = float(v)
        except Exception:
            continue
        mn = thresholds[name].get("min", -math.inf)
        mx = thresholds[name].get("max", math.inf)
        if v < mn or v > mx:
            t_min = ts
            break
    return t_min

def hhmm(ts: Optional[str]) -> Optional[str]:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%H:%M")
    except Exception:
        return None

# --------------------- Routes ---------------------
@app.get("/")
def root():
    return {"ok": True, "service": "pyai", "model": "IsolationForest v2"}

@app.get("/health")
def health():
    return {"ok": True, "models": len(STORE.models)}

@app.post("/train")
def train(body: BodyWithSamples):
    rows = to_rows(body.samples)
    if not rows:
        return {"ok": False, "detail": "no_samples_provided"}
    contamination = float(os.environ.get("ISO_CONTAM", "0.08"))
    updated = STORE.fit(rows, contamination=contamination)
    STORE.save(MODEL_PATH)
    return {"ok": True, "facility": body.facility, "updated": updated}

@app.post("/score")
def score(body: BodyWithSamples):
    rows = to_rows(body.samples)
    # can score even if empty -> return zeros
    scored = STORE.score(rows) if rows else {}
    scored = annotate_with_thresholds(scored, body.thresholds)
    issues = rank_issues(scored)
    # Stability heuristic: fewer breaches/anomalies -> higher stability
    n_breach = sum(1 for i in issues if i.get("status") in ("low", "high"))
    n_issues = len(issues)
    stability = max(0, 100 - min(100, n_breach * 12 + max(0, (n_issues - n_breach)) * 4))
    return {
        "facility": body.facility,
        "stability": int(round(stability)),
        "topIssues": issues[:6],
        "usedBaselines": True  # indicates model-based scoring
    }

@app.post("/summary")
def summary(body: BodyWithSamples):
    rows = to_rows(body.samples)
    scored = STORE.score(rows) if rows else {}
    scored = annotate_with_thresholds(scored, body.thresholds)
    issues = rank_issues(scored)

    # stability
    n_breach = sum(1 for i in issues if i.get("status") in ("low", "high"))
    n_issues = len(issues)
    stability = max(0, 100 - min(100, n_breach * 12 + max(0, (n_issues - n_breach)) * 4))

    # build humanline summary (no LLM required)
    fac = body.facility
    if not rows or len(issues) == 0:
        s = f"{fac} is {stability}% stable. No noteworthy anomalies in the current window."
        return {"facility": fac, "stability": int(stability), "topIssues": [], "summary": s, "tips": []}

    breaches = [i for i in issues if i.get("status") in ("low", "high")]
    if breaches:
        # group by kind for prettier line
        kinds = defaultdict(list)
        for b in breaches:
            k = b["status"]
            kinds[k].append(b["sensor"])
        parts = []
        if kinds.get("high"):
            parts.append(f"{', '.join(kinds['high'])} running high")
        if kinds.get("low"):
            parts.append(f"{', '.join(kinds['low'])} running low")
        since = hhmm(earliest_breach_time(rows, body.thresholds or {})) or "recently"
        s = f"{fac} shows instability since {since}: " + "; ".join(parts) + "."
    else:
        # no threshold breach, pick top anomalies by score
        top = [i["sensor"] for i in issues[:3]]
        s = f"{fac} is {stability}% stable. Notable outliers: {', '.join(top)}."

    # simple tips
    tips = []
    for i in issues[:4]:
        name = i["sensor"]
        st = i.get("status")
        if st == "high":
            tips.append(f"Check {name} setpoint/airflow; consider lowering load or scheduling HVAC cooldown.")
        elif st == "low":
            tips.append(f"Check {name} supply/valves; verify sensor calibration and minimum setpoints.")
        else:
            tips.append(f"Observe {name}; trend suggests transient deviation—recheck in 10–15 minutes.")

    return {
        "facility": fac,
        "stability": int(stability),
        "topIssues": issues[:6],
        "summary": s,
        "tips": tips
    }

@app.post("/insights")
def insights(body: Dict[str, Any]):
    """
    Lightweight endpoint used by GenerateInsights.
    Accepts either:
      { facility, latest: {sensor:value}, ts }  OR
      { facility, samples: [...] }
    Returns: { summary, riskScore, tips }
    """
    facility = str(body.get("facility") or "Global")
    thresholds: Dict[str, Dict[str, float]] = body.get("thresholds") or {}

    if "samples" in body and isinstance(body["samples"], list):
        rows = body["samples"]
    else:
        # build rows from latest snapshot (single timestamp)
        ts = body.get("ts") or datetime.utcnow().isoformat()
        latest = body.get("latest") or {}
        rows = [{"sensor": k, "value": v, "time": ts} for k, v in latest.items()]

    scored = STORE.score(rows) if rows else {}
    scored = annotate_with_thresholds(scored, thresholds)
    issues = rank_issues(scored)

    # risk: breaches weigh more
    n_breach = sum(1 for i in issues if i.get("status") in ("low", "high"))
    risk = min(100, n_breach * 30 + max(0, (len(issues) - n_breach)) * 10)

    # sentence
    if n_breach == 0 and not issues:
        summary = f"All core metrics in {facility} look stable."
        tips = ["Maintain current ventilation profile.", "Consider a scheduled HVAC self-check."]
    else:
        breaches = [i for i in issues if i.get("status") in ("low", "high")]
        if breaches:
            highs = [b["sensor"] for b in breaches if b.get("status") == "high"]
            lows  = [b["sensor"] for b in breaches if b.get("status") == "low"]
            segs = []
            if highs: segs.append(f"{', '.join(highs)} high")
            if lows:  segs.append(f"{', '.join(lows)} low")
            summary = f"{facility}: {('; '.join(segs))}."
        else:
            top = [i["sensor"] for i in issues[:3]]
            summary = f"{facility}: notable outliers — {', '.join(top)}."

        tips = []
        for i in issues[:4]:
            name = i["sensor"]
            st = i.get("status")
            if st == "high":
                tips.append(f"Reduce {name} load or improve cooling/ventilation path.")
            elif st == "low":
                tips.append(f"Increase {name} baseline or verify supply/valves and sensor calibration.")
            else:
                tips.append(f"Monitor {name}; re-check in 10–15 minutes for persistence.")

    return {"summary": summary, "riskScore": int(risk), "tips": tips}
