// src/components/analytics/ChartCard.tsx
// Container for one analytics chart: title, one-line subtitle, empty state, and
// the table-view toggle every chart must have (values never gated on hover or
// on telling colours apart).

import { ReactNode, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';

export interface TableSpec {
  columns: string[];
  rows: (string | number)[][];
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  darkMode: boolean;
  /** When set, the chart body is replaced by this message. */
  empty?: string | null;
  table?: TableSpec;
  children: ReactNode;
  className?: string;
}

export default function ChartCard({ title, subtitle, darkMode, empty, table, children, className = '' }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  const muted = darkMode ? 'text-gray-300' : 'text-gray-600';
  const canToggle = Boolean(table) && !empty;

  return (
    <figure className={`rounded-lg shadow-sm p-5 m-0 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'} ${className}`}>
      <figcaption className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
          {subtitle && <p className={`text-sm mt-0.5 ${muted}`}>{subtitle}</p>}
        </div>
        {canToggle && (
          <button
            type="button"
            onClick={() => setShowTable(!showTable)}
            className={`shrink-0 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
              darkMode ? 'border-gray-600 text-gray-200 hover:bg-[#2d2d2d]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            aria-pressed={showTable}
          >
            {showTable ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </figcaption>

      {empty ? (
        <p className={`text-sm py-8 text-center ${muted}`}>{empty}</p>
      ) : showTable && table ? (
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
            <thead>
              <tr className={`border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                {table.columns.map((c, i) => (
                  <th key={c} className={`py-2 pr-4 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className={`border-b last:border-0 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                  {row.map((cell, i) => (
                    <td key={i} className={`py-2 pr-4 ${i === 0 ? 'text-left' : 'text-right tabular-nums'}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}
