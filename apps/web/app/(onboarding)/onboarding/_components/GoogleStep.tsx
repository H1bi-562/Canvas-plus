"use client";

// UC23 step 2 – what connecting Google Calendar does, with an optional Connect.
// Google's consent screen sends the student back to /onboarding, not Settings.

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { connectGoogle, fetchGoogleStatus, type GoogleStatus } from "@/lib/googleCalendarApi";
import type { StepProps } from "./OnboardingWizard";
import { stepStyles } from "./stepStyles";

export const GOOGLE_RETURN = { callbackURL: "/onboarding?google=connected", errorCallbackURL: "/onboarding?google=error" };

interface GoogleStepProps extends StepProps {
  callbackResult: "connected" | "error" | null;
}

export default function GoogleStep({ darkMode, onDone, saving, callbackResult }: GoogleStepProps) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(callbackResult === "error" ? "Google didn't connect. You can try again or skip." : null);
  const s = stepStyles(darkMode);

  useEffect(() => {
    let active = true;
    fetchGoogleStatus()
      .then((next) => { if (active) setStatus(next); })
      .catch(() => { if (active) setStatus({ configured: false, connected: false }); });
    return () => { active = false; };
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectGoogle(GOOGLE_RETURN); // leaves the page on success
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the Google connection.");
      setBusy(false);
    }
  };

  const skip = <button type="button" onClick={() => void onDone("skipped")} disabled={busy || saving} className={s.secondary}>Skip</button>;

  return (
    <>
      <p className={`${s.muted} mb-6`}>
        Connecting lets CanvasPlus show your Google Calendar events next to your Canvas due dates. It only reads your
        calendars (calendar.readonly) and never changes them.
      </p>

      {status === null && <p className={s.muted}>Checking your Google connection…</p>}

      {status && !status.configured && (
        <>
          <p className={`${s.muted} mb-6`}>Google sign-in isn&apos;t set up on this server.</p>
          {skip}
        </>
      )}

      {status?.configured && status.connected && (
        <>
          <div className={`${s.okBox} mb-6`}>
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Google Calendar is connected</span>
          </div>
          <button type="button" onClick={() => void onDone("done")} disabled={saving} className={s.primary}>Continue</button>
        </>
      )}

      {status?.configured && !status.connected && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void handleConnect()} disabled={busy || saving} className={s.primary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Connect Google
          </button>
          {skip}
        </div>
      )}

      {error && (
        <div role="alert" className={s.errorBox}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </>
  );
}
