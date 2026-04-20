const pool = require('./db');

async function testDB() {
  try {
    console.log("Connecting to database...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        title TEXT,
        due_date DATE
      );
    `);

    console.log("Table ready.");

    await pool.query(`
      INSERT INTO assignments (title, due_date)
      VALUES ('Test Assignment', '2026-04-20');
    `);

    console.log("Inserted data.");

    const result = await pool.query(`SELECT * FROM assignments`);

    console.log("Retrieved data:");
    console.log(result.rows);

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

testDB();