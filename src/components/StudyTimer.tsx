// src/components/StudyTimer.tsx
// UC24 – study session timer with start / pause / resume / end states.
// Nathan Salazar + Owen Rivera
//
// Why the elapsed time is not just a counter
// ------------------------------------------
// The obvious build is `setInterval(() => setSeconds(s => s + 1), 1000)`. It is
// wrong here for three reasons, all of which we hit in the Manifest V3 research:
//
//   1. A Manifest V3 background service worker is evicted after ~30s idle, and
//      the popup unmounts every time it closes. Any count held in memory is
//      gone, so a counter would silently restart at zero.
//   2. Browsers throttle timers in background tabs, so an interval that has
//      "ticked 60 times" has not necessarily seen 60 seconds pass.
//   3. Drift accumulates — intervals fire late, never early.
//
// So the server owns the truth. Every state change returns the session with
// timestamps stamped by the database, and the interval below only decides when
// to repaint: the number it shows is always recomputed from the last server
// response plus the wall-clock delta since it arrived. Remounting, closing the
// popup, or letting the worker die costs nothing — mounting re-syncs.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, Loader2, AlertCircle } from 'lucide-react';
import {
  StudySession,
  SessionApiError,
  fetchActiveSession,
  startSession,
  pauseSession,
  resumeSession,
  endSession,
  formatDuration,
} from '../lib/sessionsApi';

interface StudyTimerProps {
  darkMode: boolean;
  /** Optionally tie the session to an assignment. */
  assignmentID?: string | null;
  /** Label shown under the clock so the user knows what they are timing. */
  assignmentTitle?: string | null;
  /** Fired once a session is closed, so a parent can refresh totals. */
  onSessionEnd?: (session: StudySession) => void;
  /**
   * Fired whenever the server's view of the open session changes (including on
   * mount), so a parent can lock its assignment picker while a session runs.
   */
  onSessionChange?: (session: StudySession | null) => void;
}

type UiState = 'loading' | 'idle' | 'active' | 'paused';

