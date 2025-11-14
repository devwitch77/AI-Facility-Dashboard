import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import io from "socket.io-client";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import annotationPlugin from "chartjs-plugin-annotation";
import "chartjs-adapter-date-fns";
import { useAuth } from "./AuthContext";
import { useFacility } from "./FacilityContext";
import CitySwitcher from "./components/CitySwitcher";
import AiPanel from "./components/AIPanel";
import IntelligenceAnnouncer from "./components/IntelligenceAnnouncer";
// 🚫 Removed: GenerateInsights import to avoid duplicate insights
import GenerateInsights from "./components/GenerateInsights";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { speak, cancelAll, setPaused as setTtsPaused } from "./lib/tts";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
  zoomPlugin,
  annotationPlugin
);

const SOCKET_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SOCKET_URL) ||
  window.__SOCKET_URL__ ||
  "http://localhost:5000";
const socket = io(SOCKET_URL);

const forest = {
  bg: "#070a09",
  panel: "#0c100e",
  panel2: "#0f1412",
  border: "#1d2320",
  grid: "rgba(255,255,255,0.06)",
  accent: "#1b3d2f",
  glow: "rgba(143,227,179,0.45)",
  ink: "#8FE3B3",
};

const FACILITY_SCENES = {
  Dubai: {
    ambient: "#1c3d2f",
    labelSuffix: "— Dubai",
    rooms: [
      { name: "Server Room", x: -1.7, z: -1.6 },
      { name: "Office 1", x: 1.7, z: -1.4 },
      { name: "Office 2", x: -1.6, z: 1.6 },
      { name: "Lobby", x: 1.6, z: 1.6 },
    ],
    beaconsOffset: { dx: 0.55, dz: 0.45 },
  },
  London: {
    ambient: "#3b2a57",
    labelSuffix: "— London",
    rooms: [
      { name: "Server Room", x: -1.5, z: -1.5 },
      { name: "Office 1", x: 1.5, z: -1.5 },
      { name: "Office 2", x: -1.5, z: 1.5 },
      { name: "Lobby", x: 1.5, z: 1.5 },
    ],
    beaconsOffset: { dx: 0.5, dz: 0.5 },
  },
  Tokyo: {
    ambient: "#5a2b1a",
    labelSuffix: "— Tokyo",
    rooms: [
      { name: "Server Room", x: -1.4, z: -1.8 },
      { name: "Office 1", x: 1.4, z: -1.2 },
      { name: "Office 2", x: -1.8, z: 1.4 },
      { name: "Lobby", x: 1.2, z: 1.8 },
    ],
    beaconsOffset: { dx: 0.6, dz: 0.35 },
  },
};

const BASE_THRESHOLDS = {
  "Temperature Sensor 1": { min: 18, max: 28 },
  "Humidity Sensor 1": { min: 30, max: 60 },
  "CO2 Sensor 1": { min: 0, max: 800 },
  "Light Sensor 1": { min: 100, max: 700 },
};

const floorPlanRooms = [
  { name: "Server Room", top: 0.05, left: 0.05, width: 0.4, height: 0.4 },
  { name: "Office 1", top: 0.05, left: 0.55, width: 0.4, height: 0.4 },
  { name: "Office 2", top: 0.55, left: 0.05, width: 0.4, height: 0.4 },
  { name: "Lobby", top: 0.55, left: 0.55, width: 0.4, height: 0.4 },
];

const SENSOR_POS_LOCAL = {
  "Temperature Sensor 1": { room: "Server Room", top: 0.2, left: 0.3 },
  "Humidity Sensor 1": { room: "Office 1", top: 0.4, left: 0.5 },
  "CO2 Sensor 1": { room: "Office 2", top: 0.6, left: 0.4 },
  "Light Sensor 1": { room: "Lobby", top: 0.3, left: 0.6 },
};

const FRESH_WINDOW_MS = 5 * 60 * 1000;

const inRange = (thr, v) => typeof v === "number" && thr && v >= thr.min && v <= thr.max;
const outOfRange = (thr, v) => typeof v === "number" && thr && (v < thr.min || v > thr.max);

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

const getColorForValue = (value, thr) => {
  if (value === undefined || value === null || !thr) return forest.ink;
  const { min, max } = thr;
  const range = max - min;
  const warn = 0.1 * range;
  if (value < min - warn || value > max + warn) return "#EF4444";
  if (value < min || value > max) return "#F59E0B";
  return "#22C55E";
};

const getZones = (thr) => {
  if (!thr) return {};
  const { min, max } = thr;
  const range = max - min;
  const warn = 0.1 * range;
  return {
    dangerLow: { yMin: -Infinity, yMax: min - warn, backgroundColor: "rgba(239,68,68,0.2)" },
    warningLow: { yMin: min - warn, yMax: min, backgroundColor: "rgba(245,158,11,0.15)" },
    safe: { yMin: min, yMax: max, backgroundColor: "rgba(34,197,94,0.15)" },
    warningHigh: { yMin: max, yMax: max + warn, backgroundColor: "rgba(245,158,11,0.15)" },
    dangerHigh: { yMin: max + warn, yMax: Infinity, backgroundColor: "rgba(239,68,68,0.2)" },
  };
};

const clamp = (arr, n = 150) => (Array.isArray(arr) && arr.length > n ? arr.slice(-n) : arr || []);

function GroundMini() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[12, 12]} />
      <meshStandardMaterial color={"#0b0f0d"} />
    </mesh>
  );
}

function RoomBlock({ x, z, active, onClick, name }) {
  return (
    <mesh
      position={[x, 0.6, z]}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick(name);
      }}
    >
      <boxGeometry args={[2.4, 1.2, 2.4]} />
      <meshStandardMaterial color={active ? forest.accent : "#222"} roughness={0.9} metalness={0.1} />
    </mesh>
  );
}

