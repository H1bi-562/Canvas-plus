// UC23 – the browser's calls to /api/onboarding.
import { apiRequest } from "@/lib/apiClient";
import type { OnboardingState, OnboardingStep, StepStatus } from "@/lib/onboarding";

export function fetchOnboarding() {
  return apiRequest<OnboardingState>("/api/onboarding");
}

export function saveOnboardingStep(step: OnboardingStep, status: StepStatus) {
  return apiRequest<OnboardingState>("/api/onboarding", "PATCH", { step, status });
}

export function completeOnboarding() {
  return apiRequest<OnboardingState>("/api/onboarding/complete", "POST", {});
}

/** Settings → Run setup again: clears progress so the wizard shows from step 1. */
export function restartOnboarding() {
  return apiRequest<OnboardingState>("/api/onboarding", "DELETE");
}
