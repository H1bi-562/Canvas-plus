import { useCallback, useEffect, useState } from 'react';
import Dashboard from '../components/Dashboard';
import LoginPage from '../components/LoginPage';
import AssignmentDetails from '../components/AssignmentDetails';
import CalendarView from '../components/CalendarView';
import FocusMode from '../components/FocusMode';
import Settings from '../components/Settings';
import BottomNav from '../components/BottomNav';
import AnalyticsView from '../components/analytics/AnalyticsView';
import { Assignment, fetchAssignments } from '../lib/assignmentsApi';
import { ApiError, logout } from '../lib/apiClient';

type ViewType = 'assignments' | 'calendar' | 'focus' | 'analytics' | 'profile' | 'auth';

export default function App() {
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('auth');  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [blockedSites, setBlockedSites] = useState([
    'youtube.com',
    'discord.com',
    'twitter.com',
    'reddit.com'
  ]);

  // Profile/Settings state
  const [aiApiKey, setAiApiKey] = useState('');
  const [showAiKey, setShowAiKey] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [signedInUser, setSignedInUser] = useState<string | null>(null);
  const [assignmentDueWarning, setAssignmentDueWarning] = useState(false);
  const [dueWarningTimeframe, setDueWarningTimeframe] = useState('24');
  const [smartScheduler, setSmartScheduler] = useState(false);
  const [assignmentDecomposition, setAssignmentDecomposition] = useState(false);

  // Assignments come from the API: Canvas-synced rows, or demo rows in dev.
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  const signOutLocally = useCallback(() => {
    setSignedInUser(null);
    setAssignments([]);
    setSelectedAssignment(null);
    setCurrentView('auth');
  }, []);

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      setAssignments(await fetchAssignments());
    } catch (err) {
      // The auth cookie expired or was revoked: back to the login screen.
      if (err instanceof ApiError && err.status === 401) return signOutLocally();
      setAssignmentsError(err instanceof ApiError ? err.message : 'Could not load assignments.');
    } finally {
      setAssignmentsLoading(false);
    }
  }, [signOutLocally]);

  const signedIn = currentView !== 'auth';
  useEffect(() => {
    if (signedIn) loadAssignments();
  }, [signedIn, loadAssignments]);

  const handleLogout = async () => {
    try {
      await logout(); // revokes the JWT and clears the httpOnly cookie
    } catch {
      // Already signed out server-side; clear the UI regardless.
    }
    signOutLocally();
  };

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
      onClick={handleLogout}
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
          isLoading={assignmentsLoading && assignments.length === 0}
          error={assignmentsError}
          onOpenSettings={() => setCurrentView('profile')}
          onSelectAssignment={setSelectedAssignment}
          getPriorityColor={getPriorityColor}
        />
      )}

      {currentView === 'calendar' && (
        <CalendarView
          darkMode={darkMode}
          assignments={assignments}
          isLoading={assignmentsLoading && assignments.length === 0}
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
          assignments={assignments}
          onAssignmentsChanged={loadAssignments}
        />
      )}

      {currentView === 'analytics' && (
        <AnalyticsView
          darkMode={darkMode}
          onStudyNow={() => setCurrentView('focus')}
          onSignedOut={signOutLocally}
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
          aiApiKey={aiApiKey}
          setAiApiKey={setAiApiKey}
          showAiKey={showAiKey}
          setShowAiKey={setShowAiKey}
          emailNotifications={emailNotifications}
          setEmailNotifications={setEmailNotifications}
          pushNotifications={pushNotifications}
          setPushNotifications={setPushNotifications}
          setDarkMode={setDarkMode}
          assignmentDueWarning={assignmentDueWarning}
          setAssignmentDueWarning={setAssignmentDueWarning}
          dueWarningTimeframe={dueWarningTimeframe}
          setDueWarningTimeframe={setDueWarningTimeframe}
          smartScheduler={smartScheduler}
          setSmartScheduler={setSmartScheduler}
          assignmentDecomposition={assignmentDecomposition}
          setAssignmentDecomposition={setAssignmentDecomposition}
          onAssignmentsChanged={loadAssignments}
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
        onChanged={loadAssignments}
      />
    </div>
  );
}
