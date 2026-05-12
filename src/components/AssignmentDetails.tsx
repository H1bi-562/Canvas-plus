import { Calendar, X } from 'lucide-react';

interface Assignment {
  id: number;
  title: string;
  dueDate: string;
  priority: string;
  description: string;
}

interface AssignmentDetailsProps {
  assignment: Assignment | undefined;
  darkMode: boolean;
  onClose: () => void;
  getPriorityColor: (priority: string) => string;
}

export default function AssignmentDetails({ assignment, darkMode, onClose, getPriorityColor }: AssignmentDetailsProps) {
  if (!assignment) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
        {/* Panel Header */}
        <div className={`sticky top-0 border-b px-6 py-4 flex items-center justify-between ${
          darkMode ? 'bg-[#3a3a3a] border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {assignment.title}
          </h2>
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
                <span>Due: {assignment.dueDate}</span>
              </div>
              <span className={`text-sm px-2 py-1 rounded ${getPriorityColor(assignment.priority)}`}>
                {assignment.priority} Priority
              </span>
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
