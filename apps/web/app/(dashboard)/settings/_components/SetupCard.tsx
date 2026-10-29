"use client";

// UC23 – Settings card to go through the setup wizard again. Clearing progress
// is all it takes: the wizard reopens at step 1, and connected accounts stay connected.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { restartOnboarding } from "@/lib/onboardingApi";

export default function SetupCard({ darkMode }: { darkMode: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestart = async () => {
    setBusy(true);
    setError(null);
    try {
      await restartOnboarding();
    } catch {
      setError("Could not restart setup. Try again.");
      setBusy(false);
      return;
    }
    router.push("/onboarding");
  };

  // ── Styling (matches CanvasConnection.tsx / GoogleConnection.tsx) ───────
  const card = `rounded-lg shadow-sm p-6 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`;
  const secondary = `inline-flex items-center gap-2 py-2.5 px-5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
    darkMode ? "border-gray-600 text-gray-200 hover:bg-[var(--cp-page)]" : "border-gray-300 text-gray-700 hover:bg-gray-50"
  }`;

  return (
    <div className={card}>
      <h2 className={`font-semibold mb-2 ${darkMode ? "text-white" : "text-gray-900"}`}>Setup</h2>
      <p className={`text-sm mb-4 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
        Go through the setup wizard again. Connected accounts stay connected.
      </p>
      <button type="button" onClick={() => void handleRestart()} disabled={busy} className={secondary}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        Run setup again
      </button>
      {error && (
        <div role="alert" className={`flex items-start gap-2 mt-4 p-3 rounded-lg text-sm ${
          darkMode ? "bg-red-900/30 border border-red-700 text-red-300" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
