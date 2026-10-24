# UC23 Onboarding & First-Run Setup Wizard — Design

- **Owner:** Nathan Salazar
- **Branch:** `uc23-onboarding-wizard` (from `main` on 2026-10-24)
- **Status:** Draft for review

## Goal

Every user goes through a short setup wizard the first time they open CanvasPlus after this ships. That includes existing accounts. The wizard covers:

- connecting Canvas
- learning about the Google Calendar connection
- running a first sync
- a tour of the core features (dashboard widgets, assignments, the study timer, analytics, calendar, settings and the extension) and picking a theme

Progress is saved after every step, so a user who leaves can resume where they stopped. The wizard can be re-run later from Settings.

**Done means:**

- A user who has not finished onboarding is always taken to `/onboarding` before the dashboard.
- Finishing the wizard sends the user to the dashboard. They never see the wizard again unless they choose "Run setup again".
- Leaving mid-way and coming back reopens the wizard at the first unfinished step, on any device.
- Canvas and Google can both be skipped. The wizard still finishes.

## Decisions (agreed 2026-10-24)

| Decision | Choice | Why |
|---|---|---|
| Who sees it | Everyone once, including existing accounts | Requested; also gives every tester the same entry point |
| Where progress lives | Database (new `Config` columns) | Works across devices; matches the Design Specification |
| Canvas step | Skippable ("I'll connect later") | Only the 6 approved CSULB participants have tokens |
| Google step | Walkthrough with optional Connect; skippable | Nathan will not connect Google; Google may be unset on a server |
| Step 3 preferences | Existing settings only: first sync + calendar sources | No new preference columns; avoids changing UC5 and sync code |
| How users are sent there | Server-side check in the dashboard layout | No dashboard flash, works from any entry point; Next 16 Proxy is not meant for database lookups |
| Tour style | Feature-tour cards (one per core feature), not a spotlight over the live UI | Covers every core feature; robust to dashboard layout changes |
| Tour content | Only features that work on `main` today | A tour that claims unfinished features work would mislead students and graders |

## User flow

```
login ─▶ /assignments ─▶ (dashboard)/layout.tsx: onboarding finished?
                              │ no
                              ▼
/onboarding: [1 Canvas] → [2 Google] → [3 First sync] → [4 Tour + theme] → Finish ─▶ /assignments
```

- A progress indicator shows "Step N of 4".
- **Back** is always available. **Continue** or **Skip** records the step and moves forward.
- On open, the wizard starts at the first step that has not been recorded yet.

## Routing and the onboarding check

- **`app/(dashboard)/layout.tsx`** (existing server component, already checks the session):
  - After the session check, load the user's onboarding state.
  - If `completedAt` is empty, call `redirect('/onboarding')`. Per the Next 16 docs, `redirect` must sit **outside** any `try/catch`.
  - If the lookup itself fails, log it and show the dashboard (fail open). Onboarding is guidance, not access control.
