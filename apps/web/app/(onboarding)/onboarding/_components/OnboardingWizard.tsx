"use client";

import type { OnboardingState } from "@/lib/onboarding";

interface OnboardingWizardProps {
  userId: string;
  initialState: OnboardingState;
  googleResult: "connected" | "error" | null;
}

// Stub: Task 4 replaces this with the full wizard.
export default function OnboardingWizard({ initialState }: OnboardingWizardProps) {
  return <h1 className="text-xl font-semibold">Setup — next step: {initialState.nextStep ?? "tour"}</h1>;
}
