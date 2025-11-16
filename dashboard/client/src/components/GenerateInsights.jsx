import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase";

const forest = {
  panel: "#0c100e",
  panel2: "#0f1412",
  border: "#1d2320",
  ink: "#8FE3B3",
};

// local copy of thresholds to keep this component self-contained
const BASE_THRESHOLDS = {
  "Temperature Sensor 1": { min: 18, max: 28 },
  "Humidity Sensor 1": { min: 30, max: 60 },
  "CO2 Sensor 1": { min: 0, max: 800 },
  "Light Sensor 1": { min: 100, max: 700 },
};

const FRESH_WINDOW_MS = 5 * 60 * 1000;

const outOfRange = (thr, v) =>
  typeof v === "number" && thr && (v < thr.min || v > thr.max);

function computeBreachesNow({ facility, history, thresholds }) {
  const now = Date.now();
  const breaches = [];
  Object.keys(history)
    .filter((k) => k.startsWith(`${facility} •`))
    .forEach((full) => {
      const series = history[full];
      if (!series?.length) return;
      const pt = series[series.length - 1];
      if (!pt?.x || typeof pt?.y !== "number") return;
      if (now - new Date(pt.x).getTime() > FRESH_WINDOW_MS) return;

      const thr = thresholds[full];
      if (outOfRange(thr, pt.y)) {
        breaches.push({
          sensor: full,
          value: pt.y,
          status: pt.y < thr.min ? "low" : "high",
          time: pt.x,
        });
      }
    });
  return breaches.sort((a, b) => new Date(b.time) - new Date(a.time));
}

function baseNameFromFull(full) {
  const idx = full.indexOf("•");
  if (idx === -1) return full.trim();
  return full.slice(idx + 1).trim();
}

// get first breach time for this sensor, like in the TTS helper
function getBreachDurationInfo(sensorName, history, thresholds) {
  const thr = thresholds[sensorName];
  const series = history[sensorName] || [];
  if (!thr || !series.length) return null;
  const now = Date.now();
  let startIdx = series.length - 1;
  for (let i = series.length - 1; i >= 0; i--) {
    const p = series[i];
    if (!p?.x || typeof p?.y !== "number") continue;
    if (!outOfRange(thr, p.y)) break;
    startIdx = i;
  }
  const startPoint = series[startIdx];
  if (!startPoint?.x) return null;
  const startTs = new Date(startPoint.x).getTime();
  const durationMs = now - startTs;
  const mins = Math.max(1, Math.round(durationMs / 60000));
  return { mins, startTs, durationMs };
}

function severityFromValue(value, thr) {
  if (value == null || !thr) return { sev: "unknown", dir: "ok" };
  const range = thr.max - thr.min || 1;
  const warnBand = 0.15 * range;

  if (value < thr.min - warnBand || value > thr.max + warnBand) {
    return { sev: "critical", dir: value > thr.max ? "high" : "low" };
  }
  if (value < thr.min || value > thr.max) {
    return { sev: "warn", dir: value > thr.max ? "high" : "low" };
  }
  return { sev: "ok", dir: "ok" };
}

function chipClasses(sev) {
  if (sev === "critical") {
    return "border-red-500/60 bg-red-500/10 text-red-300";
  }
  if (sev === "warn") {
    return "border-amber-400/60 bg-amber-400/10 text-amber-200";
  }
  if (sev === "ok") {
    return "border-emerald-500/60 bg-emerald-500/10 text-emerald-200";
  }
  return "border-gray-500/60 bg-gray-500/10 text-gray-300";
}

