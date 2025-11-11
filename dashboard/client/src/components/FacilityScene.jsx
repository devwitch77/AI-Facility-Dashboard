// src/components/FacilityScene.jsx
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useFacility } from "../FacilityContext";
import { CITY_CONFIGS } from "../cityScenes";

function Ground({ color }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function PulsingBuilding({
  pos = [0, 0.8, 0],
  size = [1, 1.6, 1],
  color = "#222",
  emissive = "#000",
  glass = false,
  label = "",
  active = false,
}) {
  const group = useRef();
  const meshRef = useRef();
  const haloRef = useRef();

  useFrame((_, dt) => {
    const t = performance.now() * 0.006;

    if (group.current) {
      const pulse = active ? 1 + 0.08 * Math.sin(t * 3) : 1;
      const yPulse = active ? 1 + 0.12 * Math.abs(Math.sin(t * 2)) : 1;
      group.current.scale.set(pulse, yPulse, pulse);
    }

    if (meshRef.current) {
      const mat = meshRef.current.material;
      if (mat) {
        mat.emissiveIntensity = active ? 1.2 + 0.8 * Math.abs(Math.sin(t * 2)) : (glass ? 0.4 : 0.1);
        if (active) {
          mat.color.offsetHSL(0, 0, 0.0015);
        }
      }
    }

    if (haloRef.current) {
      haloRef.current.visible = active;
      if (active) {
        haloRef.current.material.opacity = 0.45 + 0.25 * Math.abs(Math.sin(t * 2));
        haloRef.current.rotation.y += dt * 0.8;
      }
    }
  });

  return (
    <group position={pos} ref={group}>
      {/* main block */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          emissive={active ? "#ff3b3b" : emissive}
          emissiveIntensity={active ? 1.5 : (glass ? 0.4 : 0.1)}
          roughness={glass ? 0.15 : 0.9}
          metalness={glass ? 0.8 : 0.1}
        />
      </mesh>

      {/* halo ring */}
      <mesh ref={haloRef} position={[0, size[1] * 0.55, 0]} visible={false}>
        <torusGeometry args={[Math.max(size[0], size[2]) * 0.75, 0.06, 8, 64]} />
        <meshBasicMaterial color="#ff5555" transparent opacity={0.0} />
      </mesh>

      {/* label chip */}
      <Html distanceFactor={10} position={[0, size[1] * 0.65, 0]}>
        <div
          style={{
            padding: "2px 8px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: active ? "#ffe1e1" : "#e6f0ff",
            background: active ? "rgba(40,0,0,0.75)" : "rgba(0,0,20,0.70)",
            border: "1px solid rgba(255,255,255,0.25)",
            textShadow: "0 1px 2px rgba(0,0,0,0.7)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

function Spinner({ pos = [0, 3, 0], color = "#fff", radius = 1.4, speed = 0.02 }) {
  const a = useRef(0);
  const ref = useRef();
  useFrame((_, dt) => {
    a.current += dt * speed;
    if (ref.current) {
      ref.current.position.x = pos[0] + Math.cos(a.current) * radius;
      ref.current.position.z = pos[2] + Math.sin(a.current) * radius;
    }
  });
  return (
    <mesh ref={ref} position={pos}>
      <boxGeometry args={[0.2, 0.2, 0.2]} />
      <meshStandardMaterial color={color} emissive={color} />
    </mesh>
  );
}

function SimpleWindTurbine({ pos = [0, 1, 0], color = "#bbb" }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 1.2;
  });
  return (
    <group position={pos}>
      <mesh>
        <cylinderGeometry args={[0.05, 0.05, 1.4, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh ref={ref} position={[0, 0.8, 0]}>
        <boxGeometry args={[0.9, 0.05, 0.08]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function TimeOfDayLights({ palette, ambientHex, dirIntensity, t, dangerAny }) {
  const amb = useRef();
  const dir = useRef();
  useFrame(() => {
    if (!amb.current || !dir.current) return;
    const ambI = 0.4 + 0.4 * t;
    const baseDir = dangerAny ? 0.8 * dirIntensity : dirIntensity;
    const dirI = baseDir * (1.0 - 0.3 * t);
    amb.current.intensity = ambI;
    dir.current.intensity = dirI;
  });

  return (
    <>
      <ambientLight ref={amb} color={ambientHex} intensity={0.6} />
      <directionalLight
        ref={dir}
        position={[6, 8, 6]}
        castShadow
        intensity={dirIntensity}
        color={palette.accent}
      />
    </>
  );
}

const SENSOR_ORDER = [
  "Temperature Sensor 1",
  "Humidity Sensor 1",
  "CO2 Sensor 1",
  "Light Sensor 1",
];

export function FacilityScene({ dangerSensors = new Set() }) {
  const { facility } = useFacility();
  const cfg = CITY_CONFIGS[facility] || CITY_CONFIGS.Dubai;

  const now = new Date();
  const frac = (now.getHours() + now.getMinutes() / 60) / 24; // 0..1
  const t = Math.min(1, Math.max(0, (frac - 0.2) / (0.8 - 0.2))); // morning -> dusk

  const group = useRef();
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * cfg.rotationSpeed;
  });

  const blocks = useMemo(() => {
    if (facility === "Dubai") {
      return [
        { pos: [0, 0.8, 0], size: [2.2, 1.6, 2.2], glass: true },
        { pos: [0, 0.8, 3], size: [1.2, 1.4, 1.2] },
        { pos: [3, 0.8, 0], size: [1.2, 1.6, 1.2] },
        { pos: [0, 0.8, -3], size: [1.2, 1.2, 1.2] },
        { pos: [-3, 0.8, 0], size: [1.2, 1.8, 1.2] },
      ];
    }
    if (facility === "London") {
      return [
        { pos: [-1.2, 0.8, -0.8], size: [1.4, 1.6, 1.2] },
        { pos: [1.4, 0.8, -0.6], size: [1.2, 1.4, 1.6] },
        { pos: [-0.2, 0.8, 1.6], size: [1.2, 1.8, 1.2] },
      ];
    }
    
    const arr = [];
    for (let x = -2; x <= 2; x += 2) {
      for (let z = -2; z <= 2; z += 2) {
        arr.push({
          pos: [x, 0.6 + Math.random() * 1.2, z],
          size: [0.9, 1 + Math.random() * 1.6, 0.9],
        });
      }
    }
    return arr;
  }, [facility]);

  const dangerAny = dangerSensors && dangerSensors.size > 0;

  return (
    <>
      <TimeOfDayLights
        palette={cfg.palette}
        ambientHex={cfg.ambient}
        dirIntensity={cfg.dirIntensity}
        t={t}
        dangerAny={dangerAny}
      />
      <Ground color={cfg.palette.ground} />

      <group ref={group}>
        {blocks.map((b, i) => {
          const sensorName = SENSOR_ORDER[i % SENSOR_ORDER.length];
          const isDanger = !!dangerSensors?.has?.(sensorName);
          return (
            <PulsingBuilding
              key={i}
              pos={b.pos}
              size={b.size}
              color={cfg.palette.block}
              emissive={cfg.palette.accent}
              glass={b.glass}
              label={sensorName}
              active={isDanger}
            />
          );
        })}

        {}
        {facility === "Dubai" && (
          <>
            <SimpleWindTurbine pos={[2.8, 0, 2.8]} />
            <Spinner
              pos={[0, 2.8, 0]}
              color={cfg.palette.accent}
              radius={2.2}
              speed={0.8 * cfg.rotationSpeed * 80}
            />
          </>
        )}
        {facility === "London" && (
          <Spinner
            pos={[0, 3.2, 0]}
            color={cfg.palette.accent}
            radius={3}
            speed={cfg.rotationSpeed * 120}
          />
        )}
      </group>
    </>
  );
}
