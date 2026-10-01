// routes/scheduler.js
// UC8 -- thin REST wrapper around services/scheduler.js so the smart
// scheduler can be triggered (and demoed) end to end.

const express = require('express');
const auth = require('../middleware/authMiddleware');
const { autoScheduleForUser } = require('../services/scheduler');

const router = express.Router();
router.use(auth);

// ── POST /api/scheduler/auto-schedule ──────────────────────────────────────
// Body (all optional): { windowStart, windowEnd, dailyStartHour, dailyEndHour }
// Places any of the logged-in user's un-scheduled, estimated assignments
// into open calendar time and returns what got scheduled vs. what didn't.
router.post('/auto-schedule', async (req, res) => {
  try {
    const { windowStart, windowEnd, dailyStartHour, dailyEndHour } = req.body || {};
    const options = {};
    if (windowStart) options.windowStart = new Date(windowStart);
    if (windowEnd) options.windowEnd = new Date(windowEnd);
    if (dailyStartHour !== undefined) options.dailyStartHour = dailyStartHour;
    if (dailyEndHour !== undefined) options.dailyEndHour = dailyEndHour;

    const result = await autoScheduleForUser(req.user.id, options);
    res.status(201).json(result);
  } catch (err) {
    console.error('Auto-schedule error:', err.message);
    res.status(500).json({ error: 'Failed to auto-schedule assignments' });
  }
});

module.exports = router;
