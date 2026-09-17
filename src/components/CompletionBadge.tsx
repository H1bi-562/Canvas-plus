// src/components/CompletionBadge.tsx
// Small status pill for an assignment's completion (UC21). Pending shows nothing:
// "not done yet, not due yet" is the default and does not need a label.

import type { CompletionStatus } from '../lib/assignmentsApi';

const LABELS: Record<CompletionStatus, string> = {
  pending: '',
  overdue: 'Overdue',
  submitted: 'Submitted',
  done: 'Done',
  late: 'Late',
  missing: 'Missing',
  excused: 'Excused',
};

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const TONE: Record<CompletionStatus, Tone> = {
  pending: 'neutral',
  overdue: 'bad',
  submitted: 'good',
  done: 'good',
  late: 'warn',
  missing: 'bad',
  excused: 'neutral',
};

const STYLES: Record<Tone, [light: string, dark: string]> = {
  good:    ['bg-green-50 text-green-700',   'bg-green-900/40 text-green-300'],
  warn:    ['bg-amber-50 text-amber-700',   'bg-amber-900/40 text-amber-300'],
  bad:     ['bg-red-50 text-red-700',       'bg-red-900/40 text-red-300'],
  neutral: ['bg-gray-100 text-gray-600',    'bg-gray-700 text-gray-300'],
};

export default function CompletionBadge({ status, darkMode }: { status: CompletionStatus; darkMode: boolean }) {
  if (status === 'pending') return null;
  const [light, dark] = STYLES[TONE[status]];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${darkMode ? dark : light}`}>
      {LABELS[status]}
    </span>
  );
}
