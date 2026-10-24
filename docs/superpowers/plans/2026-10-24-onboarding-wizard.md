# UC23 Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user sees a four-step setup wizard once (Canvas → Google walkthrough → first sync → feature tour and theme). Progress is saved in the database, and the wizard can be re-run from Settings.

**Architecture:**
- Two new `Config` columns hold progress.
- A Drizzle query module plus four `api()`-wrapped routes expose it.
- The `(dashboard)` server layout redirects unfinished users to a new `(onboarding)/onboarding` page.
- That page renders a client wizard built from one component per step, reusing the existing Canvas, Google, sync, calendar-source and theme endpoints.

**Tech Stack:** Next.js 16 App Router (Turbopack), React 19, TypeScript, Tailwind v4, lucide-react, Drizzle ORM + Postgres (Neon), Better Auth, Vitest + Testing Library, pnpm 10.32.1 + Turborepo.

**Spec:** `docs/superpowers/specs/2026-10-24-onboarding-wizard-design.md`

## Global Constraints

- **Read the Next 16 docs first.** Before writing Next.js code, read the bundled guides in `apps/web/node_modules/next/dist/docs/01-app/` (required by `apps/web/AGENTS.md`):
  - `01-getting-started/05-server-and-client-components.md`
  - `01-getting-started/15-route-handlers.md`
  - `02-guides/redirecting.md`
  - `02-guides/upgrading/version-16.md`
- **Next 16 request APIs are async:** `await headers()`, and `searchParams` is a `Promise`.
- **`redirect()` is called outside `try/catch`.**
- **Every new route uses `api()`** from `apps/web/lib/server/api.ts`.
- **Errors:** validation failures throw `HttpError(400, …)` from `packages/database/src/errors.js`.
- **Migrations:** generate them with `pnpm db:generate`; never hand-write the SQL. Never run `pnpm db:migrate` against the shared Neon database without the team's OK.
- **Test database:** integration tests run only with `TEST_DATABASE_URL` pointed at a non-shared database.
- **Styling** follows the existing cards and buttons:
  - classes from `apps/web/app/(dashboard)/settings/_components/GoogleConnection.tsx:61-68`
  - `darkMode ? … : …` branches
  - `--cp-page` / `--cp-card` CSS variables
  - lucide-react icons
- **Step ids** are exactly `canvas`, `google`, `sync`, `tour`. **Statuses** are exactly `done`, `skipped`.
- **Tour cards** describe only features that work on `main`. No cards for Smart Scheduler, Focus Mode site blocking or Break into Tasks.
- **Git:**
  - Work on branch `uc23-onboarding-wizard`.
  - Commit only when Nathan approves.
  - Commit messages are short plain English, with **no** Claude co-author or attribution lines.
- **Secrets:** none go in files, tests or logs. The Canvas token only goes through the existing `/api/canvas/token`.
- **Commands** run from the repo root.

## Review Focus

1. **Two tabs (or a double click) save different steps at the same moment.** Both steps must be recorded; neither save may overwrite the other. Task 1 test: `parallel saves keep both steps`.
2. **An account with no `Config` row** (created before the Better Auth hook existed). GET returns the default progress, and the first save creates the row instead of returning 404. Task 1 test: `an account without a Config row can still onboard`.
3. **The theme picked in the wizard survives the first dashboard load.** The dashboard's preference sync must not repaint a stale cached theme. Task 7 test: `a saved theme pick leaves a clean cache matching the server`.
4. **Google sends the user back with `?google=error`.** The wizard opens the Google step showing an error and does **not** record the step. Task 5 test: `a failed Google callback shows an error and records nothing`.
5. **The database is unreachable when the dashboard checks onboarding.** The dashboard still renders (fail open) and the error is logged. Task 3 test: `loadGate returns null and logs when the lookup fails`.

---

### Task 0: Prerequisites (Nathan runs these)

**Files:** none

- [ ] **Step 1: Create a non-shared test database.**
  - In the Neon console, open the project and go to **Branches**. Create a branch named `uc23-test` with **schema only**, so it doesn't copy real Canvas tokens. Then go to **Connect** and copy its connection string.
  - Expected: a connection string that is different from `DATABASE_URL`.
- [ ] **Step 2: Add it to the root `.env`** as `TEST_DATABASE_URL=<that string>`. Never paste it into chat.
- [ ] **Step 3: Confirm the existing integration suite runs against it.**
  - Run: `pnpm --filter @canvasplus/web test:integration`
  - Expected: all existing tests PASS.

