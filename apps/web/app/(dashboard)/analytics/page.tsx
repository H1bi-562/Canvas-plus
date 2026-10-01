"use client";

import AnalyticsView from "@/app/(dashboard)/analytics/_components/AnalyticsView";
import { useDashboard } from "../_components/DashboardProvider";

export default function Page() {
  const { setCurrentView, darkMode, signOutLocally } = useDashboard();
  return (<AnalyticsView
    darkMode={darkMode}
    onStudyNow={() => setCurrentView("focus")}
    onSignedOut={signOutLocally}
  />);
}
