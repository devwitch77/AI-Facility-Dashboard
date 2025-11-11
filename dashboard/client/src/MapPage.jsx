// client/src/MapPage.jsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "./ThemeContext";
import { useFacility } from "./FacilityContext";
import CitySwitcher from "./components/CitySwitcher";
import { FacilityScene } from "./components/FacilityScene";
import MapHud from "./components/MapHud";
import { socket } from "./socket";           

const THRESHOLDS = {
  "Temperature Sensor 1": { min: 18, max: 28 },
  "Humidity Sensor 1": { min: 30, max: 60 },
  "CO2 Sensor 1": { min: 0, max: 800 },
  "Light Sensor 1": { min: 100, max: 700 },
};

export default function MapPage() {
  const { bundles } = useTheme();
  const { facility } = useFacility();

  const [muted, setMuted] = useState(false);
  const [acked, setAcked] = useState(() => new Set());
  const [lastValues, setLastValues] = useState({});
  const [liveAlerts, setLiveAlerts] = useState([]);

  const title = useMemo(() => `Smart Facility — ${facility}`, [facility]);

  useEffect(() => {
    const onSensorUpdated = (s) => {
      const namespaced = `${facility} • ${s.name}`;
      setLastValues((prev) => ({
        ...prev,
        [namespaced]: { v: Number(s.value), t: s.updated_at || new Date().toISOString() },
      }));
    };

    const onServerAlert = (a) => {
      const namespaced = `${facility} • ${a.sensor}`;
      const id = `${namespaced}|${a.value}|${a.time || Date.now()}`;
      setLiveAlerts((prev) => {
        if (acked.has(id)) return prev;
        const next = [{ id, sensor: a.sensor, value: a.value, status: a.status, time: a.time || Date.now() }, ...prev];
        return next.slice(0, 30);
      });
    };

    socket.on("sensor-updated", onSensorUpdated);
    socket.on("sensor-alert", onServerAlert);

    return () => {
      socket.off("sensor-updated", onSensorUpdated);
      socket.off("sensor-alert", onServerAlert);
    };
  }, [facility, acked]);

  useEffect(() => {
    const id = setInterval(() => {
      const fresh = [];
      Object.entries(lastValues)
        .filter(([k]) => k.startsWith(`${facility} •`))
        .forEach(([k, { v, t }]) => {
          const base = k.split("•")[1].trim();
          const thr = THRESHOLDS[base];
          if (!thr || !Number.isFinite(v)) return;
          if (v < thr.min || v > thr.max) {
            const status = v < thr.min ? "low" : "high";
            const alertId = `${k}|${v}|${t}`;
            if (!acked.has(alertId)) {
              fresh.push({ id: alertId, sensor: base, value: v, status, time: t || Date.now() });
            }
          }
        });

      setLiveAlerts((prev) => {
        const byId = new Map(prev.map((a) => [a.id, a]));
        fresh.forEach((a) => byId.set(a.id, a));
        return Array.from(byId.values()).filter((a) => !acked.has(a.id)).slice(0, 30);
      });
    }, 1500);
    return () => clearInterval(id);
  }, [lastValues, facility, acked]);


  

  const dangerSet = useMemo(() => {
    const bad = new Set();
    liveAlerts.forEach((a) => bad.add(a.sensor));
    return bad;
  }, [liveAlerts]);

  const handleAck = (id) => setAcked((s) => new Set([...s, id]));
  const toggleMute = () => setMuted((m) => !m);

  return (
    <div className="w-full h-[calc(100vh-56px)] relative">
      <div className={`${bundles.panel} mb-4 p-3 rounded-xl`}>
        <div className="flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <CitySwitcher size="sm" />
        </div>
      </div>

      <div className={`${bundles.panel} rounded-xl p-2`} style={{ height: "calc(100% - 72px)" }}>
        <Canvas shadows camera={{ position: [0, 6, 10], fov: 55 }}>
          <FacilityScene dangerSensors={dangerSet} muted={muted} />
          <OrbitControls enableDamping dampingFactor={0.15} />
        </Canvas>
      </div>

      {}
      <MapHud
        alerts={liveAlerts}
        muted={muted}
        onToggleMute={toggleMute}
        onAck={handleAck}
      />
    </div>
  );
}
