// src/components/analytics/TimePerCourseChart.tsx
// Where study time goes, by course. Horizontal bars (long course names, close
// values compare better as lengths than as donut slices). One series, so one
// hue for every bar and no legend -- the title names what is plotted.

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsSummary } from '../../lib/analyticsApi';
import ChartCard from './ChartCard';
import VizTooltip from './VizTooltip';
import { formatMinutes, minuteTicks, shortCourse, vizTheme, SANS } from './vizTokens';

const BAR = 16;
const ROW = 36;

export default function TimePerCourseChart({ summary, darkMode }: { summary: AnalyticsSummary; darkMode: boolean }) {
  const theme = vizTheme(darkMode);
  const data = summary.timePerCourse.map((c) => ({
    name: shortCourse(c.courseCode, c.courseName),
    fullName: c.courseName,
    minutes: c.minutes,
    sessions: c.sessions,
  }));
  const total = data.reduce((n, d) => n + d.minutes, 0);
  const scale = minuteTicks(Math.max(0, ...data.map((d) => d.minutes)));

  return (
    <ChartCard
      title="Time per course"
      subtitle={total ? `${formatMinutes(total)} across ${data.length} ${data.length === 1 ? 'course' : 'courses'}` : undefined}
      darkMode={darkMode}
      empty={data.length ? null : 'Start a study session to see where your time goes.'}
      table={{
        columns: ['Course', 'Time', 'Sessions', 'Share'],
        rows: data.map((d) => [d.fullName, formatMinutes(d.minutes), d.sessions, `${Math.round((d.minutes / total) * 100)}%`]),
      }}
    >
      {/* Height includes the x-axis band so the card never scrolls internally. */}
      <div style={{ height: data.length * ROW + 32 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke={theme.grid} />
            <XAxis
              type="number"
              domain={[0, scale.max]}
              ticks={scale.ticks}
              tickFormatter={(v: number) => formatMinutes(v)}
              tick={{ fill: theme.inkMuted, fontSize: 12, fontFamily: SANS }}
              axisLine={{ stroke: theme.axis }}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={96}
              tick={{ fill: theme.inkSecondary, fontSize: 12, fontFamily: SANS }}
              axisLine={{ stroke: theme.axis }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: theme.grid, opacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <VizTooltip
                    theme={theme}
                    title={d.fullName}
                    rows={[{ label: `${d.sessions} ${d.sessions === 1 ? 'session' : 'sessions'}`, value: formatMinutes(d.minutes), color: theme.accent }]}
                  />
                );
              }}
            />
            <Bar dataKey="minutes" fill={theme.accent} barSize={BAR} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="minutes"
                position="right"
                formatter={(v: number) => formatMinutes(v)}
                style={{ fill: theme.inkSecondary, fontSize: 12, fontFamily: SANS }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
