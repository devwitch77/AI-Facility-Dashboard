import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import Login from "./Login";
import Dashboard from "./Dashboard";
import MapPage from "./MapPage";
import Reports from "./Reports";
import Settings from "./Settings";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { FacilityProvider, useFacility } from "./FacilityContext";
import { Link } from "react-router-dom";

function Sidebar() {
  const { bundles } = useTheme();
  const { user } = useAuth();

  return (
    <div className={`${bundles.panel} h-screen w-64 flex flex-col items-start px-6 py-6`}>
      <h2 className={`text-xl font-bold ${bundles.accentText} mb-8`}>Smart Facility</h2>
      <nav className="flex flex-col gap-4 w-full">
        <Link to="/" className="hover:text-emerald-400 transition">Dashboard</Link>
        <Link to="/map" className="hover:text-emerald-400 transition">3D Map</Link>
        <Link to="/reports" className="hover:text-emerald-400 transition">Reports</Link>
        <Link to="/settings" className="hover:text-emerald-400 transition">Settings</Link>
      </nav>
      {user && (
        <div className="mt-auto text-xs text-zinc-400">
          Logged in as: <span className="text-emerald-400">{user.role}</span>
        </div>
      )}
    </div>
  );
}

function Topbar() {
  const { bundles } = useTheme();
  const { user, logout } = useAuth();
  const { facility } = useFacility();

  if (!user) return null;

  return (
    <div
      className={`w-full h-14 flex justify-between items-center px-6 border-b ${bundles.border} bg-black/30 backdrop-blur-sm`}
    >
      <h3 className={`font-semibold ${bundles.accentText}`}>
        {user.role.toUpperCase()} — {facility}
      </h3>
      <button onClick={logout} className={`${bundles.btnPrimary} text-sm px-4 py-1`}>
        Logout
      </button>
    </div>
  );
}

function Layout({ children }) {
  const { bundles } = useTheme();
  return (
    <div className={bundles.pageBg}>
      <div className="flex">
        <Sidebar />
        <div className="flex-1 min-h-screen flex flex-col">
          <Topbar />
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FacilityProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute allowedRoles={["admin", "operator", "viewer"]}>
                    <Layout>
                      <Dashboard />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/map"
                element={
                  <ProtectedRoute allowedRoles={["admin", "operator", "viewer"]}>
                    <Layout>
                      <MapPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute allowedRoles={["admin", "operator"]}>
                    <Layout>
                      <Reports />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={["admin", "operator", "viewer"]}>
                    <Layout>
                      <Settings />
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Router>
        </FacilityProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
