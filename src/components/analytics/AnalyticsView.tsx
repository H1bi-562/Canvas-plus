// src/components/analytics/AnalyticsView.tsx
// UC21 – Study Analytics Dashboard.
//
// One filter row (date range) scopes everything below it. Each chart is a
// self-contained component that takes the summary and darkMode, so UC22's
// customizable dashboard can mount any of them as a widget.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { AnalyticsSummary, fetchAnalyticsSummary, localDateKey } from '../../lib/analyticsApi';
import { ApiError } from '../../lib/apiClient';
import StatTiles from './StatTiles';
import AtRiskList from './AtRiskList';
import TimePerCourseChart from './TimePerCourseChart';
import EstimateVsActualChart from './EstimateVsActualChart';
import OnTimeRate from './OnTimeRate';
import WorkloadChart from './WorkloadChart';

// CSULB Fall 2026: Aug 24 – Dec 11.
const SEMESTER_START = '2026-08-24';
const SEMESTER_END = '2026-12-11';

type RangeKey = '7' | '30' | '90' | 'semester';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'semester', label: 'This semester' },
];

function rangeDates(key: RangeKey): { from: string; to: string } {
  const today = localDateKey();
  if (key === 'semester') {
    const to = today < SEMESTER_END ? today : SEMESTER_END;
    // Before the semester starts there is nothing to show; fall back to 30 days.
    return today >= SEMESTER_START ? { from: SEMESTER_START, to } : { from: localDateKey(-29), to: today };
  }
  return { from: localDateKey(-(Number(key) - 1)), to: today };
}

interface AnalyticsViewProps {
  darkMode: boolean;
  onStudyNow?: () => void;
  /** 401 from the API: the session ended. */
  onSignedOut?: () => void;
}

export default function AnalyticsView({ darkMode, onStudyNow, onSignedOut }: AnalyticsViewProps) {
  const [range, setRange] = useState<RangeKey>('30');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (key: RangeKey) => {
    // Ignore responses from a range the student has already moved away from.
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchAnalyticsSummary(rangeDates(key));
      if (request === requestRef.current) setSummary(next);
    } catch (err) {
      if (request !== requestRef.current) return;
      if (err instanceof ApiError && err.status === 401) return onSignedOut?.();
      setError(err instanceof ApiError ? err.message : 'Could not load analytics.');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [onSignedOut]);

  useEffect(() => { load(range); }, [range, load]);

  const ink = darkMode ? 'text-white' : 'text-gray-900';
  const muted = darkMode ? 'text-gray-300' : 'text-gray-600';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div>
          <h2 className={`text-xl font-semibold ${ink}`}>Study Analytics</h2>
          <p className={`text-sm ${muted}`}>Where your study time goes, and how it lines up with your deadlines.</p>
        </div>

        {/* One filter row above everything it scopes. */}
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Date range">
          {RANGES.map(({ key, label }) => {
            const selected = key === range;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRange(key)}
                className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-colors ${
                  selected
                    ? (darkMode ? 'border-gray-300 text-white font-semibold' : 'border-gray-900 text-gray-900 font-semibold')
                    : (darkMode ? 'border-gray-600 text-gray-300 hover:bg-[#3a3a3a]' : 'border-gray-300 text-gray-600 hover:bg-gray-100')
                }`}
              >
                {selected && <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />}
                {label}
              </button>
            );
          })}
          {loading && summary && <Loader2 className={`w-4 h-4 animate-spin ${muted}`} aria-label="Updating" />}
        </div>

        {error && (
          <div role="alert" className={`p-3 rounded-lg text-sm flex items-center justify-between gap-3 ${
            darkMode ? 'bg-red-900/30 border border-red-700 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            <span>{error}</span>
            <button type="button" onClick={() => load(range)} className="underline">Retry</button>
          </div>
        )}

        {!summary && loading && (
          <div className={`flex items-center gap-2 py-16 justify-center ${muted}`}>
            <Loader2 className="w-5 h-5 animate-spin" /> Loading analytics…
          </div>
        )}

        {/* Refetch keeps the frame: the previous render stays, dimmed, until new data lands. */}
        {summary && (
          <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
            <StatTiles summary={summary} darkMode={darkMode} />
            <AtRiskList summary={summary} darkMode={darkMode} onStudyNow={onStudyNow} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TimePerCourseChart summary={summary} darkMode={darkMode} />
              <OnTimeRate summary={summary} darkMode={darkMode} />
            </div>
            <EstimateVsActualChart summary={summary} darkMode={darkMode} />
            <WorkloadChart summary={summary} darkMode={darkMode} />
          </div>
        )}
      </div>
    </div>
  );
}
