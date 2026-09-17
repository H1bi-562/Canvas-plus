import { Skeleton } from '../app/components/ui/skeleton';

import type { Assignment as SharedAssignment } from '../lib/assignmentsApi';

type Assignment = Pick<SharedAssignment, 'id' | 'title' | 'dueDate' | 'priority'>;


interface CalendarViewProps {
  darkMode: boolean;
  assignments: Assignment[];
  isLoading?: boolean;
  onSelectAssignment: (id: string) => void;
}

export default function CalendarView({
  darkMode,
  assignments,
  isLoading = false,
  onSelectAssignment,
}: CalendarViewProps) {
  // The month being shown. Was hardcoded to April 2026; now follows today so
  // synced and demo assignments land on the grid.
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based
  const monthLabel = today.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const generateCalendar = () => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
    const weeks = [];
    let currentWeek = new Array(firstDayOfWeek).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const calendarWeeks = generateCalendar();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Get assignments for a specific date
  const getAssignmentsForDate = (day: number) => {
    if (!day) return [];
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return assignments.filter(a => a.dueDate === dateString);
  };

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-6"
      aria-busy={isLoading}
      aria-label={isLoading ? 'Loading calendar assignments' : 'Calendar'}
    >
      <div className="max-w-6xl mx-auto">
        <h2 className={`text-xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{monthLabel}</h2>

        {/* Calendar Grid */}
        <div className={`rounded-lg shadow-sm overflow-hidden mb-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
          {/* Week day headers */}
          <div className={`grid grid-cols-7 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            {weekDays.map(day => (
              <div key={day} className={`p-3 text-center text-sm font-medium ${darkMode ? 'text-gray-300 bg-[#404040]' : 'text-gray-700 bg-gray-50'}`}>
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7">
            {calendarWeeks.flat().map((day, index) => {
              const dayAssignments = day ? getAssignmentsForDate(day) : [];
              const isToday = day === 3; // April 3, 2026 is today

              return (
                <div
                  key={index}
                  className={`min-h-28 p-2 border-r border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} ${
                    day ? (darkMode ? 'bg-[#3a3a3a]' : 'bg-white') : (darkMode ? 'bg-[#2d2d2d]' : 'bg-gray-50')
                  } ${isToday ? (darkMode ? 'bg-blue-900/30' : 'bg-blue-50') : ''}`}
                >
                  {day && (
                    <>
                      <div className={`text-sm font-medium mb-2 ${
                        isToday ? 'text-blue-600' : (darkMode ? 'text-white' : 'text-gray-900')
                      }`}>
                        {day}
                      </div>

                      {/* Study blocks */}
                      <div className="space-y-1">
                        {isLoading && [5, 6, 8, 10].includes(day) ? (
                          <Skeleton className={`h-5 w-full ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
                        ) : (
                          dayAssignments.map(assignment => (
                            <button
                              type="button"
                              key={assignment.id}
                              onClick={() => onSelectAssignment(assignment.id)}
                              className={`block w-full text-left text-xs p-1 rounded cursor-pointer ${
                                assignment.priority === 'High'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : assignment.priority === 'Medium'
                                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              {assignment.title}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Smart Scheduler Button */}
        <div className="flex justify-center">
          <button className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white py-4 px-12 rounded-lg shadow-lg transition-all transform hover:scale-105 text-lg font-semibold">
            Run Smart Scheduler
          </button>
        </div>
      </div>
    </div>
  );
}
