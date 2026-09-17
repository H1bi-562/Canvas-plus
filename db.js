require('dotenv').config();
const { Pool } = require('pg');

// Neon hands out one connection string (Console -> Connect). When DATABASE_URL
// is set it wins, so pointing the app at a personal Neon branch is a one-line
// .env change. Otherwise the individual DB_* variables are used as before.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: true
    });

module.exports = pool;
