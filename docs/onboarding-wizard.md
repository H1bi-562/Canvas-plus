# UC23 Onboarding & First-Run Setup Wizard

*Nathan Salazar · CECS 491B · CanvasPlus*

## What it does
- Every student sees a four-step setup wizard once, the first time they open CanvasPlus after it ships. That includes students who already have accounts.
- **Step 1, Canvas:** paste a Canvas personal access token, or skip and connect later.
- **Step 2, Google Calendar:** what connecting does, with an optional Connect, or skip.
- **Step 3, First sync:** import courses and assignments now, and choose which sources the calendar shows.
- **Step 4, Feature tour:** six cards on the core features (dashboard widgets, assignments, the study timer, analytics, calendar, settings and the extension), then pick a color theme and Finish.
- **Settings → Run setup again** reopens the wizard. Connected accounts stay connected.

## How it fits together
- **Database:** two new columns on `Config`.
  - `onboardingSteps` records each step as done or skipped.
  - `onboardingCompletedAt` stays empty until the student finishes.
- **API:** four small routes under `/api/onboarding`: get progress, save a step, finish, restart.
- **The check:** the dashboard's server layout looks at that progress. A student who hasn't finished is redirected to `/onboarding` before the dashboard renders.
- **Reuse:** the wizard is built from one component per step, and it reuses the existing Canvas, Google, sync, calendar-source and theme endpoints. No feature logic is duplicated.

## Key design decisions (and why)
- **The check happens on the server, not in the browser.** The dashboard never flashes on screen before the redirect. The check works the same from login, a bookmark or the browser extension. In Next.js 16, Proxy (formerly middleware) is documented as unsuitable for database lookups, so the check lives in the dashboard layout.
- **Progress lives in the database, not the browser.** A student who leaves at step 3 on their laptop picks up at step 3 on a lab computer.
- **"Everyone once" comes from the empty default.** Existing rows start empty, so everyone sees the wizard once without a backfill script.
- **Canvas and Google are skippable.** Only the six CSULB participants approved by the university have Canvas tokens, and Google may not be set up on every server. Teammates and graders can still finish the wizard.
- **Saves can't overwrite each other.** Each step is merged into the stored progress inside the database (Postgres `jsonb ||`), so two tabs saving at the same moment both keep their step.
- **Fail open.** If the progress lookup fails, the dashboard still opens and the error is logged. The wizard is guidance, not access control.
- **The tour only shows features that work today.** Smart Scheduler, Focus Mode site blocking and Break into Tasks are left out until they ship, so the tour never promises something that doesn't work.
- **The theme pick follows the dashboard's sync rules.** The wizard writes the same local cache the dashboard uses, so the chosen theme isn't replaced by a stale copy on the first dashboard load.

## Security
- **No new secrets.** The Canvas token only goes through the existing token endpoint, which checks it with Canvas, stores it encrypted (AES-256-GCM) and never sends it back to the browser.
- **The same protections as the rest of the API.** Every new route requires a login session, rejects changes from other websites (Origin check against CSRF) and accepts JSON only.
- **Allow-listed input.** Only the four known step names and two statuses can be stored. Anything else is rejected with a 400.
- **Same-site redirects only.** Google's consent screen can only send the student back to a CanvasPlus page.

## Testing
- **Database tests** run against a separate test database, never the shared one. They cover:
  - new accounts
  - skipped steps
  - rejected input
  - two saves at once
  - finishing and restarting
  - accounts with no `Config` row
  - one student's progress staying private from another
  - requests from other websites being rejected
- **Component tests** cover:
  - resuming at the right step
  - save failures
  - every Canvas, Google and sync path, including the Google error callback and a rejected token
  - the six-card tour
  - the theme cache
  - Finish
  - Run setup again