- **New `app/(onboarding)/onboarding/`**, with its own `layout.tsx` and `page.tsx`:
  - Lives outside the dashboard route group, so the redirect cannot loop.
  - Its `page.tsx` (a server component) requires a session (redirect to `/login` if there isn't one), loads the user's progress, and passes it and the Google callback result to the wizard. A Next.js layout cannot pass data to its page, so the layout only provides the page frame.
  - If onboarding is already finished, the page redirects to `/assignments`.
- **Login page:** unchanged. It already sends users to `/assignments`, and the dashboard layout takes over from there.
- **Extension:** unchanged. "Open dashboard" opens the web app root, which goes through the same check.

## The steps

Step ids are `canvas`, `google`, `sync` and `tour`. Each recorded step is either `done` or `skipped`.

### 1. Canvas (`canvas`)
- Reads `GET /api/canvas/status`.
- **Already connected:** shows "Connected as {canvasName}". **Continue** records the step as `done`.
- **Not connected:**
  - Shows a token form that reuses the behavior of `CanvasConnection.tsx`: masked input with an eye toggle, `POST /api/canvas/token`.
  - Instructions: Canvas → Account → Settings → **+ New Access Token**. CSULB pilot participants instead activate the token issued by Canvas Support on that page.
  - A successful connect records the step as `done`.
- **"I'll connect later"** records `skipped`.
- If the server is not set up for Canvas (the token route returns 503), the step explains this and offers Skip only.

### 2. Google Calendar walkthrough (`google`)
- Reads `GET /api/google` (`{configured, connected}`).
- Explains what connecting does: read-only calendar access (`calendar.readonly`), so Google events appear on the Calendar page next to Canvas due dates.
- **Connect Google** calls `connectGoogle` with a callback back to the wizard: `/onboarding?google=connected`, or `/onboarding?google=error` on failure.
  - `connectGoogle` in `lib/googleCalendarApi.ts` currently hard-codes `/settings?...`.
  - It gains an optional callback parameter. Calls that leave the parameter out keep today's behavior, so existing callers are unaffected.
- **Not configured on the server:** explanation plus **Skip**.
- **Skip** records `skipped`. A successful connect records `done`.

### 3. First sync (`sync`)
- **Canvas not connected:** explains that sync needs Canvas and offers **Continue** (records `skipped`).
- **Canvas connected:**
  - **Run first sync** calls `POST /api/canvas/sync` and shows "Synced {assignments} assignments from {courses} courses". The endpoint returns totals only, so the step shows a spinner and then the result, with no progress bar.
  - A sync error (for example 409, "token no longer accepted") shows the message and a **Back to Canvas** button.
- **Calendar sources:**
  - Toggles for "Canvas due dates" and, only when Google is connected, "Google events".
  - They use the existing hidden-sources setting saved through `/api/config` (`CalendarConfig.filteredEvents`). The helpers in `googleCalendarApi.ts` are reused.
- **Continue** records `done`, or `skipped` if the user moves on without syncing.

### 4. Feature tour and theme (`tour`)

A card carousel: one card per core feature, then the theme picker. Each card has a lucide icon, the feature name, two or three short "what it does" bullets, and "Where to find it". Dots show the current position; **Back** and **Next** move between cards; **Skip tour** jumps straight to the theme picker. The cards cannot link into the app, because any page outside `/onboarding` redirects back until the wizard is finished.

| # | Card | What it covers | Where to find it |
|---|---|---|---|
| 1 | **Your dashboard (UC22)** | Widgets: Assignments, Study Timer, Study Stats, At Risk, Time per Course, On-time Rate, Estimated vs. Actual, Weekly Workload. **Customize** to drag, resize, add or remove them; Save, Cancel, Reset to default. Layout follows your account. | Home → Customize |
| 2 | **Assignments from Canvas** | Synced automatically from Canvas, with due dates and priority badges (UC15). Open one for details: an AI summary (UC13), the grade-impact what-if (UC14), and marking it done. | Home → open an assignment |
| 3 | **Study timer with assignments (UC24)** | Pick an assignment under "What are you working on?" (or General study). Start, Pause, Resume, End; paused time is not counted, and the timer survives closing the page. Set an estimate or take the suggested one (UC7). | Focus |
| 4 | **Study analytics (UC21)** | Date ranges (7, 30 or 90 days, This semester). Tiles: Study time, Focus, Sessions, Study streak. At Risk (due soon, little time logged), Time per course, On-time completion, Estimated vs. actual, Weekly workload. | Analytics |
| 5 | **Calendar** | Month and week views of Canvas due dates, plus Google events when connected; toggle which sources show. | Calendar |
| 6 | **Settings and the browser extension** | Reconnect Canvas or Google, and **Run setup again**. The extension popup shows upcoming assignments and opens the dashboard. | Profile → Settings; browser toolbar |

- The card content lives in one data file (`tourCards.ts`), so it can be updated when a feature changes without touching wizard logic.
- **Accuracy rule:** before the cards ship, check each claim against the code on `main`. Not toured, because they are not functional yet: Smart Scheduler, Focus Mode site blocking (the list exists, nothing is blocked), and Break into Tasks. Add a card when one of them ships.

**Theme picker** (after the last card):
- Built from `THEMES` in `packages/ui/src/themes.ts`.
- Selecting a theme applies it to the page right away and saves it with `PUT /api/layout/theme`.
- The implementation must follow the theme-sync rules in `DashboardProvider.tsx` (lines 100–180) and the local preferences cache (`lib/preferencesCache.ts`). Otherwise the dashboard could replace the new theme with a stale cached one.
- **Finish** calls `POST /api/onboarding/complete`, then `router.replace('/assignments')` and `router.refresh()`.

## Data model

Two new columns on `Config` (`packages/database/src/schema.ts`):

| Column | Type | Meaning |
|---|---|---|
| `onboardingSteps` | `jsonb NOT NULL DEFAULT '{}'` | Recorded steps, e.g. `{"canvas":"done","google":"skipped"}` |
| `onboardingCompletedAt` | `timestamptz NULL` | When the user finished; `NULL` means the wizard still shows |

**Notes:**
- Existing rows get `{}` and `NULL`. That is how "everyone once" works with no backfill.
- The migration is generated with `pnpm db:generate` and lands as `packages/database/drizzle/0002_*.sql`. It is never written by hand.
- Applying it to the **shared** Neon database (`pnpm db:migrate`) waits for team sign-off. Generating the file does not touch any database.
- A user without a `Config` row is treated as "not started". Writes create the row if needed (upsert).

## API

New query module `packages/database/src/queries/onboarding.js`:

- **Exports:** `ONBOARDING_STEPS`, `STEP_STATUSES`, `getOnboarding`, `saveStep`, `completeOnboarding`, `resetOnboarding`.
- **Validation:** step ids and statuses are checked against allowlists. Unknown values throw `HttpError(400)`.

New routes in `apps/web/app/api/onboarding/`. All use the existing `api()` wrapper, which provides the session requirement, the same-origin check on writes, and JSON and body-size checks.

| Method and path | Body | Result |
|---|---|---|
| `GET /api/onboarding` | — | `{ steps, completedAt, nextStep }` |
| `PATCH /api/onboarding` | `{ step, status }` | Same shape, after saving |
| `POST /api/onboarding/complete` | — | Same shape; records `tour: "done"` and sets `completedAt` |
| `DELETE /api/onboarding` | — | Same shape; clears steps and `completedAt` |

`nextStep` is the first id in `ONBOARDING_STEPS` that has not been recorded, or `null` once all four are.

## Settings

A new **Setup** card after the Google card in `Settings.tsx`:

- **Run setup again** calls `DELETE /api/onboarding`, then `router.push('/onboarding')`.
- Integrations that are already connected stay connected. Their steps simply show the connected state.

## Error handling

- **A step save fails:** show an inline error, stay on the step, and let the user retry. The wizard never moves forward on a failed save.
- **Canvas or sync errors:** show the existing messages from those endpoints.
- **The onboarding check fails in the dashboard layout:** log it and show the dashboard (fail open).

## Security

- **No new secrets.** The Canvas token only goes through the existing `/api/canvas/token` route, which stores it encrypted and never returns it.
- **Same protections as other routes.** Every new route goes through `api()`, which requires a session, checks the Origin on writes (CSRF protection) and accepts JSON only.
- **Input allowlist.** Only the four known step ids and two statuses are stored, so a client cannot write arbitrary JSON into `onboardingSteps`.
- **Google redirect.** Callback URLs are same-site relative paths, so the Google flow cannot be pointed at another site.
- **Out of scope:** limiting Canvas connections to the six approved participants. Noted as a follow-up; the Canvas step is a natural place for that check.

## Testing

- **Integration tests:** `apps/web/test/onboarding.integration.test.ts`, modeled on `routes.integration.test.ts`. They cover:
  - default state, and `nextStep = canvas`
  - saving a step
  - rejecting an unknown step or status (400)
  - completing, and resetting
  - one user cannot see another user's progress
- **Unit tests:**
  - the "should this user see onboarding?" decision used by the dashboard layout
  - `nextStep` ordering
  - client/server parity of the step list, in the style of the existing widget and theme parity tests
- **Component test:** `apps/web/test/OnboardingWizard.test.tsx`. It checks that the wizard resumes at the first unfinished step, that Skip on Google records `skipped`, that the tour shows all six cards in order and **Skip tour** jumps to the theme picker, and that Finish calls complete and navigates.
- **Tour content test:** every card in `tourCards.ts` has a unique id, a title, at least one bullet, and a "Where to find it" value.
- **Test database:**
  - `TEST_DATABASE_URL` should point at a Neon branch or a local Postgres, not the shared database.
  - The test setup creates and removes its own temporary schema, but it still writes to whichever database it is given.
- **Manual check** on the MacBook and the PC:
  - a new account goes through the whole flow
  - an existing account is sent to the wizard once
  - leaving mid-way and reopening resumes at the right step
  - "Run setup again" restarts the wizard

## Out of scope

- Live progress during sync. The sync API returns totals only.
- Tour cards for features that are not functional yet (Smart Scheduler, Focus Mode site blocking, Break into Tasks).
- New saved preferences, such as the due-warning threshold or a course filter.
- Extension changes.
- The six-participant allowlist.
- Login page changes.

## Documentation

- `docs/onboarding-wizard.md`: a presentable bullet-point walkthrough of what was built, the reasoning, and the key decisions.
- Living documents (next review):
  - **Requirements UC23:** steps 4–5 wording changes — no live progress, no course filter, Canvas and Google skippable.
  - **Design:** Activity Diagram #7 description.
  - **Test Specification:** add the new tests.

## Rollout

1. Build on `uc23-onboarding-wizard`. Unit and integration tests pass against a non-shared test database.
2. Ask the team before applying the migration to the shared Neon database.
3. Warn teammates that everyone sees the wizard once after it ships.
4. Open a PR to `main`.
