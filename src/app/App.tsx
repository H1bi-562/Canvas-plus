import { useState } from 'react';
import Dashboard from '../components/Dashboard';
import LoginPage from '../components/LoginPage';
import AssignmentDetails from '../components/AssignmentDetails';
import CalendarView from '../components/CalendarView';
import FocusMode from '../components/FocusMode';
import Settings from '../components/Settings';
import BottomNav from '../components/BottomNav';

type ViewType = 'assignments' | 'calendar' | 'focus' | 'profile' | 'auth';

export default function App() {
  const [selectedAssignment, setSelectedAssignment] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('auth');  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [blockedSites, setBlockedSites] = useState([
    'youtube.com',
    'discord.com',
    'twitter.com',
    'reddit.com'
  ]);

  // Profile/Settings state
  const [canvasApiKey, setCanvasApiKey] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [showCanvasKey, setShowCanvasKey] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [signedInUser, setSignedInUser] = useState<string | null>(null);
  
 

  const assignments = [
    {
      id: 1,
      title: 'Mathematics Homework',
      dueDate: '2026-04-05',
      priority: 'High',
      description: 'Complete chapters 5-7 exercises on quadratic equations and graphing functions. Show all work and include graphs for problems 15-20.'
    },
    {
      id: 2,
      title: 'History Essay',
      dueDate: '2026-04-08',
      priority: 'Medium',
      description: 'Write a 5-page essay analyzing the causes and effects of the Industrial Revolution. Include at least 3 primary sources and 5 secondary sources.'
    },
    {
      id: 3,
      title: 'Science Lab Report',
      dueDate: '2026-04-10',
      priority: 'Low',
      description: 'Document the results of the chemistry experiment on acid-base reactions. Include hypothesis, methodology, observations, and conclusions.'
    },
    {
      id: 4,
      title: 'English Reading',
      dueDate: '2026-04-06',
      priority: 'High',
      description: 'Read chapters 8-12 of "To Kill a Mockingbird" and prepare answers to the discussion questions provided in class.'
    }
  ];

  const selectedAssignmentData = assignments.find(a => a.id === selectedAssignment);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High':
        return 'text-red-600 bg-red-50';
      case 'Medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'Low':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className={`size-full flex flex-col ${darkMode ? 'bg-[#2d2d2d]' : 'bg-gray-50'}`}>
      {/* Top Bar */}
      <div className={`shadow-sm px-6 py-4 flex items-center justify-between ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
        <h1 className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>CanvasPlus</h1>
        {currentView !== 'auth' && (
        <div className="flex items-center gap-4">
      <span className={`${darkMode ? 'text-white' : 'text-gray-700'} font-medium`}>
        {signedInUser ? `Welcome, ${signedInUser}` : 'Welcome'}
        </span>

    <button
      onClick={() => {
        setSignedInUser(null);
        setCurrentView('auth');
      }}
      className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg transition-colors"
    >
      Log Out
    </button>
  </div>
)}
      </div>

      {/* Main Content */}
      {currentView === 'assignments' && (
        <Dashboard
          assignments={assignments}
          darkMode={darkMode}
          onSelectAssignment={setSelectedAssignment}
          getPriorityColor={getPriorityColor}
        />
      )}

      {currentView === 'calendar' && (
        <CalendarView
          darkMode={darkMode}
          assignments={assignments}
          onSelectAssignment={setSelectedAssignment}
        />
      )}

      {currentView === 'focus' && (
        <FocusMode
          darkMode={darkMode}
          focusModeEnabled={focusModeEnabled}
          setFocusModeEnabled={setFocusModeEnabled}
          blockedSites={blockedSites}
          setBlockedSites={setBlockedSites}
        />
      )}

      {currentView === 'auth' && (
  <LoginPage
    onLoginSuccess={(name: string) => {
    setSignedInUser(name);
    setCurrentView('assignments');
  }}
  />
)}
      {currentView === 'profile' && (
        <Settings
          darkMode={darkMode}
          canvasApiKey={canvasApiKey}
          setCanvasApiKey={setCanvasApiKey}
          aiApiKey={aiApiKey}
          setAiApiKey={setAiApiKey}
          showCanvasKey={showCanvasKey}
          setShowCanvasKey={setShowCanvasKey}
          showAiKey={showAiKey}
          setShowAiKey={setShowAiKey}
          emailNotifications={emailNotifications}
          setEmailNotifications={setEmailNotifications}
          pushNotifications={pushNotifications}
          setPushNotifications={setPushNotifications}
          setDarkMode={setDarkMode}
        />
      )}

      {/* Bottom Navigation */}
      {currentView !== 'auth' && (
      <BottomNav
        currentView={currentView}
      darkMode={darkMode}
      onViewChange={setCurrentView}
      />
)}

      {/* Assignment Detail Panel */}
      <AssignmentDetails
        assignment={selectedAssignmentData}
        darkMode={darkMode}
        onClose={() => setSelectedAssignment(null)}
        getPriorityColor={getPriorityColor}
      />
    </div>
  );
}
