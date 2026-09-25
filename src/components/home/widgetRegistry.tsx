// src/components/home/widgetRegistry.tsx
// UC22 – every widget the home screen can show.
//
// Ids and minimum sizes must match WIDGETS in services/dashboardLayout.js; the
// server rejects a layout that uses anything else. DEFAULT_LAYOUT mirrors the
// server's default and is only used if GET /api/layout fails, so the home
// screen still renders offline.

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import Dashboard from '../Dashboard';
import StudyTimer from '../StudyTimer';
import StatTiles from '../analytics/StatTiles';
import AtRiskList from '../analytics/AtRiskList';
import TimePerCourseChart from '../analytics/TimePerCourseChart';
import OnTimeRate from '../analytics/OnTimeRate';
import EstimateVsActualChart from '../analytics/EstimateVsActualChart';
import WorkloadChart from '../analytics/WorkloadChart';
import type { AnalyticsSummary } from '../../lib/analyticsApi';
import type { Assignment } from '../../lib/assignmentsApi';
import type { LayoutItem } from '../../lib/layoutApi';

/** Everything a widget may need; HomeView builds this once per render. */
export interface WidgetContext {
  darkMode: boolean;
  assignments: Assignment[];
  assignmentsLoading: boolean;
  assignmentsError: string | null;
  onSelectAssignment: (id: string) => void;
  getPriorityColor: (priority: string) => string;
  onOpenSettings: () => void;
  onStudyNow: () => void;
  onSessionEnd: () => void;
  summary: AnalyticsSummary | null;
  summaryError: string | null;
  onRetrySummary: () => void;
}

export interface WidgetSpec {
  title: string;
  /** One line for the widget library panel. */
  description: string;
  minW: number;
  minH: number;
  /** Size when added from the library. */
  defaultW: number;
  defaultH: number;
  /** Needs GET /api/analytics/summary; HomeView only fetches it if one is shown. */
  usesSummary: boolean;
  render: (ctx: WidgetContext) => ReactNode;
}

/** Loading / error placeholder for widgets that read the analytics summary. */
function withSummary(ctx: WidgetContext, render: (summary: AnalyticsSummary) => ReactNode) {
  if (ctx.summary) return render(ctx.summary);
  const muted = ctx.darkMode ? 'text-gray-300' : 'text-gray-600';
  return (
    <div className={`h-full rounded-lg shadow-sm p-5 flex items-center justify-center gap-2 text-sm ${muted} ${
      ctx.darkMode ? 'bg-[var(--cp-card)]' : 'bg-white'
    }`}>
      {ctx.summaryError ? (
        <>
          <span>{ctx.summaryError}</span>
          <button type="button" onClick={ctx.onRetrySummary} className="underline">Retry</button>
        </>
      ) : (
        <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
      )}
    </div>
  );
}

export const WIDGETS: Record<string, WidgetSpec> = {
  'upcoming-assignments': {
    title: 'Assignments',
    description: 'Your synced assignments with due dates and priority.',
    minW: 3, minH: 4, defaultW: 6, defaultH: 10, usesSummary: false,
    render: (ctx) => (
      <Dashboard
        embedded
        assignments={ctx.assignments}
        darkMode={ctx.darkMode}
        isLoading={ctx.assignmentsLoading && ctx.assignments.length === 0}
        error={ctx.assignmentsError}
        onOpenSettings={ctx.onOpenSettings}
        onSelectAssignment={ctx.onSelectAssignment}
        getPriorityColor={ctx.getPriorityColor}
      />
    ),
  },
  'study-timer': {
    title: 'Study Timer',
    description: 'Start, pause and end a study session.',
    minW: 3, minH: 5, defaultW: 5, defaultH: 6, usesSummary: false,
    render: (ctx) => <StudyTimer darkMode={ctx.darkMode} onSessionEnd={ctx.onSessionEnd} />,
  },
  'stat-tiles': {
    title: 'Study Stats',
    description: 'Study time, focus, sessions and streak for the last 30 days.',
    minW: 4, minH: 3, defaultW: 12, defaultH: 3, usesSummary: true,
    render: (ctx) => withSummary(ctx, (s) => <StatTiles summary={s} darkMode={ctx.darkMode} />),
  },
  'at-risk': {
    title: 'At Risk',
    description: 'Work due in the next 72 hours that you have barely started.',
    minW: 3, minH: 3, defaultW: 5, defaultH: 4, usesSummary: true,
    render: (ctx) => withSummary(ctx, (s) => (
      <AtRiskList summary={s} darkMode={ctx.darkMode} onStudyNow={ctx.onStudyNow} />
    )),
  },
  'time-per-course': {
    title: 'Time per Course',
    description: 'Where your study hours went, by course.',
    minW: 4, minH: 6, defaultW: 6, defaultH: 7, usesSummary: true,
    render: (ctx) => withSummary(ctx, (s) => <TimePerCourseChart summary={s} darkMode={ctx.darkMode} />),
  },
  'on-time-rate': {
    title: 'On-time Rate',
    description: 'Share of finished work handed in on time.',
    minW: 3, minH: 6, defaultW: 6, defaultH: 7, usesSummary: true,
    render: (ctx) => withSummary(ctx, (s) => <OnTimeRate summary={s} darkMode={ctx.darkMode} />),
  },
  'estimate-vs-actual': {
    title: 'Estimated vs. Actual',
    description: 'How your time estimates compare to real study time.',
    minW: 4, minH: 6, defaultW: 12, defaultH: 8, usesSummary: true,
    render: (ctx) => withSummary(ctx, (s) => <EstimateVsActualChart summary={s} darkMode={ctx.darkMode} />),
  },
  'weekly-workload': {
    title: 'Weekly Workload',
    description: 'Assignments due and hours studied, week by week.',
    minW: 4, minH: 6, defaultW: 12, defaultH: 9, usesSummary: true,
    render: (ctx) => withSummary(ctx, (s) => <WorkloadChart summary={s} darkMode={ctx.darkMode} />),
  },
};

export const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'stat-tiles',           x: 0, y: 0,  w: 12, h: 3 },
  { i: 'upcoming-assignments', x: 0, y: 3,  w: 7,  h: 10 },
  { i: 'study-timer',          x: 7, y: 3,  w: 5,  h: 6 },
  { i: 'at-risk',              x: 7, y: 9,  w: 5,  h: 4 },
  { i: 'time-per-course',      x: 0, y: 13, w: 6,  h: 7 },
  { i: 'on-time-rate',         x: 6, y: 13, w: 6,  h: 7 },
];
