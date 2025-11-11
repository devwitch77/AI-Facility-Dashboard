// client/src/socket.js
import io from "socket.io-client";

const API_BASE =
  (import.meta.env.VITE_API_BASE && import.meta.env.VITE_API_BASE.replace(/\/+$/, "")) ||
  "http://localhost:5000";

export const socket = io(API_BASE, { transports: ["websocket"] });
