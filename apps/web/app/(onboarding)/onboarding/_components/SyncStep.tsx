"use client";

// UC23 step 3 – run the first Canvas sync and choose which calendar sources show.
// The sync endpoint returns totals only, so this shows a spinner, then the counts.

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { fetchCanvasStatus, syncAssignments, type SyncResult } from "@/app/(dashboard)/settings/_api/canvasApi";
import { fetchGoogleStatus, fetchHiddenSources, saveHiddenSources, type CalendarSource } from "@/lib/googleCalendarApi";
import { ApiError } from "@/lib/apiClient";
import type { StepProps } from "./OnboardingWizard";
import { stepStyles } from "./stepStyles";

interface SyncStepProps extends StepProps {
  /** Go back to step 1 without saving, e.g. after Canvas rejects the stored token. */
  onBackToCanvas: () => void;
}

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Try again.");

function SourceSwitch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${on ? "bg-blue-600" : "bg-gray-300"}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function SyncStep({ darkMode, onDone, saving, onBackToCanvas }: SyncStepProps) {
  const [canvasConnected, setCanvasConnected] = useState<boolean | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [hidden, setHidden] = useState<CalendarSource[]>([]);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = stepStyles(darkMode);

  useEffect(() => {
    let active = true;
    fetchCanvasStatus().then((st) => { if (active) setCanvasConnected(st.connected); }).catch(() => { if (active) setCanvasConnected(false); });
    fetchGoogleStatus().then((st) => { if (active) setGoogleConnected(st.connected); }).catch(() => {});
    fetchHiddenSources().then((list) => { if (active) setHidden(list); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const runSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      setResult(await syncAssignments());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSyncing(false);
    }
  };

  const toggle = (source: CalendarSource) => {
    const previous = hidden;
    const next = hidden.includes(source) ? hidden.filter((x) => x !== source) : [...hidden, source];
    setHidden(next);
    saveHiddenSources(next).catch((err) => {
      setHidden(previous);
      setError(errorText(err));
    });
  };

  if (canvasConnected === null) return <p className={s.muted}>Checking your Canvas connection…</p>;

  return (
    <>
      {!canvasConnected ? (
        <p className={`${s.muted} mb-6`}>Connect Canvas first to sync your assignments.</p>
      ) : (
        <>
          <p className={`${s.muted} mb-4`}>Import your active courses and their assignments from Canvas now. Later syncs happen automatically.</p>
          {result ? (
            <div className={`${s.okBox} mb-6`}>
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Synced {result.assignments} assignments from {result.courses} courses</span>
            </div>
          ) : (
            <button type="button" onClick={() => void runSync()} disabled={syncing} className={`${s.primary} mb-6`}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Run first sync
            </button>
          )}
        </>
      )}

      <h2 className={`font-semibold mb-3 ${s.strong}`}>What your calendar shows</h2>
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between gap-4">
          <span className={s.muted}>Canvas due dates</span>
          <SourceSwitch label="Show Canvas due dates" on={!hidden.includes("canvas")} onToggle={() => toggle("canvas")} />
        </div>
        {googleConnected && (
          <div className="flex items-center justify-between gap-4">
            <span className={s.muted}>Google Calendar events</span>
            <SourceSwitch label="Show Google events" on={!hidden.includes("google")} onToggle={() => toggle("google")} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void onDone(result ? "done" : "skipped")} disabled={syncing || saving} className={s.primary}>Continue</button>
        {error && canvasConnected && <button type="button" onClick={onBackToCanvas} className={s.secondary}>Back to Canvas</button>}
      </div>

      {error && (
        <div role="alert" className={s.errorBox}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </>
  );
}
