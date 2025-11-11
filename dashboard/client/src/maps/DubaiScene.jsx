// src/maps/DubaiScene.jsx
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export default function DubaiScene() {
  const vehicles = useRef([]);
  const sun = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // vehicle orbiting paths
    vehicles.current.forEach((v, i) => {
      v.position.x = Math.cos(t * 0.3 + i) * 7;
      v.position.z = Math.sin(t * 0.3 + i) * 7;
    });
    // time-of-day shimmer
    const sunCycle = (Math.sin(t * 0.05) + 1.2) / 2;
    if (sun.current) sun.current.intensity = 0.4 + sunCycle * 0.9;
  });

  const districts = Array.from({ length: 7 }).map((_, i) => ({
    x: Math.cos((i / 7) * Math.PI * 2) * 5,
    z: Math.sin((i / 7) * Math.PI * 2) * 5,
  }));

  return (
    <group>
      <directionalLight ref={sun} position={[6, 8, 6]} color="#fff2b3" intensity={1} />
      <ambientLight intensity={0.4} color="#0affc1" />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0b1d17" metalness={0.3} roughness={0.8} />
      </mesh>

      {/* Palm layout buildings */}
      {districts.map((p, i) => (
        <mesh key={i} position={[p.x, 1, p.z]}>
          <boxGeometry args={[1.2, 2 + Math.random(), 1.2]} />
          <meshStandardMaterial color="#1bffb0" emissive="#00ffaa" emissiveIntensity={0.3} />
        </mesh>
      ))}

      {/* Hover vehicles */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} ref={(r) => (vehicles.current[i] = r)} position={[0, 2, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.6]} />
          <meshStandardMaterial color="#ffd85e" emissive="#ffdf7a" emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  );
}
