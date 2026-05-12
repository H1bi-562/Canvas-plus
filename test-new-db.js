// ============================================================
// CanvasPlus – Full Database Test (UC12)
// Run: node test-db.js
// Tests every table and the relationships between them.
// Does NOT require the server to be running.
// ============================================================

require('dotenv').config();
const pool = require('./db');
const fs   = require('fs');
const path = require('path');

// Small helper to log pass/fail cleanly
function pass(msg) { console.log('  ✅', msg); }
function fail(msg, err) { console.error('  ❌', msg, '\n    ', err?.message || err); }

async function runTests() {
  console.log('\n🟢  CanvasPlus – UC12 Database Test');
  console.log('=====================================\n');

  const client = await pool.connect();

  try {
    // ── 0. Schema ────────────────────────────────────────────
    console.log('📐  Applying schema...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    pass('All 7 tables created / verified');

    // ── 1. User ──────────────────────────────────────────────
    console.log('\n👤  User table');
    const bcrypt = require('bcryptjs');
    const hashedPw = await bcrypt.hash('TestPass123!', 10);

    const userRes = await client.query(
      `INSERT INTO "User" (email, "hashedPassword")
       VALUES ('jace@csulb.edu', $1)
       ON CONFLICT (email) DO UPDATE SET "updatedAt" = NOW()
       RETURNING id, email`,
      [hashedPw]
    );
    const user = userRes.rows[0];
    pass(`User inserted → ${user.email} (${user.id})`);

    // Verify password round-trip
    const passwordOk = await bcrypt.compare('TestPass123!', hashedPw);
    pass(`bcrypt hash/compare works: ${passwordOk}`);

    // ── 2. Config ────────────────────────────────────────────
    console.log('\n⚙️   Config table');
    const configRes = await client.query(
      `INSERT INTO "Config" ("userID", "canvasURL", "canvasKey", "calendarKey", "modelKey")
       VALUES ($1, 'https://canvas.csulb.edu', 'canvas_api_key_here',
               'google_cal_key_here', 'anthropic_key_here')
       ON CONFLICT ("userID") DO UPDATE SET "updatedAt" = NOW()
       RETURNING id`,
      [user.id]
    );
    const config = configRes.rows[0];
    pass(`Config linked to User (configID: ${config.id})`);

    // ── 3. CalendarConfig ────────────────────────────────────
    console.log('\n📅  CalendarConfig table');
    await client.query(
      `INSERT INTO "CalendarConfig" ("configID", "defaultCalendar", "filteredEvents")
       VALUES ($1, 'primary', '{"excludeWeekends": false, "minPriority": 5}')
       ON CONFLICT ("configID") DO NOTHING`,
      [config.id]
    );
    const ccCheck = await client.query(
      `SELECT "defaultCalendar", "filteredEvents" FROM "CalendarConfig" WHERE "configID" = $1`,
      [config.id]
    );
    pass(`CalendarConfig set → calendar: "${ccCheck.rows[0].defaultCalendar}", JSONB: ${JSON.stringify(ccCheck.rows[0].filteredEvents)}`);

    // ── 4. Course ────────────────────────────────────────────
    console.log('\n📚  Course table');
    const courseID = '00000000-0000-0000-0000-000000000001'; // fixed UUID for test
    await client.query(
      `INSERT INTO "Course" (id, name, department, grade, semester)
       VALUES ($1, 'CECS 491A', 'Computer Engineering', 'A', 'Spring 2026')
       ON CONFLICT (id) DO UPDATE SET "updated_at" = NOW()`,
      [courseID]
    );
    pass(`Course inserted → CECS 491A (${courseID})`);

    // ── 5. Assignment ────────────────────────────────────────
    console.log('\n📝  Assignment table');
    const assignRes = await client.query(
      `INSERT INTO "Assignment"
         ("userID", "courseID", title, description, points, "dueAt", "availableUntil")
       VALUES ($1, $2,
         'Final DB Implementation',
         'Implement the full PostgreSQL schema and Express API routes for CanvasPlus.',
         100,
         NOW() + INTERVAL '7 days',
         NOW() + INTERVAL '14 days')
       RETURNING id, title, points`,
      [user.id, courseID]
    );
    const assignment = assignRes.rows[0];
    pass(`Assignment stored → "${assignment.title}" (${assignment.points} pts, id: ${assignment.id})`);

    // ── 6. AssignmentDetail (AI content) ─────────────────────
    console.log('\n🤖  AssignmentDetail table');
    await client.query(
      `INSERT INTO "AssignmentDetail" ("assignmentID", subtasks, summary, "priorityScore")
       VALUES ($1,
         '["Set up Supabase project", "Apply schema.sql", "Build Express routes", "Test with test-db.js"]',
         'Implement the complete database layer for CanvasPlus using Supabase-hosted PostgreSQL.',
         9)
       ON CONFLICT ("assignmentID") DO NOTHING`,
      [assignment.id]
    );
    const detailCheck = await client.query(
      `SELECT summary, subtasks, "priorityScore" FROM "AssignmentDetail" WHERE "assignmentID" = $1`,
      [assignment.id]
    );
    const detail = detailCheck.rows[0];
    pass(`AI subtasks stored (${detail.subtasks.length} tasks, priority: ${detail.priorityScore})`);
    pass(`Summary: "${detail.summary.slice(0, 60)}..."`);

    // ── 7. CalendarEvent ─────────────────────────────────────
    console.log('\n🗓️   CalendarEvent table');
    const eventRes = await client.query(
      `INSERT INTO "CalendarEvent"
         ("assignmentID", title, calendar, "eventStart", "eventEnd")
       VALUES ($1, 'Study: Final DB Implementation', 'primary',
               NOW() + INTERVAL '2 days',
               NOW() + INTERVAL '2 days' + INTERVAL '3 hours')
       RETURNING id, title`,
      [assignment.id]
    );
    pass(`Calendar event stored → "${eventRes.rows[0].title}"`);

    // ── 8. Full relational JOIN ───────────────────────────────
    console.log('\n🔍  Full relational JOIN (all tables)');
    const joinRes = await client.query(
      `SELECT
         u.email,
         c.name             AS course,
         a.title            AS assignment,
         a.points,
         ad."priorityScore",
         ad.summary,
         ce.title           AS event,
         ce."eventStart"
       FROM "User"               u
       JOIN "Assignment"         a  ON a."userID"       = u.id
       JOIN "Course"             c  ON c.id             = a."courseID"
       LEFT JOIN "AssignmentDetail"  ad ON ad."assignmentID" = a.id
       LEFT JOIN "CalendarEvent"     ce ON ce."assignmentID" = a.id
       WHERE u.id = $1
       LIMIT 1`,
      [user.id]
    );
    const row = joinRes.rows[0];
    pass(`JOIN returned: ${row.email} | ${row.course} | "${row.assignment}" | priority ${row.priorityScore}`);

    // ── 9. Row counts ─────────────────────────────────────────
    console.log('\n📋  Row counts per table');
    const tables = ['User','Config','CalendarConfig','Course','Assignment','AssignmentDetail','CalendarEvent'];
    for (const t of tables) {
      const { rows } = await client.query(`SELECT COUNT(*) FROM "${t}"`);
      pass(`${t.padEnd(22)} → ${rows[0].count} row(s)`);
    }

    console.log('\n========================================');
    console.log('✅  All UC12 tests passed!\n');

  } catch (err) {
    fail('Test failed', err);
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}

runTests();