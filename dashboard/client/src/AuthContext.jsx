import { createContext, useContext, useEffect, useState } from "react";

const Ctx = createContext(null);

// 🔹 Base URL for the API (local in dev, Railway in prod)
const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:5000";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem("token") || "");

  useEffect(() => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else localStorage.removeItem("user");
  }, [user]);

  useEffect(() => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }, [token]);

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (!data?.token) return false;

      setToken(data.token);
      setUser({
        email: data.email,
        role: data.role,
        id: data.id || 0,
      });

      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken("");
  };

  return (
    <Ctx.Provider value={{ user, token, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
