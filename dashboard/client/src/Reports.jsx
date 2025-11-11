// client/src/Reports.jsx
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "./ThemeContext";
import { useFacility } from "./FacilityContext";

export default function Reports() {
  const { bundles } = useTheme();
  const { facility: activeFacility } = useFacility();

  // UI state (same look, now powered by API)
  const [facility, setFacility] = useState(activeFacility || "Dubai");
  const [fromISO, setFromISO] = useState(() => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return d.toISOString();
  });
  const [toISO, setToISO] = useState(() => new Date().toISOString());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [analytics, setAnalytics] = useState({
    stableText: "—",
    lastAnomaly: "—",
    activeAlerts: 0,
  });

  // Fetch summary when scope changes
  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const q = new URLSearchParams({
          facility,
          from: fromISO,
          to: toISO,
        }).toString();

        const r = await fetch(`/api/reports/summary?${q}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();

        if (!ignore) {
          // Expecting { ok:true, analytics:{ stableText, lastAnomaly, activeAlerts }, ... }
          const a = j?.analytics || {};
          setAnalytics({
            stableText: a.stableText ?? "—",
            lastAnomaly: a.lastAnomaly ?? "—",
            activeAlerts: typeof a.activeAlerts === "number" ? a.activeAlerts : 0,
          });
        }
      } catch (e) {
        if (!ignore) setErr("Could not load report (404 / summary).");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [facility, fromISO, toISO]);

  // Keep your existing “summary tiles” look
  const tiles = useMemo(
    () => ([
      { k: "System Status", v: analytics.stableText },
      { k: "Last Anomaly", v: analytics.lastAnomaly },
      { k: "Active Alerts", v: String(analytics.activeAlerts) },
      { k: "Report Scope", v: "Custom" },
    ]),
    [analytics]
  );

  const exportCSV = async () => {
    try {
      const q = new URLSearchParams({ facility, from: fromISO, to: toISO }).toString();
      const r = await fetch(`/api/reports/export.csv?${q}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${facility.toLowerCase()}-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Could not export CSV.");
    }
  };

  const exportPDF = async () => {
    try {
      const q = new URLSearchParams({ facility, from: fromISO, to: toISO }).toString();
      const r = await fetch(`/api/reports/export.pdf?${q}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${facility.toLowerCase()}-report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Could not export PDF.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Scope controls (kept minimal, same page look) */}
      <div className={`rounded-xl p-4 ${bundles.panel}`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs opacity-80 block mb-1">Facility</label>
            <select
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
              className="px-3 py-2 rounded border border-white/10 bg-black/20"
            >
              <option>Dubai</option>
              <option>London</option>
              <option>Tokyo</option>
            </select>
          </div>
          <div>
            <label className="text-xs opacity-80 block mb-1">From (ISO)</label>
            <input
              type="datetime-local"
              value={toLocalDT(fromISO)}
              onChange={(e) => setFromISO(fromLocalDT(e.target.value))}
              className="px-3 py-2 rounded border border-white/10 bg-black/20"
            />
          </div>
          <div>
            <label className="text-xs opacity-80 block mb-1">To (ISO)</label>
            <input
              type="datetime-local"
              value={toLocalDT(toISO)}
              onChange={(e) => setToISO(fromLocalDT(e.target.value))}
              className="px-3 py-2 rounded border border-white/10 bg-black/20"
            />
          </div>
          <div className="text-sm opacity-80">
            {loading ? "Loading…" : err ? <span className="text-amber-300">{err}</span> : " "}
          </div>
        </div>
      </div>

      {/* Summary tiles (unchanged look) */}
      <div id="reports-shot" className={`rounded-xl p-4 ${bundles.panel}`}>
        <h2 className={`text-lg font-semibold mb-3`}>Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tiles.map(t => <Tile key={t.k} k={t.k} v={t.v} />)}
        </div>
      </div>

      {/* Export actions (unchanged look) */}
      <div className={`rounded-xl p-4 ${bundles.panel} flex gap-3`}>
        <button onClick={exportCSV} className={`${bundles.btn} px-4 py-2 rounded`}>Export CSV</button>
        <button onClick={exportPDF} className={`${bundles.btnPrimary} px-4 py-2 rounded`}>Export PDF</button>
      </div>
    </div>
  );
}

function Tile({ k, v }) {
  return (
    <div className="rounded-lg border border-white/10 p-3">
      <div className="text-xs opacity-80">{k}</div>
      <div className="text-xl font-bold">{v}</div>
    </div>
  );
}

// ---------- helpers for datetime-local <-> ISO ----------
function toLocalDT(iso) {
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return "";
  }
}
function fromLocalDT(local) {
  try {
    const d = new Date(local);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  } catch {
    return new Date().toISOString();
  }
}
