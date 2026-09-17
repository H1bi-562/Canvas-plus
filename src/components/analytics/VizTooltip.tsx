// src/components/analytics/VizTooltip.tsx
// Shared Recharts tooltip: the value leads (strong), the series name follows,
// each row keyed by a short stroke of the series colour.

import type { VizTheme } from './vizTokens';

export interface TooltipRow {
  label: string;
  value: string;
  color: string;
}

export default function VizTooltip({ title, rows, theme }: { title: string; rows: TooltipRow[]; theme: VizTheme }) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.grid}`,
        borderRadius: 8,
        padding: '8px 10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        minWidth: 140,
      }}
    >
      <div style={{ color: theme.inkSecondary, fontSize: 12, marginBottom: 4 }}>{title}</div>
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, lineHeight: '20px' }}>
          <span style={{ width: 12, height: 2, background: row.color, borderRadius: 1, flexShrink: 0 }} />
          <strong style={{ color: theme.inkPrimary, fontWeight: 600 }}>{row.value}</strong>
          <span style={{ color: theme.inkSecondary }}>{row.label}</span>
        </div>
      ))}
    </div>
  );
}