---

### Task 1: Onboarding progress in the database

**Files:**
- Modify: `packages/database/src/schema.ts`, the `config` table (around lines 32–35)
- Create (generated): `packages/database/drizzle/0002_*.sql`, plus the updated `drizzle/meta/_journal.json` and `drizzle/meta/0002_snapshot.json`
- Create: `packages/database/src/queries/onboarding.js`
- Test: `apps/web/test/onboarding.integration.test.ts`

**Interfaces:**
- **Produces, schema:** two new columns on `config`:
  - `onboardingSteps: jsonb("onboardingSteps").notNull().default({})`
  - `onboardingCompletedAt: time("onboardingCompletedAt")`
- **Produces, `@canvasplus/database/queries/onboarding`:**
  - `ONBOARDING_STEPS = ["canvas", "google", "sync", "tour"]`
  - `STEP_STATUSES = ["done", "skipped"]`
  - `getOnboarding(userId: string): Promise<OnboardingState>`
  - `saveStep(userId: string, step: unknown, status: unknown): Promise<OnboardingState>`
  - `completeOnboarding(userId: string): Promise<OnboardingState>`
  - `resetOnboarding(userId: string): Promise<OnboardingState>`
- **`OnboardingState` shape:** `{ steps: { [step]: "done" | "skipped" }, completedAt: string | null /* ISO */, nextStep: "canvas" | "google" | "sync" | "tour" | null }`
- **`nextStep` rule:** the first id in `ONBOARDING_STEPS` that is missing from `steps`, or `null` when all four are present.

- [ ] **Step 1: Write the failing tests** in `apps/web/test/onboarding.integration.test.ts`.
  - Copy the `req()` and `register()` helpers and `afterAll(() => pool.end())` from `apps/web/test/routes.integration.test.ts:15-24`.
  - Call the query functions directly, imported from `@canvasplus/database/queries/onboarding`.

