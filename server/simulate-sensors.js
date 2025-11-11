import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool } = pkg;
import fetch from "node-fetch"; 
import { io } from "socket.io-client";

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

const socket = io("http://localhost:5000");

const sensors = [
  { name: "Temperature Sensor 1", unit: "°C", min: 20, max: 30 },
  { name: "Humidity Sensor 1", unit: "%", min: 30, max: 70 },
  { name: "CO2 Sensor 1", unit: "ppm", min: 400, max: 800 },
  { name: "Light Sensor 1", unit: "lux", min: 100, max: 700 },
];

console.log("🚀 Sensor simulator started...");

function randomValue(min, max) {
  return (Math.random() * (max - min) + min).toFixed(2);
}

setInterval(async () => {
  for (const sensor of sensors) {
    const value = randomValue(sensor.min, sensor.max);

    const query = `
      UPDATE sensors
      SET value=$1, updated_at=NOW()
      WHERE name=$2
      RETURNING *;
    `;
    try {
      const result = await pool.query(query, [value, sensor.name]);
      const updatedSensor = result.rows[0];

      socket.emit("sensor-updated", updatedSensor);
      console.log(`✅ Updated ${sensor.name}: ${value}${sensor.unit}`);
    } catch (err) {
      console.error("❌ Error updating sensor:", err);
    }
  }
}, 3000); 
