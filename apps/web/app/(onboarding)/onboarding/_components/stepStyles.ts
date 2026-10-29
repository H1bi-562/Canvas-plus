// Shared classes for the wizard's steps (match the Settings cards in GoogleConnection.tsx).
export function stepStyles(darkMode: boolean) {
  return {
    muted: `text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`,
    strong: darkMode ? "text-white" : "text-gray-900",
    primary: "inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
    secondary: `inline-flex items-center gap-2 py-2.5 px-5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      darkMode ? "border-gray-600 text-gray-200 hover:bg-[var(--cp-page)]" : "border-gray-300 text-gray-700 hover:bg-gray-50"
    }`,
    input: `w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${
      darkMode ? "bg-[var(--cp-page)] border-gray-600 text-white placeholder-gray-400" : "bg-white border-gray-300 text-gray-900"
    }`,
    errorBox: `flex items-start gap-2 mt-4 p-3 rounded-lg text-sm ${
      darkMode ? "bg-red-900/30 border border-red-700 text-red-300" : "bg-red-50 border border-red-200 text-red-700"
    }`,
    okBox: `flex items-start gap-2 p-3 rounded-lg text-sm ${
      darkMode ? "bg-green-900/30 border border-green-700 text-green-300" : "bg-green-50 border border-green-200 text-green-800"
    }`
  };
}
