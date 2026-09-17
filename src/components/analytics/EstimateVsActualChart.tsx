// src/components/analytics/EstimateVsActualChart.tsx
// Estimated vs. actual time per assignment: two bars per row in one hue, two
// steps (estimate lighter, actual stronger). The variance is direct-labelled at
// the end of each actual bar -- one label per row, the number the student wants.

import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsSummary } from '../../lib/analyticsApi';
import ChartCard from './ChartCard';
import VizTooltip from './VizTooltip';
import { formatMinutes, minuteTicks, shortCourse, vizTheme, SANS } from './vizTokens';

const BAR = 10;
const ROW = 44;

function truncate(text: string, max = 20) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export default function EstimateVsActualChart({ summary, darkMode }: { summary: AnalyticsSummary; darkMode: boolean }) {
  const theme = vizTheme(darkMode);
  const data = summary.estVsActual.map((r) => ({
    name: truncate(r.title),
    title: r.title,
    course: shortCourse(r.courseCode, ''),
    estimated: r.estimatedMinutes,
    actual: r.actualMinutes,
    variance: r.variancePct,
    finished: r.finished,
  }));

  const scale = minuteTicks(Math.max(0, ...data.flatMap((d) => [d.estimated, d.actual])));

  const ratio = summary.estimateRatio;
  const subtitle = ratio == null
    ? 'Finish an estimated assignment to see how your estimates hold up'
    : ratio >= 1
      ? `Finished work took ${ratio.toFixed(2)}× your estimates`
      : `Finished work took ${Math.round(ratio * 100)}% of your estimates`;

  const signed = (v: number) => `${v > 0 ? '+' : ''}${v}%`;

  return (
    <ChartCard
      title="Estimated vs. actual"
      subtitle={subtitle}
      darkMode={darkMode}
      empty={data.length ? null : 'Add an estimate to an assignment, then study it with the timer.'}
      table={{
        columns: ['Assignment', 'Estimated', 'Actual', 'Difference', 'Status'],
        rows: data.map((d) => [
          `${d.course ? `${d.course} · ` : ''}${d.title}`,
          formatMinutes(d.estimated),
          formatMinutes(d.actual),
          signed(d.variance),
          d.finished ? 'Finished' : 'In progress',
        ]),
      }}
    >
      <div style={{ height: data.length * ROW + 64 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" barGap={2} margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke={theme.grid} />
            <XAxis
              type="number"
              domain={[0, scale.max]}
              ticks={scale.ticks}
              tickFormatter={(v: number) => formatMinutes(v)}
              tick={{ fill: theme.inkMuted, fontSize: 12, fontFamily: SANS }}
              axisLine={{ stroke: theme.axis }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={168}
              // Rendered as one <text> so Recharts cannot wrap a truncated name.
              tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                <text x={x} y={y} dy={4} textAnchor="end" fill={theme.inkSecondary} fontSize={12} fontFamily={SANS}>
                  {payload.value}
                </text>
              )}
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
                    title={`${d.title}${d.finished ? '' : ' (in progress)'}`}
                    rows={[
                      { label: 'estimated', value: formatMinutes(d.estimated), color: theme.estimate },
                      { label: `actual (${signed(d.variance)})`, value: formatMinutes(d.actual), color: theme.actual },
                    ]}
                  />
                );
              }}
            />
            <Legend
              verticalAlign="top"
              align="left"
              height={28}
              iconType="rect"
              iconSize={10}
              formatter={(value: string) => <span style={{ color: theme.inkSecondary, fontSize: 12, fontFamily: SANS }}>{value}</span>}
            />
            <Bar name="Estimated" dataKey="estimated" fill={theme.estimate} barSize={BAR} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            <Bar name="Actual" dataKey="actual" fill={theme.actual} barSize={BAR} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="variance"
                position="right"
                formatter={(v: number) => signed(v)}
                style={{ fill: theme.inkSecondary, fontSize: 12, fontFamily: SANS }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
