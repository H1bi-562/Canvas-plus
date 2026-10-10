"use client";

import HomeView from "@/app/(dashboard)/assignments/_components/HomeView";
import { useDashboard } from "../_components/DashboardProvider";

export default function Page() {
  const { setSelectedAssignment, setCurrentView, themeId, assignments, assignmentsLoading, assignmentsError, darkMode, loadAssignments, changeTheme, signOutLocally, getPriorityColor, savedLayout, layoutLoadError, applyServerPreferences } = useDashboard();
  return (<HomeView
    darkMode={darkMode}
    assignments={assignments}
    assignmentsLoading={assignmentsLoading}
    assignmentsError={assignmentsError}
    onSelectAssignment={setSelectedAssignment}
    getPriorityColor={getPriorityColor}
    onOpenSettings={() => setCurrentView("profile")}
    onStudyNow={() => setCurrentView("focus")}
    onAssignmentsChanged={loadAssignments}
    onSignedOut={signOutLocally}
    themeId={themeId}
    onThemeChange={changeTheme}
    savedLayout={savedLayout}
    layoutLoadError={layoutLoadError}
    onLayoutSaved={applyServerPreferences}
  />);
}
