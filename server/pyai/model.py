from __future__ import annotations
import os
import json
from typing import Dict, List, Any
import numpy as np
import joblib

BASELINES_PATH = os.path.join(os.path.dirname(__file__), "baselines.joblib")

class Baselines:
    """
     ML: keeps mean/std per sensor_name.
    """
    def __init__(self):
        # { sensor_name: {"mean": float, "std": float} }
        self.stats: Dict[str, Dict[str, float]] = {}

    def fit(self, rows: List[Dict[str, Any]]):
        """
        rows: [{ "sensor": str, "value": float, "time": iso, "facility": str }]
        Builds mean/std per sensor (across provided rows).
        """
        buckets: Dict[str, List[float]] = {}
        for r in rows:
            name = str(r.get("sensor") or r.get("sensor_name") or "").strip()
            v = r.get("value")
            if not name:
                continue
            try:
                v = float(v)
            except Exception:
                continue
            buckets.setdefault(name, []).append(v)

        new_stats: Dict[str, Dict[str, float]] = {}
        for name, arr in buckets.items():
            if not arr:
                continue
            a = np.array(arr, dtype=float)
            mean = float(a.mean())
            std = float(a.std()) or 1e-6  # never zero
            new_stats[name] = {"mean": mean, "std": std}

        self.stats = new_stats

    def score(self, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compute stability and topIssues using current baselines.
        """
        last_per_sensor: Dict[str, float] = {}
        for r in rows:
            name = str(r.get("sensor") or r.get("sensor_name") or "").strip()
            if not name:
                continue
            try:
                v = float(r.get("value"))
            except Exception:
                continue
            last_per_sensor[name] = v  

        issues = []
        for name, last in last_per_sensor.items():
            base = self.stats.get(name)
            if not base:
                continue
            mean = base["mean"]
            std = base["std"] or 1.0
            z = (last - mean) / std
            if abs(z) > 1.2:
                issues.append({
                    "sensor": name,
                    "z": round(float(z), 2),
                    "last": round(float(last), 2)
                })

        issues.sort(key=lambda x: abs(x["z"]), reverse=True)
        stability = max(0, 100 - min(100, len(issues) * 8))
        return {
            "model": "ZScoreBaseline v1",
            "stability": int(round(stability)),
            "topIssues": issues[:6],
            "usedBaselines": bool(self.stats),
        }

    def save(self, path: str = BASELINES_PATH):
        joblib.dump(self.stats, path)

    def load(self, path: str = BASELINES_PATH):
        if os.path.exists(path):
            self.stats = joblib.load(path)
        else:
            self.stats = {}
