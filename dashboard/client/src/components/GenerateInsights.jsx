import { useEffect, useState } from "react";

const API_BASE =
  (import.meta.env.VITE_API_BASE && import.meta.env.VITE_API_BASE.replace(/\/+$/,"")) ||
  "http://localhost:5000";

export default function GenerateInsights({ facility, history }) {
  const [insight, setInsight] = useState(null);
  const [err, setErr] = useState("");

  const buildSamples = () => {
    const out = [];
    Object.entries(history || {}).forEach(([full, series]) => {
      if (!full.startsWith(`${facility} •`)) return;
      const base = full.split("•")[1]?.trim() || full;
      (series || []).slice(-60).forEach(pt => {
        if (typeof pt?.y === "number" && pt?.x) {
          out.push({ facility, sensor: base, value: pt.y, time: new Date(pt.x).toISOString() });
        }
      });
    });
    return out;
  };

  const run = async () => {
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/ai/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility, samples: buildSamples() }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const j = await r.json();
      setInsight(j);
    } catch (e) {
      setErr(`Insights unavailable (${e.message})`);
    }
  };

  useEffect(() => { run(); }, [facility]);

  return (
    <div className="rounded-xl p-3 mt-3" style={{ background:"#0f1412", border:"1px solid #1d2320" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Generate Insights (Live) — {facility}</div>
        <button onClick={run} className="px-2 py-1 text-xs rounded border border-white/15 bg-white/5 hover:bg-white/10">
          Refresh
        </button>
      </div>
      {err ? <div className="text-xs text-amber-300">{err}</div> : null}
      {insight ? (
        <div className="text-sm text-gray-200">
          {insight.summary}
          {Array.isArray(insight.tips) && insight.tips.length ? (
            <ul className="list-disc pl-5 mt-2 text-xs text-gray-300">
              {insight.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          ) : null}
        </div>
      ) : <div className="text-xs text-gray-400">No insight yet.</div>}
    </div>
  );
}
