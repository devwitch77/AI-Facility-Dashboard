// src/maps/TokyoScene.jsx
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export default function TokyoScene() {
  const trains = useRef([]);
  const lights = useRef([]);
  const sun = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    trains.current.forEach((train, i) => {
      train.position.x = ((t * 5 + i * 6) % 30) - 15;
    });
    lights.current.forEach((l, i) => {
      const flicker = (Math.sin(t * 5 + i) + 1.4) / 2;
      l.material.emissiveIntensity = flicker * 1.8;
    });
    const timeCycle = (Math.sin(t * 0.05) + 1.2) / 2;
    if (sun.current) sun.current.intensity = 0.4 + timeCycle * 0.8;
  });

  return (
    <group>
      <directionalLight ref={sun} position={[6, 8, 6]} color="#ffa84d" intensity={1} />
      <ambientLight intensity={0.5} color="#ff3a3a" />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1a0806" />
      </mesh>

      {/* Neon towers */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh
          key={i}
          ref={(r) => (lights.current[i] = r)}
          position={[Math.random() * 14 - 7, 1.4, Math.random() * 14 - 7]}
        >
          <boxGeometry args={[1, Math.random() * 3 + 1, 1]} />
          <meshStandardMaterial color="#ff0044" emissive="#ff4400" emissiveIntensity={0.6} />
        </mesh>
      ))}

      {/* Moving trains */}
      {Array.from({ length: 3 }).map((_, i) => (
        <mesh key={i} ref={(r) => (trains.current[i] = r)} position={[0, 0.4, i * 2 - 2]}>
          <boxGeometry args={[2, 0.3, 0.4]} />
          <meshStandardMaterial color="#ffd400" emissive="#ffa600" emissiveIntensity={0.7} />
        </mesh>
      ))}
    </group>
  );
}
