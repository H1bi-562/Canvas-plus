# Canvas Plus

Canvas Plus pulls a student's Canvas courses and assignments into one place, runs study sessions against them, and turns that time into analytics: where study time goes, how estimates compare to reality, and what's at risk of being late.

CECS 491B – Computer Science Senior Project II (CSULB, Fall 2026)

## Features

- **Canvas integration**: connect with a personal access token or OAuth2; syncs active courses, assignments, and submission status (submitted / late / missing / excused). Tokens are encrypted at rest and never sent to the browser.
- **Assignments**: dashboard, current-month calendar, and a detail panel with time estimates, "Mark done", and completion badges.
- **Study timer (UC24)**: start / pause / resume / end, tied to an assignment. The server owns the clock, so the timer survives closing the page.
- **Study Analytics (UC21)**: study time, focus ratio, streak, at-risk assignments (due in 72 hours with little time logged), time per course, on-time completion rate, estimated vs. actual, and weekly workload. Every chart has a table view.
- **Auth**: register / login with an httpOnly JWT cookie; logout revokes the token server-side.
- **Demo data (development only)**: load sample courses, assignments, and study sessions to preview the app without Canvas access.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Node.js, Express |
| Database | PostgreSQL (Neon) |
| Auth | JWT in an httpOnly cookie, bcrypt |
| Tests | Node's built-in test runner (`node --test`) |

## Getting started

### Prerequisites

- Node.js 20 or newer
- Access to the team's Neon database (ask a teammate for an invite), or your own PostgreSQL database

### 1. Install

```bash
git clone git@github.com:H1bi-562/Canvas-plus.git
cd Canvas-plus
npm install
```

Use `npm`. The repo also contains pnpm files, but `package-lock.json` is the lockfile the team uses.

### 2. Configure `.env`

```bash
cp .env.example .env
```

Fill in the values. Get real credentials from a teammate **privately**, never through Git, a group chat, or a screenshot.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes* | Neon connection string (Neon Console → Connect) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Yes* | Alternative to `DATABASE_URL`; `DATABASE_URL` wins if both are set |
| `JWT_SECRET` | Yes | Signs login tokens |
| `ENCRYPTION_KEY` | Yes | 64 hex characters; encrypts Canvas tokens. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CANVAS_BASE_URL` | For Canvas | e.g. `https://csulb.instructure.com` (all a personal access token needs) |
| `CANVAS_CLIENT_ID`, `CANVAS_CLIENT_SECRET`, `CANVAS_REDIRECT_URI`, `CANVAS_SCOPES` | OAuth2 only | From a Canvas developer key |
| `FRONTEND_URL` | Optional | Where OAuth redirects after connecting (default `http://localhost:5173`) |
| `PORT` | Optional | API port (default `3000`) |

\* Provide either `DATABASE_URL` or the `DB_*` variables.

The frontend reads `VITE_API_BASE` (default `http://localhost:3000`) if the API runs somewhere else.

### 3. Database

The shared Neon database already has every migration applied. **Skip this step if you're using it.**

For a new database, run these in order (Neon SQL Editor or `psql`). Every script is safe to run more than once:

```
schema.sql
001_token_tracking.sql
002_study_session.sql
003_session_resume.sql
004_canvas_oauth.sql
005_canvas_sync.sql
006_analytics_inputs.sql
```

### 4. Run

Two terminals:

```bash
# Terminal 1: API on http://localhost:3000
node server.js

# Terminal 2: frontend on http://localhost:5173
npm run dev
```

Open http://localhost:5173 and create an account.

### 5. Add data

- **With Canvas access**: Profile → Canvas Integration → paste your access token (Canvas → Account → Settings → **+ New Access Token**) → **Connect Canvas**. It syncs automatically; use **Sync assignments** later to refresh.
- **Without Canvas access**: Profile → Demo Data → **Load demo data**. It only affects your account. Remove it before syncing real Canvas data.

## Project structure

