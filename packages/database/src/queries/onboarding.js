// UC23 – first-run wizard progress, stored on the user's Config row.
// "onboardingSteps" maps a step id to "done" | "skipped"; "onboardingCompletedAt"
// stays NULL until the student finishes, which is what sends them to /onboarding.
import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { config } from "../schema";
import { HttpError } from "../errors.js";

// Order matters: the wizard resumes at the first step not recorded yet.
// Keep in sync with ONBOARDING_STEPS in apps/web/lib/onboarding.ts (a parity test checks).
export const ONBOARDING_STEPS = ["canvas", "google", "sync", "tour"];
export const STEP_STATUSES = ["done", "skipped"];

const columns = { steps: config.onboardingSteps, completedAt: config.onboardingCompletedAt };

function toState(row) {
  const steps = row?.steps && typeof row.steps === "object" ? row.steps : {};
  return {
    steps,
    completedAt: row?.completedAt ? new Date(row.completedAt).toISOString() : null,
    nextStep: ONBOARDING_STEPS.find(step => !(step in steps)) ?? null
  };
}

/** Merge into the stored steps inside the database, so two saves at once cannot overwrite each other. */
const merge = patch => sql`${config.onboardingSteps} || ${JSON.stringify(patch)}::jsonb`;

/** Insert-or-update, because accounts created before the Better Auth hook may have no Config row. */
async function upsert(userId, insertValues, updateValues) {
  const [row] = await db.insert(config).values({ userID: userId, ...insertValues })
    .onConflictDoUpdate({ target: config.userID, set: { ...updateValues, updatedAt: new Date() } })
    .returning(columns);
  return toState(row);
}

export async function getOnboarding(userId) {
  const [row] = await db.select(columns).from(config).where(eq(config.userID, userId));
  return toState(row);
}

export async function saveStep(userId, step, status) {
  if (typeof step !== "string" || !ONBOARDING_STEPS.includes(step)) throw new HttpError(400, "Unknown onboarding step");
  if (typeof status !== "string" || !STEP_STATUSES.includes(status)) throw new HttpError(400, "Invalid onboarding status");
  return upsert(userId, { onboardingSteps: { [step]: status } }, { onboardingSteps: merge({ [step]: status }) });
}

/** Finishing the wizard sets the time only; the in-app walkthrough records "tour" when it ends. */
export async function completeOnboarding(userId) {
  const now = new Date();
  return upsert(userId, { onboardingCompletedAt: now }, { onboardingCompletedAt: now });
}

export async function resetOnboarding(userId) {
  const cleared = { onboardingSteps: {}, onboardingCompletedAt: null };
  return upsert(userId, cleared, cleared);
}
