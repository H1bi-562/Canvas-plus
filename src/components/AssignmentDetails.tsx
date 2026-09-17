import { useState } from 'react';
import { Calendar, CheckCircle2, Loader2, X } from 'lucide-react';

import {
  Assignment,
  FINISHED_STATUSES,
  formatMinutes,
  saveCompleted,
} from '../lib/assignmentsApi';
import { ApiError } from '../lib/apiClient';
import CompletionBadge from './CompletionBadge';
import EstimateEditor from './EstimateEditor';


interface AssignmentDetailsProps {
  assignment: Assignment | undefined;
  darkMode: boolean;
  onClose: () => void;
  getPriorityColor: (priority: string) => string;
  /** Reload assignments after an estimate or completion change. */
  onChanged: () => void;
}

export default function AssignmentDetails({
  assignment,
  darkMode,
  onClose,
  getPriorityColor,
  onChanged,
}: AssignmentDetailsProps) {
  const [savingDone, setSavingDone] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);

  if (!assignment) return null;

  const muted = darkMode ? 'text-gray-300' : 'text-gray-600';
  // Canvas already recorded a submission: "Mark done" would add nothing.
  const submittedInCanvas = assignment.completionStatus === 'submitted' ||
    (assignment.completionStatus === 'late' && Boolean(assignment.submittedAt)) ||
    assignment.completionStatus === 'excused';
  const markedDone = Boolean(assignment.completedAt);

  const estimate = assignment.estimatedMinutes;
  const logged = assignment.loggedMinutes;
  const pct = estimate ? Math.min(100, Math.round((logged / estimate) * 100)) : 0;
  const over = estimate != null && logged > estimate;

  async function toggleDone() {
    if (!assignment || savingDone) return;
    setSavingDone(true);
    setDoneError(null);
    try {
      await saveCompleted(assignment.id, !markedDone);
      onChanged();
    } catch (err) {
      setDoneError(err instanceof ApiError ? err.message : 'Could not update this assignment.');
    } finally {
      setSavingDone(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
        {/* Panel Header */}
        <div className={`sticky top-0 border-b px-6 py-4 flex items-center justify-between ${
          darkMode ? 'bg-[#3a3a3a] border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div>
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {assignment.title}
            </h2>
            {(assignment.courseCode || assignment.points != null) && (
              <p className={`text-sm mt-1 ${muted}`}>
                {[assignment.courseCode, assignment.points != null ? `${assignment.points} pts` : null]
                  .filter(Boolean).join(' · ')}
                {assignment.isDemo && ' · Demo'}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Panel Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Assignment Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className={`flex items-center text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <Calendar className="w-4 h-4 mr-2" />
                <span>Due: {assignment.dueLabel}</span>
              </div>
              <span className={`text-sm px-2 py-1 rounded ${getPriorityColor(assignment.priority)}`}>
                {assignment.priority} Priority
              </span>
              <CompletionBadge status={assignment.completionStatus} darkMode={darkMode} />
            </div>

            {/* Progress: estimate vs. time actually logged (UC21) */}
            <div className={`rounded-lg p-4 space-y-4 ${darkMode ? 'bg-[#2d2d2d]' : 'bg-gray-50'}`}>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Study time</h3>
                  <span className={`text-sm ${muted}`}>
                    {formatMinutes(logged)} logged
                    {estimate != null && <> of ~{formatMinutes(estimate)}</>}
                  </span>
                </div>
                {estimate != null && (
                  <div
                    className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`h-full rounded-full ${over ? 'bg-amber-500' : 'bg-blue-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                {over && (
                  <p className={`text-xs mt-1.5 ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                    {formatMinutes(logged - estimate!)} over your estimate
                  </p>
                )}
              </div>

              <EstimateEditor
                key={assignment.id}
                assignmentID={assignment.id}
                estimatedMinutes={estimate}
                darkMode={darkMode}
                onSaved={onChanged}
                label={estimate == null ? 'About how long will this take?' : 'Your estimate'}
              />

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className={`text-sm ${muted}`}>
                  {submittedInCanvas
                    ? 'Canvas has recorded this as handed in.'
                    : markedDone
                      ? 'You marked this done.'
                      : FINISHED_STATUSES.has(assignment.completionStatus)
                        ? 'Finished.'
                        : 'Handed this in outside Canvas? Mark it done.'}
                </p>
                {!submittedInCanvas && (
                  <button
                    type="button"
                    onClick={toggleDone}
                    disabled={savingDone}
                    className={`shrink-0 inline-flex items-center gap-2 text-sm py-2 px-4 rounded-lg transition-colors disabled:opacity-50 ${
                      markedDone
                        ? (darkMode ? 'border border-gray-600 text-gray-200 hover:bg-[#3a3a3a]' : 'border border-gray-300 text-gray-700 hover:bg-white')
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {savingDone ? <Loader2 className="w-4 h-4 animate-spin" /> : !markedDone && <CheckCircle2 className="w-4 h-4" />}
                    {markedDone ? 'Mark not done' : 'Mark done'}
                  </button>
                )}
              </div>
              {doneError && <p role="alert" className="text-sm text-red-600">{doneError}</p>}
            </div>

            {/* Description */}
            <div>
              <h3 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Description</h3>
              <p className={`leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {assignment.description}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={`space-y-3 pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <button className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span>AI Summary</span>
            </button>

            <button className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span>Break into Tasks</span>
            </button>

            <button className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span>Grade Impact</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
