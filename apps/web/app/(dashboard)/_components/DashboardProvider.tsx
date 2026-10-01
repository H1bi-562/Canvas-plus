"use client";

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import AssignmentDetails from "@/components/AssignmentDetails";
import BottomNav from "@/components/BottomNav";
import { Assignment, fetchAssignments } from "@/lib/assignmentsApi";
import { ApiError, logout } from "@/lib/apiClient";
import { fetchLayout, saveTheme } from "@/app/(dashboard)/assignments/_api/layoutApi";
import { DEFAULT_THEME, getTheme, type ThemeId } from "@/lib/themes";
import { useRouter } from "next/navigation";

type ViewType = "assignments" | "calendar" | "focus" | "analytics" | "profile" | "auth";

const DashboardContext = createContext<ReturnType<typeof useDashboardState> | null>(null);

function useDashboardState(initialName: string) {
  const router = useRouter();
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null);
  const setCurrentView = (view: ViewType) => router.push(view === "profile" ? "/settings" : view === "auth" ? "/login" : `/${view}`);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [blockedSites, setBlockedSites] = useState([
    "youtube.com",
    "discord.com",
    "twitter.com",
    "reddit.com"
  ]);

  // Profile/Settings state
  const [aiApiKey, setAiApiKey] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  // UC22 – colour theme. darkMode follows the theme, so every component's
  // existing light/dark classes keep working; themes.css recolours both.
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);
  const darkMode = getTheme(themeId).mode === "dark";
  const [signedInUser, setSignedInUser] = useState<string | null>(initialName);
  const [assignmentDueWarning, setAssignmentDueWarning] = useState(false);
  const [dueWarningTimeframe, setDueWarningTimeframe] = useState("24");
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
    setThemeId(DEFAULT_THEME); // the next student on this machine starts fresh
    router.replace("/login");
    router.refresh();
  }, [router]);

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      setAssignments(await fetchAssignments());
    } catch (err) {
      // The auth cookie expired or was revoked: back to the login screen.
      if (err instanceof ApiError && err.status === 401) return signOutLocally();
      setAssignmentsError(err instanceof ApiError ? err.message : "Could not load assignments.");
    } finally {
      setAssignmentsLoading(false);
    }
  }, [signOutLocally]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  // The saved theme. A failure just leaves the default; HomeView reports
  // problems with the same endpoint.
  useEffect(() => {
    fetchLayout().then((res) => setThemeId(getTheme(res.theme).id)).catch(() => {});
  }, []);

  // On <html>, not the app root, so dialogs portalled to <body> are themed too.
  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
  }, [themeId]);

  /** Apply at once (like VS Code's theme picker) and save in the background. */
  const changeTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    saveTheme(id).catch((err) => {
      if (err instanceof ApiError && err.status === 401) signOutLocally();
      else console.error("Could not save theme:", err);
    });
  }, [signOutLocally]);

  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout(); // Revokes the Better Auth session and clears its cookie.
      signOutLocally();
    } catch {
      setLogoutError("Could not sign out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };

  const selectedAssignmentData = assignments.find(a => a.id === selectedAssignment);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "text-red-600 bg-red-50";
      case "Medium":
        return "text-yellow-600 bg-yellow-50";
      case "Low":
        return "text-green-600 bg-green-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };


  useEffect(() => {
    window.addEventListener("session-expired", signOutLocally);
    return () => window.removeEventListener("session-expired", signOutLocally);
  }, [signOutLocally]);
  return { selectedAssignment, setSelectedAssignment, focusModeEnabled, setFocusModeEnabled, blockedSites, setBlockedSites, aiApiKey, setAiApiKey, showAiKey, setShowAiKey, emailNotifications, setEmailNotifications, pushNotifications, setPushNotifications, themeId, setThemeId, signedInUser, setSignedInUser, assignmentDueWarning, setAssignmentDueWarning, dueWarningTimeframe, setDueWarningTimeframe, smartScheduler, setSmartScheduler, assignmentDecomposition, setAssignmentDecomposition, assignments, setAssignments, assignmentsLoading, setAssignmentsLoading, assignmentsError, setAssignmentsError, darkMode, loadAssignments, changeTheme, signOutLocally, getPriorityColor, setCurrentView, selectedAssignmentData, handleLogout, logoutError, loggingOut };
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("Dashboard provider is missing");
  return context;
}

export default function DashboardProvider({ initialName, children }: { initialName: string; children: ReactNode }) {
  const state = useDashboardState(initialName);
  const { darkMode, signedInUser, handleLogout, logoutError, loggingOut, selectedAssignmentData, setSelectedAssignment, getPriorityColor, loadAssignments } = state;
  return <DashboardContext.Provider value={state}>
    <div className={`size-full flex flex-col ${darkMode ? "bg-[var(--cp-page)]" : "bg-gray-50"}`}>
      {/* Top Bar */}
      <div className={`shadow-sm px-6 py-4 flex items-center justify-between ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`}>
        <h1 className={`text-2xl font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>CanvasPlus</h1>
        {(
          <div className="flex items-center gap-4">
            <span className={`${darkMode ? "text-white" : "text-gray-700"} font-medium`}>
              {signedInUser ? `Welcome, ${signedInUser}` : "Welcome"}
            </span>

            <button
              disabled={loggingOut}
              onClick={handleLogout}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg transition-colors"
            >
      Log Out
            </button>
          </div>
        )}
      </div>

      {logoutError && <p role="alert" className="px-6 py-2 text-red-600">{logoutError}</p>}
      {children}
      <BottomNav darkMode={darkMode} />
      {/* Assignment Detail Panel */}
      <AssignmentDetails
        assignment={selectedAssignmentData}
        darkMode={darkMode}
        onClose={() => setSelectedAssignment(null)}
        getPriorityColor={getPriorityColor}
        onChanged={loadAssignments}
      />
    </div>
  </DashboardContext.Provider>;
}