export default function GenerateInsights({ facility, history }) {
  const [aiSummary, setAiSummary] = useState("");
  const [aiTips, setAiTips] = useState([]);

  // thresholds namespaced with facility
  const ALERT_THRESHOLDS = useMemo(() => {
    const out = {};
    Object.keys(BASE_THRESHOLDS).forEach((k) => {
      out[`${facility} • ${k}`] = BASE_THRESHOLDS[k];
    });
    return out;
  }, [facility]);

  // keep AI summary + tips in sync with AiPanel via window events
  useEffect(() => {
    const onSummary = (e) => {
      if (e.detail?.facility !== facility) return;
      setAiSummary(e.detail.summary || "");
    };
    const onInsights = (e) => {
      if (e.detail?.facility !== facility) return;
      setAiSummary(e.detail.summary || "");
      setAiTips(Array.isArray(e.detail.tips) ? e.detail.tips : []);
    };
    window.addEventListener("ai-summary", onSummary);
    window.addEventListener("ai-insights", onInsights);
    return () => {
      window.removeEventListener("ai-summary", onSummary);
      window.removeEventListener("ai-insights", onInsights);
    };
  }, [facility]);

  const breaches = useMemo(
    () => computeBreachesNow({ facility, history, thresholds: ALERT_THRESHOLDS }),
    [facility, history, ALERT_THRESHOLDS]
  );

  // pick representative sensors for each subsystem
  const latestByBase = useMemo(() => {
    const out = {};
    Object.entries(history || {})
      .filter(([k]) => k.startsWith(`${facility} •`))
      .forEach(([full, series]) => {
        const base = baseNameFromFull(full);
        const last = series?.[series.length - 1];
        if (!last || typeof last.y !== "number" || !last.x) return;
        out[full] = last;
      });
    return out;
  }, [facility, history]);

  const subsystems = useMemo(() => {
    const def = (label, key) => ({
      label,
      sensorKey: `${facility} • ${key}`,
    });

    const defs = [
      def("Cooling", "Temperature Sensor 1"),
      def("Humidity", "Humidity Sensor 1"),
      def("Air quality", "CO2 Sensor 1"),
      def("Lighting", "Light Sensor 1"),
    ];

    return defs.map((s) => {
      const last = latestByBase[s.sensorKey];
      const thr = ALERT_THRESHOLDS[s.sensorKey];
      const val = last ? last.y : null;
      const durationInfo = getBreachDurationInfo(s.sensorKey, history, ALERT_THRESHOLDS);
      const { sev, dir } = severityFromValue(val, thr);

      // build a small narrative for this subsystem
      let statusLine = "No recent data.";
      if (val != null && thr) {
        const dirWord =
          dir === "high" ? "high" : dir === "low" ? "low" : "within normal range";
        const durText =
          dir !== "ok" && durationInfo
            ? `, running ${dirWord} for about ${durationInfo.mins} min`
            : "";
        statusLine = `Latest: ${Math.round(val)} (${dirWord}${durText}, normal ${thr.min}–${thr.max}).`;
      }

      // local action suggestion
      let localAction = "";
      if (sev === "critical" || sev === "warn") {
        if (s.label === "Cooling") {
          localAction =
            dir === "high"
              ? "Increase cooling setpoints in the affected room or check the server/HVAC load."
              : "Check for overcooling or faulty thermostats; slightly raise temperature setpoint.";
        } else if (s.label === "Humidity") {
          localAction =
            dir === "high"
              ? "Enable dehumidification or increase fresh air intake; check for leaks or condensation."
              : "Consider reducing dehumidification or checking for over-dry conditions.";
        } else if (s.label === "Air quality") {
          localAction =
            dir === "high"
              ? "Increase fresh air or ventilation rate; verify CO₂ sensors and occupancy levels."
              : "Verify calibration if values are unexpectedly low.";
        } else if (s.label === "Lighting") {
          localAction =
            dir === "high"
              ? "Dim non-critical lighting or adjust lighting schedules in occupied zones."
              : "Check for failed fixtures or overly aggressive dimming.";
        }
      }

      return {
        ...s,
        latest: val,
        severity: sev,
        dir,
        statusLine,
        localAction,
      };
    });
  }, [facility, latestByBase, ALERT_THRESHOLDS, history]);

  // merge AI tips + local actions into one action list
  const combinedActions = useMemo(() => {
    const local = subsystems
      .filter((s) => s.localAction && s.severity !== "ok")
      .map((s) => `${s.label}: ${s.localAction}`);
    return [...(aiTips || []), ...local];
  }, [aiTips, subsystems]);

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm text-gray-200">AI Operations Board — {facility}</h3>
        <span className="text-[11px] text-gray-500">
          Live anomalies + actions
        </span>
      </div>

      {/* High-level AI summary (from LLM) */}
      <div className="text-xs text-gray-300">
        <div className="font-semibold mb-1">Current AI summary</div>
        {aiSummary ? (
          <p>{aiSummary}</p>
        ) : (
          <p className="text-gray-500">
            Waiting for AI panel to publish a summary…
          </p>
        )}
      </div>

      {/* Subsystem chips */}
      <div className="grid grid-cols-2 gap-3">
        {subsystems.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl p-3 border text-xs ${chipClasses(
              s.severity
            )}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold">{s.label}</div>
              <div className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    background:
                      s.severity === "critical"
                        ? "#f87171"
                        : s.severity === "warn"
                        ? "#facc15"
                        : s.severity === "ok"
                        ? "#4ade80"
                        : "#9ca3af",
                  }}
                />
                <span className="uppercase text-[10px] tracking-wide">
                  {s.severity === "critical"
                    ? "CRITICAL"
                    : s.severity === "warn"
                    ? "WARN"
                    : s.severity === "ok"
                    ? "OK"
                    : "UNKNOWN"}
                </span>
              </div>
            </div>
            <div className="text-[11px] leading-snug mb-1">
              {s.statusLine}
            </div>
            {s.localAction && (s.severity === "critical" || s.severity === "warn") && (
              <div className="mt-1 text-[11px]">
                <span className="font-semibold">Action:</span> {s.localAction}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Combined action list */}
      <div className="pt-2 border-t border-white/5 text-xs text-gray-300">
        <div className="font-semibold mb-1">AI action board</div>
        {combinedActions.length ? (
          <ul className="list-disc pl-5 space-y-1">
            {combinedActions.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">
            No urgent actions. Maintain current profiles and continue monitoring.
          </p>
        )}
      </div>

      {/* Recent anomalies count for vibes */}
      <div className="text-[11px] text-gray-500">
        Recent anomalies (last 5 min): {breaches.length}
      </div>
    </div>
  );
}