function Beacon({ x, z, danger, safeColor = forest.ink }) {
  const ref = useRef();
  const dangerRef = useRef(!!danger);
  dangerRef.current = !!danger;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const d = dangerRef.current;
    ref.current.intensity = (d ? 1.1 : 0.6) * (1 + 0.3 * Math.sin(t * 2.1));
    ref.current.distance = (d ? 4 : 2.8) + 0.5 * Math.sin(t * 1.4);
    ref.current.color.set(d ? "#ef4444" : safeColor);
  });
  return <pointLight ref={ref} position={[x, 1.8, z]} castShadow />;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { facility } = useFacility();
  const facilityScene = FACILITY_SCENES[facility] || FACILITY_SCENES.Dubai;

  const withFacility = useCallback((name) => `${facility} • ${name}`, [facility]);
  const baseNameFromFull = (full) => {
    const idx = full.indexOf("•");
    if (idx === -1) return full.trim();
    return full.slice(idx + 1).trim();
  };

  const ALERT_THRESHOLDS = useMemo(() => {
    const out = {};
    Object.keys(BASE_THRESHOLDS).forEach((k) => (out[withFacility(k)] = BASE_THRESHOLDS[k]));
    return out;
  }, [withFacility]);

  const SENSOR_POS = useMemo(() => {
    const out = {};
    Object.keys(SENSOR_POS_LOCAL).forEach((k) => (out[withFacility(k)] = SENSOR_POS_LOCAL[k]));
    return out;
  }, [withFacility]);

  // NEW: hard filter for ridiculous spikes (e.g., humidity 10 or 700)
  const sanitizeValue = useCallback(
    (sensorFull, raw) => {
      const thr = ALERT_THRESHOLDS[sensorFull];
      const v = Number(raw);
      if (!thr || typeof v !== "number" || Number.isNaN(v)) return v;
      const range = thr.max - thr.min;
      const hardMin = thr.min - 2 * range;
      const hardMax = thr.max + 2 * range;
      if (v < hardMin || v > hardMax) {
        // treat as sensor glitch → ignore this point
        return null;
      }
      return v;
    },
    [ALERT_THRESHOLDS]
  );

  const [history, setHistory] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [allAlerts, setAllAlerts] = useState([]);
  const [filter, setFilter] = useState("");
  const [compactView, setCompactView] = useState(false);
  const [modalSensor, setModalSensor] = useState(null);
  const [modalRoom, setModalRoom] = useState(null);
  const [paused, setPaused] = useState(false);

  const [ack, setAck] = useState(() => new Set());
  const ackSnapRef = useRef(new Set());
  const [ackSeq, setAckSeq] = useState(0);

