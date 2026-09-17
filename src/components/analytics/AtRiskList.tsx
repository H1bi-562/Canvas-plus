// src/components/analytics/AtRiskList.tsx
// Unfinished work due within 72 hours with little or no study time logged --
// the one list on this screen a student can act on right now.

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { AnalyticsSummary } from '../../lib/analyticsApi';
import { formatMinutes, shortCourse, vizTheme } from './vizTokens';

interface AtRiskListProps {
  summary: AnalyticsSummary;
  darkMode: boolean;
  /** Jump to Focus mode to start studying. */
  onStudyNow?: () => void;
}

function dueIn(hours: number) {
  if (hours < 1) return 'due within the hour';
  if (hours < 24) return `due in ${hours}h`;
  const days = Math.round(hours / 24);
  return `due in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export default function AtRiskList({ summary, darkMode, onStudyNow }: AtRiskListProps) {
  const theme = vizTheme(darkMode);
  const items = summary.atRisk;
  const muted = darkMode ? 'text-gray-300' : 'text-gray-600';
  const ink = darkMode ? 'text-white' : 'text-gray-900';

  return (
    <section className={`rounded-lg shadow-sm p-5 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`} aria-labelledby="at-risk-title">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 id="at-risk-title" className={`font-semibold ${ink}`}>At risk in the next 72 hours</h3>
        {items.length > 0 && onStudyNow && (
          <button
            type="button"
            onClick={onStudyNow}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded-lg transition-colors"
          >
            Study now
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className={`flex items-center gap-2 text-sm ${muted}`}>
          <CheckCircle2 className="w-4 h-4" style={{ color: theme.status.good }} aria-hidden="true" />
          Nothing at risk — everything due soon has time logged against it.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: theme.grid }}>
          {items.map((a) => (
            <li key={a.assignmentID} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: theme.status.warning }} aria-label="At risk" />
                <div className="min-w-0">
                  <div className={`text-sm font-medium truncate ${ink}`}>{a.title}</div>
                  <div className={`text-xs ${muted}`}>
                    {shortCourse(a.courseCode, 'Course')} · {dueIn(a.hoursLeft)}
                  </div>
                </div>
              </div>
              <div className={`text-xs text-right shrink-0 ${muted}`}>
                {formatMinutes(a.loggedMinutes)} logged
                {a.estimatedMinutes != null && <><br />of ~{formatMinutes(a.estimatedMinutes)}</>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
