// routes/layout.js
// UC22 – Customizable Dashboard & Widget Layout.
//
//   GET    /api/layout   the student's layout (the default if never saved)
//   PUT    /api/layout   { layout: [{ i, x, y, w, h }, ...] } -> save
//   DELETE /api/layout   reset to the default layout (keeps the theme)
//   PUT    /api/layout/theme   { theme: 'dracula' } -> save the colour theme

const express = require('express');
const auth    = require('../middleware/authMiddleware');
const layouts = require('../services/dashboardLayout');

const router = express.Router();
router.use(auth);

function handle(label, fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      if (err instanceof layouts.LayoutError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(`${label} error:`, err.message);
      res.status(500).json({ error: `Failed to ${label.toLowerCase()}` });
    }
  };
}

router.get('/',    handle('Load layout',  (req) => layouts.getLayout(req.user.id)));
router.put('/',    handle('Save layout',  (req) => layouts.saveLayout(req.user.id, req.body?.layout)));
router.delete('/', handle('Reset layout', (req) => layouts.resetLayout(req.user.id)));
router.put('/theme', handle('Save theme', (req) => layouts.saveTheme(req.user.id, req.body?.theme)));

module.exports = router;
