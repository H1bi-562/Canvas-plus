// routes/analytics.js
// UC21 – Study Analytics Dashboard.
//
//   GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=America/Los_Angeles
//
// from/to are inclusive dates in the student's time zone; both are optional and
// default to the last 30 days. tz is required so days and weeks match the
// student's calendar rather than the server's.

const express   = require('express');
const auth      = require('../middleware/authMiddleware');
const analytics = require('../services/analytics');

const router = express.Router();
router.use(auth);

router.get('/summary', async (req, res) => {
  try {
    const { from, to, tz } = req.query;
    res.json(await analytics.getSummary(req.user.id, { from, to, tz }));
  } catch (err) {
    if (err instanceof analytics.AnalyticsError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Analytics summary error:', err.message);
    res.status(500).json({ error: 'Failed to compute analytics' });
  }
});

module.exports = router;
