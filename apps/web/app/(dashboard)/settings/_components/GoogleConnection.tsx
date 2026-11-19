// Settings card for linking Google Calendar (read-only) through Better Auth.
// Connecting leaves for Google's consent screen and comes back to
// /settings?google=connected|error; tokens never reach this page.

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { type GoogleStatus, connectGoogle, disconnectGoogle, fetchGoogleStatus, fetchSyncToGoogle, saveSyncToGoogle } from "@/lib/googleCalendarApi";

type Notice = { kind: "success" | "error"; text: string } | null;

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";

export default function GoogleConnection({ darkMode }: { darkMode: boolean }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "disconnect" | "sync">(null);
  const [notice, setNotice] = useState<Notice>(null);
  // UC3: whether CanvasPlus events are copied out to Google. Off until asked for.
  const [syncOut, setSyncOut] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await fetchGoogleStatus());
    } catch (err) {
      setNotice({ kind: "error", text: errorText(err) });
    }
  }, []);

  useEffect(() => {
    fetchSyncToGoogle().then(setSyncOut).catch(() => setSyncOut(false));
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

  // UC3: turning this on writes to the student's real calendar from then on, so it is
  // saved immediately and reverted in the UI if the save fails.
  const handleSyncToggle = async () => {
    const next = !syncOut;
    setBusy("sync");
    setNotice(null);
    setSyncOut(next);
    try {
      await saveSyncToGoogle(next);
      setNotice({
        kind: "success",
        text: next
          ? "New CanvasPlus events will be added to your Google Calendar. Events you already created stay where they are."
          : "CanvasPlus will stop adding events to your Google Calendar. Events already there are not removed."
      });
    } catch (err) {
      setSyncOut(!next);
      setNotice({ kind: "error", text: errorText(err) });
    } finally {
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
            Show your Google Calendar events next to your Canvas due dates. CanvasPlus reads your
            calendars, and can add events you create in CanvasPlus to your calendar once you turn
            that on below. It never touches events it did not create.
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

          {/* UC3: the outbound half, off unless the student asks for it. */}
          <label className={`flex items-start gap-3 mb-4 ${muted}`}>
            <input
              type="checkbox"
              checked={syncOut}
              disabled={busy !== null}
              onChange={handleSyncToggle}
              aria-label="Add my CanvasPlus events to Google Calendar"
            />
            <span>
              Also add my CanvasPlus events to Google Calendar.
              <span className="block text-xs mt-0.5 opacity-80">
                Only events you create in CanvasPlus. If you connected Google before this option
                existed, reconnect once so CanvasPlus is allowed to add them.
              </span>
            </span>
          </label>

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
