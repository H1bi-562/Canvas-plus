// routes/demo.js
// Dev-only demo data for previewing the site before real Canvas access exists.
// Mounted by server.js only when NODE_ENV is not "production".
//
//   POST   /api/demo   -> seed demo courses, assignments, and past sessions
//   DELETE /api/demo   -> remove this student's demo data

const express = require('express');
const auth    = require('../middleware/authMiddleware');
const demo    = require('../services/demoData');

const router = express.Router();
router.use(auth);

router.post('/', async (req, res) => {
  try {
    res.json(await demo.seedDemoData(req.user.id));
  } catch (err) {
    console.error('Seed demo data error:', err.message);
    res.status(500).json({ error: 'Failed to load demo data' });
  }
});

router.delete('/', async (req, res) => {
  try {
    res.json(await demo.clearDemoData(req.user.id));
  } catch (err) {
    console.error('Clear demo data error:', err.message);
    res.status(500).json({ error: 'Failed to remove demo data' });
  }
});

module.exports = router;
