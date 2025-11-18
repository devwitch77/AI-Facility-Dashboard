// dashboard/client/src/Reports.jsx
import { useEffect, useState, useMemo } from "react";
import { API_BASE } from "./lib/apiBase";

const forest = {
  panel: "#0c100e",
  panel2: "#0f1412",
  border: "#1d2320",
  ink: "#8FE3B3",
};

const REPORT_BASE = `${API_BASE.replace(/\/+$/, "")}/api/reports`;

export default function Reports({ facility = "Dubai" }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState(null);

  // initialise a 24h range (now - 24h → now)
  useEffect(() => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const toIso = now.toISOString().slice(0, 16);       // yyyy-MM-ddTHH:mm
    const fromIso = yesterday.toISOString().slice(0, 16);

    setTo(toIso);
    setFrom(fromIso);
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (facility) params.set("facility", facility);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    return params.toString();
  }, [facility, from, to]);

  const csvUrl = `${REPORT_BASE}/export.csv?${queryString}`;
  const pdfUrl = `${REPORT_BASE}/export.pdf?${queryString}`;

  async function loadSummary(e) {
    if (e) e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${REPORT_BASE}/summary?${queryString}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      console.error("Report summary fetch error:", err);
      setErr("Failed to load report summary from backend.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  const analytics = summary?.analytics;
  const range = summary?.range;

  return (
    <div
      className="rounded-2xl p-4 space-y-4"
      style={{ background: forest.panel, border: `1px solid ${forest.border}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm text-gray-200">
          Facility Reports — {facility}
        </h2>
        <span className="text-[11px] text-gray-500">Exports & summary</span>
      </div>

      {/* Filters */}
      <form
        className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"
        onSubmit={loadSummary}
      >
        <div>
          <div className="text-gray-400 mb-1">From</div>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-md bg-black/40 border border-gray-700 px-2 py-1 text-gray-100 text-xs"
          />
        </div>

        <div>
          <div className="text-gray-400 mb-1">To</div>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-md bg-black/40 border border-gray-700 px-2 py-1 text-gray-100 text-xs"
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="px-3 py-2 rounded-md text-xs font-semibold"
            style={{
              background: forest.panel2,
              border: `1px solid ${forest.border}`,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Loading…" : "Refresh summary"}
          </button>
        </div>
      </form>

      {err && (
        <div className="text-xs text-amber-300">
          {err}
        </div>
      )}

      {/* Summary panel */}
      {summary && (
        <div
          className="mt-2 p-3 rounded-xl text-xs text-gray-200 space-y-2"
          style={{
            background: forest.panel2,
            border: `1px solid ${forest.border}`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="font-semibold">Summary</div>
            {range && (
              <div className="text-[11px] text-gray-500">
                {new Date(range.from).toLocaleString()} →{" "}
                {new Date(range.to).toLocaleString()}
              </div>
            )}
          </div>
          {analytics ? (
            <ul className="space-y-1">
              <li>
                Stability:{" "}
                <span className="text-emerald-300 font-semibold">
                  {analytics.stableText}
                </span>
              </li>
              <li>
                Active alerts:{" "}
                <span className="text-red-300 font-semibold">
                  {analytics.activeAlerts}
                </span>
              </li>
              <li>
                Last anomaly time:{" "}
                <span className="text-sky-300">
                  {analytics.lastAnomaly}
                </span>
              </li>
            </ul>
          ) : (
            <p className="text-gray-400">
              No analytics data in this window.
            </p>
          )}
        </div>
      )}

      {/* Export buttons */}
      <div
        className="mt-2 p-3 rounded-xl text-xs text-gray-200 flex flex-wrap gap-3 items-center"
        style={{
          background: forest.panel2,
          border: `1px solid ${forest.border}`,
        }}
      >
        <div className="font-semibold mr-2">Exports</div>
        <a
          href={csvUrl}
          className="px-3 py-1 rounded border border-gray-600 bg-black/40 hover:bg-black/60"
        >
          Download CSV
        </a>
        <a
          href={pdfUrl}
          className="px-3 py-1 rounded border border-gray-600 bg-black/40 hover:bg-black/60"
          target="_blank"
          rel="noopener noreferrer"
        >
          Download PDF
        </a>
        <span className="text-[11px] text-gray-500 ml-auto">
          CSV for raw data • PDF for human-readable snapshot
        </span>
      </div>
    </div>
  );
}
