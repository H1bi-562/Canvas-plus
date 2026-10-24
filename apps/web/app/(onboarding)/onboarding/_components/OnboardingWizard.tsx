"use client";

// UC23 – the first-run setup wizard. Four steps, each saved as it is finished, so a
// student who leaves comes back to the first unfinished step on any device.

import { useLayoutEffect, useState } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { DEFAULT_THEME, getTheme, type ThemeId } from "@canvasplus/ui/themes";
import { ONBOARDING_STEPS, type OnboardingState, type OnboardingStep, type StepStatus } from "@/lib/onboarding";
import { saveOnboardingStep } from "@/lib/onboardingApi";
import { readPreferences } from "@/lib/preferencesCache";
import CanvasStep from "./CanvasStep";
import GoogleStep from "./GoogleStep";
import SyncStep from "./SyncStep";

interface OnboardingWizardProps {
  userId: string;
  initialState: OnboardingState;
  /** Set when Google's consent screen sent the student back here. */
  googleResult: "connected" | "error" | null;
}

/** What every step component receives; steps add their own extra props. */
export interface StepProps {
  darkMode: boolean;
  /** Save this step as done or skipped, then move on. Rejections are shown by the wizard. */
  onDone: (status: StepStatus) => Promise<void>;
}

const TITLES: Record<OnboardingStep, string> = {
  canvas: "Connect Canvas",
  google: "Google Calendar",
  sync: "Run your first sync",
  tour: "Tour CanvasPlus"
};

const SAVE_ERROR = "Could not save your progress. Try again.";

function startIndex(initialState: OnboardingState, googleResult: OnboardingWizardProps["googleResult"]) {
  if (googleResult) return ONBOARDING_STEPS.indexOf("google");
  return ONBOARDING_STEPS.indexOf(initialState.nextStep ?? "tour");
}

// Placeholder until the real step components exist.
function PlaceholderStep({ onDone }: StepProps) {
  return <button type="button" onClick={() => void onDone("done")} className="bg-blue-600 text-white py-2.5 px-5 rounded-lg">Continue</button>;
}

export default function OnboardingWizard({ userId, initialState, googleResult }: OnboardingWizardProps) {
  const [index, setIndex] = useState(() => startIndex(initialState, googleResult));
  const [error, setError] = useState<string | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);

  // This browser's saved theme, read after hydration so the server and first client render agree.
  useLayoutEffect(() => {
    const saved = readPreferences(userId)?.theme;
    if (saved) setThemeId(saved);
  }, [userId]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeId;
  }, [themeId]);

  const step = ONBOARDING_STEPS[index];
  const darkMode = getTheme(themeId).mode === "dark";

  const record = async (status: StepStatus) => {
    setError(null);
    try {
      await saveOnboardingStep(step, status);
    } catch {
      setError(SAVE_ERROR);
      return;
    }
    setIndex((i) => Math.min(i + 1, ONBOARDING_STEPS.length - 1));
  };

  const goBack = () => {
    setError(null);
    setIndex((i) => Math.max(i - 1, 0));
  };

  const stepProps: StepProps = { darkMode, onDone: record };

  // ── Styling (matches the Settings cards) ────────────────────────────────
  const card = `w-full max-w-2xl rounded-lg shadow-sm p-6 sm:p-8 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`;
  const muted = `text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`;
  const heading = `text-2xl font-semibold mt-1 mb-6 ${darkMode ? "text-white" : "text-gray-900"}`;

  return (
    <section className={card} aria-labelledby="onboarding-title">
      <p className={muted}>Welcome to CanvasPlus</p>
      <div className="flex items-center justify-between mt-3">
        <p className={`text-xs font-medium uppercase tracking-wide ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          Step {index + 1} of {ONBOARDING_STEPS.length}
        </p>
        {index > 0 && (
          <button type="button" onClick={goBack} className={`inline-flex items-center gap-1 text-sm ${darkMode ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}>
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
      </div>
      <div className="flex gap-1.5 mt-2" aria-hidden="true">
        {ONBOARDING_STEPS.map((id, i) => (
          <span key={id} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-blue-600" : darkMode ? "bg-gray-600" : "bg-gray-200"}`} />
        ))}
      </div>

      <h1 id="onboarding-title" className={heading}>{TITLES[step]}</h1>

      {step === "canvas" && <CanvasStep key="canvas" {...stepProps} />}
      {step === "google" && <GoogleStep key="google" {...stepProps} callbackResult={googleResult} />}
      {step === "sync" && <SyncStep key="sync" {...stepProps} onBackToCanvas={() => { setError(null); setIndex(0); }} />}
      {step === "tour" && <PlaceholderStep key="tour" {...stepProps} />}

      {error && (
        <div role="alert" className={`flex items-start gap-2 mt-4 p-3 rounded-lg text-sm ${
          darkMode ? "bg-red-900/30 border border-red-700 text-red-300" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
