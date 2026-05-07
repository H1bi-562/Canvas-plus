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
  setDarkMode
}: SettingsProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className={darkMode ? 'bg-[#1e3a5f] px-6 py-4' : 'bg-[#1e3a5f] px-6 py-4'}>
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

          {/* Preferences */}
          <div className={`rounded-lg shadow-sm p-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
            <h2 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Preferences</h2>
            <div className="space-y-4">
              {/* Email Notifications */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Email Notifications</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Receive assignment reminders via email</p>
                </div>
                <button
                  onClick={() => setEmailNotifications(!emailNotifications)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    emailNotifications ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      emailNotifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Push Notifications */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Push Notifications</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Get push notifications on your device</p>
                </div>
                <button
                  onClick={() => setPushNotifications(!pushNotifications)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    pushNotifications ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      pushNotifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Dark Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Dark Mode</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Enable dark theme across the app</p>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    darkMode ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      darkMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
