
import { useEffect, useRef, useState } from "react";
import { useFacility } from "../FacilityContext";
import { socket } from "../socket";
import { speak, cancelAll, isPaused } from "../lib/tts";

export default function MapHud() {
  const { facility } = useFacility();
  const [alerts, setAlerts] = useState([]);

  const [hudMuted, setHudMuted] = useState(false);

  const hudRef = useRef({ hudMuted: false });
  useEffect(() => {
    hudRef.current.hudMuted = hudMuted;
    if (hudMuted) cancelAll();
  }, [hudMuted]);

  const say = (txt) => {
    if (!txt) return;
    if (hudRef.current.hudMuted || isPaused()) return; 
    speak(txt, { rate: 1.02, pitch: 1.0, volume: 1.0 });
  };

  useEffect(() => {
    let mounted = true;

    const onAll = (arr = []) => {
      if (!mounted) return;
      setAlerts(arr.slice(0, 60));
    };

    const onOne = (a) => {
      if (!mounted) return;
      setAlerts((p) => [a, ...p].slice(0, 60));
      const base = (a.sensor || "").split("•")[1]?.trim() || a.sensor || "Sensor";
      const hiLo = a.status === "high" ? "high" : "low";
      say(`${base} in ${facility} is ${hiLo}. Value ${Math.round(Number(a.value) || 0)}.`);
      try {
        window.dispatchEvent(new CustomEvent("facility-alert", {
          detail: { sensor: base, status: hiLo, value: Number(a.value) || 0, time: Date.now() }
        }));
      } catch {}
    };

    socket.on("all-alerts", onAll);
    socket.on("sensor-alert", onOne);

    return () => {
      mounted = false;
      socket.off("all-alerts", onAll);
      socket.off("sensor-alert", onOne);
    };
  }, [facility]);

  const acknowledge = () => {
    setAlerts([]);
    cancelAll(); 
    try { window.dispatchEvent(new CustomEvent("hud-ack-all")); } catch {}
  };

  const count = alerts.length;

  return (
    <div className="absolute bottom-3 right-3 z-50 w-[300px]">
      <div className="rounded-xl p-3" style={{ background:"#0c100e", border:"1px solid #1d2320" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Live Alerts — {facility}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHudMuted(m => !m)}
              className="text-xs px-2 py-1 rounded border border-white/15 bg-white/5 hover:bg-white/10"
              title="Toggle HUD voice (global Pause still applies)"
            >
              {hudMuted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={acknowledge}
              className="text-xs px-2 py-1 rounded border border-white/15 bg-white/5 hover:bg-white/10"
              title="Acknowledge current breaches (stops pulsing + voice)"
            >
              Acknowledge
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-gray-400">Active in view</span>
          <span className="px-2 py-0.5 rounded bg-white/10 border border-white/15">{count}</span>
        </div>

        <div className="max-h-56 overflow-y-auto space-y-1">
          {count === 0 ? (
            <div className="text-xs text-gray-400">No active alerts</div>
          ) : alerts.map((a, i) => {
              const base = (a.sensor || "").split("•")[1]?.trim() || a.sensor || "Sensor";
              const icon = a.status === "high" ? "🔺" : "🔻";
              return (
                <div key={i}
                     className="text-xs px-2 py-1 rounded flex items-center justify-between"
                     style={{ background:"#0f1412", border:"1px solid #1d2320" }}>
                  <div className="truncate">
                    <span className="mr-1">{icon}</span>
                    <span className="font-medium">{base}</span>
                  </div>
                  <div className="ml-2 shrink-0 text-gray-300">{Math.round(Number(a.value) || 0)}</div>
                </div>
              );
            })}
        </div>

        <div className="mt-2 text-[11px] text-gray-400">🔺 high • 🔻 low</div>
      </div>
    </div>
  );
}
