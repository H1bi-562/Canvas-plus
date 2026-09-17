// src/components/EstimateEditor.tsx
// "About how long will this take?" -- the student's time estimate for an
// assignment (UC21 estimated vs. actual). Quick picks cover most answers; a
// custom field handles the rest.

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatMinutes, saveEstimate } from '../lib/assignmentsApi';
import { ApiError } from '../lib/apiClient';

const PRESETS = [15, 30, 60, 120, 240];

interface EstimateEditorProps {
  assignmentID: string;
  estimatedMinutes: number | null;
  darkMode: boolean;
  /** Called after a successful save so the parent can reload assignments. */
  onSaved: () => void;
  label?: string;
}

export default function EstimateEditor({
  assignmentID,
  estimatedMinutes,
  darkMode,
  onSaved,
  label = 'About how long will this take?',
}: EstimateEditorProps) {
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(minutes: number | null) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveEstimate(assignmentID, minutes);
      setCustom('');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the estimate.');
    } finally {
      setSaving(false);
    }
  }

  const customMinutes = Number(custom);
  const customValid = custom.trim() !== '' && Number.isInteger(customMinutes) &&
    customMinutes >= 1 && customMinutes <= 6000;

  const muted = darkMode ? 'text-gray-300' : 'text-gray-600';
  const chip = (active: boolean) =>
    `text-sm px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
      active
        ? 'bg-blue-600 border-blue-600 text-white'
        : darkMode
          ? 'border-gray-600 text-gray-200 hover:bg-[#2d2d2d]'
          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
    }`;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{label}</span>
        {saving && <Loader2 className={`w-4 h-4 animate-spin ${muted}`} aria-label="Saving estimate" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={saving}
            onClick={() => save(minutes)}
            className={chip(estimatedMinutes === minutes)}
            aria-pressed={estimatedMinutes === minutes}
          >
            {formatMinutes(minutes)}
          </button>
        ))}

        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={6000}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && customValid) save(customMinutes); }}
            placeholder="min"
            aria-label="Custom estimate in minutes"
            className={`w-20 text-sm px-2 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              darkMode ? 'bg-[#2d2d2d] border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
            }`}
          />
          <button
            type="button"
            disabled={!customValid || saving}
            onClick={() => save(customMinutes)}
            className={chip(false)}
          >
            Set
          </button>
        </div>

        {estimatedMinutes != null && !PRESETS.includes(estimatedMinutes) && (
          <span className={`text-sm ${muted}`}>Current: {formatMinutes(estimatedMinutes)}</span>
        )}
        {estimatedMinutes != null && (
          <button
            type="button"
            disabled={saving}
            onClick={() => save(null)}
            className={`text-sm underline ${muted} disabled:opacity-50`}
          >
            Clear
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
