// src/components/AIPanel.jsx
import { useState, useEffect } from "react";
import { speak, cancelAll } from "../lib/tts";

const forest = {
  panel: "#0c100e",
  panel2: "#0f1412",
  border: "#1d2320",
  ink: "#8FE3B3",
};

async function apiPost(path, body) {
  const res = await fetch(`/api/ai${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

export default function AiPanel({ facility, analytics }) {
  const [busySummary, setBusySummary] = useState(false);
  const [busyScore, setBusyScore] = useState(false);
  const [busyTrain, setBusyTrain] = useState(false);
  const [busyInsights, setBusyInsights] = useState(false);

  const [summary, setSummary] = useState("");
  const [summaryErr, setSummaryErr] = useState("");

  const [modelStability, setModelStability] = useState(null);
  const [modelIssues, setModelIssues] = useState([]);
  const [scoreErr, setScoreErr] = useState("");

  const [insightsSummary, setInsightsSummary] = useState("");
  const [insightsTips, setInsightsTips] = useState([]);
  const [insightsErr, setInsightsErr] = useState("");
  const [lastRetrainMsg, setLastRetrainMsg] = useState("");

  // heuristic stability from dashboard analytics
  const stabilityValue = analytics?.stableValue ?? 100;
  const stabilityText = analytics?.stableText ?? `${stabilityValue}% stable`;
  const activeAlerts = analytics?.activeAlerts ?? 0;

  // 🔁 refresh natural-language summary (LLM) + (optionally) speak it
  const handleRefreshSummary = async ({ silent = false } = {}) => {
    setBusySummary(true);
    setSummaryErr("");
    try {
      const { ok, status, json } = await apiPost("/summary", { facility });
      if (!ok) throw new Error(`HTTP ${status}`);

      const line =
        json?.summary ||
        `System in ${facility} is ${stabilityText.toLowerCase()} with ${activeAlerts} active alert(s).`;

      setSummary(line);

      // broadcast to other components (GenerateInsights)
      window.dispatchEvent(
        new CustomEvent("ai-summary", {
          detail: { facility, summary: line },
        })
      );

      if (!silent) {
        cancelAll();
        speak(line, { rate: 1.0, pitch: 1.0, volume: 1.0 });
      }
    } catch (e) {
      setSummaryErr("AI summary unavailable. Showing heuristic status only.");
    } finally {
      setBusySummary(false);
    }
  };

  // 📊 call /score to get backend model stability + top issues
  const handleScoreNow = async () => {
    setBusyScore(true);
    setScoreErr("");
    try {
      const { ok, status, json } = await apiPost("/score", { facility });
      if (!ok) throw new Error(`HTTP ${status}`);
      const stab = typeof json?.stability === "number" ? json.stability : null;
      const issues = Array.isArray(json?.topIssues) ? json.topIssues : [];

      setModelStability(stab);
      setModelIssues(issues);

      // broadcast to other components
      window.dispatchEvent(
        new CustomEvent("ai-score", {
          detail: {
            facility,
            modelStability: stab,
            topIssues: issues,
          },
        })
      );
    } catch (e) {
      setScoreErr("Failed to compute AI score from backend.");
      setModelIssues([]);
      setModelStability(null);
    } finally {
      setBusyScore(false);
    }
  };

  // 🧠 retrain backend baselines
  const handleRetrain = async () => {
    setBusyTrain(true);
    setLastRetrainMsg("");
    try {
      const { ok, status } = await apiPost("/retrain", { facility });
      if (!ok) throw new Error(`HTTP ${status}`);
      const msg = `Retrain request sent for ${facility}. New baselines will be used for future scoring.`;
      setLastRetrainMsg(msg);
      cancelAll();
      speak(msg, { rate: 1.0, pitch: 1.0, volume: 1.0 });
    } catch (e) {
      setLastRetrainMsg("Failed to trigger retrain on backend.");
    } finally {
      setBusyTrain(false);
    }
  };

  // 🧩 higher-level insights (breaches/tips) – optionally silent
  const handleInsights = async ({ silent = false } = {}) => {
    setBusyInsights(true);
    setInsightsErr("");
    try {
      const { ok, status, json } = await apiPost("/insights", { facility });
      if (!ok) throw new Error(`HTTP ${status}`);

      const sum =
        json?.summary ||
        `There are ${Array.isArray(json?.breaches) ? json.breaches.length : 0} current anomalies in ${facility}.`;

      const tips = Array.isArray(json?.tips) ? json.tips : [];

      setInsightsSummary(sum);
      setInsightsTips(tips);

      // broadcast to other components
      window.dispatchEvent(
        new CustomEvent("ai-insights", {
          detail: {
            facility,
            summary: sum,
            tips,
          },
        })
      );

      if (!silent) {
        cancelAll();
        speak(sum, { rate: 1.0, pitch: 1.0, volume: 1.0 });
      }
    } catch (e) {
      setInsightsErr("Failed to generate AI insights from backend.");
      setInsightsTips([]);
      setInsightsSummary("");
    } finally {
      setBusyInsights(false);
    }
  };

  // 🔁 Auto-refresh: summary + score + insights every 30s (silent)
  useEffect(() => {
    // reset local state when facility changes
    setSummary("");
    setSummaryErr("");
    setModelStability(null);
    setModelIssues([]);
    setScoreErr("");
    setInsightsSummary("");
    setInsightsTips([]);
    setInsightsErr("");
    setLastRetrainMsg("");

    // initial fetch
    handleScoreNow();
    handleInsights({ silent: true });
    handleRefreshSummary({ silent: true });

    const id = setInterval(() => {
      handleScoreNow();
      handleInsights({ silent: true });
      handleRefreshSummary({ silent: true });
    }, 30000);

    return () => clearInterval(id);
    // we intentionally keep deps minimal so we only restart on facility change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facility]);

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{ background: forest.panel, border: `1px solid ${forest.border}` }}
    >
      {/* HEADER + HEURISTIC STABILITY (your analytics) */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm text-gray-300">AI Facility Intelligence — {facility}</h3>
        <span className="text-[11px] text-gray-500">
          {/* reserved for small status text if you want later */}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Stability circle from analytics */}
        <div className="w-20 h-20 rounded-full flex items-center justify-center border-2 border-emerald-400">
          <span className="text-lg font-bold text-emerald-300">
            {stabilityValue}%
          </span>
        </div>
        <div className="text-sm space-y-1">
          <div className="text-xs text-gray-400 uppercase">Heuristic stability</div>
          <div className="text-emerald-300 font-semibold">
            {stabilityText}
          </div>
          <div className="text-xs text-gray-400">
            Active alerts:{" "}
            <span className="text-red-300 font-semibold">
              {activeAlerts}
            </span>
          </div>
          {modelStability !== null && (
            <div className="text-xs text-gray-400">
              Model score:{" "}
              <span className="text-sky-300 font-semibold">
                {modelStability}%
              </span>{" "}
              (from /score)
            </div>
          )}
        </div>
      </div>

      {/* CONTROL ROW: SCORE / RETRAIN / INSIGHTS / SUMMARY */}
      <div
        className="mt-2 p-3 rounded-xl flex flex-wrap gap-2 items-center"
        style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
      >
        <button
          onClick={handleScoreNow}
          disabled={busyScore}
          className="px-3 py-1 rounded text-xs"
          style={{
            background: forest.panel,
            border: `1px solid ${forest.border}`,
            opacity: busyScore ? 0.6 : 1,
          }}
        >
          {busyScore ? "Scoring…" : "Score now"}
        </button>

        <button
          onClick={handleRetrain}
          disabled={busyTrain}
          className="px-3 py-1 rounded text-xs"
          style={{
            background: forest.panel,
            border: `1px solid ${forest.border}`,
            opacity: busyTrain ? 0.6 : 1,
          }}
        >
          {busyTrain ? "Retraining…" : "Retrain baselines"}
        </button>

        <button
          onClick={() => handleInsights({ silent: false })}
          disabled={busyInsights}
          className="px-3 py-1 rounded text-xs"
          style={{
            background: forest.panel,
            border: `1px solid ${forest.border}`,
            opacity: busyInsights ? 0.6 : 1,
          }}
        >
          {busyInsights ? "Analyzing…" : "Insights"}
        </button>

        <button
          onClick={() => handleRefreshSummary({ silent: false })}
          disabled={busySummary}
          className="px-3 py-1 rounded text-xs ml-auto"
          style={{
            background: forest.panel,
            border: `1px solid ${forest.border}`,
            opacity: busySummary ? 0.6 : 1,
          }}
        >
          {busySummary ? "Talking…" : "Refresh summary"}
        </button>
      </div>

      {/* MODEL ISSUES FROM /score */}
      {scoreErr && (
        <div className="text-xs text-amber-300">
          {scoreErr}
        </div>
      )}
      {modelIssues?.length ? (
        <div className="text-xs text-gray-300">
          <div className="font-semibold mb-1">Top model anomalies</div>
          <ul className="space-y-1">
            {modelIssues.map((i, idx) => (
              <li key={idx}>
                <span className="text-sky-300">{i.sensor}</span>{" "}
                <span className="text-gray-400">
                  (z = {i.z}, last = {i.last})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* RETRAIN STATUS */}
      {lastRetrainMsg && (
        <div className="text-xs text-gray-300">
          <span className="font-semibold">Retrain: </span>
          {lastRetrainMsg}
        </div>
      )}

      {/* LLM SUMMARY */}
      {summaryErr && (
        <div className="text-xs text-amber-300 mb-1">
          {summaryErr}
        </div>
      )}
      <div className="text-xs text-gray-300">
        <div className="font-semibold mb-1">Latest AI summary</div>
        {summary ? (
          <p>{summary}</p>
        ) : (
          <p className="text-gray-500">
            Waiting for AI to summarize current facility state…
          </p>
        )}
      </div>

      {/* INSIGHTS + TIPS */}
      {insightsErr && (
        <div className="text-xs text-amber-300 mb-1">
          {insightsErr}
        </div>
      )}
      {(insightsSummary || (insightsTips && insightsTips.length)) && (
        <div className="text-xs text-gray-300">
          <div className="font-semibold mb-1">Insights</div>
          {insightsSummary && <p className="mb-1">{insightsSummary}</p>}
          {insightsTips?.length ? (
            <ul className="list-disc pl-5 space-y-1">
              {insightsTips.map((t, idx) => (
                <li key={idx}>{t}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
