import { Home, Shield, Calendar, User } from 'lucide-react';

type ViewType = 'assignments' | 'calendar' | 'focus' | 'profile' | 'auth';

interface BottomNavProps {
  currentView: ViewType;
  darkMode: boolean;
  onViewChange: (view: ViewType) => void;
}

export default function BottomNav({ currentView, darkMode, onViewChange }: BottomNavProps) {
  if (currentView === 'auth') return null;

  return (
    <div className={`border-t px-6 py-3 shadow-sm ${darkMode ? 'bg-[#3a3a3a] border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="max-w-md mx-auto flex justify-around">
        <button
          onClick={() => onViewChange('assignments')}
          className={`flex flex-col items-center gap-1 ${
            currentView === 'assignments' ? 'text-blue-600' : (darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')
          }`}
        >
          <Home className="w-6 h-6" />
          <span className="text-xs">Home</span>
        </button>
        <button
          onClick={() => onViewChange('focus')}
          className={`flex flex-col items-center gap-1 ${
            currentView === 'focus' ? 'text-blue-600' : (darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')
          }`}
        >
          <Shield className="w-6 h-6" />
          <span className="text-xs">Focus</span>
        </button>
        <button
          onClick={() => onViewChange('calendar')}
          className={`flex flex-col items-center gap-1 ${
            currentView === 'calendar' ? 'text-blue-600' : (darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')
          }`}
        >
          <Calendar className="w-6 h-6" />
          <span className="text-xs">Calendar</span>
        </button>
        <button
          onClick={() => onViewChange('profile')}
          className={`flex flex-col items-center gap-1 ${
            currentView === 'profile' ? 'text-blue-600' : (darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')
          }`}
        >
          <User className="w-6 h-6" />
          <span className="text-xs">Profile</span>
        </button>
      </div>
    </div>
  );
}
