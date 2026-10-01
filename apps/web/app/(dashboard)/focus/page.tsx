"use client";

import FocusMode from "@/app/(dashboard)/focus/_components/FocusMode";
import { useDashboard } from "../_components/DashboardProvider";

export default function Page() {
  const { focusModeEnabled, setFocusModeEnabled, blockedSites, setBlockedSites, assignments, darkMode, loadAssignments } = useDashboard();
  return (<FocusMode
    darkMode={darkMode}
    focusModeEnabled={focusModeEnabled}
    setFocusModeEnabled={setFocusModeEnabled}
    blockedSites={blockedSites}
    setBlockedSites={setBlockedSites}
    assignments={assignments}
    onAssignmentsChanged={loadAssignments}
  />);
}
