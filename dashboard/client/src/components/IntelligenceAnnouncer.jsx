
import { useEffect, useRef, useState } from "react";
import { speak, cancelAll, isPaused } from "../lib/tts";

const API_BASE =
  (import.meta.env.VITE_API_BASE && import.meta.env.VITE_API_BASE.replace(/\/+$/,"")) ||
  "http://localhost:5000";

export default function IntelligenceAnnouncer({ facility, cadenceSec = 45, tts = true }) {
  const [lastText, setLastText] = useState("");
  const timerRef = useRef(null);

  const announce = (text) => {
    if (!tts || !text || isPaused()) return;
    speak(text, { rate: 1.02, pitch: 1.0, volume: 1.0 });
  };

  const fetchAndAnnounce = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/ai/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility }),
      });
      if (!r.ok) return;
      const j = await r.json();
      const line = typeof j?.summary === "string" ? j.summary.trim() : "";
      if (!line || line === lastText) return;
      setLastText(line);
      announce(line);
    } catch {
      
    }
  };

  useEffect(() => {
    
    fetchAndAnnounce();
    
    timerRef.current = setInterval(fetchAndAnnounce, Math.max(15, cadenceSec) * 1000);
    return () => {
      clearInterval(timerRef.current);
      cancelAll(); 
    };
    
  }, [facility]);

  return null; 
}
