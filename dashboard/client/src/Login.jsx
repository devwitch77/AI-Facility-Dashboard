import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useTheme } from "./ThemeContext";

export default function Login() {
  const { login } = useAuth();
  const { bundles } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const creds = [
    { role: "Admin", email: "admin@facility.com", pass: "admin123" },
    { role: "Operator", email: "operator@facility.com", pass: "operator123" },
    { role: "Viewer", email: "viewer@facility.com", pass: "viewer123" },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const ok = await login(email.trim(), password);
      if (ok) {
        navigate("/");
      } else {
        setError("Invalid email or password.");
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text, role) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(role);
      setTimeout(() => setCopied(""), 1200);
    } catch {}
  };

  return (
    <div className={`min-h-screen w-full flex items-center justify-center px-4 ${bundles.hardBg}`}>
      <div className={`w-full max-w-md rounded-2xl p-8 ${bundles.panel}`}>
        <h1 className={`text-2xl font-bold mb-6 ${bundles.accentText}`}>Smart Facility System</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm opacity-75 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                backgroundColor: "rgba(20,20,20,0.9)",
                color: "#eaeaea",
                border: "1px solid #333",
              }}
              className="w-full px-4 py-2 rounded focus:border-emerald-400 focus:outline-none"
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm opacity-75 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                backgroundColor: "rgba(20,20,20,0.9)",
                color: "#eaeaea",
                border: "1px solid #333",
              }}
              className="w-full px-4 py-2 rounded focus:border-emerald-400 focus:outline-none"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-sm text-red-300 border border-red-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`${bundles.btnPrimary} w-full py-2 rounded font-semibold`}
            style={{ opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Logging in…" : "Log In"}
          </button>
        </form>

        <div className="mt-8 text-sm">
          <h2 className={`${bundles.accentText} font-semibold mb-2`}>Demo Credentials</h2>
          <div className="space-y-2">
            {creds.map((u) => (
              <div
                key={u.role}
                className={`flex items-center justify-between px-3 py-2 rounded ${bundles.panel}`}
              >
                <div>
                  <div className="font-semibold">{u.role}</div>
                  <div className="opacity-80 text-xs">
                    {u.email} / {u.pass}
                  </div>
                </div>
                <button
                  className="text-xs px-2 py-1 rounded border border-white/20 hover:bg-white/10 transition"
                  onClick={() => copy(`${u.email} ${u.pass}`, u.role)}
                >
                  {copied === u.role ? "Copied!" : "Copy"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