```
server.js               Express app: CORS, cookies, routes
db.js                   PostgreSQL pool (DATABASE_URL or DB_*)
middleware/             authMiddleware: verifies the JWT cookie
routes/                 HTTP endpoints (thin)
services/               Logic: Canvas auth + sync, analytics, progress, demo data
utils/                  Encryption and date helpers
test/                   API/service tests + a mock Canvas server
*.sql                   Schema and migrations (run in numeric order)
src/
  app/App.tsx           App shell and navigation
  components/           Screens (Dashboard, Focus, Settings, ...)
  components/analytics/ Analytics charts; each takes (summary, darkMode) and can be reused as a widget
  lib/                  API clients (fetch with credentials)
```

## API

All routes except register, login, and the OAuth callback require the auth cookie.

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Create an account and sign in |
| POST | `/api/auth/login` | Sign in (sets the httpOnly `token` cookie) |
| POST | `/api/auth/logout` | Revoke the token and clear the cookie |
| GET | `/api/assignments` | Assignments with estimate, time logged, and `completionStatus` |
| GET | `/api/assignments/:id` | One assignment with details and calendar events |
| PATCH | `/api/assignments/:id/estimate` | `{ minutes }` (1–6000) or `{ minutes: null }` |
| PATCH | `/api/assignments/:id/completion` | `{ completed: true \| false }` ("Mark done") |
| PUT | `/api/assignments/:id/details` | AI summary / subtasks / priority score |
| DELETE | `/api/assignments/:id` | Delete an assignment |
| POST | `/api/sessions/start` | Start a study session (`{ assignmentID? }`) |
| PATCH | `/api/sessions/:id/pause` · `/resume` · `/end` | Control the open session |
| GET | `/api/sessions/active` | The open session, if any |
| GET | `/api/sessions` | Session history |
| GET | `/api/analytics/summary` | `?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=America/Los_Angeles` |
| POST | `/api/canvas/token` | Connect with a personal access token (`{ token }`) |
| POST | `/api/canvas/sync` | Sync active courses, assignments, and submissions |
| GET | `/api/canvas/status` | Connection status (never returns a token) |
| GET | `/api/canvas/authorize` · `/callback` | OAuth2 connect flow |
| POST | `/api/canvas/refresh` | Force an OAuth token refresh |
| DELETE | `/api/canvas/disconnect` | Remove the Canvas connection |
| GET / POST / DELETE | `/api/calendar` | Calendar events |
| GET / PUT | `/api/config` | User settings |
| POST / DELETE | `/api/demo` | Load / remove demo data (**not available in production**) |

Errors: `401` means signed out; `409` from Canvas routes means the stored Canvas token no longer works (reconnect).

## Testing

```bash
npm test
```

69 tests cover Canvas OAuth and personal access tokens, sync (against `test/mockCanvas.js`, no real Canvas needed), estimates and completion, analytics, and demo data, including checks that one student never sees another's data.

The tests use the database in `.env`. There is no separate test database, so every test creates its own `@example.invalid` users and deletes them afterward.

## Security notes

- **Never commit `.env`.** It is gitignored; stage files by name rather than `git add .`.
- `.env` was committed to this repo in April/May 2026. The database password from those commits has been reset. When pulling the commit that untracked `.env`, back yours up first (`cp .env .env.backup`), because Git deletes the local copy.
- Canvas tokens are stored AES-256-GCM encrypted in `CanvasAuth` and never returned by the API.
- The shared Neon database holds the whole team's data: delete any test rows you create.

## Known issues

- `POST /api/assignments` inserts 8 values into 7 columns and fails on every call (Canvas sync does not use it).
- Refreshing the page returns to the login screen even though the session cookie is still valid.
- The app runs as a web app; there is no Chrome extension `manifest.json` yet.
- No TypeScript type checking runs in the build (Vite strips types without checking them).
- The production bundle is over 500 kB because of the chart library.

## Team

Daniel Aguilar · Beau Cordero · Jace Orozco · John Ojelabi · Nathan Salazar · Owen Rivera

UI components from [shadcn/ui](https://ui.shadcn.com/) (MIT). See [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
