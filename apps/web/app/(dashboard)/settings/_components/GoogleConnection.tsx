// Settings card for linking Google Calendar (read-only) through Better Auth.
// Connecting leaves for Google's consent screen and comes back to
// /settings?google=connected|error; tokens never reach this page.

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { type GoogleStatus, connectGoogle, disconnectGoogle, fetchGoogleStatus } from "@/lib/googleCalendarApi";

type Notice = { kind: "success" | "error"; text: string } | null;

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";

export default function GoogleConnection({ darkMode }: { darkMode: boolean }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "disconnect">(null);
  const [notice, setNotice] = useState<Notice>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await fetchGoogleStatus());
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err) });
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    // The OAuth round trip reports its result in the query string.
    const result = new URLSearchParams(window.location.search).get("google");
    if (result === "connected") setNotice({ kind: "success", text: "Google Calendar connected. Your events now show on the Calendar page." });
    if (result === "error") setNotice({ kind: "error", text: "Google Calendar was not connected. Try again and allow calendar access." });
  }, [refreshStatus]);

  const handleConnect = async () => {
    setBusy("connect");
    setNotice(null);
    try {
      await connectGoogle(); // navigates away on success
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err) });
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    setNotice(null);
    try {
      await disconnectGoogle();
      setNotice({ kind: "success", text: "Google Calendar disconnected." });
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err) });
    } finally {
      await refreshStatus();
      setBusy(null);
    }
  };

  // ── Styling (matches CanvasConnection.tsx) ──────────────────────────────
  const card      = `rounded-lg shadow-sm p-6 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`;
  const heading   = `font-semibold ${darkMode ? "text-white" : "text-gray-900"}`;
  const muted     = `text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`;
  const primary   = "inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const secondary = `inline-flex items-center gap-2 py-2.5 px-5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
    darkMode ? "border-gray-600 text-gray-200 hover:bg-[var(--cp-page)]" : "border-gray-300 text-gray-700 hover:bg-gray-50"
  }`;
  const spinner = <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-2">
        <h2 className={heading}>Google Calendar</h2>
        {status?.connected && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            darkMode ? "bg-green-900/40 text-green-300" : "bg-green-50 text-green-700"
          }`}>
            Connected
          </span>
        )}
      </div>

      {status === null && !notice && <p className={muted}>Checking connection…</p>}

      {status && !status.configured && (
        <p className={muted}>
          Google sign-in is not set up on this server. Add <code>GOOGLE_CLIENT_ID</code> and{" "}
          <code>GOOGLE_CLIENT_SECRET</code> to <code>.env</code> (see the README).
        </p>
      )}

      {status?.configured && !status.connected && (
        <>
          <p className={`${muted} mb-4`}>
            Show your Google Calendar events next to your Canvas due dates. CanvasPlus only reads
            your calendars; it never changes them.
          </p>
          <button type="button" onClick={handleConnect} disabled={busy !== null} className={primary}>
            {busy === "connect" && spinner}
            Connect Google Calendar
          </button>
        </>
      )}

      {status?.configured && status.connected && (
        <>
          <p className={`${muted} mb-4`}>
            Events from every calendar you have visible in Google appear on the Calendar page.
          </p>
          <button type="button" onClick={handleDisconnect} disabled={busy !== null} className={secondary}>
            {busy === "disconnect" && spinner}
            Disconnect
          </button>
        </>
      )}

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`flex items-start gap-2 mt-4 p-3 rounded-lg text-sm ${
            notice.kind === "error"
              ? (darkMode ? "bg-red-900/30 border border-red-700 text-red-300" : "bg-red-50 border border-red-200 text-red-700")
              : (darkMode ? "bg-green-900/30 border border-green-700 text-green-300" : "bg-green-50 border border-green-200 text-green-800")
          }`}
        >
          {notice.kind === "error"
            ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}
    </div>
  );
}
