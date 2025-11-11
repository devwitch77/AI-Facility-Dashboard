export const FLOORPLAN_BY_CITY = {
  Dubai: [
    { name: "Server Room", top: 0.05, left: 0.05, width: 0.4, height: 0.4 },
    { name: "Office 1",    top: 0.05, left: 0.55, width: 0.4, height: 0.4 },
    { name: "Office 2",    top: 0.55, left: 0.05, width: 0.4, height: 0.4 },
    { name: "Lobby",       top: 0.55, left: 0.55, width: 0.4, height: 0.4 },
  ],
  London: [
    { name: "Ops A", top: 0.05, left: 0.05, width: 0.45, height: 0.35 },
    { name: "Ops B", top: 0.55, left: 0.05, width: 0.45, height: 0.35 },
    { name: "NetLab", top: 0.05, left: 0.55, width: 0.4, height: 0.4 },
    { name: "Reception", top: 0.55, left: 0.55, width: 0.4, height: 0.4 },
  ],
  Tokyo: [
    { name: "Core-1", top: 0.05, left: 0.08, width: 0.36, height: 0.36 },
    { name: "Core-2", top: 0.52, left: 0.08, width: 0.36, height: 0.40 },
    { name: "Labs",   top: 0.05, left: 0.52, width: 0.40, height: 0.36 },
    { name: "Gate",   top: 0.52, left: 0.52, width: 0.40, height: 0.40 },
  ]
};

export const SENSOR_POS_BY_CITY = {
  Dubai: {
    "Temperature Sensor 1": { room: "Server Room", top: 0.2, left: 0.3 },
    "Humidity Sensor 1":    { room: "Office 1",    top: 0.4, left: 0.5 },
    "CO2 Sensor 1":         { room: "Office 2",    top: 0.6, left: 0.4 },
    "Light Sensor 1":       { room: "Lobby",       top: 0.3, left: 0.6 },
  },
  London: {
    "Temperature Sensor 1": { room: "Ops A",    top: 0.3, left: 0.35 },
    "Humidity Sensor 1":    { room: "Ops B",    top: 0.6, left: 0.35 },
    "CO2 Sensor 1":         { room: "NetLab",   top: 0.55, left: 0.55 },
    "Light Sensor 1":       { room: "Reception",top: 0.35, left: 0.65 },
  },
  Tokyo: {
    "Temperature Sensor 1": { room: "Core-1", top: 0.25, left: 0.3 },
    "Humidity Sensor 1":    { room: "Core-2", top: 0.65, left: 0.35 },
    "CO2 Sensor 1":         { room: "Labs",   top: 0.5,  left: 0.6 },
    "Light Sensor 1":       { room: "Gate",   top: 0.3,  left: 0.6 },
  }
};

export const tag = (facility, sensorName) => `${facility} — ${sensorName}`;
export const untag = (sensorName) => sensorName.includes(" — ") ? sensorName.split(" — ").slice(1).join(" — ") : sensorName;
