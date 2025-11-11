// src/components/MiniFacility.jsx
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useFacility } from "../FacilityContext";
import { useRef } from "react";

function MiniScene({ facility }) {
  const lights = useRef([]);
  const vehicles = useRef([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    vehicles.current.forEach((v, i) => {
      v.position.x = Math.cos(t * 0.5 + i) * 2.5;
      v.position.z = Math.sin(t * 0.5 + i) * 2.5;
    });
    lights.current.forEach((l, i) => {
      const pulse = (Math.sin(t * 2 + i) + 1.2) / 2;
      l.material.emissiveIntensity = pulse * 1.2;
    });
  });

  const palette = {
    Dubai: { base: "#1bffb0", glow: "#00ffaa", ground: "#0b1d17" },
    London: { base: "#b49efc", glow: "#7040ff", ground: "#1a132b" },
    Tokyo: { base: "#ff0044", glow: "#ff4400", ground: "#1a0806" },
  }[facility] || { base: "#8FE3B3", glow: "#1b3d2f", ground: "#0c100e" };

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color={palette.ground} />
      </mesh>

      {/* central district */}
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh key={i} ref={(r) => (lights.current[i] = r)} position={[Math.cos(i * 1.6) * 2, 1, Math.sin(i * 1.6) * 2]}>
          <boxGeometry args={[0.9, 1.6 + Math.random() * 0.5, 0.9]} />
          <meshStandardMaterial color={palette.base} emissive={palette.glow} emissiveIntensity={0.5} />
        </mesh>
      ))}

      {/* hover vehicles */}
      {Array.from({ length: 3 }).map((_, i) => (
        <mesh key={i} ref={(r) => (vehicles.current[i] = r)} position={[0, 1.5, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.6]} />
          <meshStandardMaterial color={palette.glow} emissive={palette.glow} emissiveIntensity={1} />
        </mesh>
      ))}
    </group>
  );
}

export default function MiniFacility() {
  const { facility } = useFacility();
  return (
    <Canvas shadows camera={{ position: [0, 5, 7], fov: 55 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} castShadow />
      <MiniScene facility={facility} />
      <OrbitControls enableZoom={false} enablePan={false} enableDamping dampingFactor={0.15} />
    </Canvas>
  );
}
