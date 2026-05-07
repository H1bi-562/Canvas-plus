import { Calendar } from 'lucide-react';

interface Assignment {
  id: number;
  title: string;
  dueDate: string;
  priority: string;
  description: string;
}

interface DashboardProps {
  assignments: Assignment[];
  darkMode: boolean;
  onSelectAssignment: (id: number) => void;
  getPriorityColor: (priority: string) => string;
}

export default function Dashboard({ assignments, darkMode, onSelectAssignment, getPriorityColor }: DashboardProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        {assignments.map((assignment) => (
          <div
            key={assignment.id}
            className={`rounded-lg shadow-sm p-3 w-80 mx-auto ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}
          >
            <h2 className={`text-lg font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {assignment.title}
            </h2>

            <div className="space-y-2 mb-3">
              <div className={`flex items-center text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <Calendar className="w-4 h-4 mr-2" />
                <span>Due: {assignment.dueDate}</span>
              </div>

              <div className="flex items-center">
                <span className={`text-sm mr-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Priority:</span>
                <span className={`text-sm px-2 py-1 rounded ${getPriorityColor(assignment.priority)}`}>
                  {assignment.priority}
                </span>
              </div>
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
