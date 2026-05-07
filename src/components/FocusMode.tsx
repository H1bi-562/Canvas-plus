import { Shield, X } from 'lucide-react';

interface FocusModeProps {
  darkMode: boolean;
  focusModeEnabled: boolean;
  setFocusModeEnabled: (value: boolean) => void;
  blockedSites: string[];
  setBlockedSites: (sites: string[]) => void;
}

export default function FocusMode({
  darkMode,
  focusModeEnabled,
  setFocusModeEnabled,
  blockedSites,
  setBlockedSites
}: FocusModeProps) {
  const removeSite = (index: number) => {
    setBlockedSites(blockedSites.filter((_, i) => i !== index));
  };

  const addSite = (site: string) => {
    setBlockedSites([...blockedSites, site]);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <h2 className={`text-xl font-semibold mb-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Focus Mode</h2>

        {/* Focus Mode Toggle */}
        <div className={`rounded-lg shadow-sm p-6 mb-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Focus Mode</h3>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Block distracting websites</p>
            </div>
            <button
              onClick={() => setFocusModeEnabled(!focusModeEnabled)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                focusModeEnabled ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  focusModeEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Blocked Sites List */}
        <div className={`rounded-lg shadow-sm p-6 mb-6 ${darkMode ? 'bg-[#3a3a3a]' : 'bg-white'}`}>
          <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Blocked Sites</h3>
          <div className="space-y-2">
            {blockedSites.map((site, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-[#2d2d2d]' : 'bg-gray-50'}`}
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-red-600" />
                  <span className={darkMode ? 'text-white' : 'text-gray-900'}>{site}</span>
                </div>
                <button
                  onClick={() => removeSite(index)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add Site Input */}
          <div className="mt-4">
            <input
              type="text"
              placeholder="Add website to block..."
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                darkMode ? 'bg-[#2d2d2d] border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
              }`}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value) {
                  addSite(e.currentTarget.value);
                  e.currentTarget.value = '';
                }
              }}
            />
          </div>
        </div>

        {/* Start Focus Mode Button */}
        <div className="flex justify-center">
          <button
            onClick={() => setFocusModeEnabled(true)}
            className={`py-4 px-12 rounded-lg shadow-lg text-lg font-semibold transition-all transform hover:scale-105 ${
              focusModeEnabled
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
            }`}
            disabled={focusModeEnabled}
          >
            {focusModeEnabled ? 'Focus Mode Active' : 'Start Focus Mode'}
          </button>
        </div>

        {focusModeEnabled && (
          <div className={`mt-6 p-4 border rounded-lg text-center ${
            darkMode ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-green-50 border-green-200 text-green-800'
          }`}>
            <p className="font-medium">
              Focus Mode is now active! Distracting sites are blocked.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
