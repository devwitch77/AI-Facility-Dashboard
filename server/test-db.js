// test-db.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'smart_facility_db',
  password: 'postgres123',
  port: 5432
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('❌ DB error:', err);
  else console.log('✅ DB connected:', res.rows[0]);
  pool.end();
});
