import { Calendar } from 'lucide-react';
import { Skeleton } from '../app/components/ui/skeleton';
import { formatMinutes, type Assignment } from '../lib/assignmentsApi';
import CompletionBadge from './CompletionBadge';

interface DashboardProps {
  assignments: Assignment[];
  darkMode: boolean;
  isLoading?: boolean;
  onSelectAssignment: (id: string) => void;
  getPriorityColor: (priority: string) => string;
  /** Shown instead of the list when loading assignments failed. */
  error?: string | null;
  onOpenSettings?: () => void;
}

export default function Dashboard({
  assignments,
  darkMode,
  isLoading = false,
  onSelectAssignment,
  getPriorityColor,
  error = null,
  onOpenSettings,
}: DashboardProps) {
  const muted = darkMode ? 'text-gray-300' : 'text-gray-600';

  if (!isLoading && (error || assignments.length === 0)) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className={`rounded-lg shadow-sm p-6 max-w-md mx-auto text-center ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
          <h2 className={`text-lg font-medium mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {error ? 'Could not load assignments' : 'No assignments yet'}
          </h2>
          <p className={`text-sm mb-4 ${muted}`}>
            {error || 'Connect Canvas in Settings to sync your assignments.'}
          </p>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-5 rounded-lg transition-colors"
            >
              Go to Settings
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-6"
      aria-busy={isLoading}
      aria-label={isLoading ? 'Loading assignments' : 'Assignments'}
    >
      <div className="max-w-md mx-auto space-y-4">
        {isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className={`rounded-lg shadow-sm p-3 w-80 mx-auto ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}
              >
                <Skeleton className={`h-7 w-3/4 mb-3 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
                <div className="space-y-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className={`size-4 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
                    <Skeleton className={`h-4 w-36 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Priority:</span>
                    <Skeleton className={`h-6 w-16 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded opacity-60 cursor-not-allowed"
                >
                  View Details
                </button>
              </div>
            ))
          : assignments.map((assignment) => (
          <div
            key={assignment.id}
            className={`rounded-lg shadow-sm p-3 w-80 mx-auto ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {assignment.courseCode && (
                <span className={`text-xs font-medium ${muted}`}>{assignment.courseCode}</span>
              )}
              {assignment.isDemo && (
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                  darkMode ? 'bg-purple-900/40 text-purple-300' : 'bg-purple-50 text-purple-700'
                }`}>
                  Demo
                </span>
              )}
            </div>
            <h2 className={`text-lg font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {assignment.title}
            </h2>

            <div className="space-y-2 mb-3">
              <div className={`flex items-center text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <Calendar className="w-4 h-4 mr-2" />
                <span>Due: {assignment.dueLabel}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Priority:</span>
                <span className={`text-sm px-2 py-1 rounded ${getPriorityColor(assignment.priority)}`}>
                  {assignment.priority}
                </span>
                <CompletionBadge status={assignment.completionStatus} darkMode={darkMode} />
              </div>

              {(assignment.loggedMinutes > 0 || assignment.estimatedMinutes != null) && (
                <p className={`text-xs ${muted}`}>
                  {formatMinutes(assignment.loggedMinutes)} studied
                  {assignment.estimatedMinutes != null && <> · ~{formatMinutes(assignment.estimatedMinutes)} estimated</>}
                </p>
              )}
            </div>

            <button
              onClick={() => onSelectAssignment(assignment.id)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
            >
              View Details
            </button>
          </div>
            ))}
      </div>
    </div>
  );
}
