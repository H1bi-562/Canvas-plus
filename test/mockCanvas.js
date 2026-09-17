// test/mockCanvas.js
// A stand-in for a real Canvas instance that speaks the parts of the OAuth2
// protocol we depend on. It exists so the connection flow can be tested in CI
// without Docker or a developer key.
//
// It is deliberately strict -- it rejects a wrong client_secret, an unknown
// code, and a reused code -- because a permissive mock would let real bugs pass.

const express = require('express');

const CLIENT_ID     = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret';

// Personal access tokens the mock accepts, as if a student generated them in
// Canvas > Account > Settings.
const VALID_PAT = 'pat-valid-token';

// Canvas caps per_page; a small cap here forces the client to follow Link
// headers, which is exactly the code path a real multi-page course exercises.
const DEFAULT_PAGE_CAP = 2;

/** Fixture courses. 103 is concluded; 104 is date-restricted (Canvas omits its name). */
function defaultCourses() {
  return [
    { id: 101, name: 'Computer Science Senior Project II', course_code: 'CECS 491B-02',
      workflow_state: 'available', term: { name: 'Fall 2026' } },
    { id: 102, name: 'Network Science', course_code: 'CECS 427-01',
      workflow_state: 'available', term: { name: 'Fall 2026' } },
    { id: 103, name: 'Old Course', course_code: 'CECS 100-01',
      workflow_state: 'completed', term: { name: 'Spring 2024' } },
    { id: 104, access_restricted_by_date: true },
  ];
}

function defaultAssignments() {
  return {
    101: [
      { id: 5001, name: 'Weekly Review 9/19', description: '<p>Sprint notes</p>',
        points_possible: 10, due_at: '2026-09-20T06:59:00Z', lock_at: null,
        submission: { workflow_state: 'unsubmitted', submitted_at: null, late: false, missing: false, excused: false } },
      { id: 5002, name: 'Design Spec Update', description: null,
        points_possible: 2.5, due_at: '2026-09-27T06:59:00Z', lock_at: '2026-09-28T06:59:00Z',
        submission: { workflow_state: 'submitted', submitted_at: '2026-09-26T20:00:00Z', late: false, missing: false, excused: false } },
      { id: 5003, name: 'Team Retro', description: '', points_possible: null,
        due_at: null, lock_at: null,
        submission: { workflow_state: 'graded', submitted_at: null, late: false, missing: false, excused: true } },
    ],
    102: [
      { id: 6001, name: 'Programming Assignment 2', description: '<p>BFS</p>',
        points_possible: 100, due_at: '2026-10-01T06:59:00Z', lock_at: null,
        submission: { workflow_state: 'submitted', submitted_at: '2026-10-02T03:00:00Z', late: true, missing: false, excused: false } },
    ],
    103: [
      { id: 7001, name: 'Should never sync', description: '', points_possible: 1,
        due_at: '2024-05-01T06:59:00Z', lock_at: null },
    ],
  };
}

