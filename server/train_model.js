// server/train_model.js
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stdev(arr) {
  if (arr.length < 2) return 1; 
  const m = mean(arr);
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1);
  return Math.max(Math.sqrt(v), 1e-6);
}

async function train(days = 7) {
  console.log(` Training model on last ${days} day(s) of sensor_data...`);
  const q = `
    SELECT sensor_name, value::float
    FROM sensor_data
    WHERE recorded_at >= NOW() - INTERVAL '${days} days'
  `;
  const { rows } = await pool.query(q);

  const bySensor = {};
  for (const r of rows) {
    const k = String(r.sensor_name);
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    if (!bySensor[k]) bySensor[k] = [];
    bySensor[k].push(v);
  }

  const model = { trainedAt: new Date().toISOString(), sensors: {} };
  for (const [name, arr] of Object.entries(bySensor)) {
    const m = mean(arr);
    const s = stdev(arr);
    model.sensors[name] = { mean: +m.toFixed(4), stdev: +s.toFixed(4), n: arr.length };
  }

  const outDir = path.join(process.cwd(), "server", "ml");
  const outFile = path.join(outDir, "model.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(model, null, 2));
  console.log(`✅ Model written to ${outFile} (${Object.keys(model.sensors).length} sensors)`);
}

train()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Training failed:", e);
    process.exit(1);
  });
