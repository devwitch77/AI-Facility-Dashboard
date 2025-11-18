import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const router = express.Router();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

router.get("/summary", async (req, res) => {
  try {
    const facility = String(req.query.facility || "Dubai");
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 24 * 3600 * 1000);
    const to   = req.query.to   ? new Date(String(req.query.to))   : new Date();

    const { rows } = await pool.query(
      `
      SELECT sensor_name AS sensor, value::float AS value, recorded_at AS time
      FROM sensor_data
      WHERE recorded_at >= $1 AND recorded_at < $2
      ORDER BY recorded_at ASC
      `,
      [from.toISOString(), to.toISOString()]
    );

    const bySensor = {};
    for (const r of rows) {
      const key = `${facility} • ${r.sensor}`; 
      if (!bySensor[key]) bySensor[key] = [];
      bySensor[key].push(Number(r.value));
    }

    let activeAlerts = 0;

    let sumDev = 0, count = 0;
    const THRESHOLDS = {
      "Temperature Sensor 1": { min: 18, max: 28 },
      "Humidity Sensor 1":    { min: 30, max: 60 },
      "CO2 Sensor 1":         { min: 0,  max: 800 },
      "Light Sensor 1":       { min: 100, max: 700 },
    };

    Object.entries(bySensor).forEach(([full, arr]) => {
      const base = full.split("•")[1]?.trim() || full;
      const thr = THRESHOLDS[base];
      if (!thr || !arr.length) return;
      const v = arr[arr.length - 1];
      const mid = (thr.min + thr.max) / 2;
      const half = (thr.max - thr.min) / 2 || 1;
      const dev = Math.min(1, Math.abs(v - mid) / half);
      sumDev += dev; count++;
    });
    const avgDevPct = count ? ((sumDev / count) * 100) : 0;
    const stab = Math.max(0, 100 - avgDevPct * 0.6 - activeAlerts * 4);

    const lastTime = rows.length ? rows[rows.length - 1].time : null;

    res.json({
      ok: true,
      facility,
      range: { from: from.toISOString(), to: to.toISOString() },
      analytics: {
        stableText: `${Math.round(stab)}% stable`,
        lastAnomaly: lastTime ? new Date(lastTime).toLocaleTimeString() : "—",
        activeAlerts,
      }
    });
  } catch (e) {
    console.error("Report summary error:", e);
    res.status(500).json({ ok: false, error: "report_summary_failed" });
  }
});

// CSV export
router.get("/export.csv", async (req, res) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 24 * 3600 * 1000);
    const to   = req.query.to   ? new Date(String(req.query.to))   : new Date();

    const { rows } = await pool.query(
      `
      SELECT recorded_at AS time, sensor_name AS sensor, value::float AS value
      FROM sensor_data
      WHERE recorded_at >= $1 AND recorded_at < $2
      ORDER BY recorded_at ASC
      `,
      [from.toISOString(), to.toISOString()]
    );

    const header = "time,sensor,value\n";
    const body = rows.map(r => `${new Date(r.time).toISOString()},${r.sensor},${r.value}`).join("\n");
    const csv = header + body;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=facility-report.csv");
    res.send(csv);
  } catch (e) {
    console.error("export.csv error:", e);
    res.status(500).send("export_failed");
  }
});

router.get("/export.pdf", async (req, res) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 24 * 3600 * 1000);
    const to   = req.query.to   ? new Date(String(req.query.to))   : new Date();

    const { rows } = await pool.query(
      `
      SELECT recorded_at AS time, sensor_name AS sensor, value::float AS value
      FROM sensor_data
      WHERE recorded_at >= $1 AND recorded_at < $2
      ORDER BY recorded_at ASC
      `,
      [from.toISOString(), to.toISOString()]
    );

    try {
      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "A4", margin: 36 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=facility-report.pdf");
      doc.pipe(res);
      doc.fontSize(14).text("Smart Facility Report", { underline: true });
      doc.moveDown();
      rows.slice(0, 500).forEach(r => {
        doc.fontSize(10).text(`${new Date(r.time).toISOString()}  |  ${r.sensor}  |  ${r.value}`);
      });
      doc.end();
    } catch {
      res.status(204).end();
    }
  } catch (e) {
    console.error("export.pdf error:", e);
    res.status(500).send("export_failed");
  }
});

export default router;
