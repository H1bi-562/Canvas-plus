// src/components/CanvasConnection.tsx
// Settings card for connecting Canvas with a personal access token and syncing
// assignments, plus (dev builds only) loading demo data to preview the site.
//
// The token is sent once to POST /api/canvas/token, verified against Canvas, and
// stored encrypted server-side. It is never kept in React state after that call
// and never comes back from the API.

import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  CanvasStatus,
  fetchCanvasStatus,
  connectWithToken,
  syncAssignments,
  disconnectCanvas,
} from '../lib/canvasApi';
import { loadDemoData, removeDemoData } from '../lib/demoApi';
import { ApiError } from '../lib/apiClient';

interface CanvasConnectionProps {
  darkMode: boolean;
  /** Called after anything that changes the assignment list. */
  onAssignmentsChanged: () => void;
}

type Busy = null | 'connect' | 'sync' | 'disconnect' | 'demo-load' | 'demo-remove';
type Notice = { kind: 'success' | 'error'; text: string } | null;

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Try again.';

export default function CanvasConnection({ darkMode, onAssignmentsChanged }: CanvasConnectionProps) {
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await fetchCanvasStatus());
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
    }
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  /** Run one action at a time and surface its result. */
  async function run(kind: Exclude<Busy, null>, action: () => Promise<string>) {
    if (busy) return;
    setBusy(kind);
    setNotice(null);
    try {
      setNotice({ kind: 'success', text: await action() });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
      // 409 = Canvas no longer accepts the stored token; show the reconnect form.
      if (err instanceof ApiError && err.status === 409) await refreshStatus();
    } finally {
      setBusy(null);
    }
  }

  // Sync straight after a successful connect, inside the same action, so a failed
  // connect never triggers a sync whose error would hide the real one.
  const handleConnect = () => run('connect', async () => {
    const next = await connectWithToken(token);
    setToken('');
    setShowToken(false);
    setStatus(next);
    const result = await syncAssignments();
    onAssignmentsChanged();
    return `Connected as ${next.canvasName || 'your Canvas account'} and synced ` +
      `${result.assignments} assignments from ${result.courses} courses.`;
  });

  const handleSync = () => run('sync', async () => {
    const result = await syncAssignments();
    onAssignmentsChanged();
    return `Synced ${result.assignments} assignments from ${result.courses} courses ` +
      `(${result.created} new, ${result.updated} updated).`;
  });

  const handleDisconnect = () => run('disconnect', async () => {
    await disconnectCanvas();
    await refreshStatus();
    return 'Canvas disconnected. Synced assignments stay until you remove them.';
  });

  const handleLoadDemo = () => run('demo-load', async () => {
    const result = await loadDemoData();
    onAssignmentsChanged();
    return result.created > 0
      ? `Loaded ${result.assignments} demo assignments and ${result.sessions} past study sessions.`
      : 'Demo data is already loaded — due dates were refreshed.';
  });

  const handleRemoveDemo = () => run('demo-remove', async () => {
    const result = await removeDemoData();
    onAssignmentsChanged();
    return `Removed ${result.assignments} demo assignments and ${result.sessions} study sessions.`;
  });

  // ── Styling (matches Settings.tsx) ──────────────────────────────────────
  const card    = `rounded-lg shadow-sm p-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`;
  const heading = `font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`;
  const muted   = `text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`;
  const input   = `w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${
    darkMode ? 'bg-[#2d2d2d] border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
  }`;
  const primary   = 'inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const secondary = `inline-flex items-center gap-2 py-2.5 px-5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
    darkMode ? 'border-gray-600 text-gray-200 hover:bg-[#2d2d2d]' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
  }`;
  const spinner = <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <>
      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <h2 className={heading}>Canvas Integration</h2>
          {status?.connected && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              darkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700'
            }`}>
              Connected
            </span>
          )}
        </div>

        {status === null && <p className={muted}>Checking connection…</p>}

        {status && !status.connected && (
          <>
            <p className={`${muted} mb-4`}>
              In Canvas, go to <strong>Account → Settings → + New Access Token</strong>, then paste
              the token here. It is verified with Canvas and stored encrypted — it never comes back
              to this page.
            </p>
            <div className="relative mb-4">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && token.trim()) handleConnect(); }}
                placeholder="Paste your Canvas access token"
                autoComplete="off"
                spellCheck={false}
                className={input}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <button type="button" onClick={handleConnect} disabled={!token.trim() || busy !== null} className={primary}>
              {busy === 'connect' && spinner}
              Connect Canvas
            </button>
          </>
        )}

        {status?.connected && (
          <>
            <p className={`${muted} mb-4`}>
              Signed in as <strong>{status.canvasName || 'your Canvas account'}</strong>
              {status.canvasBaseURL && <> on {status.canvasBaseURL.replace(/^https?:\/\//, '')}</>}
              {status.authType === 'pat' && ' with a personal access token'}.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={handleSync} disabled={busy !== null} className={primary}>
                {busy === 'sync' ? spinner : <RefreshCw className="w-4 h-4" />}
                Sync assignments
              </button>
              <button type="button" onClick={handleDisconnect} disabled={busy !== null} className={secondary}>
                {busy === 'disconnect' && spinner}
                Disconnect
              </button>
            </div>
          </>
        )}

        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2 mt-4 p-3 rounded-lg text-sm ${
              notice.kind === 'error'
                ? (darkMode ? 'bg-red-900/30 border border-red-700 text-red-300' : 'bg-red-50 border border-red-200 text-red-700')
                : (darkMode ? 'bg-green-900/30 border border-green-700 text-green-300' : 'bg-green-50 border border-green-200 text-green-800')
            }`}
          >
            {notice.kind === 'error'
              ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}
      </div>

      {/* Dev builds only: the server does not mount /api/demo in production. */}
      {import.meta.env.DEV && (
        <div className={`${card} border-2 border-dashed ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
          <h2 className={`${heading} mb-2`}>Demo Data <span className={`text-xs font-normal ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}>(dev only)</span></h2>
          <p className={`${muted} mb-4`}>
            Preview the site without Canvas access: adds 3 courses, 10 assignments due around today,
            and two weeks of past study sessions to <strong>your account only</strong>. Remove it
            before syncing real Canvas data.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleLoadDemo} disabled={busy !== null} className={primary}>
              {busy === 'demo-load' && spinner}
              Load demo data
            </button>
            <button type="button" onClick={handleRemoveDemo} disabled={busy !== null} className={secondary}>
              {busy === 'demo-remove' && spinner}
              Remove demo data
            </button>
          </div>
        </div>
      )}
    </>
  );
}
