import { Eye, EyeOff } from 'lucide-react';

interface SettingsProps {
  darkMode: boolean;
  canvasApiKey: string;
  setCanvasApiKey: (value: string) => void;
  aiApiKey: string;
  setAiApiKey: (value: string) => void;
  showCanvasKey: boolean;
  setShowCanvasKey: (value: boolean) => void;
  showAiKey: boolean;
  setShowAiKey: (value: boolean) => void;
  emailNotifications: boolean;
  setEmailNotifications: (value: boolean) => void;
  pushNotifications: boolean;
  setPushNotifications: (value: boolean) => void;
  setDarkMode: (value: boolean) => void;
  // New props
  assignmentDueWarning: boolean;
  setAssignmentDueWarning: (value: boolean) => void;
  dueWarningTimeframe: string;
  setDueWarningTimeframe: (value: string) => void;
  smartScheduler: boolean;
  setSmartScheduler: (value: boolean) => void;
  assignmentDecomposition: boolean;
  setAssignmentDecomposition: (value: boolean) => void;
}

export default function Settings({
  darkMode,
  canvasApiKey,
  setCanvasApiKey,
  aiApiKey,
  setAiApiKey,
  showCanvasKey,
  setShowCanvasKey,
  showAiKey,
  setShowAiKey,
  emailNotifications,
  setEmailNotifications,
  pushNotifications,
  setPushNotifications,
  setDarkMode,
  assignmentDueWarning,
  setAssignmentDueWarning,
  dueWarningTimeframe,
  setDueWarningTimeframe,
  smartScheduler,
  setSmartScheduler,
  assignmentDecomposition,
  setAssignmentDecomposition,
}: SettingsProps) {

  const Toggle = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${
        enabled ? 'bg-blue-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  const SectionDivider = () => (
    <div className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-100'}`} />
  );

  const subsectionLabel = `text-xs font-semibold uppercase tracking-wide mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="bg-[#1e3a5f] px-6 py-4">
        <h1 className="text-white text-xl font-medium">Settings</h1>
      </div>

      <div className={`px-6 py-6 min-h-full ${darkMode ? 'bg-[#2d2d2d]' : 'bg-gray-50'}`}>
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Canvas Integration */}
          <div className={`rounded-lg shadow-sm p-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
            <h2 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Canvas Integration</h2>
            <div>
              <label className={`block text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Canvas API Key</label>
              <div className="relative">
                <input
                  type={showCanvasKey ? 'text' : 'password'}
                  value={canvasApiKey}
                  onChange={(e) => setCanvasApiKey(e.target.value)}
                  placeholder="Enter your Canvas API key"
                  className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${
                    darkMode ? 'bg-[#2d2d2d] border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
                <button
                  onClick={() => setShowCanvasKey(!showCanvasKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCanvasKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Google Integration */}
          <div className={`rounded-lg shadow-sm p-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
            <h2 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Google Integration</h2>
            <p className={`text-sm mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Connect your Google account to sync calendars and assignments</p>
            <button className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg transition-colors">
              Connect Google Account
            </button>
          </div>

          {/* AI Integration */}
          <div className={`rounded-lg shadow-sm p-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
            <h2 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>AI Integration</h2>
            <div>
              <label className={`block text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>AI API Key</label>
              <div className="relative">
                <input
                  type={showAiKey ? 'text' : 'password'}
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder="Enter your AI API key"
                  className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${
                    darkMode ? 'bg-[#2d2d2d] border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
                <button
                  onClick={() => setShowAiKey(!showAiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showAiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* App Config */}
          <div className={`rounded-lg shadow-sm p-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
            <h2 className={`font-semibold mb-5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>CanvasPlus Settings</h2>

            {/* --- Assignment Due Warning --- */}
            <p className={subsectionLabel}>Assignment Due Warning</p>
            <div className="space-y-4">

              {/* Master toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Due Date Alert</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Show a modal alert when an assignment is approaching its due date
                  </p>
                </div>
                <Toggle enabled={assignmentDueWarning} onToggle={() => setAssignmentDueWarning(!assignmentDueWarning)} />
              </div>

              {/* Timeframe select — dimmed when toggle is off */}
              <div className={`flex items-center justify-between transition-opacity ${assignmentDueWarning ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Warning Timeframe</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    How far in advance to trigger the alert
                  </p>
                </div>
                <select
                  value={dueWarningTimeframe}
                  onChange={(e) => setDueWarningTimeframe(e.target.value)}
                  className={`text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    darkMode
                      ? 'bg-[#2d2d2d] border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="1">1 hour</option>
                  <option value="3">3 hours</option>
                  <option value="6">6 hours</option>
                  <option value="12">12 hours</option>
                  <option value="24">24 hours</option>
                  <option value="48">48 hours</option>
                  <option value="72">72 hours</option>
                </select>
              </div>
            </div>

            <SectionDivider />

            {/* --- AI Preferences --- */}
            <p className={`${subsectionLabel} mt-5`}>AI Preferences</p>
            <div className="space-y-4">

              {/* Smart Scheduler */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Smart Scheduler</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Automatically suggest optimal study sessions based on your workload
                  </p>
                </div>
                <Toggle enabled={smartScheduler} onToggle={() => setSmartScheduler(!smartScheduler)} />
              </div>

              {/* Assignment Decomposition */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Assignment Decomposition</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Break assignments into smaller, manageable subtasks automatically
                  </p>
                </div>
                <Toggle enabled={assignmentDecomposition} onToggle={() => setAssignmentDecomposition(!assignmentDecomposition)} />
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className={`rounded-lg shadow-sm p-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
            <h2 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Email Notifications</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Receive assignment reminders via email</p>
                </div>
                <Toggle enabled={emailNotifications} onToggle={() => setEmailNotifications(!emailNotifications)} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Push Notifications</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Get push notifications on your device</p>
                </div>
                <Toggle enabled={pushNotifications} onToggle={() => setPushNotifications(!pushNotifications)} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Dark Mode</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Enable dark theme across the app</p>
                </div>
                <Toggle enabled={darkMode} onToggle={() => setDarkMode(!darkMode)} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}