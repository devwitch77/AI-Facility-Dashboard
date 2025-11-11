// src/maps/LondonScene.jsx
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export default function LondonScene() {
  const drone = useRef();
  const sun = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (drone.current) {
      drone.current.position.x = Math.sin(t * 0.8) * 5;
      drone.current.position.z = Math.cos(t * 0.8) * 5;
      drone.current.rotation.y = t;
    }
    const dusk = (Math.sin(t * 0.05) + 1.2) / 2;
    if (sun.current) sun.current.intensity = 0.3 + dusk * 0.7;
  });

  return (
    <group>
      <fog attach="fog" args={["#2d1f46", 6, 30]} />
      <directionalLight ref={sun} position={[6, 8, 6]} color="#cfc0ff" />
      <ambientLight intensity={0.4} color="#5a3cff" />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[35, 35]} />
        <meshStandardMaterial color="#1a132b" />
      </mesh>

      {/* Buildings + bridges */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[i * 2 - 8, 1.2, Math.sin(i) * 3]}>
          <boxGeometry args={[1.2, 2 + Math.random() * 1.5, 1.2]} />
          <meshStandardMaterial color="#b49efc" emissive="#7040ff" emissiveIntensity={0.4} />
        </mesh>
      ))}

      {/* Drone spotlight */}
      <pointLight ref={drone} intensity={3} color="#a6c9ff" position={[0, 6, 0]} />
    </group>
  );
}
