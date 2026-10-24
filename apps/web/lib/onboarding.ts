// UC23 – first-run wizard progress, shared by the server pages and the browser.
// Safe to import anywhere: no database code. The server copy of the step list is
// ONBOARDING_STEPS in packages/database/src/queries/onboarding.js (a parity test checks).

export const ONBOARDING_STEPS = ["canvas", "google", "sync", "tour"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
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

/** Only loaded, unfinished progress sends a student to /onboarding; a failed lookup (null) does not. */
export function needsOnboarding(state: OnboardingState | null): boolean {
  return state !== null && state.completedAt === null;
}