```ts
test("a new account starts at the Canvas step", async () => {
  const { user } = await register();
  expect(await getOnboarding(user.id)).toEqual({ steps: {}, completedAt: null, nextStep: "canvas" });
});

test("skipped steps count as recorded", async () => {
  const { user } = await register();
  await saveStep(user.id, "canvas", "skipped");
  const state = await saveStep(user.id, "google", "done");
  expect(state.steps).toEqual({ canvas: "skipped", google: "done" });
  expect(state.nextStep).toBe("sync");
});

test("unknown steps and statuses are rejected with 400 and change nothing", async () => {
  const { user } = await register();
  await expect(saveStep(user.id, "billing", "done")).rejects.toMatchObject({ status: 400 });
  await expect(saveStep(user.id, "canvas", "maybe")).rejects.toMatchObject({ status: 400 });
  expect((await getOnboarding(user.id)).steps).toEqual({});
});

test("parallel saves keep both steps", async () => {
  const { user } = await register();
  await Promise.all([saveStep(user.id, "canvas", "done"), saveStep(user.id, "google", "skipped")]);
  expect((await getOnboarding(user.id)).steps).toEqual({ canvas: "done", google: "skipped" });
});

test("complete records the tour and a finish time; reset clears both", async () => {
  const { user } = await register();
  const done = await completeOnboarding(user.id);
  expect(done.steps.tour).toBe("done");
  expect(Number.isNaN(Date.parse(done.completedAt!))).toBe(false);
  expect(await resetOnboarding(user.id)).toEqual({ steps: {}, completedAt: null, nextStep: "canvas" });
});

test("an account without a Config row can still onboard", async () => {
  const { user } = await register();
  await pool.query('DELETE FROM "Config" WHERE "userID" = $1', [user.id]);
  expect((await getOnboarding(user.id)).nextStep).toBe("canvas");
  expect((await saveStep(user.id, "canvas", "done")).steps).toEqual({ canvas: "done" });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**
  - Run: `pnpm --filter @canvasplus/web test:integration onboarding`
  - Expected: FAIL. The module `@canvasplus/database/queries/onboarding` is not found.
- [ ] **Step 3: Add the two columns to `config` in `schema.ts`** (definitions in the Interfaces block). Then generate the migration.
  - Run: `pnpm db:generate`
  - Expected: a new file `packages/database/drizzle/0002_<name>.sql` that contains `ADD COLUMN "onboardingSteps" jsonb DEFAULT '{}'::jsonb NOT NULL` and `ADD COLUMN "onboardingCompletedAt" timestamp with time zone`, and nothing else.
- [ ] **Step 4: Implement `packages/database/src/queries/onboarding.js`.**
  - Use Drizzle `db` and the `config` table, in the style of `queries/config.js`.
  - Write paths **upsert** with `db.insert(config).values({ userID, … }).onConflictDoUpdate({ target: config.userID, set: … })`, so a missing row is created.
  - `saveStep` merges inside the database with ``sql`${config.onboardingSteps} || ${JSON.stringify({ [step]: status })}::jsonb` ``, so parallel saves cannot overwrite each other. Set `updatedAt: new Date()`.
  - `completeOnboarding` merges `{ tour: "done" }` and sets `onboardingCompletedAt: new Date()`.
  - `resetOnboarding` sets `{}` and `null`.
  - `getOnboarding` on a missing row returns the default state without inserting anything.
  - Error messages: `HttpError(400, "Unknown onboarding step")` and `HttpError(400, "Invalid onboarding status")`.
- [ ] **Step 5: Run the tests to verify they pass.**
  - Run: `pnpm --filter @canvasplus/web test:integration onboarding`
  - Expected: PASS (6 tests).
- [ ] **Step 6: Checkpoint.** Show Nathan the diff. On approval: `git add packages/database apps/web/test/onboarding.integration.test.ts`, then `git commit -m "Store onboarding progress on Config"`.

---

### Task 2: Onboarding API and client helpers

**Files:**
- Create: `apps/web/lib/onboarding.ts` (client-safe: no database imports)
- Create: `apps/web/lib/onboardingApi.ts`
- Create: `apps/web/app/api/onboarding/route.ts` and `apps/web/app/api/onboarding/complete/route.ts`
- Test: append to `apps/web/test/onboarding.integration.test.ts`; create `apps/web/test/onboarding.test.ts`

**Interfaces:**
- **Consumes:** Task 1's query functions.
- **Produces, `@/lib/onboarding`:**
  - `ONBOARDING_STEPS` (`as const`)
  - `type OnboardingStep`, `type StepStatus`, `interface OnboardingState` (same shape as Task 1)
  - `nextStep(steps: OnboardingState["steps"]): OnboardingStep | null`
  - `needsOnboarding(state: OnboardingState | null): boolean`. Returns `true` only when `state` is non-null and `completedAt === null`.
- **Produces, `@/lib/onboardingApi`**, all via `apiRequest`:
  - `fetchOnboarding(): Promise<OnboardingState>`
  - `saveOnboardingStep(step: OnboardingStep, status: StepStatus): Promise<OnboardingState>`
  - `completeOnboarding(): Promise<OnboardingState>`
  - `restartOnboarding(): Promise<OnboardingState>`
- **Produces, routes:**
  - `GET` / `PATCH {step, status}` / `DELETE` on `/api/onboarding`
  - `POST` on `/api/onboarding/complete`
  - Each is a one-line `api()` handler, like `apps/web/app/api/config/route.ts`.

- [ ] **Step 1: Write the failing tests.**

Unit tests (`onboarding.test.ts`):
```ts
test("nextStep follows the fixed order and ignores out-of-order records", () => {
  expect(nextStep({})).toBe("canvas");
  expect(nextStep({ canvas: "done", google: "skipped" })).toBe("sync");
  expect(nextStep({ sync: "done" })).toBe("canvas");
  expect(nextStep({ canvas: "done", google: "done", sync: "done", tour: "done" })).toBeNull();
});
test("needsOnboarding is true only for loaded, unfinished progress", () => {
  expect(needsOnboarding({ steps: {}, completedAt: null, nextStep: "canvas" })).toBe(true);
  expect(needsOnboarding({ steps: {}, completedAt: "2026-10-24T00:00:00Z", nextStep: "canvas" })).toBe(false);
  expect(needsOnboarding(null)).toBe(false);
});
```

Integration tests (append):
```ts
test("routes save, complete and reset progress per user", async () => {
  const alice = await register(); const bob = await register();
  expect((await patch(req("PATCH", alice.cookie, { step: "canvas", status: "done" }))).status).toBe(200);
  expect((await (await get(req("GET", bob.cookie))).json()).nextStep).toBe("canvas");
  expect((await patch(req("PATCH", alice.cookie, { step: "nope", status: "done" }))).status).toBe(400);
  expect((await complete(req("POST", alice.cookie, {}))).status).toBe(200);
  expect((await (await reset(req("DELETE", alice.cookie))).json()).completedAt).toBeNull();
});
test("an untrusted origin cannot change progress", async () => {
  const { cookie } = await register();
  expect((await patch(req("PATCH", cookie, { step: "canvas", status: "done" }, "https://untrusted.example"))).status).toBe(403);
});
test("client and server step lists match", () => {
  expect([...CLIENT_STEPS]).toEqual(SERVER_STEPS);
});
```
Import names used above: `get`, `patch` and `reset` are `GET`, `PATCH` and `DELETE` from `../app/api/onboarding/route`; `complete` is `POST` from `../app/api/onboarding/complete/route`; `CLIENT_STEPS` comes from `@/lib/onboarding`; `SERVER_STEPS` from the queries module.

- [ ] **Step 2: Run the tests to verify they fail.**
  - Run: `pnpm --filter @canvasplus/web test onboarding` and `pnpm --filter @canvasplus/web test:integration onboarding`
  - Expected: FAIL, because the modules are missing.
- [ ] **Step 3: Implement** the two lib files and the two route files (signatures in the Interfaces block).
- [ ] **Step 4: Run the tests to verify they pass.** Same commands. Expected: PASS.
- [ ] **Step 5: Checkpoint.** Show the diff. On approval: `git commit -m "Add onboarding API routes and client helpers"`.

---

### Task 3: Send unfinished users to the wizard

**Files:**
- Modify: `apps/web/app/(dashboard)/layout.tsx`
- Modify: `apps/web/lib/onboarding.ts` (add `loadGate`)
- Create: `apps/web/app/(onboarding)/onboarding/layout.tsx`, `apps/web/app/(onboarding)/onboarding/page.tsx`
- Create: `apps/web/app/(onboarding)/onboarding/_components/OnboardingWizard.tsx` (a stub that renders the step heading only; Task 4 builds it out)
- Test: `apps/web/test/onboarding.test.ts`

**Interfaces:**
- **Consumes:** `getOnboarding` (Task 1); `needsOnboarding` and `OnboardingState` (Task 2).
- **Produces:**
  - `loadGate(load: () => Promise<OnboardingState>): Promise<OnboardingState | null>`. Returns the state, or logs with `console.error("Onboarding check failed:", error)` and returns `null`.
  - The wizard's props: `OnboardingWizard({ userId: string; initialState: OnboardingState; googleResult: "connected" | "error" | null })`.

- [ ] **Step 1: Write the failing tests.**
```ts
test("loadGate returns null and logs when the lookup fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await loadGate(async () => { throw new Error("db down"); })).toBeNull();
  expect(log).toHaveBeenCalledWith("Onboarding check failed:", expect.any(Error));
});
test("loadGate passes a loaded state through", async () => {
  const state = { steps: {}, completedAt: null, nextStep: "canvas" as const };
  expect(await loadGate(async () => state)).toBe(state);
});
```
- [ ] **Step 2: Run the tests to verify they fail.**
  - Run: `pnpm --filter @canvasplus/web test onboarding`
  - Expected: FAIL (`loadGate` is not exported).
- [ ] **Step 3: Implement.**
  - `loadGate` goes in `lib/onboarding.ts`.
  - **Dashboard layout:** after the existing session check, add `const progress = await loadGate(() => getOnboarding(session.user.id)); if (needsOnboarding(progress)) redirect("/onboarding");`. Both lines sit outside any `try`.
  - **Onboarding `page.tsx`** (a server component):
    - get the session (redirect `/login` if none)
    - `getOnboarding(session.user.id)`
    - `if (!needsOnboarding(state)) redirect("/assignments")`
    - `const { google } = await searchParams`
    - render the wizard with `googleResult` set to `google` when it is `"connected"` or `"error"`, else `null`
  - **Onboarding `layout.tsx`:** a full-height centered container (`min-h-screen` plus `bg-[var(--cp-page)]`).
- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Check it manually.**
  - Run: `pnpm dev`, then log in.
  - Expected: you are sent to `/onboarding`, which shows the stub. Visiting `/assignments` also lands on `/onboarding`.
- [ ] **Step 6: Checkpoint.** Show the diff. On approval: `git commit -m "Redirect users who have not finished onboarding"`.

---

### Task 4: Wizard shell (progress, navigation, resume, save errors)

**Files:**
- Modify: `apps/web/app/(onboarding)/onboarding/_components/OnboardingWizard.tsx`
- Test: `apps/web/test/OnboardingWizard.test.tsx`

**Interfaces:**
- **Consumes:** `saveOnboardingStep` (Task 2); the props from Task 3; `readPreferences` and `getTheme` for the initial theme.
- **Produces, the step contract.** Every step component receives `{ darkMode: boolean; onDone: (status: StepStatus) => Promise<void> }`. Tasks 5–7 add their own extra props.
  - The wizard's `onDone` saves the step. On success it moves to the next step index. On failure it stays and shows `role="alert"` with the text "Could not save your progress. Try again."
- **Produces, the shell's behavior:**
  - **Step titles:** "Connect Canvas", "Google Calendar", "Run your first sync", "Tour CanvasPlus".
  - **Progress line:** "Step {n} of 4".
  - **Back** is shown on steps 2–4.
  - **Starting step:** `googleResult` → `google`; otherwise `initialState.nextStep`; otherwise `tour`.
  - **`darkMode`** is `getTheme(themeId).mode === "dark"`. `themeId` starts at `readPreferences(userId)?.theme ?? DEFAULT_THEME` and is applied to `document.documentElement.dataset.theme` in a `useLayoutEffect`.

- [ ] **Step 1: Write the failing tests.** Mock `@/lib/onboardingApi`, and use placeholder step bodies (each with a `Continue` button that calls `onDone("done")`) until Tasks 5–7 replace them.
```ts
test("resumes at the first unfinished step", () => {
  render(<OnboardingWizard userId="u1" initialState={{ steps: { canvas: "done", google: "skipped" }, completedAt: null, nextStep: "sync" }} googleResult={null} />);
  expect(screen.getByRole("heading", { name: "Run your first sync" })).toBeTruthy();
  expect(screen.getByText("Step 3 of 4")).toBeTruthy();
});
test("a failed save keeps the user on the step", async () => {
  api.saveOnboardingStep.mockRejectedValueOnce(new Error("offline"));
  render(<OnboardingWizard userId="u1" initialState={{ steps: {}, completedAt: null, nextStep: "canvas" }} googleResult={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Could not save your progress. Try again.");
  expect(screen.getByRole("heading", { name: "Connect Canvas" })).toBeTruthy();
});
test("Back returns to the previous step without saving", async () => { /* start at google, click Back, expect "Connect Canvas", saveOnboardingStep not called */ });
```
- [ ] **Step 2: Run the tests to verify they fail.**
  - Run: `pnpm --filter @canvasplus/web test OnboardingWizard`
  - Expected: FAIL.
- [ ] **Step 3: Implement the shell.**
- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.
- [ ] **Step 5: Checkpoint.** On approval: `git commit -m "Add onboarding wizard shell"`.

---

### Task 5: Canvas and Google steps

**Files:**
- Create: `apps/web/app/(onboarding)/onboarding/_components/CanvasStep.tsx`, `GoogleStep.tsx`
- Modify: `apps/web/lib/googleCalendarApi.ts`, the `connectGoogle` function
- Modify: `OnboardingWizard.tsx` (wire both steps in)
- Test: `apps/web/test/OnboardingWizard.test.tsx`

**Interfaces:**
- **Consumes:** `fetchCanvasStatus` and `connectWithToken` from `@/app/(dashboard)/settings/_api/canvasApi`; `fetchGoogleStatus` and `connectGoogle` from `@/lib/googleCalendarApi`; `ApiError` from `@/lib/apiClient`.
- **Produces:** `connectGoogle(returnTo = { callbackURL: "/settings?google=connected", errorCallbackURL: "/settings?google=error" })`. Settings keeps today's behavior. The wizard passes `{ callbackURL: "/onboarding?google=connected", errorCallbackURL: "/onboarding?google=error" }`.
- **Canvas copy:**
  - Connected: "Connected as {canvasName}" and a `Continue` button.
  - Not connected:
    - a masked input labelled "Canvas access token", with an eye toggle
    - a `Connect Canvas` button
    - instructions: "In Canvas, open Account → Settings and click + New Access Token. CSULB pilot participants: activate the token Canvas Support issued to you on that page."
    - an `I'll connect later` button, which records `skipped`
  - When connect returns a 503 `ApiError`, hide the form and show "Canvas isn't set up on this server yet. You can skip this step and connect later in Settings."
- **Google copy:**
  - Explanation: "Connecting lets CanvasPlus show your Google Calendar events next to your Canvas due dates. It only reads your calendars (calendar.readonly) and never changes them."
  - Configured but not connected: `Connect Google` and `Skip`.
  - Not configured: "Google sign-in isn't set up on this server." and `Skip`.
  - Connected: "Google Calendar is connected" and `Continue`.
  - When `googleResult === "error"`: an alert "Google didn't connect. You can try again or skip."

- [ ] **Step 1: Write the failing tests.**
```ts
test("Canvas can be skipped", async () => { /* status {connected:false}; click "I'll connect later"; expect saveOnboardingStep("canvas","skipped"); expect heading "Google Calendar" */ });
test("a pasted token connects and records the Canvas step", async () => { /* type into "Canvas access token", click "Connect Canvas"; expect connectWithToken(token) then saveOnboardingStep("canvas","done") */ });
test("an unconfigured Canvas server leaves only Skip", async () => { /* connectWithToken rejects new ApiError("x", 503); expect the 503 message, no "Connect Canvas" button */ });
test("a failed Google callback shows an error and records nothing", async () => {
  render(<OnboardingWizard userId="u1" initialState={{ steps: { canvas: "done" }, completedAt: null, nextStep: "google" }} googleResult="error" />);
  expect((await screen.findByRole("alert")).textContent).toBe("Google didn't connect. You can try again or skip.");
  expect(api.saveOnboardingStep).not.toHaveBeenCalled();
});
test("Google can be skipped", async () => { /* click "Skip"; expect saveOnboardingStep("google","skipped") */ });
test("Connect Google returns to the wizard", async () => { /* click "Connect Google"; expect connectGoogle({ callbackURL: "/onboarding?google=connected", errorCallbackURL: "/onboarding?google=error" }) */ });
```
- [ ] **Step 2: Run the tests to verify they fail.**
  - Run: `pnpm --filter @canvasplus/web test OnboardingWizard`
  - Expected: the new tests FAIL.
- [ ] **Step 3: Implement both steps and the `connectGoogle` parameter.**
- [ ] **Step 3b: Update Task 4's shell tests** for the real Canvas step: mock `fetchCanvasStatus` to resolve `{ connected: true, configured: false, canvasName: "Test" }` so its `Continue` button exists. The assertions stay unchanged.
- [ ] **Step 4: Run the full web unit suite** (catches regressions in Settings' Google card).
  - Run: `pnpm --filter @canvasplus/web test`
  - Expected: PASS.
- [ ] **Step 5: Checkpoint.** On approval: `git commit -m "Add Canvas and Google onboarding steps"`.

---

### Task 6: First sync step

**Files:**
- Create: `apps/web/app/(onboarding)/onboarding/_components/SyncStep.tsx`
- Modify: `OnboardingWizard.tsx`, which passes `onBackToCanvas` (jumps to step index 0 without saving)
- Test: `apps/web/test/OnboardingWizard.test.tsx`

**Interfaces:**
- **Consumes:** `fetchCanvasStatus` and `syncAssignments` (`SyncResult`) from `canvasApi`; `fetchGoogleStatus`, `fetchHiddenSources` and `saveHiddenSources` from `googleCalendarApi`.
- **Produces:** `SyncStep({ darkMode, onDone, onBackToCanvas: () => void })`.
- **Copy:**
  - Canvas not connected: "Connect Canvas first to sync your assignments." and `Continue`, which records `skipped`.
  - Canvas connected:
    - a `Run first sync` button
    - on success: "Synced {assignments} assignments from {courses} courses"
    - on an `ApiError`: show its message and a `Back to Canvas` button
  - Continue: `Continue` records `done` if a sync succeeded, otherwise `skipped`.
- **Source toggles** (`role="switch"`):
  - "Show Canvas due dates", always shown.
  - "Show Google events", only when Google is connected.
  - Toggling saves the hidden list with `saveHiddenSources`. Hidden `canvas` means the Canvas switch is off.

- [ ] **Step 1: Write the failing tests.**
```ts
test("the first sync reports what was imported", async () => { /* status connected; syncAssignments resolves {courses:3, assignments:12,...}; click "Run first sync"; expect text "Synced 12 assignments from 3 courses"; click Continue → saveOnboardingStep("sync","done") */ });
test("a rejected token offers a way back to the Canvas step", async () => { /* syncAssignments rejects new ApiError("Canvas no longer accepts the stored token...", 409); expect that message; click "Back to Canvas"; expect heading "Connect Canvas" */ });
test("without Canvas the step can be passed", async () => { /* status {connected:false}; click Continue → saveOnboardingStep("sync","skipped") */ });
test("turning off Canvas due dates saves the hidden list", async () => { /* fetchHiddenSources [] ; click switch "Show Canvas due dates"; expect saveHiddenSources(["canvas"]) */ });
```
- [ ] **Step 2: Run the tests to verify they fail.** Run: `pnpm --filter @canvasplus/web test OnboardingWizard`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement `SyncStep`.**
- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.
- [ ] **Step 5: Checkpoint.** On approval: `git commit -m "Add first-sync onboarding step"`.

---

### Task 7: Feature tour, theme picker and Finish

**Files:**
- Create: `apps/web/app/(onboarding)/onboarding/_components/tourCards.ts`, `TourStep.tsx`
- Create: `apps/web/app/(onboarding)/onboarding/_lib/theme.ts`
- Modify: `OnboardingWizard.tsx`, which passes `onThemeChange`, owns `themeId`, and handles Finish
- Test: `apps/web/test/onboarding.test.ts`, `apps/web/test/OnboardingWizard.test.tsx`

**Interfaces:**
- **Consumes:** `THEMES`, `getTheme` and `ThemeId` from `@canvasplus/ui/themes`; `saveTheme` from `@/app/(dashboard)/assignments/_api/layoutApi`; `readPreferences` and `writePreferences` from `@/lib/preferencesCache`; `completeOnboarding` (Task 2); `useRouter` from `next/navigation`.
- **Produces:**
  - `TOUR_CARDS: TourCard[]` where `TourCard = { id: string; icon: LucideIcon; title: string; bullets: string[]; where: string }`.
    - Ids, in order: `dashboard`, `assignments`, `timer`, `analytics`, `calendar`, `settings`.
    - Titles, bullets and "Where" values come verbatim from the spec's step 4 table.
    - Before writing each bullet, check its claim against the component it names on `main`.
  - `applyThemeChoice(userId: string, id: ThemeId): Promise<void>`. In order:
    1. set `document.documentElement.dataset.theme = id`
    2. `writePreferences(userId, { theme: id, layout: local?.layout ?? null, updatedAt: local?.updatedAt ?? null, themeDirty: true })`
    3. `await saveTheme(id)`
    4. if the cached theme is still `id`, write `{ theme: id, layout: res.layout, updatedAt: res.updatedAt, themeDirty: false }`

    A save error is swallowed and logged: the cache stays dirty, so `DashboardProvider` pushes it on its next sync. This mirrors `changeTheme` and `pushTheme` in `DashboardProvider.tsx:154-180`.
  - `TourStep({ darkMode, themeId, onThemeChange: (id: ThemeId) => void, onFinish: () => Promise<void> })`.
  - **Copy:** "Card {i} of 6", `Back`, `Next`, `Skip tour`. After the last card, or after Skip tour: the heading "Pick a theme", one radio per `THEMES` label, and `Finish`.
  - **Wizard Finish:** `await completeOnboarding()`, then `router.replace("/assignments")` and `router.refresh()`. On failure, show the save-error alert.

- [ ] **Step 1: Write the failing tests.**
```ts
// onboarding.test.ts
test("tour cards are complete and in order", () => {
  expect(TOUR_CARDS.map(c => c.id)).toEqual(["dashboard", "assignments", "timer", "analytics", "calendar", "settings"]);
  for (const card of TOUR_CARDS) { expect(card.title).toBeTruthy(); expect(card.bullets.length).toBeGreaterThan(0); expect(card.where).toBeTruthy(); }
});
test("a saved theme pick leaves a clean cache matching the server", async () => {
  layout.saveTheme.mockResolvedValueOnce({ theme: "dracula", layout: [], isDefault: true, updatedAt: "2026-10-24T12:00:00Z" });
  await applyThemeChoice("u1", "dracula");
  expect(document.documentElement.dataset.theme).toBe("dracula");
  expect(JSON.parse(localStorage.getItem("canvasplus:preferences:u1")!)).toEqual({ theme: "dracula", layout: [], updatedAt: "2026-10-24T12:00:00Z", themeDirty: false });
});
test("a failed theme save stays dirty for the dashboard to retry", async () => {
  layout.saveTheme.mockRejectedValueOnce(new Error("offline"));
  await applyThemeChoice("u1", "monokai");
  expect(JSON.parse(localStorage.getItem("canvasplus:preferences:u1")!).themeDirty).toBe(true);
});
// OnboardingWizard.test.tsx
test("the tour walks six cards and Skip tour jumps to the theme picker", async () => { /* start at tour; expect "Card 1 of 6"; Next ×5 → "Card 6 of 6"; Back → "Card 5 of 6"; Skip tour → heading "Pick a theme" */ });
test("Finish completes onboarding and opens the dashboard", async () => { /* click "Finish"; expect completeOnboarding called, then mocks.replace("/assignments") and mocks.refresh */ });
```
- [ ] **Step 2: Run the tests to verify they fail.** Run: `pnpm --filter @canvasplus/web test onboarding OnboardingWizard`. Expected: FAIL.
- [ ] **Step 3: Implement** `tourCards.ts`, `_lib/theme.ts`, `TourStep.tsx`, and the Finish wiring.
- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.
- [ ] **Step 5: Checkpoint.** On approval: `git commit -m "Add feature tour and theme pick to onboarding"`.

---

### Task 8: "Run setup again" in Settings

**Files:**
- Create: `apps/web/app/(dashboard)/settings/_components/SetupCard.tsx`
- Modify: `apps/web/app/(dashboard)/settings/_components/Settings.tsx`. Render `<SetupCard darkMode={darkMode} />` right after `<GoogleConnection … />`.
- Test: `apps/web/test/SetupCard.test.tsx`

**Interfaces:**
- **Consumes:** `restartOnboarding` (Task 2); `useRouter`.
- **Produces:** `SetupCard({ darkMode })`.
  - Heading "Setup".
  - Text: "Go through the setup wizard again. Connected accounts stay connected."
  - Button `Run setup again`: `await restartOnboarding()`, then `router.push("/onboarding")`.
  - On error, show `role="alert"` with "Could not restart setup. Try again." and do not navigate.

- [ ] **Step 1: Write the failing tests:** `restarts setup and opens the wizard`, and `a failed restart stays on Settings and shows an error` (assertions as in the Interfaces block).
- [ ] **Step 2: Run the tests to verify they fail.** Run: `pnpm --filter @canvasplus/web test SetupCard`. Expected: FAIL.
- [ ] **Step 3: Implement**, and add the card to `Settings.tsx`.
- [ ] **Step 4: Run all checks.**
  - Run: `pnpm --filter @canvasplus/web test`, then `pnpm --filter @canvasplus/web test:integration`, then `pnpm typecheck` and `pnpm lint`
  - Expected: all PASS, with no type or lint errors.
- [ ] **Step 5: Checkpoint.** On approval: `git commit -m "Add Run setup again to Settings"`.

---

### Task 9: Walkthrough doc, manual check and rollout

**Files:**
- Create: `docs/onboarding-wizard.md`

- [ ] **Step 1: Write `docs/onboarding-wizard.md`** as presentable bullet points, not a line-by-line walkthrough. Cover:
  - what the wizard does
  - the four steps
  - why the check lives on the server and not in Proxy
  - why progress is in the database (resume on any device)
  - why the steps can be skipped (only 6 approved CSULB participants have tokens)
  - the jsonb merge that keeps parallel saves safe
  - the fail-open choice
  - the "tour only shows working features" rule
  - the security points (`api()` origin check, step allowlist, the token never echoed back)
- [ ] **Step 2: Manual check on `pnpm dev`** (MacBook or PC). Expected:
  - a brand-new account goes through all four steps
  - leaving at step 3 and logging back in reopens step 3
  - Google Skip works
  - the picked theme is still applied on the dashboard after a reload
  - Settings → Run setup again restarts the wizard at step 1, with Canvas still shown as connected
  - `/onboarding` after finishing redirects to `/assignments`
- [ ] **Step 3: Checkpoint.** On approval: `git commit -m "Document the onboarding wizard"`.
- [ ] **Step 4 (Nathan, after the team agrees): migrate the shared database and open the PR.** Migrate **before** this code runs against any database. Sign-up's `Config` insert names the new columns, so running unmigrated breaks sign-up (found in the final review). The PR description must say this.
  - Tell teammates that everyone will see the wizard once.
  - Then run `pnpm db:migrate`. Expected: it applies `0002_*` without errors.
  - Then push the branch and open a PR to `main`.