export default function StudyTimer({
  darkMode,
  assignmentID = null,
  assignmentTitle = null,
  onSessionEnd,
  onSessionChange,
}: StudyTimerProps) {
  const [session, setSession] = useState<StudySession | null>(null);
  const [uiState, setUiState] = useState<UiState>('loading');
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The last server reading and the local instant it landed. Elapsed time is
  // always (banked seconds) + (wall clock since that reading), never a tally of
  // interval ticks.
  const anchorRef = useRef<{ seconds: number; at: number } | null>(null);

  // Guards against a response from an in-flight request landing after the
  // component has unmounted.
  const mountedRef = useRef(true);

  // Read through a ref so applySession can stay stable (it is a dependency of
  // the mount effect) while still calling the latest callback.
  const onSessionChangeRef = useRef(onSessionChange);
  onSessionChangeRef.current = onSessionChange;

  /** Adopt a server response as the new source of truth. */
  const applySession = useCallback((next: StudySession | null) => {
    if (!mountedRef.current) return;

    setSession(next);
    onSessionChangeRef.current?.(next && next.status !== 'completed' ? next : null);

    if (!next || next.status === 'completed') {
      anchorRef.current = null;
      setUiState('idle');
      setDisplaySeconds(0);
      return;
    }

    if (next.status === 'active') {
      anchorRef.current = { seconds: next.elapsedSeconds, at: Date.now() };
      setUiState('active');
      setDisplaySeconds(next.elapsedSeconds);
    } else {
      // Paused: the total is frozen at whatever the server banked.
      anchorRef.current = null;
      setUiState('paused');
      setDisplaySeconds(next.durationSeconds);
    }
  }, []);

  /** Ask the server what should be on screen. */
  const sync = useCallback(async () => {
    try {
      const { session: open } = await fetchActiveSession();
      applySession(open);
      if (mountedRef.current) setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof SessionApiError ? err.message : 'Could not reach the server.';
      setError(message);
      setUiState('idle');
    }
  }, [applySession]);

  // Re-sync on mount, and again whenever the popup becomes visible — that is
  // exactly when a service worker may have been evicted while we were away.
  useEffect(() => {
    mountedRef.current = true;
    sync();

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);

  // Repaint once a second while running. This only drives rendering; the value
  // comes from the anchor, so a throttled or late interval cannot lose time.
  useEffect(() => {
    if (uiState !== 'active') return;

    const tick = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setDisplaySeconds(anchor.seconds + (Date.now() - anchor.at) / 1000);
    };

    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [uiState]);

  /** Run a state-changing call, keeping one action in flight at a time. */
  const run = useCallback(
    async (action: () => Promise<StudySession>, after?: (s: StudySession) => void) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const updated = await action();
        applySession(updated);
        after?.(updated);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof SessionApiError) {
          setError(err.message);
          // 404/409 mean our view of the world is stale — the session was
          // already ended or started elsewhere. Re-read rather than guess.
          if (err.status === 404 || err.status === 409) await sync();
        } else {
          setError('Could not reach the server.');
        }
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [busy, applySession, sync]
  );

  const handleStart  = () => run(() => startSession(assignmentID));
  const handlePause  = () => session && run(() => pauseSession(session.id));
  const handleResume = () => session && run(() => resumeSession(session.id));
  const handleEnd    = () =>
    session && run(() => endSession(session.id), (ended) => onSessionEnd?.(ended));

  // ── Styling ─────────────────────────────────────────────────────────────
  const card    = darkMode ? 'bg-[#3a3a3a]' : 'bg-white';
  const heading = darkMode ? 'text-white' : 'text-gray-900';
  const muted   = darkMode ? 'text-gray-300' : 'text-gray-600';

  const statusLabel: Record<UiState, string> = {
    loading: 'Loading…',
    idle: 'Ready',
    active: 'Studying',
    paused: 'Paused',
  };

  const statusStyle: Record<UiState, string> = {
    loading: darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600',
    idle:    darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600',
    active:  darkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700',
    paused:  darkMode ? 'bg-yellow-900/40 text-yellow-300' : 'bg-yellow-50 text-yellow-700',
  };

  const primaryButton =
    'flex items-center justify-center gap-2 py-3 px-8 rounded-lg font-semibold text-white ' +
    'transition-all transform hover:scale-105 disabled:opacity-50 ' +
    'disabled:cursor-not-allowed disabled:hover:scale-100';

  return (
    <div className={`rounded-lg shadow-sm p-6 ${card}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`font-semibold ${heading}`}>Study Timer</h3>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusStyle[uiState]}`}>
          {statusLabel[uiState]}
        </span>
      </div>

      {/* Clock. tabular-nums keeps the digits from shifting as they change. */}
      <div className="text-center py-6">
        <div
          className={`text-5xl font-mono tabular-nums tracking-tight ${heading}`}
          role="timer"
          aria-live="off"
          aria-label={`Elapsed study time ${formatDuration(displaySeconds)}`}
        >
          {formatDuration(displaySeconds)}
        </div>

        {assignmentTitle && (
          <p className={`mt-2 text-sm ${muted}`}>{assignmentTitle}</p>
        )}

        {uiState === 'paused' && (
          <p className={`mt-2 text-sm ${muted}`}>Paused time is not counted.</p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className={`flex items-start gap-2 mb-4 p-3 rounded-lg text-sm ${
            darkMode
              ? 'bg-red-900/30 border border-red-700 text-red-300'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Controls. Which buttons exist is driven entirely by uiState, so an
          invalid transition (pausing an idle timer) is not reachable. */}
      <div className="flex justify-center gap-3">
        {uiState === 'loading' && (
          <Loader2 className={`w-6 h-6 animate-spin ${muted}`} aria-label="Loading timer" />
        )}

        {uiState === 'idle' && (
          <button
            onClick={handleStart}
            disabled={busy}
            className={`${primaryButton} bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700`}
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            Start
          </button>
        )}

        {uiState === 'active' && (
          <>
            <button
              onClick={handlePause}
              disabled={busy}
              className={`${primaryButton} bg-yellow-600 hover:bg-yellow-700`}
            >
              <Pause className="w-5 h-5" />
              Pause
            </button>
            <button
              onClick={handleEnd}
              disabled={busy}
              className={`${primaryButton} bg-red-600 hover:bg-red-700`}
            >
              <Square className="w-5 h-5" />
              End
            </button>
          </>
        )}

        {uiState === 'paused' && (
          <>
            <button
              onClick={handleResume}
              disabled={busy}
              className={`${primaryButton} bg-green-600 hover:bg-green-700`}
            >
              <Play className="w-5 h-5" />
              Resume
            </button>
            <button
              onClick={handleEnd}
              disabled={busy}
              className={`${primaryButton} bg-red-600 hover:bg-red-700`}
            >
              <Square className="w-5 h-5" />
              End
            </button>
          </>
        )}
      </div>
    </div>
  );
}
