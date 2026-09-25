// test/dashboardLayout.test.js
// Covers UC22's layout validation and persistence (services/dashboardLayout.js).
//
//   npm test
//
// The round-trip test touches the real database: two @example.invalid users,
// deleted afterwards. It is skipped until 008_dashboard_layout.sql is applied.

require('dotenv').config({ quiet: true });

const test   = require('node:test');
const assert = require('node:assert/strict');

const layouts = require('../services/dashboardLayout');
const pool    = require('../db');

const { validateLayout, LayoutError, DEFAULT_LAYOUT } = layouts;

const rejects400 = (layout, pattern) => assert.throws(
  () => validateLayout(layout),
  (err) => err instanceof LayoutError && err.status === 400 && pattern.test(err.message)
);

test('the default layout passes its own validation', () => {
  assert.deepEqual(validateLayout(DEFAULT_LAYOUT), DEFAULT_LAYOUT);
});

test('validateLayout keeps only the grid fields', () => {
  const clean = validateLayout([{ i: 'study-timer', x: 0, y: 0, w: 4, h: 6, moved: false, static: false }]);
  assert.deepEqual(clean, [{ i: 'study-timer', x: 0, y: 0, w: 4, h: 6 }]);
});

test('an empty layout is allowed (every widget hidden)', () => {
  assert.deepEqual(validateLayout([]), []);
});

test('validateLayout rejects bad input', () => {
  rejects400(null, /must be an array/);
  rejects400({ i: 'study-timer' }, /must be an array/);
  rejects400(['study-timer'], /must be an object/);
  rejects400([{ i: 'crypto-miner', x: 0, y: 0, w: 4, h: 4 }], /Unknown widget/);
  rejects400([
    { i: 'study-timer', x: 0, y: 0, w: 4, h: 6 },
    { i: 'study-timer', x: 4, y: 0, w: 4, h: 6 },
  ], /more than once/);
  rejects400([{ i: 'study-timer', x: 0, y: 0, w: 4.5, h: 6 }], /integer/);
  rejects400([{ i: 'study-timer', x: 0, y: 0, w: '4', h: 6 }], /integer/);
  rejects400([{ i: 'study-timer', x: 0, y: 0, w: 2, h: 6 }], /at least 3 wide/);
  rejects400([{ i: 'study-timer', x: 10, y: 0, w: 4, h: 6 }], /outside/);
  rejects400([{ i: 'study-timer', x: -1, y: 0, w: 4, h: 6 }], /outside/);
  rejects400([{ i: 'study-timer', x: 0, y: 38, w: 4, h: 6 }], /outside/);
});

test('layout persistence', async (t) => {
  const { rows: [{ table }] } = await pool.query(`SELECT to_regclass('"DashboardLayout"') AS table`);
  if (!table) {
    await pool.end();
    return t.skip('DashboardLayout table missing: run 008_dashboard_layout.sql');
  }

  const makeUser = async (label) => (await pool.query(
    `INSERT INTO "User" (email, "hashedPassword") VALUES ($1, 'x') RETURNING id`,
    [`layout+${label}-${Date.now()}@example.invalid`]
  )).rows[0].id;
  const alice = await makeUser('alice');
  const bob   = await makeUser('bob');
  t.after(async () => {
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1)`, [[alice, bob]]); // cascades to DashboardLayout
    await pool.end();
  });

  // Never saved -> default.
  let got = await layouts.getLayout(alice);
  assert.equal(got.isDefault, true);
  assert.deepEqual(got.layout, DEFAULT_LAYOUT);

  // Save, then read back exactly what was saved.
  const mine = [
    { i: 'study-timer',          x: 0, y: 0, w: 6, h: 6 },
    { i: 'upcoming-assignments', x: 6, y: 0, w: 6, h: 8 },
  ];
  await layouts.saveLayout(alice, mine);
  got = await layouts.getLayout(alice);
  assert.equal(got.isDefault, false);
  assert.deepEqual(got.layout, mine);

  // Saving again replaces, not appends.
  await layouts.saveLayout(alice, [mine[0]]);
  assert.deepEqual((await layouts.getLayout(alice)).layout, [mine[0]]);

  // One student's layout never leaks to another.
  assert.equal((await layouts.getLayout(bob)).isDefault, true);

  // An invalid save leaves the stored layout untouched.
  await assert.rejects(layouts.saveLayout(alice, [{ i: 'nope', x: 0, y: 0, w: 4, h: 4 }]), LayoutError);
  assert.deepEqual((await layouts.getLayout(alice)).layout, [mine[0]]);

  // Themes: default until picked, saved on their own, invalid ids rejected.
  assert.equal((await layouts.getLayout(alice)).theme, layouts.DEFAULT_THEME);
  await layouts.saveTheme(alice, 'dracula');
  got = await layouts.getLayout(alice);
  assert.equal(got.theme, 'dracula');
  assert.deepEqual(got.layout, [mine[0]]); // picking a theme leaves the layout alone
  await assert.rejects(layouts.saveTheme(alice, 'hot-pink'), LayoutError);
  assert.equal((await layouts.getLayout(alice)).theme, 'dracula');

  // A theme alone (no saved layout) still gives the default layout.
  await layouts.saveTheme(bob, 'monokai');
  got = await layouts.getLayout(bob);
  assert.equal(got.theme, 'monokai');
  assert.equal(got.isDefault, true);
  assert.deepEqual(got.layout, DEFAULT_LAYOUT);

  // Reset -> default layout again, but the theme is kept.
  got = await layouts.resetLayout(alice);
  assert.equal(got.isDefault, true);
  assert.deepEqual(got.layout, DEFAULT_LAYOUT);
  assert.equal(got.theme, 'dracula');
});

test('client widget registry matches the server', () => {
  // widgetRegistry.tsx is TypeScript/JSX, so read its ids and sizes as text.
  const fs   = require('node:fs');
  const path = require('node:path');
  const src  = fs.readFileSync(path.join(__dirname, '../src/components/home/widgetRegistry.tsx'), 'utf8');

  const client = {};
  for (const [, id, minW, minH] of src.matchAll(/'([a-z-]+)': \{\s*title:[\s\S]*?minW: (\d+), minH: (\d+)/g)) {
    client[id] = { minW: Number(minW), minH: Number(minH) };
  }
  assert.deepEqual(client, layouts.WIDGETS);

  const clientDefault = [...src.matchAll(/\{ i: '([a-z-]+)',\s*x: (\d+), y: (\d+),\s*w: (\d+),\s*h: (\d+) \}/g)]
    .map(([, i, x, y, w, h]) => ({ i, x: +x, y: +y, w: +w, h: +h }));
  assert.deepEqual(clientDefault, DEFAULT_LAYOUT);
});

test('client theme list matches the server', () => {
  const fs   = require('node:fs');
  const path = require('node:path');
  const src  = fs.readFileSync(path.join(__dirname, '../src/lib/themes.ts'), 'utf8');
  const ids  = [...src.matchAll(/^\s*id: '([a-z-]+)'/gm)].map((m) => m[1]);
  assert.deepEqual(ids, layouts.THEMES);
  assert.match(src, new RegExp(`DEFAULT_THEME[^=]*= '${layouts.DEFAULT_THEME}'`));
});
