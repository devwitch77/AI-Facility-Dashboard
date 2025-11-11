// client/src/components/AiPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";

const API_BASE =
  (import.meta.env.VITE_API_BASE && import.meta.env.VITE_API_BASE.replace(/\/+$/, "")) ||
  "http://localhost:5000";

const socket = io(API_BASE, { transports: ["websocket"] });

export default function AiPanel({ facility, history = {}, analytics }) {
  const [score, setScore] = useState(null);
  const [summary, setSummary] = useState("");
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState({ score: false, summary: false, retrain: false });
  const [err, setErr] = useState("");
  const [auto, setAuto] = useState(true);
  const [llmEnabled, setLlmEnabled] = useState(null);
  const [lastAt, setLastAt] = useState(null);
  const autoRef = useRef(true);
  autoRef.current = auto;

  
  const samples = useMemo(() => {
    const out = [];
    const keys = Object.keys(history).filter((k) =>
      facility === "Global" ? true : k.startsWith(`${facility} •`)
    );
    for (const k of keys) {
      const series = Array.isArray(history[k]) ? history[k] : [];
      for (const p of series.slice(-40)) {
        const val = typeof p?.y === "number" ? p.y : null;
        const t = p?.x ? new Date(p.x).toISOString() : null;
        if (val !== null && t) {
          const parts = k.split("•");
          const base = parts.length > 1 ? parts[1].trim() : k.trim();
          out.push({ sensor: base, value: val, time: t, facility });
        }
      }
    }
    return out;
  }, [history, facility]);

  const post = async (path, body, key) => {
    if (key) setLoading((s) => ({ ...s, [key]: true }));
    try {
      const r = await fetch(`${API_BASE}/api/ai/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`${path} ${r.status}`);
      setErr("");
      return await r.json();
    } catch (e) {
      setErr(`API error: ${e.message}`);
      return null;
    } finally {
      if (key) setLoading((s) => ({ ...s, [key]: false }));
    }
  };

  const runScore = async () => {
    const j = await post("score", { facility, samples }, "score");
    if (j) {
      setScore({
        facility: j.facility,
        stability: Number(j.stability ?? 0),
        usedBaselines: !!j.usedBaselines,
        topIssues: Array.isArray(j.topIssues) ? j.topIssues : [],
      });
      setLastAt(new Date());
    }
  };

  const runSummary = async () => {
    const j = await post("summary", { facility, samples }, "summary");
    if (j) {
      setSummary(j.summary || "");
      setTips(Array.isArray(j.tips) ? j.tips : []);
      setLastAt(new Date());
    }
  };

  const handleRetrain = async () => {
    const j = await post("retrain", { facility, samples }, "retrain");
    if (j) {
      await runScore();
      await runSummary();
    }
  };

 
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/ai/ping`);
        const j = await r.json();
        if (!ignore) setLlmEnabled(!!j?.llm);
      } catch {
        if (!ignore) setLlmEnabled(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    runScore();
    runSummary();
  }, [facility]);

  useEffect(() => {
    const id = setInterval(() => {
      if (autoRef.current) {
        runScore();
        runSummary();
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onAlert = () => {
      if (autoRef.current) {
        runScore();
        runSummary();
      }
    };
    socket.on("sensor-alert", onAlert);
    return () => socket.off("sensor-alert", onAlert);
  }, []);

  const stabilityBadge =
    score?.stability >= 95 ? "text-emerald-300" :
    score?.stability >= 85 ? "text-amber-300" :
    "text-red-300";

  return (
    <div className="rounded-2xl p-4 mb-4" style={{ background: "#0c100e", border: "1px solid #1d2320" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">AI Insights — {facility}</h3>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-300 flex items-center gap-1">
            <input type="checkbox" checked={auto} onChange={(e)=>setAuto(e.target.checked)} />
            Auto refresh
          </label>
          <button onClick={runScore} disabled={loading.score} className="px-3 py-1.5 rounded border border-white/15 bg-white/5 hover:bg-white/10">
            {loading.score ? "Scoring…" : "Score"}
          </button>
          <button onClick={runSummary} disabled={loading.summary} className="px-3 py-1.5 rounded border border-white/15 bg-white/5 hover:bg-white/10">
            {loading.summary ? "Summarizing…" : "Summary"}
          </button>
          <button onClick={handleRetrain} disabled={loading.retrain} className="px-3 py-1.5 rounded border border-white/15 bg-white/5 hover:bg-white/10">
            {loading.retrain ? "Re-training…" : "Re-train"}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-400 mb-2">
        {lastAt ? <>Last updated: {lastAt.toLocaleTimeString()}</> : "—"}
        {llmEnabled === false && !summary ? (
          <> • LLM disabled — add <code>OPENAI_API_KEY</code> + <code>USE_LLM=1</code> to <code>server/.env</code> and restart.</>
        ) : null}
      </div>

      {/* Heuristic (client) */}
      <div className="text-sm text-gray-300 mb-3">
        <strong>Heuristic</strong> — {analytics?.stableText} • Alerts: {analytics?.activeAlerts} • Dev: {analytics?.avgDeviation} • Last: {analytics?.lastAnomaly}
      </div>

      {/* Score cards */}
      {score && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="rounded-xl p-3" style={{ background: "#0f1412", border: "1px solid #1d2320" }}>
              <div className="text-xs text-gray-400 mb-1">Stability</div>
              <div className={`text-xl font-bold ${stabilityBadge}`}>{score.stability}%</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: "#0f1412", border: "1px solid #1d2320" }}>
              <div className="text-xs text-gray-400 mb-1">Baselines</div>
              <div className="text-sm">{score.usedBaselines ? "Trained" : "Ad-hoc"}</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: "#0f1412", border: "1px solid #1d2320" }}>
              <div className="text-xs text-gray-400 mb-1">Issues</div>
              <div className="text-sm">{score.topIssues?.length || 0}</div>
            </div>
          </div>

          {}
          {score.topIssues?.length ? (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-sm">
                <thead className="text-gray-400">
                  <tr>
                    <th className="text-left py-1 pr-3">Sensor</th>
                    <th className="text-left py-1 pr-3">Last</th>
                    <th className="text-left py-1 pr-3">Score/Z</th>
                    <th className="text-left py-1">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {score.topIssues.map((i, idx) => {
                    const hasIF = typeof i.score === "number";
                    const sev =
                      hasIF
                        ? (i.score <= -0.2 ? "High" : i.score <= -0.05 ? "Moderate" : "Low")
                        : (Math.abs(i.z ?? 0) >= 2.5 ? "High" : Math.abs(i.z ?? 0) >= 1.8 ? "Moderate" : "Low");

                    const color =
                      sev === "High" ? "text-red-300" :
                      sev === "Moderate" ? "text-amber-300" :
                      "text-emerald-300";

                    return (
                      <tr key={idx} className="border-t border-white/5">
                        <td className="py-1 pr-3">
                          {i.sensor}
                          {i.thresholdBreach ? (
                            <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 border border-red-500/30">TH</span>
                          ) : null}
                        </td>
                        <td className="py-1 pr-3">{i.last}</td>
                        <td className="py-1 pr-3">{hasIF ? i.score : (i.z ?? "")}</td>
                        <td className={`py-1 ${color}`}>{sev}{i.status ? ` • ${i.status}` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-400 mb-3">No notable drifts in the recent window.</div>
          )}
        </>
      )}

      {}
      {summary && (
        <div className="text-sm mb-2">
          <div className="font-semibold mb-1">LLM Summary</div>
          <div className="text-gray-200" style={{ background:"#0f1412", border:"1px solid #1d2320", borderRadius:8, padding:12 }}>
            {summary}
          </div>
        </div>
      )}

      {tips?.length ? (
        <ul className="list-disc pl-5 text-sm text-gray-300" style={{ marginTop: 6 }}>
          {tips.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      ) : null}

      {err && <div className="mt-2 text-sm text-red-300">⚠ {err}</div>}
    </div>
  );
}
