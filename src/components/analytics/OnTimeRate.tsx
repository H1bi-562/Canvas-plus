// src/components/analytics/OnTimeRate.tsx
// On-time completion is a single ratio against a limit, so it is a meter, not a
// two-slice pie. The breakdown uses the reserved status colours, always with an
// icon and a label -- never colour alone.

import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { AnalyticsSummary } from '../../lib/analyticsApi';
import ChartCard from './ChartCard';
import { vizTheme } from './vizTokens';

export default function OnTimeRate({ summary, darkMode }: { summary: AnalyticsSummary; darkMode: boolean }) {
  const theme = vizTheme(darkMode);
  const c = summary.completion;
  const rate = c.onTimeRate;
  const pct = rate == null ? 0 : Math.round(rate * 100);
  const notDone = c.missing + c.overdue;

  // The fill carries severity; the label states it in words.
  const severity = rate == null
    ? null
    : rate >= 0.8
      ? { color: theme.accent, text: 'On track' }
      : rate >= 0.5
        ? { color: theme.status.warning, text: 'Slipping' }
        : { color: theme.status.critical, text: 'Needs attention' };

  const rows = [
    { key: 'onTime', label: 'On time', count: c.onTime, color: theme.status.good, Icon: CheckCircle2 },
    { key: 'late', label: 'Late', count: c.late, color: theme.status.warning, Icon: Clock },
    { key: 'missing', label: 'Missing or overdue', count: notDone, color: theme.status.critical, Icon: XCircle },
  ];

  const ink = darkMode ? 'text-white' : 'text-gray-900';
  const muted = darkMode ? 'text-gray-300' : 'text-gray-600';

  return (
    <ChartCard
      title="On-time completion"
      subtitle={`Assignments due ${summary.range.from === summary.range.to ? 'on this day' : 'in this range'}`}
      darkMode={darkMode}
      empty={c.total ? null : 'No assignments were due in this range.'}
      table={{
        columns: ['Outcome', 'Assignments'],
        rows: [
          ['On time', c.onTime],
          ['Late', c.late],
          ['Missing', c.missing],
          ['Overdue', c.overdue],
          ['Excused', c.excused],
          ['Not due yet', c.pending],
        ],
      }}
    >
      {rate == null ? (
        <p className={`text-sm py-4 ${muted}`}>
          Nothing due in this range has been decided yet ({c.pending} still upcoming).
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span className={`text-5xl font-semibold ${ink}`}>{pct}%</span>
            <span className={`text-sm ${muted}`}>{severity?.text}</span>
          </div>
          <div
            className="mt-3 h-2 rounded-full overflow-hidden"
            style={{ background: theme.track }}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="On-time completion rate"
          >
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: severity?.color }} />
          </div>
        </>
      )}

      <ul className="mt-5 space-y-2">
        {rows.map(({ key, label, count, color, Icon }) => (
          <li key={key} className="flex items-center justify-between text-sm">
            <span className={`flex items-center gap-2 ${muted}`}>
              <Icon className="w-4 h-4" style={{ color }} aria-hidden="true" />
              {label}
            </span>
            <span className={`font-medium tabular-nums ${ink}`}>{count}</span>
          </li>
        ))}
      </ul>
      {(c.pending > 0 || c.excused > 0) && (
        <p className={`text-xs mt-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Not counted: {c.pending} not due yet{c.excused ? `, ${c.excused} excused` : ''}.
        </p>
      )}
    </ChartCard>
  );
}
