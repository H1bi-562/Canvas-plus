"use client";

import Settings from "@/app/(dashboard)/settings/_components/Settings";
import { useDashboard } from "../_components/DashboardProvider";

export default function Page() {
  const { aiApiKey, setAiApiKey, showAiKey, setShowAiKey, emailNotifications, setEmailNotifications, pushNotifications, setPushNotifications, assignmentDueWarning, setAssignmentDueWarning, dueWarningTimeframe, setDueWarningTimeframe, smartScheduler, setSmartScheduler, assignmentDecomposition, setAssignmentDecomposition, darkMode, loadAssignments, changeTheme } = useDashboard();
  return (<Settings
    darkMode={darkMode}
    aiApiKey={aiApiKey}
    setAiApiKey={setAiApiKey}
    showAiKey={showAiKey}
    setShowAiKey={setShowAiKey}
    emailNotifications={emailNotifications}
    setEmailNotifications={setEmailNotifications}
    pushNotifications={pushNotifications}
    setPushNotifications={setPushNotifications}
    setDarkMode={(on: boolean) => changeTheme(on ? "dark-modern" : "light-modern")}
    assignmentDueWarning={assignmentDueWarning}
    setAssignmentDueWarning={setAssignmentDueWarning}
    dueWarningTimeframe={dueWarningTimeframe}
    setDueWarningTimeframe={setDueWarningTimeframe}
    smartScheduler={smartScheduler}
    setSmartScheduler={setSmartScheduler}
    assignmentDecomposition={assignmentDecomposition}
    setAssignmentDecomposition={setAssignmentDecomposition}
    onAssignmentsChanged={loadAssignments}
  />);
}
