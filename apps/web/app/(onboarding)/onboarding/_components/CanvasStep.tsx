"use client";

// UC23 step 1 – connect Canvas with a personal access token, or skip for now.
// The token goes only to POST /api/canvas/token, which verifies it with Canvas,
// stores it encrypted, and never sends it back.

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { connectWithToken, fetchCanvasStatus, type CanvasStatus } from "@/app/(dashboard)/settings/_api/canvasApi";
import { ApiError } from "@/lib/apiClient";
import type { StepProps } from "./OnboardingWizard";
import { stepStyles } from "./stepStyles";

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Try again.");

export default function CanvasStep({ darkMode, onDone, saving }: StepProps) {
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server has no CANVAS_BASE_URL, so no token can work here.
  const [unavailable, setUnavailable] = useState(false);
  // Connected, but the student wants to paste a new token (e.g. after Canvas rejected the stored one).
  const [replacing, setReplacing] = useState(false);
  const s = stepStyles(darkMode);

  useEffect(() => {
    let active = true;
    fetchCanvasStatus()
      .then((next) => { if (active) setStatus(next); })
      .catch((err) => {
        if (!active) return;
        setStatus({ connected: false, configured: false });
        setError(errorText(err));
      });
    return () => { active = false; };
  }, []);

  const handleConnect = async () => {
    if (busy || saving || !token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await connectWithToken(token.trim());
      setToken("");
      setShowToken(false);
      setStatus(next);
      setReplacing(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) setUnavailable(true);
      else setError(errorText(err));
      setBusy(false);
      return;
    }
    await onDone("done");
    setBusy(false);
  };

  const skip = <button type="button" onClick={() => void onDone("skipped")} disabled={busy || saving} className={s.secondary}>I&apos;ll connect later</button>;

  if (status === null) return <p className={s.muted}>Checking your Canvas connection…</p>;

  if (status.connected && !replacing) {
    return (
      <>
        <div className={`${s.okBox} mb-6`}>
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Connected as {status.canvasName || "your Canvas account"}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void onDone("done")} disabled={saving} className={s.primary}>Continue</button>
          <button type="button" onClick={() => setReplacing(true)} disabled={saving} className={s.secondary}>Use a different token</button>
        </div>
      </>
    );
  }

  if (unavailable) {
    return (
      <>
        <p className={`${s.muted} mb-6`}>Canvas isn&apos;t set up on this server yet. You can skip this step and connect later in Settings.</p>
        {skip}
      </>
    );
  }

  return (
    <>
      <p className={`${s.muted} mb-4`}>
        CanvasPlus imports your courses and assignments from Canvas. It only reads them; it never submits or changes anything.
      </p>
      <p className={`${s.muted} mb-4`}>
        In Canvas, open <strong>Account → Settings</strong> and click <strong>+ New Access Token</strong>. CSULB pilot
        participants: activate the token Canvas Support issued to you on that page.
      </p>
      <label htmlFor="onboarding-canvas-token" className={`block text-sm font-medium mb-2 ${s.strong}`}>Canvas access token</label>
      <div className="relative mb-4">
        <input
          id="onboarding-canvas-token"
          type={showToken ? "text" : "password"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleConnect(); }}
          autoComplete="off"
          spellCheck={false}
          className={s.input}
        />
        <button
          type="button"
          onClick={() => setShowToken(!showToken)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label={showToken ? "Hide token" : "Show token"}
        >
          {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void handleConnect()} disabled={busy || saving || !token.trim()} className={s.primary}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Connect Canvas
        </button>
        {skip}
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
