"use client";

// UC23 – the first-run setup wizard. Four steps, each saved as it is finished, so a
// student who leaves comes back to the first unfinished step on any device.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { DEFAULT_THEME, getTheme, type ThemeId } from "@canvasplus/ui/themes";
import { WIZARD_STEPS, type OnboardingState, type StepStatus, type WizardStep } from "@/lib/onboarding";
import { completeOnboarding, saveOnboardingStep } from "@/lib/onboardingApi";
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
  /** A save is in flight: steps disable their buttons so a double click cannot skip a step. */
  saving: boolean;
}

const TITLES: Record<WizardStep, string> = {
  canvas: "Connect Canvas",
  google: "Google Calendar",
  sync: "Run your first sync"
};

const SAVE_ERROR = "Could not save your progress. Try again.";

const LAST = WIZARD_STEPS.length - 1;

function startIndex(initialState: OnboardingState, googleResult: OnboardingWizardProps["googleResult"]) {
  if (googleResult) return WIZARD_STEPS.indexOf("google");
  const next = initialState.nextStep;
  // "tour" (or nothing left) means sync was saved but finishing failed: reopen sync so Finish can be retried.
  return next === "canvas" || next === "google" ? WIZARD_STEPS.indexOf(next) : LAST;
}

export default function OnboardingWizard({ userId, initialState, googleResult }: OnboardingWizardProps) {
  const [index, setIndex] = useState(() => startIndex(initialState, googleResult));
  const [error, setError] = useState<string | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  // A ref as well as state: two clicks in the same frame both still see saving === false.
  const savingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const router = useRouter();

  // This browser's saved theme, read after hydration so the server and first client render agree.
  useLayoutEffect(() => {
    const saved = readPreferences(userId)?.theme;
    if (saved) setThemeId(saved);
  }, [userId]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeId;
  }, [themeId]);

  const step = WIZARD_STEPS[index];
  const darkMode = getTheme(themeId).mode === "dark";

  // When the step changes, move focus to its heading so keyboard and screen-reader users keep their place.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [index]);

  /**
   * Save this step, then move on. On the last step (sync) this is Finish: it also sets the finish
   * time and opens the dashboard, where the in-app walkthrough takes over.
   */
  const record = async (status: StepStatus) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const finishing = step === WIZARD_STEPS[LAST];
    try {
      await saveOnboardingStep(step, status);
      if (finishing) await completeOnboarding();
    } catch {
      setError(SAVE_ERROR);
      savingRef.current = false;
      setSaving(false);
      return;
    }
    if (finishing) {
      // Keep saving=true so nothing can be clicked while the dashboard loads.
      router.replace("/assignments");
      router.refresh();
      return;
    }
    savingRef.current = false;
    setSaving(false);
    // Advance from the step that was saved, never from wherever a second click left the index.
    setIndex(Math.min(WIZARD_STEPS.indexOf(step) + 1, LAST));
  };

  const goBack = () => {
    if (savingRef.current) return;
    setError(null);
    setIndex((i) => Math.max(i - 1, 0));
  };

  const stepProps: StepProps = { darkMode, onDone: record, saving };

  // ── Styling (matches the Settings cards) ────────────────────────────────
  const card = `w-full max-w-2xl rounded-lg shadow-sm p-6 sm:p-8 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`;
  const muted = `text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`;
  const heading = `text-2xl font-semibold mt-1 mb-6 ${darkMode ? "text-white" : "text-gray-900"}`;

  return (
    <section className={card} aria-labelledby="onboarding-title">
      <p className={muted}>Welcome to CanvasPlus</p>
      <div className="flex items-center justify-between mt-3">
        <p className={`text-xs font-medium uppercase tracking-wide ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          Step {index + 1} of {WIZARD_STEPS.length}
        </p>
        {index > 0 && (
          <button type="button" onClick={goBack} disabled={saving} className={`inline-flex items-center gap-1 text-sm ${darkMode ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}>
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
      </div>
      <div className="flex gap-1.5 mt-2" aria-hidden="true">
        {WIZARD_STEPS.map((id, i) => (
          <span key={id} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-blue-600" : darkMode ? "bg-gray-600" : "bg-gray-200"}`} />
        ))}
      </div>

      <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className={`${heading} focus:outline-none`}>{TITLES[step]}</h1>

      {step === "canvas" && <CanvasStep key="canvas" {...stepProps} />}
      {step === "google" && <GoogleStep key="google" {...stepProps} callbackResult={googleResult} />}
      {step === "sync" && <SyncStep key="sync" {...stepProps} onBackToCanvas={() => { setError(null); setIndex(0); }} />}

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
