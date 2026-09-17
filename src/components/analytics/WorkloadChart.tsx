// src/components/analytics/WorkloadChart.tsx
// Workload distribution per week, as two small multiples on the same week axis:
//   1. assignments due, stacked by course (categorical, with a legend)
//   2. hours studied (one series, accent hue)
// Two measures with different units never share one plot: no dual y-axes.

import {
  Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { AnalyticsSummary } from '../../lib/analyticsApi';
import ChartCard from './ChartCard';
import VizTooltip from './VizTooltip';
import { courseColors, formatMinutes, minuteTicks, shortCourse, vizTheme, SANS } from './vizTokens';

const BAR = 24;

function weekLabel(weekStart: string) {
  const d = new Date(`${weekStart}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function WorkloadChart({ summary, darkMode }: { summary: AnalyticsSummary; darkMode: boolean }) {
  const theme = vizTheme(darkMode);
  const courses = summary.courses.filter((c) => summary.workload.some((w) => w.dueByCourse[c.courseCode || c.courseName]));
  // Colours come from the full course list so a course's colour never changes
  // with the range.
  const colors = courseColors(summary.courses, theme);
  const keys = courses.map((c) => c.courseCode || c.courseName);

  const data = summary.workload.map((w) => {
    const row: Record<string, string | number> = {
      week: weekLabel(w.weekStart),
      weekStart: w.weekStart,
      studyMinutes: w.studyMinutes,
      dueCount: w.dueCount,
      points: w.points,
    };
    keys.forEach((k) => { row[k] = w.dueByCourse[k] || 0; });
    // Only the top non-empty segment gets rounded corners.
    row.topKey = [...keys].reverse().find((k) => (w.dueByCourse[k] || 0) > 0) || '';
    return row;
  });

  const hasAnything = summary.workload.some((w) => w.dueCount > 0 || w.studyMinutes > 0);
  const studyScale = minuteTicks(Math.max(0, ...summary.workload.map((w) => w.studyMinutes)), 3);
  const maxDue = Math.max(1, ...summary.workload.map((w) => w.dueCount));
  const axisTick = { fill: theme.inkMuted, fontSize: 12, fontFamily: SANS };

  return (
    <ChartCard
      title="Weekly workload"
      subtitle="What was due each week, and how much you studied"
      darkMode={darkMode}
      empty={hasAnything ? null : 'No assignments due or study sessions in this range.'}
      table={{
        columns: ['Week of', 'Due', 'Points', 'Studied', ...keys.map((k) => shortCourse(k, k))],
        rows: summary.workload.map((w) => [
          weekLabel(w.weekStart), w.dueCount, w.points, formatMinutes(w.studyMinutes),
          ...keys.map((k) => w.dueByCourse[k] || 0),
        ]),
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-2">
        <p className={`text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Assignments due</p>
        {/* Legend as HTML: swatch carries the colour, text stays in text ink. */}
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Courses">
          {keys.map((k) => (
            <li key={k} className="flex items-center gap-1.5 text-xs" style={{ color: theme.inkSecondary }}>
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colors.get(k) }} aria-hidden="true" />
              {shortCourse(k, k)}
            </li>
          ))}
        </ul>
      </div>
      <div style={{ height: 196 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis dataKey="week" tick={axisTick} axisLine={{ stroke: theme.axis }} tickLine={false} />
            <YAxis allowDecimals={false} domain={[0, maxDue]} width={40} tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: theme.grid, opacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, string | number>;
                return (
                  <VizTooltip
                    theme={theme}
                    title={`Week of ${row.week} · ${row.dueCount} due`}
                    rows={keys
                      .filter((k) => Number(row[k]) > 0)
                      .map((k) => ({ label: shortCourse(k, k), value: String(row[k]), color: colors.get(k)! }))}
                  />
                );
              }}
            />
            {keys.map((k) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="due"
                fill={colors.get(k)}
                barSize={BAR}
                isAnimationActive={false}
                // 2px surface-coloured edge = the gap between stacked segments.
                shape={(props: any) => (
                  <Rectangle
                    {...props}
                    stroke={theme.surface}
                    strokeWidth={2}
                    radius={props.payload.topKey === k ? [4, 4, 0, 0] : 0}
                  />
                )}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className={`text-xs font-medium mt-4 mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Hours studied</p>
      <div style={{ height: 132 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis dataKey="week" tick={axisTick} axisLine={{ stroke: theme.axis }} tickLine={false} />
            <YAxis
              width={40}
              domain={[0, studyScale.max]}
              ticks={studyScale.ticks}
              tickFormatter={(v: number) => formatMinutes(v)}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: theme.grid, opacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, string | number>;
                return (
                  <VizTooltip
                    theme={theme}
                    title={`Week of ${row.week}`}
                    rows={[{ label: 'studied', value: formatMinutes(Number(row.studyMinutes)), color: theme.accent }]}
                  />
                );
              }}
            />
            <Bar dataKey="studyMinutes" fill={theme.accent} barSize={BAR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
