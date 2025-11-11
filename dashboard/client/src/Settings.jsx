// src/Settings.jsx
import { useTheme } from "./ThemeContext";
import { useFacility } from "./FacilityContext";

export default function Settings() {
  const { bundles, theme, setTheme, voiceEnabled, setVoiceEnabled } = useTheme();
  const { facility, setFacility } = useFacility();

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className={`${bundles.panel} rounded-xl p-6`}>
        <h2 className={`${bundles.accentText} text-xl font-semibold mb-4`}>Settings</h2>

        {/* Theme */}
        <div className="mb-6">
          <div className="font-semibold mb-2">Theme</div>
          <div className="flex gap-2">
            {["forest", "violet", "matte"].map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-1 rounded border ${theme === t ? bundles.btnPrimary : bundles.btn}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Facility */}
        <div className="mb-6">
          <div className="font-semibold mb-2">Active Facility</div>
          <div className="flex gap-2">
            {["Dubai", "London", "Tokyo"].map((c) => (
              <button
                key={c}
                onClick={() => setFacility(c)}
                className={`px-3 py-1 rounded border ${facility === c ? bundles.btnPrimary : bundles.btn}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Voice */}
        <div className="mb-2">
          <div className="font-semibold mb-2">Voice Alerts</div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
            />
            Enable female voice alerts
          </label>
        </div>
      </div>
    </div>
  );
}
