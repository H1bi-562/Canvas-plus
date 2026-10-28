// UC23 – first-run wizard progress, shared by the server pages and the browser.
// Safe to import anywhere: no database code. The server copy of the step list is
// ONBOARDING_STEPS in packages/database/src/queries/onboarding.js (a parity test checks).

export const ONBOARDING_STEPS = ["canvas", "google", "sync", "tour"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
/** The wizard's own steps. "tour" is recorded by the in-app walkthrough on the dashboard instead. */
export const WIZARD_STEPS = ["canvas", "google", "sync"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export type StepStatus = "done" | "skipped";

export interface OnboardingState {
  steps: Partial<Record<OnboardingStep, StepStatus>>;
  /** ISO time the student finished; null means the wizard still shows. */
  completedAt: string | null;
  nextStep: OnboardingStep | null;
}

/** The first step not recorded yet, in wizard order; null once all four are. */
export function nextStep(steps: OnboardingState["steps"]): OnboardingStep | null {
  return ONBOARDING_STEPS.find((step) => !(step in steps)) ?? null;
}

/**
 * The dashboard's onboarding check. A failed lookup is logged and reported as null so the
 * dashboard still opens (fail open): the wizard is guidance, not access control.
 */
export async function loadGate(load: () => Promise<OnboardingState>): Promise<OnboardingState | null> {
  try {
    return await load();
  } catch (error) {
    console.error("Onboarding check failed:", error);
    return null;
  }
}

/** Only loaded, unfinished progress sends a student to /onboarding; a failed lookup (null) does not. */
export function needsOnboarding(state: OnboardingState | null): boolean {
  return state !== null && state.completedAt === null;
}

/** Wizard finished, but the in-app walkthrough has not been seen (done or skipped) yet. */
export function needsWalkthrough(state: OnboardingState | null): boolean {
  return state !== null && state.completedAt !== null && !("tour" in state.steps);
}
