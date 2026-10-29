"use client";

import { createContext, useContext, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import AssignmentDetails from "@/components/AssignmentDetails";
import BottomNav from "@/components/BottomNav";
import { Assignment, fetchAssignments } from "@/lib/assignmentsApi";
import { ApiError, logout } from "@/lib/apiClient";
import { fetchLayout, saveTheme, type LayoutItem, type LayoutResponse } from "@/app/(dashboard)/assignments/_api/layoutApi";
import { clearPreferences, readPreferences, subscribePreferences, writePreferences } from "@/lib/preferencesCache";
import { DEFAULT_THEME, getTheme, type ThemeId } from "@canvasplus/ui/themes";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// UC23: only downloaded while a first-time walkthrough is running.
const Walkthrough = dynamic(() => import("./walkthrough/Walkthrough"), { ssr: false });

type ViewType = "assignments" | "calendar" | "focus" | "analytics" | "profile" | "auth";

const DashboardContext = createContext<ReturnType<typeof useDashboardState> | null>(null);

function useDashboardState(initialName: string, userId: string) {
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
  const [focusSettingsLoaded, setFocusSettingsLoaded] = useState(false);

  // Keep the user's Focus Mode settings available to the extension without
  // putting them in the database. The extension's content script reads this
  // same origin-local value and forwards it to its service worker.
  const publishFocusSettings = useCallback((enabled: boolean, sites: string[]) => {
    const payload = {
      source: "canvasplus-web",
      type: "FOCUS_SETTINGS",
      enabled,
      sites: sites.filter((site) => site.trim().length > 0),
    };

    try {
      localStorage.setItem("canvasplus:focus-settings", JSON.stringify(payload));
    } catch {
      // Continue publishing through postMessage if storage is unavailable.
    }
    window.postMessage(payload, window.location.origin);
  }, []);

  // Restore the last list when the dashboard opens, then publish it to the
  // extension. This keeps settings after refresh and after the popup closes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("canvasplus:focus-settings");
      if (raw) {
        const saved = JSON.parse(raw) as { enabled?: boolean; sites?: unknown };
        if (typeof saved.enabled === "boolean") setFocusModeEnabled(saved.enabled);
        if (Array.isArray(saved.sites)) {
          setBlockedSites(saved.sites.filter((site): site is string => typeof site === "string"));
        }
      }
    } catch {
      // Use the defaults if the saved browser value is malformed.
    } finally {
      setFocusSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (focusSettingsLoaded) publishFocusSettings(focusModeEnabled, blockedSites);
  }, [blockedSites, focusModeEnabled, focusSettingsLoaded, publishFocusSettings]);

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

  // UC22 – the home layout, owned here so it syncs alongside the theme (same row on the server).
  const [savedLayout, setSavedLayout] = useState<LayoutItem[] | null>(null);
  const [layoutLoadError, setLayoutLoadError] = useState<string | null>(null);

  const signOutLocally = useCallback(() => {
    setSignedInUser(null);
    setAssignments([]);
    setSelectedAssignment(null);
    setThemeId(DEFAULT_THEME); // the next student on this machine starts fresh
    setSavedLayout(null);
    clearPreferences(userId);
    router.replace("/login");
    router.refresh();
  }, [router, userId]);

  /** Resolves true when the list loaded. refresh lets the server re-sync a stale Canvas copy first. */
  const loadAssignments = useCallback(async (refresh = true) => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      const next = await fetchAssignments(refresh);
      // Keep the old array when nothing changed, so a background refresh re-renders nothing.
      setAssignments((prev) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
      return true;
    } catch (err) {
      // The auth cookie expired or was revoked: back to the login screen.
      if (err instanceof ApiError && err.status === 401) signOutLocally();
      else setAssignmentsError(err instanceof ApiError ? err.message : "Could not load assignments.");
      return false;
    } finally {
      setAssignmentsLoading(false);
    }
  }, [signOutLocally]);

  // UC15 – keep submission status, and so the priority list, current without a manual
  // sync: show the stored copy at once, then let the server re-sync it from Canvas when
  // it is over 5 minutes old. Again on focus (back from submitting on Canvas) and every
  // 5 minutes while visible; each is one cheap request while the copy is fresh.
  useEffect(() => {
    void loadAssignments(false).then((ok) => ok && loadAssignments());
    const refresh = () => {
      if (document.visibilityState === "visible") void loadAssignments();
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [loadAssignments]);

  // ── Theme + layout sync ────────────────────────────────────────────────────
  // This browser's copy (lib/preferencesCache) paints first; the database wins
  // whenever its row has changed, except over a theme picked here that is not
  // saved yet, which is pushed instead.

  /** Adopt the server's row, keeping a theme that is still waiting to be saved. */
  const applyServerPreferences = useCallback((res: LayoutResponse) => {
    setLayoutLoadError(null);
    const local = readPreferences(userId);
    const themeDirty = local?.themeDirty ?? false;
    if (local?.layout && !themeDirty && local.updatedAt === res.updatedAt) return; // nothing changed anywhere
    const theme = themeDirty && local ? local.theme : getTheme(res.theme).id;
    writePreferences(userId, { theme, layout: res.layout, updatedAt: res.updatedAt, themeDirty });
    setThemeId(theme);
    setSavedLayout(res.layout);
  }, [userId]);

  /** Save a theme, then adopt the server's row unless a newer pick replaced it meanwhile. */
  const pushTheme = useCallback(async (id: ThemeId) => {
    const res = await saveTheme(id);
    const local = readPreferences(userId);
    if (local?.theme !== id) return;
    writePreferences(userId, { ...local, themeDirty: false });
    applyServerPreferences(res);
  }, [userId, applyServerPreferences]);

  const syncPreferences = useCallback(async () => {
    try {
      const local = readPreferences(userId);
      if (local?.themeDirty) await pushTheme(local.theme);
      else applyServerPreferences(await fetchLayout());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return signOutLocally();
      // Keep this browser's copy; with none, HomeView shows the default layout and this message.
      if (!readPreferences(userId)?.layout) {
        setLayoutLoadError(err instanceof ApiError ? err.message : "Could not load your saved layout, showing the default.");
      }
    }
  }, [userId, pushTheme, applyServerPreferences, signOutLocally]);

  // Before the first paint after hydration, so the saved theme shows without a flash of the default.
  // ponytail: the server-rendered HTML still uses the default theme until hydration; mirror the
  // theme into a cookie and read it in (dashboard)/layout.tsx if that first frame matters.
  useLayoutEffect(() => {
    const local = readPreferences(userId);
    if (!local) return;
    setThemeId(local.theme);
    if (local.layout) setSavedLayout(local.layout);
  }, [userId]);

  useEffect(() => {
    void syncPreferences();
    // Another device may have saved changes while this window was in the background.
    const onFocus = () => { void syncPreferences(); };
    window.addEventListener("focus", onFocus);
    // Another tab in this browser changed them: apply straight away, no request needed.
    const unsubscribe = subscribePreferences(userId, (preferences) => {
      setThemeId(preferences.theme);
      if (preferences.layout) setSavedLayout(preferences.layout);
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [userId, syncPreferences]);

  // On <html>, not the app root, so dialogs portalled to <body> are themed too.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeId;
  }, [themeId]);

  /** Apply at once (like VS Code's theme picker), keep it in this browser, and save in the background. */
  const changeTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    const local = readPreferences(userId);
    writePreferences(userId, { layout: local?.layout ?? null, updatedAt: local?.updatedAt ?? null, theme: id, themeDirty: true });
    pushTheme(id).catch((err) => {
      if (err instanceof ApiError && err.status === 401) signOutLocally();
      else console.error("Could not save theme; it will be retried on the next sync:", err);
    });
  }, [userId, pushTheme, signOutLocally]);

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
  return { selectedAssignment, setSelectedAssignment, focusModeEnabled, setFocusModeEnabled, blockedSites, setBlockedSites, aiApiKey, setAiApiKey, showAiKey, setShowAiKey, emailNotifications, setEmailNotifications, pushNotifications, setPushNotifications, themeId, setThemeId, signedInUser, setSignedInUser, assignmentDueWarning, setAssignmentDueWarning, dueWarningTimeframe, setDueWarningTimeframe, smartScheduler, setSmartScheduler, assignmentDecomposition, setAssignmentDecomposition, assignments, setAssignments, assignmentsLoading, setAssignmentsLoading, assignmentsError, setAssignmentsError, darkMode, loadAssignments, changeTheme, signOutLocally, getPriorityColor, setCurrentView, selectedAssignmentData, handleLogout, logoutError, loggingOut, savedLayout, layoutLoadError, applyServerPreferences };
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("Dashboard provider is missing");
  return context;
}

export default function DashboardProvider({ initialName, userId, walkthroughPending = false, children }: { initialName: string; userId: string; walkthroughPending?: boolean; children: ReactNode }) {
  const state = useDashboardState(initialName, userId);
  // The server prop stays stale until the next refresh, so ending the tour is tracked here too.
  const [showWalkthrough, setShowWalkthrough] = useState(walkthroughPending);
  const { darkMode, signedInUser, handleLogout, logoutError, loggingOut, selectedAssignmentData, setSelectedAssignment, getPriorityColor, loadAssignments, assignments } = state;
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
      {showWalkthrough && <Walkthrough onEnd={() => setShowWalkthrough(false)} />}
      {/* Assignment Detail Panel */}
      <AssignmentDetails
        assignment={selectedAssignmentData}
        assignments={assignments}
        darkMode={darkMode}
        onClose={() => setSelectedAssignment(null)}
        getPriorityColor={getPriorityColor}
        onChanged={loadAssignments}
      />
    </div>
  </DashboardContext.Provider>;
}
