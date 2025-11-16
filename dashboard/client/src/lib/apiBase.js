// dashboard/client/src/lib/apiBase.js
export const API_BASE =
  (import.meta.env.VITE_API_BASE &&
    import.meta.env.VITE_API_BASE.replace(/\/+$/, "")) ||
  "http://localhost:5000";
