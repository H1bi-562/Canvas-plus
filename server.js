require('dotenv').config();
const express = require('express');

// Import routes
const authRoutes        = require('./routes/auth');
const configRoutes      = require('./routes/config');
const assignmentRoutes  = require('./routes/assignments');
const calendarRoutes    = require('./routes/calendar');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────
app.use(express.json()); // parse JSON request bodies

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/config',      configRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/calendar',    calendarRoutes);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'CanvasPlus API running', version: '1.0.0' });
});

// ── 404 catch-all ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 CanvasPlus API running on http://localhost:${PORT}`);
  console.log(`   Routes: /api/auth  /api/config  /api/assignments  /api/calendar\n`);
});