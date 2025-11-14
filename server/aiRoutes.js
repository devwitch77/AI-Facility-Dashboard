import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const router = express.Router();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

// Python proxy URL (optional)
const PY_AI_URL = process.env.PY_AI_URL || "http://127.0.0.1:7001";
const usePy = !!PY_AI_URL;

// --- Thresholds (must match dashboard) ---
const THRESHOLDS = {
  "Temperature Sensor 1": { min: 18, max: 28 },
  "Humidity Sensor 1":    { min: 30, max: 60 },
  "CO2 Sensor 1":         { min: 0,  max: 800 },
  "Light Sensor 1":       { min: 100, max: 700 },
};

// ---------- tiny fetch helper for the Python proxy ----------
async function pyPost(path, body) {
  const { default: fetch } = await import("node-fetch");
  const r = await fetch(`${PY_AI_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

// ---------- DB helpers ----------
async function fetchRecentSamplesFromDB(hours = 1) {
  const { rows } = await pool.query(`
    SELECT sensor_name AS sensor, value::float AS value, recorded_at AS time
    FROM sensor_data
    WHERE recorded_at >= NOW() - INTERVAL '${hours} hours'
    ORDER BY recorded_at ASC
    LIMIT 8000;
  `);
  return rows;
}

// ---------- math helpers ----------
function movingSlope(vals) {
  const n = Math.min(12, vals.length);
  if (n < 3) return 0;
  const y = vals.slice(-n);
  const x = Array.from({ length: n }, (_, i) => i + 1);
  const mean = (a) => a.reduce((p, c) => p + c, 0) / a.length;
  const mx = mean(x), my = mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  return den ? num / den : 0;
}

function trendWord(slope, absScale = 0.08) {
  if (slope > absScale) return "rising";
  if (slope < -absScale) return "falling";
  return "steady";
}

function fmtTime(d) {
  try {
    return new Date(d).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function sensorType(sensorName) {
  const s = sensorName.toLowerCase();
  if (s.includes("temp")) return "Temperature";
  if (s.includes("humid")) return "Humidity";
  if (s.includes("co2")) return "CO₂";
  if (s.includes("light")) return "Light";
  return "Sensor";
}

// Walk back to find the last time it was IN range → breach start
function breachStartForSensor(samples, thr) {
  if (!samples?.length || !thr) return null;
  // samples sorted ASC by time
  for (let i = samples.length - 1; i >= 0; i--) {
    const v = Number(samples[i]?.value);
    if (Number.isFinite(v) && v >= thr.min && v <= thr.max) {
      const next = samples[i + 1];
      return next?.time || samples[i]?.time;
    }
  }
  // never in range in the window → start at first point
  return samples[0]?.time || null;
}

// ---------- general scoring ----------
function aggregate(samples = []) {
  const out = {};
  for (const s of samples) {
    const name = s.sensor || s.sensor_name || s.name;
    const v = Number(s.value);
    if (!name || !Number.isFinite(v)) continue;
    (out[name] ||= []).push(v);
  }
  return out;
}

function statsFromArray(arr) {
  if (!arr?.length) return { mean: 0, std: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd =
    Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length) || 0;
  return { mean, std: sd };
}

/**
 * Old z-score based score (kept for continuity).
 */
function computeScoreUsing(arrBySensor, baselines = {}) {
  const issues = [];
  for (const [name, arr] of Object.entries(arrBySensor)) {
    if (!arr.length) continue;
    const last = arr[arr.length - 1];
    const base = baselines[name] || statsFromArray(arr);
    const std = base.std > 1e-6 ? base.std : 1;
    const z = (last - base.mean) / std;
    if (Math.abs(z) > 1.2)
      issues.push({
        sensor: name,
        z: +z.toFixed(2),
        last: +Number(last).toFixed(2),
      });
  }
  issues.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const stability = Math.max(0, 100 - Math.min(100, issues.length * 8));
  return { stability: Math.round(stability), issues: issues.slice(0, 6) };
}

/**
 * New: threshold-based stability so HUD + AI feel aligned.
 * Looks only at "is the last reading inside THRESHOLDS".
 */
function stabilityFromThresholds(arrBySensor) {
  let total = 0;
  let breaches = 0;
  for (const [name, arr] of Object.entries(arrBySensor)) {
    if (!arr.length) continue;
    const thr = THRESHOLDS[name];
    if (!thr) continue;
    const last = Number(arr[arr.length - 1]);
    if (!Number.isFinite(last)) continue;
    total++;
    if (last < thr.min || last > thr.max) breaches++;
  }
  if (!total) return 100;
  const ratio = breaches / total; // 0 → all good, 1 → all bad
  const s = Math.round(100 * (1 - ratio));
  return Math.max(0, Math.min(100, s));
}

/**
 * Blend z-score stability with threshold stability, and clamp.
 * Also expose `score` alias so any UI reading `score` doesn't get 0.
 */
function harmonizedStability(arrBySensor) {
  const { stability: zStability, issues } = computeScoreUsing(
    arrBySensor,
    {}
  );
  const thStability = stabilityFromThresholds(arrBySensor);

  // If we have no z-issues, trust thresholds more.
  let stability;
  if (!issues.length) {
    stability = thStability;
  } else {
    // blend, but keep it within 0–100
    stability = Math.round((zStability * 0.4 + thStability * 0.6));
  }
  stability = Math.max(0, Math.min(100, stability));
  return { stability, issues };
}

// ========== ROUTES ==========

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    llm: !!process.env.OPENAI_API_KEY && process.env.USE_LLM === "1",
    pyProxy: usePy,
    pyUrl: PY_AI_URL || null,
  });
});

// ---- /score: used by AI panel + any "stability %" cards
router.post("/score", async (req, res) => {
  try {
    const facility = String(req.body?.facility || "Global");
    let samples = Array.isArray(req.body?.samples) ? req.body.samples : null;
    if (!samples || samples.length === 0)
      samples = await fetchRecentSamplesFromDB(1);

    // If Python AI exists, let it respond first
    if (usePy) {
      try {
        const r = await pyPost("/score", {
          facility,
          samples,
          thresholds: THRESHOLDS,
        });
        if (r.ok) return res.json(r.json);
        console.error("PY /score failed", r.status, r.json);
      } catch (e) {
        console.error("PY /score error:", e);
      }
    }

    // Fallback JS score (now harmonized)
    const grouped = aggregate(samples);
    const { stability, issues } = harmonizedStability(grouped);

    res.json({
      facility,
      stability,
      score: stability, // alias, so any UI expecting `score` won't get 0
      topIssues: issues,
      usedBaselines: false,
    });
  } catch (e) {
    console.error("AI /score error:", e);
    res.status(500).json({ error: "ai_score_failed" });
  }
});

// ---- /summary (kept for AIPanel; can still sound a bit formal)
router.post("/summary", async (req, res) => {
  try {
    const facility = String(req.body?.facility || "Global");
    let samples = Array.isArray(req.body?.samples) ? req.body.samples : null;
    if (!samples || samples.length === 0)
      samples = await fetchRecentSamplesFromDB(1);

    if (usePy) {
      try {
        const r = await pyPost("/summary", {
          facility,
          samples,
          thresholds: THRESHOLDS,
        });
        if (r.ok) return res.json(r.json);
        console.error("PY /summary failed", r.status, r.json);
      } catch (e) {
        console.error("PY /summary error:", e);
      }
    }

    const grouped = aggregate(samples);
    const { stability, issues } = harmonizedStability(grouped);
    const summary = issues.length
      ? `${facility} is ${stability}% stable. Notable anomalies: ${issues
          .map(
            (i) => `${i.sensor} (score=${i.z}, last=${i.last})`
          )
          .join(", ")}.`
      : `${facility} is ${stability}% stable. No significant anomalies.`;

    res.json({
      facility,
      stability,
      score: stability,
      topIssues: issues,
      summary,
    });
  } catch (e) {
    console.error("AI /summary error:", e);
    res.status(500).json({ error: "ai_summary_failed" });
  }
});

// ---- /retrain (still a no-op baseline store; Python can handle real retrain)
router.post("/retrain", async (req, res) => {
  try {
    const facility = String(req.body?.facility || "Global");
    let samples = Array.isArray(req.body?.samples) ? req.body.samples : null;
    if (!samples || samples.length === 0)
      samples = await fetchRecentSamplesFromDB(24);

    if (usePy) {
      try {
        const r = await pyPost("/train", { facility, samples });
        if (r.ok) return res.json(r.json);
        console.error("PY /train failed", r.status, r.json);
      } catch (e) {
        console.error("PY /train error:", e);
      }
    }

    res.json({ ok: true, facility });
  } catch (e) {
    console.error("AI /retrain error:", e);
    res.status(500).json({ error: "ai_retrain_failed" });
  }
});

// ---- /insights (natural language for voice + tips)
router.post("/insights", async (req, res) => {
  try {
    const facility = String(req.body?.facility || "Global");
    // If the UI sends recent in-memory samples, we’ll take them; else pull last hour from DB
    let samples = Array.isArray(req.body?.samples) ? req.body.samples : null;
    if (!samples || samples.length === 0) {
      samples = await fetchRecentSamplesFromDB(1);
    }

    // Build per-sensor arrays with timestamps
    const bySensor = {};
    for (const s of samples) {
      const name = s.sensor || s.sensor_name || s.name;
      const v = Number(s.value);
      const t = s.time ? new Date(s.time) : null;
      if (!name || !Number.isFinite(v) || !t) continue;
      (bySensor[name] ||= []).push({ value: v, time: t });
    }
    // keep last ~120 points per sensor to make the “since” and “trend” snappy
    Object.values(bySensor).forEach((arr) =>
      arr.splice(0, Math.max(0, arr.length - 120))
    );

    // Determine anomalies vs thresholds
    const breaches = [];
    for (const [name, arr] of Object.entries(bySensor)) {
      if (!arr.length) continue;
      const thr = THRESHOLDS[name];
      const last = arr[arr.length - 1]?.value;
      if (!thr || typeof last !== "number") continue;

      const status = last < thr.min ? "low" : last > thr.max ? "high" : null;
      if (!status) continue;

      const start = breachStartForSensor(arr, thr);
      const slope = movingSlope(arr.map((p) => p.value));
      breaches.push({
        sensor: name,
        type: sensorType(name),
        status,
        last: +last.toFixed(2),
        since: start ? fmtTime(start) : null,
        trend: trendWord(slope),
      });
    }

    // Build a human sentence
    let summary = "";
    const tips = [];

    if (breaches.length === 0) {
      summary = `${facility}: all core sensors look stable right now.`;
    } else {
      // Group sensors by type
      const byType = {};
      breaches.forEach((b) => {
        (byType[b.type] ||= []).push(b);
      });

      const typePhrases = Object.entries(byType).map(([type, list]) => {
        const highs = list.filter((b) => b.status === "high").length;
        const lows = list.filter((b) => b.status === "low").length;
        const anySince = list.find((b) => b.since)?.since;
        const trendSet = new Set(list.map((b) => b.trend));
        const trend = trendSet.has("rising")
          ? "rising"
          : trendSet.has("falling")
          ? "falling"
          : "steady";

        const side =
          highs && lows
            ? "instability"
            : highs
            ? "running high"
            : "running low";

        return `${type} ${side}${anySince ? ` since ${anySince}` : ""} (${trend})`;
      });

      summary = `${facility}: ${typePhrases.join("; ")}.`;

      // Actionable tips
      const typesPresent = new Set(breaches.map((b) => b.type));
      if (typesPresent.has("Temperature")) {
        tips.push(
          "Check HVAC setpoints and recent occupancy; verify airflow and filters."
        );
      }
      if (typesPresent.has("Humidity")) {
        tips.push(
          "Inspect humidification/dehumidification controls and door/window seals."
        );
      }
      if (typesPresent.has("CO₂")) {
        tips.push(
          "Increase fresh air intake; confirm ventilation schedules and damper positions."
        );
      }
      if (typesPresent.has("Light")) {
        tips.push(
          "Review lighting schedules/sensors; check daylight override conditions."
        );
      }
      if (breaches.some((b) => b.trend === "rising")) {
        tips.push(
          "Consider a temporary override to prevent further drift while investigating."
        );
      }
    }

    // Optionally let Python LLM rewrite the sentence more elegantly if available
    if (usePy && process.env.USE_LLM === "1") {
      try {
        const r = await pyPost("/insights", { facility, summary, breaches });
        if (r.ok && r.json?.summary) {
          summary = r.json.summary;
          if (Array.isArray(r.json.tips) && r.json.tips.length) {
            tips.splice(0, tips.length, ...r.json.tips);
          }
        }
      } catch (e) {
        // keep local summary
      }
    }

    res.json({
      ok: true,
      facility,
      summary, // human line for the announcer / voice
      tips, // actionable list for GenerateInsights
      breaches, // optional detail if you want a table
    });
  } catch (e) {
    console.error("AI /insights error:", e);
    res.status(500).json({ error: "ai_insights_failed" });
  }
});

export default router;
