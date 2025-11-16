const RAW =
  (import.meta.env.VITE_API_BASE &&
    import.meta.env.VITE_API_BASE.replace(/\/+$/, "")) ||
  "http://localhost:5000";

export const API_BASE = RAW;

export const AI_BASE = `${API_BASE}/api/ai`;
