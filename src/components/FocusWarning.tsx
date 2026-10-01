// Import the warning icon from the lucide-react icon library
import { ShieldAlert } from 'lucide-react';

// Props passed into the warning component from App.tsx
interface FocusWarningProps {
  // Used to change styling between light and dark mode
  darkMode: boolean;

  // The list of websites the user has chosen to block
  blockedSites: string[];

  // Function used to close the warning popup
  onDismiss: () => void;
}

// Displays a warning when the user leaves the study page
// while Focus Mode is active
export default function FocusWarning({
  darkMode,
  blockedSites,
  onDismiss,
}: FocusWarningProps) {
  return (
    // Full-screen overlay that appears above the app
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      
      {/* Warning popup container */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="focus-warning-title"
        className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ${
          darkMode
            ? 'bg-[var(--cp-card)] text-white'
            : 'bg-white text-gray-900'
        }`}
      >

        {/* Header section containing icon and title */}
        <div className="mb-4 flex items-center gap-3">

          {/* Warning icon */}
          <div className="rounded-full bg-amber-100 p-2 text-amber-600">
            <ShieldAlert className="h-6 w-6" />
          </div>

          {/* Popup title */}
          <h2 id="focus-warning-title" className="text-lg font-semibold">
            Stay focused
          </h2>
        </div>


        {/* Explanation message */}
        <p
          className={`text-sm leading-6 ${
            darkMode ? 'text-gray-300' : 'text-gray-600'
          }`}
        >
          You left CanvasPlus while Focus Mode was active. These sites are on
          your blocked list:
        </p>


        {/* Displays the websites the user entered in Focus Mode settings */}
        <div
          className={`mt-4 rounded-lg p-3 text-sm ${
            darkMode
              ? 'bg-[var(--cp-page)] text-gray-200'
              : 'bg-gray-50 text-gray-700'
          }`}
        >
          {blockedSites.length > 0
            ? blockedSites.join(' · ')
            : 'No sites have been added yet.'}
        </div>


        {/* Button that closes the warning and returns the user to studying */}
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Return to studying
        </button>

      </div>
    </div>
  );
}