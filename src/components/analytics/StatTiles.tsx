// src/components/analytics/StatTiles.tsx
// KPI row: the headline numbers are tiles, not charts. Study time carries a
// daily sparkline (de-emphasis line, today's point in the accent).

import type { AnalyticsSummary } from '../../lib/analyticsApi';
import { formatMinutes, vizTheme, type VizTheme } from './vizTokens';

function Sparkline({ values, theme, label }: { values: number[]; theme: VizTheme; label: string }) {
  const width = 120;
  const height = 32;
  if (values.length < 2) return null;
  // Inset by the end dot's radius + ring so it is never clipped at the edge.
  const pad = 6;
  const max = Math.max(...values, 1);
  const step = (width - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => [pad + i * step, height - pad - (v / max) * (height - pad * 2)] as const);
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke={theme.inkMuted}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={4} fill={theme.accent} stroke={theme.surface} strokeWidth={2} />
    </svg>
  );
}

interface TileProps {
  label: string;
  value: string;
  note?: string;
  darkMode: boolean;
  children?: React.ReactNode;
}

function Tile({ label, value, note, darkMode, children }: TileProps) {
  return (
    <div className={`rounded-lg shadow-sm p-4 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
      <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{label}</div>
      {/* Wraps the sparkline below the value on narrow tiles instead of breaking "8h 15m". */}
      <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1 mt-1">
        <div className={`text-2xl font-semibold whitespace-nowrap ${darkMode ? 'text-white' : 'text-gray-900'}`}>{value}</div>
        {children}
      </div>
      {note && <div className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{note}</div>}
    </div>
  );
}

export default function StatTiles({ summary, darkMode }: { summary: AnalyticsSummary; darkMode: boolean }) {
  const theme = vizTheme(darkMode);
  const { totals, streak, range } = summary;
  const focus = totals.focusRatio;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile
        label="Study time"
        value={formatMinutes(totals.studyMinutes)}
        note={`${totals.activeDays} of ${range.days} days`}
        darkMode={darkMode}
      >
        <Sparkline
          values={summary.daily.map((d) => d.minutes)}
          theme={theme}
          label={`Daily study minutes over the last ${range.days} days`}
        />
      </Tile>
      <Tile
        label="Focus"
        value={focus == null ? '—' : `${Math.round(focus * 100)}%`}
        note="Active time vs. paused"
        darkMode={darkMode}
      />
      <Tile
        label="Sessions"
        value={String(totals.sessions)}
        note={totals.sessions ? `${formatMinutes(totals.avgSessionMinutes)} on average` : 'None in this range'}
        darkMode={darkMode}
      />
      <Tile
        label="Study streak"
        value={`${streak.current} ${streak.current === 1 ? 'day' : 'days'}`}
        note={`Longest: ${streak.longest} ${streak.longest === 1 ? 'day' : 'days'}`}
        darkMode={darkMode}
      />
    </div>
  );
}
