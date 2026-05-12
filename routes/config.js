// routes/config.js
// UC12 – reads/writes the Config and CalendarConfig tables
// UC2  – Canvas URL + key stored here before sync
// UC3  – Google Calendar key stored here before OAuth

const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');

const router = express.Router();

// All config routes require a valid JWT
router.use(auth);

// ── GET /api/config ───────────────────────────────────────────────────────
// Returns the current user's config (keys masked for security in a real app)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c."canvasURL", c."canvasKey", c."calendarKey", c."modelKey",
              c."updatedAt",
              cc."defaultCalendar", cc."filteredEvents"
       FROM "Config" c
       LEFT JOIN "CalendarConfig" cc ON cc."configID" = c.id
       WHERE c."userID" = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Config not found for this user' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get config error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve config' });
  }
});

// ── PUT /api/config ───────────────────────────────────────────────────────
// Saves Canvas URL, Canvas key, Google Calendar key, or AI model key.
// Also creates/updates CalendarConfig with defaultCalendar preference.
// Body: { canvasURL, canvasKey, calendarKey, modelKey, defaultCalendar, filteredEvents }
router.put('/', async (req, res) => {
  const { canvasURL, canvasKey, calendarKey, modelKey, defaultCalendar, filteredEvents } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update Config row for this user (UC12 – data storage)
    const configResult = await client.query(
      `UPDATE "Config"
       SET "canvasURL"   = COALESCE($1, "canvasURL"),
           "canvasKey"   = COALESCE($2, "canvasKey"),
           "calendarKey" = COALESCE($3, "calendarKey"),
           "modelKey"    = COALESCE($4, "modelKey"),
           "updatedAt"   = NOW()
       WHERE "userID" = $5
       RETURNING id`,
      [canvasURL, canvasKey, calendarKey, modelKey, req.user.id]
    );

    const configID = configResult.rows[0].id;

    // Upsert CalendarConfig if calendar preferences were provided
    if (defaultCalendar !== undefined || filteredEvents !== undefined) {
      await client.query(
        `INSERT INTO "CalendarConfig" ("configID", "defaultCalendar", "filteredEvents")
         VALUES ($1, $2, $3)
         ON CONFLICT ("configID")
         DO UPDATE SET
           "defaultCalendar" = COALESCE($2, "CalendarConfig"."defaultCalendar"),
           "filteredEvents"  = COALESCE($3, "CalendarConfig"."filteredEvents"),
           "updatedAt"       = NOW()`,
        [configID, defaultCalendar, filteredEvents ? JSON.stringify(filteredEvents) : null]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Config saved successfully' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update config error:', err.message);
    res.status(500).json({ error: 'Failed to update config' });
  } finally {
    client.release();
  }
});

module.exports = router;