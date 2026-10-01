// services/dashboardLayout.js
// UC22 – Customizable Dashboard & Widget Layout.
//
// A layout is an array of { i, x, y, w, h } on a 12-column grid, the shape
// react-grid-layout uses on the client. `i` is a widget id from WIDGETS; a
// widget that is not in the array is hidden. The server owns the widget list,
// the minimum sizes and the default layout, so a hand-crafted PUT cannot store
// something the UI would choke on.
//
// The same row also holds the student's colour theme (a VS Code-style theme id
// from THEMES). A theme applies the moment it is picked, so it is saved on its
// own rather than with the layout's Save button.

import { pool } from "../client";

class LayoutError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "LayoutError";
    this.status = status;
  }
}

const COLS = 12;
// Rows are ~40px each on the client; 40 rows is far more than any real screen.
const MAX_ROWS = 40;

// Minimum sizes keep a widget readable; the client uses the same numbers.
const WIDGETS = {
  "upcoming-assignments": { minW: 3, minH: 4 },
  "study-timer":          { minW: 3, minH: 5 },
  "stat-tiles":           { minW: 4, minH: 3 },
  "at-risk":              { minW: 3, minH: 3 },
  "time-per-course":      { minW: 4, minH: 6 },
  "on-time-rate":         { minW: 3, minH: 6 },
  "estimate-vs-actual":   { minW: 4, minH: 6 },
  "weekly-workload":      { minW: 4, minH: 6 }
};
const WIDGET_IDS = Object.keys(WIDGETS);

// What a student sees before they customize anything: today's work on the
// left, the timer and a glance at their numbers on the right.
const DEFAULT_LAYOUT = [
  { i: "stat-tiles",           x: 0, y: 0,  w: 12, h: 3 },
  { i: "upcoming-assignments", x: 0, y: 3,  w: 7,  h: 10 },
  { i: "study-timer",          x: 7, y: 3,  w: 5,  h: 6 },
  { i: "at-risk",              x: 7, y: 9,  w: 5,  h: 4 },
  { i: "time-per-course",      x: 0, y: 13, w: 6,  h: 7 },
  { i: "on-time-rate",         x: 6, y: 13, w: 6,  h: 7 }
];

// Must match src/lib/themes.ts.
const THEMES = ["light-modern", "dark-modern", "monokai", "solarized-light", "dracula"];
const DEFAULT_THEME = "light-modern";

const isInt = (v) => Number.isInteger(v);

/**
 * Check a layout from the client and return a clean copy (unknown keys such as
 * react-grid-layout's `moved`/`static` are dropped). Throws LayoutError(400).
 */
function validateLayout(layout) {
  if (!Array.isArray(layout)) throw new LayoutError("layout must be an array.", 400);
  if (layout.length > WIDGET_IDS.length) {
    throw new LayoutError(`layout can hold at most ${WIDGET_IDS.length} widgets.`, 400);
  }

  const seen = new Set();
  return layout.map((item, index) => {
    if (!item || typeof item !== "object") throw new LayoutError(`layout[${index}] must be an object.`, 400);
    const { i, x, y, w, h } = item;

    const spec = WIDGETS[i];
    if (!spec) throw new LayoutError(`Unknown widget "${i}".`, 400);
    if (seen.has(i)) throw new LayoutError(`Widget "${i}" appears more than once.`, 400);
    seen.add(i);

    if (![x, y, w, h].every(isInt)) {
      throw new LayoutError(`Widget "${i}" needs integer x, y, w and h.`, 400);
    }
    if (w < spec.minW || h < spec.minH) {
      throw new LayoutError(`Widget "${i}" must be at least ${spec.minW} wide and ${spec.minH} tall.`, 400);
    }
    if (x < 0 || y < 0 || x + w > COLS || y + h > MAX_ROWS) {
      throw new LayoutError(`Widget "${i}" is outside the ${COLS}-column grid.`, 400);
    }
    return { i, x, y, w, h };
  });
}

/** The student's layout and theme, with defaults for anything never saved. */
async function getLayout(userID) {
  const { rows: [row] } = await pool.query(
    "SELECT layout, theme, \"updatedAt\" FROM \"DashboardLayout\" WHERE \"userID\" = $1",
    [userID]
  );
  const theme = THEMES.includes(row?.theme) ? row.theme : DEFAULT_THEME;
  if (!row?.layout) return { layout: DEFAULT_LAYOUT, isDefault: true, theme, updatedAt: row?.updatedAt ?? null };
  // Drop any widget that has since been removed from WIDGETS, rather than
  // failing the whole home screen over one stale entry.
  const layout = row.layout.filter((item) => WIDGETS[item.i]);
  return { layout, isDefault: false, theme, updatedAt: row.updatedAt };
}

async function saveLayout(userID, layout) {
  const clean = validateLayout(layout);
  await pool.query(
    `INSERT INTO "DashboardLayout" ("userID", layout, "updatedAt")
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT ("userID") DO UPDATE SET layout = EXCLUDED.layout, "updatedAt" = NOW()`,
    [userID, JSON.stringify(clean)]
  );
  return getLayout(userID);
}

/** Reset: forget the saved layout so the default applies again. The theme stays. */
async function resetLayout(userID) {
  await pool.query(
    "UPDATE \"DashboardLayout\" SET layout = NULL, \"updatedAt\" = NOW() WHERE \"userID\" = $1",
    [userID]
  );
  return getLayout(userID);
}

async function saveTheme(userID, theme) {
  if (!THEMES.includes(theme)) {
    throw new LayoutError(`theme must be one of: ${THEMES.join(", ")}.`, 400);
  }
  await pool.query(
    `INSERT INTO "DashboardLayout" ("userID", theme, "updatedAt")
     VALUES ($1, $2, NOW())
     ON CONFLICT ("userID") DO UPDATE SET theme = EXCLUDED.theme, "updatedAt" = NOW()`,
    [userID, theme]
  );
  return getLayout(userID);
}

export {
  LayoutError,
  COLS,
  MAX_ROWS,
  WIDGETS,
  WIDGET_IDS,
  DEFAULT_LAYOUT,
  THEMES,
  DEFAULT_THEME,
  validateLayout,
  getLayout,
  saveLayout,
  resetLayout,
  saveTheme
};
