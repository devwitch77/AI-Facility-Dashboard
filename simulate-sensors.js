import fetch from "node-fetch";

const API_URL = "http://localhost:5000/api/sensors";

const sensors = [
  { name: "Temperature Sensor 1", unit: "°C", min: 20, max: 30 },
  { name: "Humidity Sensor 1", unit: "%", min: 30, max: 70 },
  { name: "CO2 Sensor 1", unit: "ppm", min: 400, max: 800 },
  { name: "Light Sensor 1", unit: "lux", min: 100, max: 800 },
];

function getRandomValue(min, max) {
  return (Math.random() * (max - min) + min).toFixed(2);
}

async function sendData() {
  for (const sensor of sensors) {
    const value = getRandomValue(sensor.min, sensor.max);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sensor.name,
          value,
          unit: sensor.unit,
        }),
      });

      const data = await res.json();
      console.log(`✅ Updated ${sensor.name}: ${value}${sensor.unit}`);
    } catch (err) {
      console.error("❌ Error sending data:", err.message);
    }
  }
}

setInterval(sendData, 5000);
console.log("🚀 Sensor simulator started...");