function createMockCanvas({ expiresIn = 3600, pageCap = DEFAULT_PAGE_CAP } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Issued codes and tokens, so the mock can reject anything it never handed out.
  const codes         = new Map(); // code -> { used }
  const refreshTokens = new Set();
  const accessTokens  = new Set();
  let counter = 0;

  const personalTokens = new Set([VALID_PAT]);
  const courses        = defaultCourses();
  const assignments    = defaultAssignments();

  const state = {
    get issuedAccessTokens() { return [...accessTokens]; },
    revoked: [],
    refreshCalls: 0,
    // Every /api/v1 request, so tests can prove sync is read-only.
    apiRequests: [],
    /** Change an assignment in "Canvas" between syncs. */
    updateAssignment(courseID, assignmentID, patch) {
      const a = assignments[courseID].find((x) => x.id === assignmentID);
      Object.assign(a, patch);
    },
    /** Simulate the student deleting their token in Canvas settings. */
    revokePersonalToken(token) { personalTokens.delete(token); },
  };

  function bearer(req) {
    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
  }

  function isValidToken(token) {
    return Boolean(token) && (accessTokens.has(token) || personalTokens.has(token));
  }

  /** Serve `items` one page at a time with a Canvas-style Link header. */
  function paginate(req, res, items) {
    const perPage = Math.min(Number(req.query.per_page) || 10, pageCap);
    const page    = Math.max(Number(req.query.page) || 1, 1);
    const slice   = items.slice((page - 1) * perPage, page * perPage);

    if (page * perPage < items.length) {
      const next = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
      next.searchParams.set('page', String(page + 1));
      next.searchParams.set('per_page', String(perPage));
      res.set('Link', `<${next.toString()}>; rel="next"`);
    }
    res.json(slice);
  }

  // Log and authenticate every Canvas REST call.
  app.use('/api/v1', (req, res, next) => {
    state.apiRequests.push({ method: req.method, path: req.path });
    if (!isValidToken(bearer(req))) {
      return res.status(401).json({ errors: [{ message: 'Invalid access token.' }] });
    }
    next();
  });

  // ── Consent screen. The real one renders HTML; we approve immediately. ──
  app.get('/login/oauth2/auth', (req, res) => {
    const { client_id: clientId, redirect_uri: redirectURI, state: oauthState } = req.query;
    if (clientId !== CLIENT_ID) return res.status(401).json({ error: 'unknown client' });

    const code = `code-${++counter}`;
    codes.set(code, { used: false });

    const params = new URLSearchParams({ code });
    if (oauthState) params.set('state', oauthState);
    res.redirect(`${redirectURI}?${params.toString()}`);
  });

  // ── Token endpoint: authorization_code and refresh_token grants. ──
  app.post('/login/oauth2/token', (req, res) => {
    const body = req.body || {};

    if (body.client_id !== CLIENT_ID || body.client_secret !== CLIENT_SECRET) {
      return res.status(401).json({ error: 'invalid_client', error_description: 'bad credentials' });
    }

    if (body.grant_type === 'authorization_code') {
      const entry = codes.get(body.code);
      if (!entry) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'unknown code' });
      }
      if (entry.used) {
        // Authorization codes are single-use; reusing one is an attack signature.
        return res.status(400).json({ error: 'invalid_grant', error_description: 'code already used' });
      }
      entry.used = true;

      const accessToken  = `access-${++counter}`;
      const refreshToken = `refresh-${++counter}`;
      accessTokens.add(accessToken);
      refreshTokens.add(refreshToken);

      return res.json({
        access_token:  accessToken,
        refresh_token: refreshToken,
        token_type:    'Bearer',
        expires_in:    expiresIn,
        scope:         '',
        user: { id: 4242, name: 'Test Student', global_id: '4242' },
      });
    }

    if (body.grant_type === 'refresh_token') {
      if (!refreshTokens.has(body.refresh_token)) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'unknown refresh token' });
      }
      state.refreshCalls += 1;
      const accessToken = `access-${++counter}`;
      accessTokens.add(accessToken);
      // Canvas does not reissue a refresh token here; neither do we.
      return res.json({
        access_token: accessToken,
        token_type:   'Bearer',
        expires_in:   expiresIn,
        user: { id: 4242, name: 'Test Student' },
      });
    }

    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  // ── Revocation. ──
  app.delete('/login/oauth2/token', (req, res) => {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token || !accessTokens.has(token)) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    accessTokens.delete(token);
    state.revoked.push(token);
    res.json({});
  });

  // ── A protected Canvas resource, to prove a token actually works. ──
  app.get('/api/v1/users/self', (req, res) => {
    res.json({ id: 4242, name: 'Test Student' });
  });

  // ── Courses the student is enrolled in. ──
  app.get('/api/v1/courses', (req, res) => {
    const activeOnly = req.query.enrollment_state === 'active';
    const visible = courses.filter((c) =>
      !activeOnly || c.access_restricted_by_date || c.workflow_state === 'available');
    paginate(req, res, visible);
  });

  // ── A course's assignments. ──
  app.get('/api/v1/courses/:courseID/assignments', (req, res) => {
    const list = assignments[req.params.courseID];
    if (!list) return res.status(404).json({ errors: [{ message: 'The specified resource does not exist.' }] });
    const base = `${req.protocol}://${req.get('host')}`;
    // Real Canvas only embeds the student's submission when asked for it.
    // Express 5's default query parser keeps "include[]" as a literal key rather
    // than an array, so accept both spellings (real Canvas/Rails handles either).
    const withSubmission = []
      .concat(req.query.include || [], req.query['include[]'] || [])
      .includes('submission');
    paginate(req, res, list.map(({ submission, ...a }) => ({
      ...a,
      ...(withSubmission ? { submission } : {}),
      course_id: Number(req.params.courseID),
      html_url: `${base}/courses/${req.params.courseID}/assignments/${a.id}`,
    })));
  });

  /** Listen on an ephemeral port; returns the base URL. */
  function start() {
    return new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        resolve({
          baseURL: `http://127.0.0.1:${port}`,
          state,
          close: () => new Promise((done) => server.close(done)),
        });
      });
    });
  }

  return { start };
}

module.exports = { createMockCanvas, CLIENT_ID, CLIENT_SECRET, VALID_PAT };
