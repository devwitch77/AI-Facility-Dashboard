// client/src/components/CitySwitcher.jsx
import { useFacility } from "../FacilityContext";

export default function CitySwitcher() {
  const { facility, setFacility } = useFacility();

  const cities = ["Dubai", "London", "Tokyo"];

  return (
    <div className="flex gap-2 items-center">
      <span className="text-xs text-gray-400">Facility:</span>
      {cities.map((c) => (
        <button
          key={c}
          onClick={() => setFacility(c)}
          className={`px-3 py-1 rounded ${
            facility === c ? "bg-emerald-600 text-white" : "bg-zinc-800 text-gray-300"
          } transition`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
