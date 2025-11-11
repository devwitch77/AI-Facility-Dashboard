from __future__ import annotations
import os
import joblib
import numpy as np
from typing import Dict, List, Any
from sklearn.ensemble import IsolationForest

BASELINES_PATH = os.path.join(os.path.dirname(__file__), "model_iforest.joblib")

class IFModel:
    def __init__(self):
      self.models: Dict[str, IsolationForest] = {}

    def load(self, path: str = BASELINES_PATH) -> None:
      if os.path.exists(path):
          try:
              payload = joblib.load(path)
              self.models = payload.get("models", {})
          except Exception:
              self.models = {}

    def save(self, path: str = BASELINES_PATH) -> None:
      joblib.dump({"models": self.models}, path)

    @staticmethod
    def _group_values(samples: List[Dict[str, Any]]) -> Dict[str, List[float]]:
      out: Dict[str, List[float]] = {}
      for s in samples or []:
          name = s.get("sensor") or s.get("sensor_name") or s.get("name")
          try:
              v = float(s.get("value"))
          except Exception:
              v = None
          if not name or v is None or not np.isfinite(v):
              continue
          out.setdefault(name, []).append(v)
      return out

    def fit(self, samples: List[Dict[str, Any]]) -> int:
      grouped = self._group_values(samples)
      for name, arr in grouped.items():
          if len(arr) < 8:
              continue
          vals = np.asarray(arr, dtype=np.float64)
          if len(vals) >= 5:
              vals = np.convolve(vals, np.ones(5)/5.0, mode="same")
          X = vals.reshape(-1, 1)
          model = IsolationForest(
              n_estimators=200,
              contamination=0.03,   
              random_state=42,
          )
          model.fit(X)
          self.models[name] = model
      return len(self.models)

    def score(self, samples: List[Dict[str, Any]]) -> Dict[str, Any]:
      grouped = self._group_values(samples)
      issues = []
      for name, arr in grouped.items():
          if not arr:
              continue
          vals = np.asarray(arr, dtype=np.float64)
          if len(vals) >= 5:
              vals_s = np.convolve(vals, np.ones(5)/5.0, mode="same")
          else:
              vals_s = vals
          last = float(vals_s[-1])
          X_last = np.array([[last]], dtype=np.float64)

          model = self.models.get(name)
          if model is None:
              if len(vals_s) >= 8:
                  model = IsolationForest(
                      n_estimators=150,
                      contamination=0.03,
                      random_state=0,
                  ).fit(vals_s.reshape(-1, 1))
              else:
                  continue

          df = float(model.decision_function(X_last)[0])  
          if df < 0.0:
              issues.append({
                  "sensor": name,
                  "score": round(df, 4),
                  "last": round(float(arr[-1]), 3),  
              })

      issues.sort(key=lambda i: i["score"])  
      top = issues[:6]
      stability = max(0, 100 - min(100, len(issues) * 10))
      return {"stability": stability, "topIssues": top, "usedBaselines": bool(self.models)}
