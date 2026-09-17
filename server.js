require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');

// Import routes
const authRoutes        = require('./routes/auth');
const configRoutes      = require('./routes/config');
const assignmentRoutes  = require('./routes/assignments');
const calendarRoutes    = require('./routes/calendar');
const sessionRoutes     = require('./routes/sessions');
const canvasRoutes      = require('./routes/canvas');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────
// CORS. The Vite dev server is a different origin (localhost:5173) than this
// API (localhost:3000), so every request from the UI is cross-origin. Because
// the client sends JSON bodies, the browser first sends an OPTIONS preflight;
// with no CORS headers on the reply it blocks the real request and fetch
// rejects, which the UI reports as "Network error".
//
// UC4 – auth is an httpOnly cookie, so the UI calls fetch with
// credentials: 'include'. The browser only sends that cookie, and only accepts
// the Set-Cookie on login, when the reply echoes the exact origin (never *) and
// sets Allow-Credentials.
//
// Dev only: any localhost/127.0.0.1 port is allowed so the port Vite happens to
// pick (5173, 5174, ...) does not matter. Tighten this to an explicit origin
// list before this is ever deployed anywhere public.
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && DEV_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  // Answer the preflight here; it must not fall through to the 404 catch-all.
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json()); // parse JSON request bodies
app.use(cookieParser());  // populates req.cookies from the Cookie header

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/config',      configRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/calendar',    calendarRoutes);
app.use('/api/sessions',    sessionRoutes);
app.use('/api/canvas',      canvasRoutes);
app.use('/api/analytics',   require('./routes/analytics'));

// Demo data for previewing the UI without Canvas access. Never in production:
// it writes fake coursework into the real database.
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/demo', require('./routes/demo'));
}

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
  console.log(`   Routes: /api/auth  /api/config  /api/assignments  /api/calendar  /api/sessions  /api/canvas  /api/analytics\n`);
});