// TTS is now MUCH calmer + needs sustained anomalies
const ttsPolicy = {
  // at least 2 minutes between alerts for the same sensor + direction
  cooldownMs: 120000,
  // tiny noise we ignore
  epsilon: 0.5,
  // how big a change must be (on top of cooldown) to speak again
  minDeltaByType: {
    temperature: 1.5, // °C
    humidity: 6,      // %
    co2: 150,         // ppm
    light: 120,       // lux
  },
  // must be out of range for at least this long before TTS fires
  minBreachMs: 30000, // 30 seconds
};

  const lastSpokenRef = useRef(new Map());
  const sensorType = (name) => {
    const n = name.toLowerCase();
    if (n.includes("temp")) return "temperature";
    if (n.includes("humid")) return "humidity";
    if (n.includes("co2")) return "co2";
    if (n.includes("light")) return "light";
    return "other";
  };

  // NEW: throttle alerts per sensor+status (not per value)
  const recentAlertsRef = useRef([]);
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 10000;
      recentAlertsRef.current = recentAlertsRef.current.filter((r) => r.t > cutoff);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const seenRecently = (sensor, status) => {
    const key = `${sensor}|${status}`;
    const now = Date.now();
    const cutoff = now - 10000; // 10 seconds window
    recentAlertsRef.current = recentAlertsRef.current.filter((r) => r.t > cutoff);
    const hit = recentAlertsRef.current.find((r) => r.key === key);
    if (hit) return true;
    recentAlertsRef.current.push({ key, t: now });
    return false;
  };

  useEffect(() => {
    setTtsPaused(paused);
    if (paused) cancelAll();
  }, [paused]);

  useEffect(() => () => cancelAll(), []);
  useEffect(() => {
    if (!user) cancelAll();
  }, [user]);

  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const pushToast = (t) => {
    const id = ++toastIdRef.current;
    setToasts((p) => [...p, { id, t }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3000);
  };

  // CHANGED: include ALERT_THRESHOLDS + sanitizeValue in deps & logic
  useEffect(() => {
    socket.on("connect", () => {});
    socket.on("all-sensors", (data) => {
      const list =
        data?.length > 0
          ? data.map((s) => ({ ...s, name: withFacility(baseNameFromFull(s.name)) }))
          : [
              { id: 1, name: withFacility("Temperature Sensor 1"), value: 22, updated_at: new Date() },
              { id: 2, name: withFacility("Humidity Sensor 1"), value: 50, updated_at: new Date() },
              { id: 3, name: withFacility("CO2 Sensor 1"), value: 400, updated_at: new Date() },
              { id: 4, name: withFacility("Light Sensor 1"), value: 300, updated_at: new Date() },
            ];
      initSensors(list);
    });

    socket.on("sensor-updated", (s) => {
      if (paused) return;
      const namespaced = { ...s, name: withFacility(baseNameFromFull(s.name)) };
      setHistory((prev) => {
        const k = namespaced.name;
        const value = sanitizeValue(k, namespaced.value);
        if (value == null) return prev; // ignore glitch
        const h = prev[k] || [];
        const next = clamp([...h, { x: new Date(namespaced.updated_at), y: Number(value) }]);
        return { ...prev, [k]: next };
      });
    });

    socket.on("all-alerts", (arr) => {
      if (Array.isArray(arr) && arr.length) {
        const formatted = arr.map((a) => {
          const ns = { ...a, sensor: withFacility(baseNameFromFull(a.sensor)) };
          return {
            sensor: ns.sensor,
            value: Number(ns.value),
            status: ns.status,
            time: ns.time ? new Date(ns.time) : new Date(),
          };
        });
        setAllAlerts((p) => [...formatted, ...p]);
      }
    });

    socket.on("sensor-alert", (a) => {
      const ns = { ...a, sensor: withFacility(baseNameFromFull(a.sensor)) };
      const value = sanitizeValue(ns.sensor, ns.value);
      if (value == null) return; // ignore glitch alerts
      const item = { ...ns, value: Number(value), time: new Date() };
      if (seenRecently(item.sensor, item.status)) return; // throttle alerts to every 10s

      setAlerts((p) => [item, ...p]);
      setAllAlerts((p) => [item, ...p]);
      if (!ack.has(ns.sensor)) speakAlert(item);
    });

    return () => {
      socket.off("connect");
      socket.off("all-sensors");
      socket.off("sensor-updated");
      socket.off("all-alerts");
      socket.off("sensor-alert");
    };
  }, [paused, withFacility, ack, sanitizeValue]);

  const initSensors = (list) => {
    setHistory((prev) => {
      const hist = { ...prev };
      list.forEach((s) => {
        const k = s.name;
        const existing = hist[k] || [];
        if (existing.length === 0) {
          hist[k] = [{ x: new Date(s.updated_at), y: Number(s.value) }];
        }
      });
      return hist;
    });
  };

  // CHANGED: alerts derived from history also throttled via seenRecently
  useEffect(() => {
    Object.entries(history).forEach(([name, series]) => {
      if (!name.startsWith(`${facility} •`)) return;
      const thr = ALERT_THRESHOLDS[name];
      if (!thr || !series?.length) return;
      const last = series[series.length - 1].y;
      if (last < thr.min || last > thr.max) {
        const status = last < thr.min ? "low" : "high";
        if (seenRecently(name, status)) return;
        const item = { sensor: name, value: last, status, time: new Date() };
        setAlerts((p) => [item, ...p]);
        setAllAlerts((p) => [item, ...p]);
        if (!ack.has(name)) speakAlert(item);
      }
    });
  }, [history, facility, ALERT_THRESHOLDS, ack]);

const getBreachDurationInfo = useCallback(
  (sensorName) => {
    const thr = ALERT_THRESHOLDS[sensorName];
    const series = history[sensorName] || [];
    if (!thr || !series.length) return null;

    const now = Date.now();
    let startIdx = series.length - 1;

    // walk backwards until we leave the breach zone
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

    return { durationMs, mins, startTs };
  },
  [history, ALERT_THRESHOLDS]
);


  const speakAlert = useCallback(
  (item) => {
    if (paused) return;
    try {
      const baseName = baseNameFromFull(item.sensor);
      const room =
        SENSOR_POS[item.sensor]?.room ||
        SENSOR_POS[withFacility(baseName)]?.room ||
        "facility";
      const facilityName = facility;
      const type = sensorType(baseName);

      // 1) How long has this been bad?
      const duration = getBreachDurationInfo(item.sensor);
      if (!duration) return;

      // don’t speak if it’s a super fresh blip (< minBreachMs)
      if (duration.durationMs < ttsPolicy.minBreachMs) return;

      const key = `${facilityName}|${baseName}|${item.status || "warn"}`;
      const last = lastSpokenRef.current.get(key);
      const now = Date.now();
      const minDelta = ttsPolicy.minDeltaByType[type] ?? 2;

      if (last) {
        const withinCooldown = now - last.t < ttsPolicy.cooldownMs;
        const deltaSmall =
          Math.abs(Number(item.value) - Number(last.value)) <
          Math.max(minDelta, ttsPolicy.epsilon);

        if (withinCooldown || deltaSmall) {
          // already complained recently about this – stay quiet
          return;
        }
      }

      lastSpokenRef.current.set(key, { t: now, value: Number(item.value) });

      const thr = ALERT_THRESHOLDS[item.sensor];
      const durationPart =
        duration?.mins != null
          ? ` running ${item.status === "high" ? "high" : "low"} for about ${
              duration.mins
            } minute${duration.mins === 1 ? "" : "s"}`
          : "";

      const rangePart =
        thr && typeof thr.min === "number" && typeof thr.max === "number"
          ? ` (normal ${thr.min}–${thr.max}).`
          : ".";

      const msg =
        `${baseName.replace(" Sensor 1", "")} in ${room} at ${facilityName} is ` +
        `${item.status === "high" ? "high" : item.status === "low" ? "low" : "out of range"}${durationPart}. ` +
        `Current value ${Math.round(item.value)}${rangePart}`;

      speak(msg, { rate: 1.02, pitch: 1.0, volume: 1.0 });
    } catch {
      // swallow TTS errors
    }
  },
  [
    paused,
    facility,
    SENSOR_POS,
    withFacility,
    ALERT_THRESHOLDS,
    getBreachDurationInfo,
  ]
);


  const facilityHistoryKeys = useMemo(
    () => Object.keys(history).filter((k) => k.startsWith(`${facility} •`)),
    [history, facility]
  );

  const filteredSensors = useMemo(
    () => facilityHistoryKeys.filter((n) => baseNameFromFull(n).toLowerCase().includes(filter.toLowerCase())),
    [facilityHistoryKeys, filter]
  );

  const getTimeUnit = (len) => (len <= 20 ? "second" : len <= 180 ? "minute" : "hour");

  const facilityAverages = useMemo(() => {
    const types = ["Temperature", "Humidity", "CO2", "Light"];
    const result = {};
    types.forEach((t) => {
      const seriesList = facilityHistoryKeys
        .filter((name) => baseNameFromFull(name).toLowerCase().includes(t.toLowerCase()))
        .map((name) => history[name] || []);
      if (!seriesList.length) {
        result[t] = [];
        return;
      }
      const max = Math.min(30, ...seriesList.map((s) => s.length || 0));
      const averaged = [];
      for (let i = 0; i < max; i++) {
        const pts = seriesList.map((s) => s[s.length - max + i]);
        const times = pts.map((p) => p?.x).filter(Boolean);
        const vals = pts.map((p) => (typeof p?.y === "number" ? p.y : null)).filter((v) => v !== null);
        if (!vals.length) continue;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        averaged.push({ x: new Date(times[0] || Date.now()), y: Number(avg.toFixed(2)) });
      }
      result[t] = averaged;
    });
    return result;
  }, [history, facilityHistoryKeys]);

  const roomCenters = useMemo(() => {
    const map = {};
    floorPlanRooms.forEach((r) => {
      map[r.name] = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    return map;
  }, []);

  const findNearestSensorByType = useCallback(
    (roomName, typeKey) => {
      const match = (nm) => {
        const n = nm.toLowerCase();
        if (typeKey === "Temperature") return n.includes("temp");
        if (typeKey === "Humidity") return n.includes("humid");
        if (typeKey === "CO2") return n.includes("co2");
        if (typeKey === "Light") return n.includes("light");
        return false;
      };
      const candidates = Object.keys(SENSOR_POS)
        .filter((k) => k.startsWith(`${facility} •`))
        .filter((k) => match(baseNameFromFull(k)));
      if (!candidates.length) return null;
      const rc = roomCenters[roomName];
      let best = null;
      let bestD = Infinity;
      candidates.forEach((full) => {
        const pos = SENSOR_POS[full];
        const meta = floorPlanRooms.find((r) => r.name === pos.room);
        if (!meta) return;
        const sx = meta.left + pos.left * meta.width;
        const sy = meta.top + pos.top * meta.height;
        const dx = sx - rc.cx;
        const dy = sy - rc.cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          best = full;
        }
      });
      return best;
    },
    [roomCenters, facility, SENSOR_POS]
  );

  const buildRoomSeries4 = useCallback(
    (roomName) => {
      const sensorsInRoom = Object.entries(SENSOR_POS)
        .filter(([key, pos]) => key.startsWith(`${facility} •`) && pos.room === roomName)
        .map(([name]) => name);
      const groups = {
        Temperature: sensorsInRoom.filter((n) => baseNameFromFull(n).toLowerCase().includes("temp")),
        Humidity: sensorsInRoom.filter((n) => baseNameFromFull(n).toLowerCase().includes("humid")),
        CO2: sensorsInRoom.filter((n) => baseNameFromFull(n).toLowerCase().includes("co2")),
        Light: sensorsInRoom.filter((n) => baseNameFromFull(n).toLowerCase().includes("light")),
      };
      const result = {};
      Object.entries(groups).forEach(([key, list]) => {
        let series = [];
        if (list.length) {
          const lst = list.map((n) => history[n] || []);
          const max = Math.min(30, ...lst.map((s) => s.length || 0));
          for (let i = 0; i < max; i++) {
            const pts = lst.map((s) => s[s.length - max + i]);
            const times = pts.map((p) => p?.x).filter(Boolean);
            const vals = pts.map((p) => (typeof p?.y === "number" ? p.y : null)).filter((v) => v !== null);
            if (!vals.length) continue;
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            series.push({ x: new Date(times[0] || Date.now()), y: Number(avg.toFixed(2)) });
          }
        }
        if (!series.length) {
          const near = findNearestSensorByType(roomName, key);
          if (near && history[near]?.length) series = history[near].slice(-30);
        }
        if (!series.length) {
          const fac = facilityAverages[key] || [];
          series = fac.slice(-30);
        }
        result[key] = series;
      });
      return result;
    },
    [history, facilityAverages, findNearestSensorByType, facility, SENSOR_POS]
  );

  // CHANGED: analytics now also returns mode + statusLine for techy sidebar
  const analytics = useMemo(() => {
    const names = facilityHistoryKeys;
    if (!names.length) {
      return {
        stableText: "—",
        stableValue: 100,
        activeAlerts: 0,
        avgDeviation: "0.0%",
        lastAnomaly: "—",
        mode: "Nominal",
        statusLine: `Awaiting live telemetry for ${facility}.`,
      };
    }

    const now = Date.now();
    let sumDev = 0;
    let count = 0;

    names.forEach((name) => {
      const series = history[name];
      const thr = ALERT_THRESHOLDS[name];
      if (!thr || !series?.length) return;

      const latest = series[series.length - 1];
      if (!latest?.x || typeof latest?.y !== "number") return;

      if (now - new Date(latest.x).getTime() > FRESH_WINDOW_MS) return;

      const mid = (thr.min + thr.max) / 2;
      const half = (thr.max - thr.min) / 2 || 1;
      const dev = Math.min(1, Math.abs(latest.y - mid) / half);
      sumDev += dev;
      count++;
    });

    const avgDev = count ? sumDev / count : 0;
    const avgDevPct = (avgDev * 100).toFixed(1);

    const currentBreaches = computeBreachesNow({
      facility,
      history,
      thresholds: ALERT_THRESHOLDS,
    });

    const activeAlerts = currentBreaches.length;
    const stability = Math.max(0, Math.min(100, 100 - avgDev * 50 - activeAlerts * 10)).toFixed(0);

    const last = currentBreaches[0]?.time ? new Date(currentBreaches[0].time) : null;
    const ago = last ? Math.max(1, Math.round((Date.now() - last.getTime()) / 60000)) : null;

    // NEW: facility "mode" + statusLine
    let mode = "Nominal";
    if (activeAlerts > 0 || Number(stability) < 90) mode = "Degraded";
    if (activeAlerts > 2 || Number(stability) < 70) mode = "Critical";

    let statusLine;
    if (mode === "Nominal") {
      statusLine = `Nominal: all systems in ${facility} are within normal tolerances.`;
    } else if (mode === "Degraded") {
      statusLine = `Degraded: ${activeAlerts} active alert(s) in ${facility}; monitor closely.`;
    } else {
      statusLine = `Critical: multiple sensors outside range in ${facility}; investigate immediately.`;
    }

    return {
      stableText: `${stability}% stable`,
      stableValue: Number(stability),
      activeAlerts,
      avgDeviation: `${avgDevPct}%`,
      lastAnomaly: ago ? `${ago} min ago` : "—",
      mode,
      statusLine,
    };
  }, [history, facility, facilityHistoryKeys, ALERT_THRESHOLDS]);

  const ambientColor = facilityScene.ambient;

  const exportCSV = () => {
    const rows = [["time", "sensor", "value"]];
    const keys = Object.keys(history).filter((k) => k.startsWith(`${facility} •`));
    keys.forEach((full) => {
      const series = history[full] || [];
      series.forEach((pt) => {
        if (!pt?.x || typeof pt?.y !== "number") return;
        rows.push([new Date(pt.x).toISOString(), full, String(pt.y)]);
      });
    });
    if (rows.length === 1) {
      alert(`No data to export for ${facility}.`);
      return;
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${facility.toLowerCase()}-facility-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const keys = Object.keys(history).filter((k) => k.startsWith(`${facility} •`));
    const hasData = keys.some((k) => (history[k] || []).length);
    if (!hasData) {
      alert(`No chart data to export for ${facility}.`);
      return;
    }
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`${facility} Facility Report (Current Window)`, 14, 14);
    autoTable(doc, {
      head: [["Sensor", "Latest Value", "Samples"]],
      body: keys.map((name) => {
        const series = history[name] || [];
        const latest = series.slice(-1)[0]?.y ?? "—";
        return [name, String(latest), String(series.length)];
      }),
      startY: 20,
      theme: "striped",
    });
    try {
      const node = document.getElementById("floorplan-shot");
      if (node) {
        const canvas = await html2canvas(node, { backgroundColor: null, scale: 2 });
        const img = canvas.toDataURL("image/png");
        const pageWidth = doc.internal.pageSize.getWidth();
        const w = pageWidth - 20;
        const h = (canvas.height * w) / canvas.width;
        const y = (doc.lastAutoTable?.finalY || 20) + 10;
        doc.addImage(img, "PNG", 10, y, w, Math.min(h, 120));
      }
    } catch {}
    doc.save(`${facility.toLowerCase()}-facility-report.pdf`);
  };

  const ringAccent = "ring-2 ring-[rgba(143,227,179,0.35)]";

  const roomCoord3D = useMemo(() => {
    const map = {};
    facilityScene.rooms.forEach((r) => (map[r.name] = [r.x, r.z]));
    return map;
  }, [facilityScene]);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);
  const [aiErr, setAiErr] = useState("");

  const collectSnapshotForAI = () => {
    const latest = {};
    facilityHistoryKeys.forEach((k) => {
      const bn = baseNameFromFull(k);
      const val = history[k]?.slice(-1)[0]?.y;
      latest[bn] = typeof val === "number" ? val : null;
    });
    return { facility, latest, ts: Date.now() };
  };

  const buildSamplesFromHistory = () => {
    const samples = [];
    Object.entries(history)
      .filter(([k]) => k.startsWith(`${facility} •`))
      .forEach(([full, series]) => {
        const base = baseNameFromFull(full);
        const lastSlice = (series || []).slice(-100);
        lastSlice.forEach((pt) => {
          if (!pt?.x || typeof pt?.y !== "number") return;
          samples.push({
            sensor: base,
            value: pt.y,
            time: new Date(pt.x).toISOString(),
          });
        });
      });
    return samples;
  };

  const localHeuristicInsight = () => {
    const now = Date.now();
    const breaches = computeBreachesNow({ facility, history, thresholds: ALERT_THRESHOLDS });

    if (!breaches.length) {
      return {
        summary: `All monitored metrics in ${facility} are within their normal ranges based on the latest readings.`,
        riskScore: 5,
        tips: [
          "Maintain current HVAC and ventilation settings.",
          "Schedule routine maintenance checks to keep conditions stable.",
        ],
      };
    }

    const lines = [];
    let risk = 10;

    breaches.forEach((b) => {
      const series = history[b.sensor] || [];
      const thr = ALERT_THRESHOLDS[b.sensor];
      if (!series.length || !thr) return;

      let startIdx = series.length - 1;
      for (let i = series.length - 1; i >= 0; i--) {
        const p = series[i];
        if (!p?.x || typeof p?.y !== "number") continue;
        if (!outOfRange(thr, p.y)) break;
        startIdx = i;
      }
      const startPoint = series[startIdx];
      const startTime = startPoint?.x ? new Date(startPoint.x).getTime() : now;
      const mins = Math.max(1, Math.round((now - startTime) / 60000));

      const base = baseNameFromFull(b.sensor);
      const room = SENSOR_POS[b.sensor]?.room || "facility";
      const dirWord = b.status === "high" ? "high" : "low";
      const line = `${base.replace(" Sensor 1", "")} in ${room} has been ${dirWord} for about ${mins} minute${
        mins === 1 ? "" : "s"
      } (current ${Math.round(b.value)}, normal ${thr.min}–${thr.max}).`;
      lines.push({ line, mins, dev: Math.abs(b.value - (thr.min + thr.max) / 2) / ((thr.max - thr.min) / 2 || 1) });

      risk += 10 * lines[lines.length - 1].dev + Math.min(20, mins * 1.5);
    });

    lines.sort((a, b) => b.mins - a.mins || b.dev - a.dev);
    const mainLines = lines.slice(0, 3).map((x) => x.line);

    const summary =
      `Currently, ${breaches.length} sensor${breaches.length === 1 ? "" : "s"} ` +
      `in ${facility} are outside their normal ranges. ` +
      mainLines.join(" ");

    const score = Math.max(0, Math.min(100, Math.round(risk)));

    const tips = [
      "Check the listed rooms and sensors first; they show the largest deviations.",
      "Adjust HVAC or lighting profiles as needed to bring values back into range.",
    ];

    return { summary, riskScore: score, tips };
  };

  const fetchWithTimeout = (url, opts = {}, ms = 6000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };

  const runAIInsights = async () => {
    setAiBusy(true);
    setAiErr("");
    try {
      const snapshot = collectSnapshotForAI();
      const samples = buildSamplesFromHistory();
      const local = localHeuristicInsight();

      const res = await fetchWithTimeout("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility, samples, snapshot }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        setAiInsight({
          summary: data.summary || local.summary,
          riskScore: typeof data.riskScore === "number" ? data.riskScore : local.riskScore,
          tips: Array.isArray(data.tips) && data.tips.length ? data.tips : local.tips,
        });
      } else {
        setAiInsight(local);
      }
    } catch (e) {
      setAiErr("AI service unreachable. Using local analysis.");
      setAiInsight(localHeuristicInsight());
    } finally {
      setAiBusy(false);
    }
  };

  const takeAckSnapshot = () => {
    const snap = new Set();
    Object.keys(SENSOR_POS)
      .filter((k) => k.startsWith(`${facility} •`))
      .forEach((full) => {
        const thr = ALERT_THRESHOLDS[full];
        const last = history[full]?.slice(-1)[0]?.y;
        if (thr && typeof last === "number" && outOfRange(thr, last)) {
          snap.add(full);
        }
      });
    ackSnapRef.current = snap;
    setAck((prev) => new Set([...prev, ...snap]));
    setAckSeq((s) => s + 1);
  };

  useEffect(() => {
    const onHudAck = () => takeAckSnapshot();
    window.addEventListener("hud-ack-all", onHudAck);
    return () => window.removeEventListener("hud-ack-all", onHudAck);
  }, [SENSOR_POS, ALERT_THRESHOLDS, history, facility]);

  useEffect(() => {
    if (ack.size === 0) return;
    const next = new Set(ack);
    let changed = false;
    ack.forEach((full) => {
      const thr = ALERT_THRESHOLDS[full];
      const last = history[full]?.slice(-1)[0]?.y;
      if (thr && typeof last === "number" && inRange(thr, last)) {
        next.delete(full);
        changed = true;
      }
    });
    if (changed) setAck(next);
  }, [history, ack, ALERT_THRESHOLDS]);

  return (
    <div className="min-h-screen h-screen w-full" style={{ background: forest.bg, color: "#fff" }}>
      <div
        className="px-4 md:px-6 py-3 flex items-center justify-between border-b"
        style={{ background: "#0b0f0d", borderColor: forest.border }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg" style={{ background: forest.accent }} />
          <div className="font-bold tracking-wide">Smart Facility Dashboard — {facility}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <CitySwitcher />
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-gray-400">View</span>
            <button
              onClick={() => setCompactView((v) => !v)}
              className="px-3 py-1 rounded-lg transition"
              style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
            >
              {compactView ? "Compact" : "Full"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaused((p) => !p)}
              className="px-3 py-1 rounded-lg transition"
              style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => {
                setAck(new Set());
                ackSnapRef.current = new Set();
                setAlerts((p) => p.filter((a) => !a.sensor.startsWith(`${facility} •`)));
                setAllAlerts((p) => p.filter((a) => !a.sensor.startsWith(`${facility} •`)));
                setHistory((prev) => {
                  const next = { ...prev };
                  Object.keys(next)
                    .filter((k) => k.startsWith(`${facility} •`))
                    .forEach((k) => delete next[k]);
                  return next;
                });
                setAckSeq((s) => s + 1);
                pushToast(`Cleared ${facility} alerts & history (local)`);
              }}
              className="px-3 py-1 rounded-lg transition"
              style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
            >
              Clear Alerts
            </button>
            <button
              onClick={() => {
                takeAckSnapshot();
                cancelAll();
                pushToast(`Acknowledged current breaches in ${facility}`);
              }}
              className="px-3 py-1 rounded-lg transition"
              style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
            >
              Acknowledge
            </button>
          </div>
          {user ? (
            <div
              className="hidden md:flex text-xs px-2 py-1 rounded"
              style={{ background: "#0e1411", border: `1px solid ${forest.border}` }}
            >
              {user.role.toUpperCase()}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPI title="Total Sensors" value={facilityHistoryKeys.length} />
              <KPI title="Active Alerts" value={analytics.activeAlerts} variant="danger" />
              <KPI
                title="Total Alerts"
                value={allAlerts.filter((a) => a.sensor.startsWith(`${facility} •`)).length}
                variant="warn"
              />
              <KPI title="Stability" value={analytics.stableText} variant="ok" />
            </div>

            <IntelligenceAnnouncer facility={facility} />
            <AiPanel facility={facility} history={history} analytics={analytics} />
            {/* Removed duplicate GenerateInsights card to avoid conflicting messages */}
            { <GenerateInsights facility={facility} history={history} /> }

            <div className="grid lg:grid-cols-2 gap-6">
              <div
                className={`rounded-2xl p-2 ${ringAccent}`}
                style={{ background: forest.panel, border: `1px solid ${forest.border}` }}
              >
                <div className="flex items-center justify-between px-2 pt-2">
                  <h3 className="text-sm text-gray-300">Interactive Facility Map (3D) {facilityScene.labelSuffix}</h3>
                </div>
                <div className="h-[360px] rounded-xl overflow-hidden" style={{ background: "#0a0a0a" }}>
                  <Canvas
                    shadows
                    camera={{ position: [0, 5, 7], fov: 55 }}
                    onCreated={({ gl }) => {
                      gl.setClearColor("#0a0a0a");
                    }}
                  >
                    <ambientLight color={ambientColor} intensity={0.65} />
                    <directionalLight position={[4, 6, 4]} castShadow intensity={0.7} />
                    <GroundMini />
                    {facilityScene.rooms.map((r) => (
                      <RoomBlock key={r.name} x={r.x} z={r.z} name={r.name} active={modalRoom === r.name} onClick={setModalRoom} />
                    ))}
                    {Object.entries(SENSOR_POS)
                      .filter(([k]) => k.startsWith(`${facility} •`))
                      .map(([name, pos]) => {
                        const last = (history[name] || []).slice(-1)[0]?.y;
                        const thr = ALERT_THRESHOLDS[name];
                        const rawDanger = !!(thr && outOfRange(thr, last));
                        const danger = rawDanger && !ackSnapRef.current.has(name);
                        const [rx, rz] = roomCoord3D[pos.room] || [0, 0];
                        return (
                          <Beacon
                            key={`${name}-${ackSeq}-${ackSnapRef.current.has(name) ? "ack" : "live"}`}
                            x={rx + (facilityScene.beaconsOffset?.dx ?? 0.5)}
                            z={rz + (facilityScene.beaconsOffset?.dz ?? 0.5)}
                            danger={danger}
                            safeColor={forest.ink}
                          />
                        );
                      })}
                    <OrbitControls enableDamping dampingFactor={0.15} />
                  </Canvas>
                </div>
              </div>

              <div
                id="floorplan-shot"
                className={`rounded-2xl p-3 ${ringAccent}`}
                style={{ background: forest.panel, border: `1px solid ${forest.border}` }}
              >
                <h3 className="text-sm text-gray-300 mb-2">Floor Plan — {facility}</h3>
                <div
                  className="relative w-full h-[360px] rounded-xl overflow-hidden border"
                  style={{ background: "#0a0f0d", borderColor: forest.border }}
                >
                  <div
                    className="absolute inset-0 opacity-[0.06]"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
                      backgroundSize: "40px 40px",
                    }}
                  />
                  {floorPlanRooms.map((room) => (
                    <div
                      key={room.name}
                      className="absolute rounded-md p-2 cursor-pointer hover:shadow-lg transition"
                      style={{
                        top: `${room.top * 100}%`,
                        left: `${room.left * 100}%`,
                        width: `${room.width * 100}%`,
                        height: `${room.height * 100}%`,
                        border: `1px solid ${forest.border}`,
                        background: "linear-gradient(180deg, rgba(143,227,179,0.06), transparent)",
                      }}
                      onClick={() => setModalRoom(room.name)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{room.name}</span>
                        <span className="text-[10px] text-gray-400">click</span>
                      </div>
                      {Object.entries(SENSOR_POS)
                        .filter(([full, p]) => full.startsWith(`${facility} •`) && p.room === room.name)
                        .map(([sName, p]) => {
                          const last = history[sName]?.slice(-1)[0]?.y;
                          return (
                            <div
                              key={sName}
                              className="absolute w-5 h-5 rounded-full cursor-pointer border-2 hover:scale-125 transition"
                              style={{
                                top: `${p.top * 100}%`,
                                left: `${p.left * 100}%`,
                                borderColor: "rgba(255,255,255,0.6)",
                                backgroundColor: getColorForValue(last, ALERT_THRESHOLDS[sName]),
                                boxShadow:
                                  last &&
                                  ALERT_THRESHOLDS[sName] &&
                                  outOfRange(ALERT_THRESHOLDS[sName], last)
                                    ? "0 0 12px rgba(239,68,68,0.6)"
                                    : `0 0 10px ${forest.glow}`,
                              }}
                              title={`${baseNameFromFull(sName)}: ${last ?? "—"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setModalSensor(sName);
                              }}
                            />
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder={`Search sensors in ${facility}…`}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="px-4 py-2 rounded transition"
                style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
              />
              <button
                onClick={exportCSV}
                className="px-3 py-2 rounded transition"
                style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
              >
                Export CSV
              </button>
              <button
                onClick={exportPDF}
                className="px-3 py-2 rounded transition"
                style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
              >
                Export PDF
              </button>
            </div>

            <div
              className="grid gap-6"
              style={{
                gridTemplateColumns: compactView
                  ? "repeat(auto-fit, minmax(220px, 1fr))"
                  : "repeat(auto-fit, minmax(320px, 1fr))",
              }}
            >
              {filteredSensors.map((name) => {
                const thr = ALERT_THRESHOLDS[name];
                const last = history[name]?.slice(-1)[0]?.y;
                const alertActive = thr && outOfRange(thr, last);
                const zones = getZones(thr);
                const label = baseNameFromFull(name);
                return (
                  <div
                    key={name}
                    className="rounded-2xl p-4 transition"
                    style={{
                      background: forest.panel,
                      border: `1px solid ${forest.border}`,
                      boxShadow: alertActive ? "0 0 0 2px rgba(239,68,68,.35)" : "none",
                    }}
                    onClick={() => setModalSensor(name)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{label}</h4>
                      <span className="text-sm text-gray-300">
                        Latest: <span style={{ color: getColorForValue(last, thr) }}>{last ?? "—"}</span>
                      </span>
                    </div>
                    <Line
                      data={{
                        datasets: [
                          {
                            label: `${facility} • ${label}`,
                            data: history[name],
                            fill: true,
                            backgroundColor: "rgba(143,227,179,0.10)",
                            borderColor: (ctx) => (ctx.p1 ? getColorForValue(ctx.p1.parsed.y, thr) : forest.ink),
                            segment: {
                              borderColor: (ctx) => (ctx.p1 ? getColorForValue(ctx.p1.parsed.y, thr) : forest.ink),
                            },
                            pointRadius: 2,
                            tension: 0.33,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        plugins: {
                          legend: { display: false },
                          annotation: { annotations: zones },
                          zoom: { pan: { enabled: true, mode: "x" }, zoom: { wheel: { enabled: true }, mode: "x" } },
                        },
                        scales: {
                          x: {
                            type: "time",
                            time: { unit: getTimeUnit(history[name]?.length || 10) },
                            ticks: { color: "#cbd5e1" },
                            grid: { color: forest.grid },
                          },
                          y: {
                            beginAtZero: true,
                            ticks: { color: "#cbd5e1" },
                            grid: { color: forest.grid },
                          },
                        },
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Mini title="Temperature (avg)" data={facilityAverages.Temperature || []} />
              <Mini title="Humidity (avg)" data={facilityAverages.Humidity || []} />
              <Mini title="CO₂ (avg)" data={facilityAverages.CO2 || []} />
              <Mini title="Light (avg)" data={facilityAverages.Light || []} />
            </div>

            <div className="rounded-2xl p-4" style={{ background: forest.panel, border: `1px solid ${forest.border}` }}>
              <h3 className="text-lg font-semibold mb-3">Alerts History — {facility}</h3>
              <div className="max-h-72 overflow-y-auto space-y-2">
                {allAlerts.filter((a) => a.sensor.startsWith(`${facility} •`)).length === 0 ? (
                  <p className="text-gray-400">No alerts.</p>
                ) : (
                  allAlerts
                    .filter((a) => a.sensor.startsWith(`${facility} •`))
                    .map((a, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-md"
                        style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
                      >
                        <span>
                          ⚠️ {baseNameFromFull(a.sensor)}{" "}
                          {SENSOR_POS[a.sensor]?.room ? `(${SENSOR_POS[a.sensor]?.room}) ` : ""}
                          {a.status.toUpperCase()} — {a.value}
                          <span className="text-gray-400 text-xs ml-2">{new Date(a.time).toLocaleTimeString()}</span>
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          {/* ANALYTICS SIDEBAR */}
          <div className={`rounded-2xl p-4 ${ringAccent}`} style={{ background: forest.panel, border: `1px solid ${forest.border}` }}>
            <h3 className="text-lg font-semibold text-gray-200 mb-3">Analytics — {facility}</h3>
            <div className="space-y-2 text-sm">
              <Row k="System Status" v={analytics.stableText} vClass="text-green-300" />
              <Row k="Mode" v={analytics.mode} vClass={analytics.mode === "Critical" ? "text-red-300" : "text-emerald-300"} />
              <Row k="Active Alerts" v={String(analytics.activeAlerts)} vClass="text-red-300" />
              <Row k="Avg Deviation" v={analytics.avgDeviation} vClass="text-amber-300" />
              <Row k="Last Anomaly" v={analytics.lastAnomaly} vClass="text-teal-300" />
            </div>

            {/* NEW: live techy facility summary */}
            <div className="mt-3 text-xs text-gray-300">
              <div className="font-semibold mb-1">Facility Pulse</div>
              <p>{analytics.statusLine}</p>
            </div>

            <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${forest.border}` }}>
              <h4 className="text-sm text-gray-300 mb-2">Quick Actions</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaused((p) => !p)}
                  className="flex-1 px-3 py-2 rounded transition"
                  style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
                >
                  {paused ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={() => {
                    setAck(new Set());
                    ackSnapRef.current = new Set();
                    setAlerts((p) => p.filter((a) => !a.sensor.startsWith(`${facility} •`)));
                    setAllAlerts((p) => p.filter((a) => !a.sensor.startsWith(`${facility} •`)));
                    setHistory((prev) => {
                      const next = { ...prev };
                      Object.keys(next)
                        .filter((k) => k.startsWith(`${facility} •`))
                        .forEach((k) => delete next[k]);
                      return next;
                    });
                    setAckSeq((s) => s + 1);
                    pushToast(`Cleared ${facility} alerts & history (local)`);
                  }}
                  className="flex-1 px-3 py-2 rounded transition"
                  style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
                >
                  Clear Alerts
                </button>
                <button
                  onClick={() => {
                    takeAckSnapshot();
                    cancelAll();
                    pushToast(`Acknowledged current breaches in ${facility}`);
                  }}
                  className="flex-1 px-3 py-2 rounded transition"
                  style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}
                >
                  Acknowledge
                </button>
              </div>
            </div>

            {/* Unified, live AI insights */}
            <div className="mt-6 p-4 rounded-xl" style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm text-gray-200">AI Insights — {facility}</h4>
                <button
                  onClick={runAIInsights}
                  disabled={aiBusy}
                  className="px-3 py-1 rounded text-sm"
                  style={{ background: forest.panel, border: `1px solid ${forest.border}`, opacity: aiBusy ? 0.6 : 1 }}
                >
                  {aiBusy ? "Analyzing…" : "Generate Insight"}
                </button>
              </div>
              {aiErr && <div className="text-xs text-amber-300 mb-2">{aiErr}</div>}
              {aiInsight ? (
                <div className="text-sm space-y-2">
                  <div className="font-semibold">Summary</div>
                  <div className="text-gray-200">{aiInsight.summary}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Risk score:</span>
                    <span className="text-emerald-300 font-semibold">{aiInsight.riskScore}/100</span>
                  </div>
                  {aiInsight.tips?.length ? (
                    <ul className="list-disc pl-5 text-xs text-gray-300">
                      {aiInsight.tips.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <div className="text-xs text-gray-400">Click “Generate Insight” to summarize live metrics.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modalSensor && (
        <Modal title={`${baseNameFromFull(modalSensor)} — ${facility}`} onClose={() => setModalSensor(null)}>
          <div style={{ height: 280 }}>
            <Line
              data={{
                datasets: [
                  {
                    label: baseNameFromFull(modalSensor),
                    data: history[modalSensor]?.slice(-30) || [],
                    fill: true,
                    backgroundColor: "rgba(143,227,179,0.10)",
                    borderColor: forest.ink,
                    pointRadius: 2,
                    tension: 0.33,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                  x: {
                    type: "time",
                    time: { unit: getTimeUnit(history[modalSensor]?.length || 10) },
                    ticks: { color: "#cbd5e1" },
                    grid: { color: forest.grid },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: { color: "#cbd5e1" },
                    grid: { color: forest.grid },
                  },
                },
              }}
            />
          </div>
        </Modal>
      )}

      {modalRoom && (
        <Modal title={`${modalRoom} — ${facility}`} onClose={() => setModalRoom(null)} wide>
          <RoomCharts roomName={modalRoom} buildRoomSeries4={buildRoomSeries4} getTimeUnit={getTimeUnit} />
        </Modal>
      )}

      <div className="fixed bottom-4 right-4 space-y-2 z-[60]">
        {toasts.map(({ id, t }) => (
          <div key={id} className="px-4 py-2 rounded shadow" style={{ background: forest.panel2, border: `1px solid ${forest.border}` }}>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function KPI({ title, value, variant }) {
  const color =
    variant === "danger"
      ? "text-red-400"
      : variant === "warn"
      ? "text-amber-300"
      : variant === "ok"
      ? "text-emerald-300"
      : "text-[#8FE3B3]";
  return (
    <div className="rounded-xl p-4" style={{ background: "#0c100e", border: "1px solid #1d2320" }}>
      <div className="text-xs text-gray-400">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Row({ k, v, vClass }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-300">{k}:</span>
      <span className={`font-semibold ${vClass || ""}`}>{v}</span>
    </div>
  );
}

function Mini({ title, data }) {
  return (
    <div className="rounded-xl p-3" style={{ background: forest.panel, border: "1px solid #1d2320" }}>
      <h4 className="text-xs text-gray-300 mb-1">{title}</h4>
      <div style={{ height: 90 }}>
        <Line
          data={{
            datasets: [
              {
                label: title,
                data,
                fill: true,
                backgroundColor: "rgba(143,227,179,0.10)",
                borderColor: "#8FE3B3",
                pointRadius: 0,
                tension: 0.25,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { type: "time", time: { unit: "minute" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.04)" } },
              y: { beginAtZero: true, ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.04)" } },
            },
          }}
        />
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-2xl w-full ${wide ? "max-w-5xl" : "max-w-2xl"} p-6 relative`}
        style={{ background: "#0c100e", border: "1px solid #1d2320" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="absolute top-3 right-3 text-gray-300 hover:text-white text-xl font-bold" onClick={onClose}>
          ×
        </button>
        <h2 className="text-xl font-bold mb-4" style={{ color: "#8FE3B3" }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function RoomCharts({ roomName, buildRoomSeries4, getTimeUnit }) {
  const roomData = useMemo(() => buildRoomSeries4(roomName), [roomName, buildRoomSeries4]);
  const types = [
    { key: "Temperature", color: "#FB923C", unit: "°C" },
    { key: "Humidity", color: "#60A5FA", unit: "%" },
    { key: "CO2", color: "#F472B6", unit: "ppm" },
    { key: "Light", color: "#A3E635", unit: "lux" },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {types.map((t) => {
        const series = roomData[t.key] || [];
        const latest = series[series.length - 1]?.y;
        return (
          <div key={t.key} className="rounded-xl p-3" style={{ background: forest.panel2, border: "1px solid #1d2320" }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs text-gray-300">{t.key}</div>
                <div className="font-bold">
                  {latest ?? "—"} {t.unit}
                </div>
              </div>
              <div className="text-xs text-gray-400">{series.length} pts</div>
            </div>
            <div style={{ height: 200 }}>
              <Line
                data={{
                  datasets: [
                    {
                      label: `${t.key} — ${roomName}`,
                      data: series,
                      fill: true,
                      backgroundColor: `${t.color}33`,
                      borderColor: t.color,
                      pointRadius: 2,
                      tension: 0.25,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: {
                      type: "time",
                      time: { unit: getTimeUnit(series?.length || 10) },
                      ticks: { color: "#cbd5e1" },
                      grid: { color: "rgba(255,255,255,0.06)" },
                    },
                    y: {
                      beginAtZero: true,
                      ticks: { color: "#cbd5e1" },
                      grid: { color: "rgba(255,255,255,0.06)" },
                    },
                  },
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
