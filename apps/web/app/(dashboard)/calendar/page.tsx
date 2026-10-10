"use client";

import CalendarView from "@/app/(dashboard)/calendar/_components/CalendarView";
import { useDashboard } from "../_components/DashboardProvider";

export default function Page() {
  const { setSelectedAssignment, assignments, assignmentsLoading, darkMode } = useDashboard();
  return (<CalendarView
    darkMode={darkMode}
    assignments={assignments}
    isLoading={assignmentsLoading && assignments.length === 0}
    onSelectAssignment={setSelectedAssignment}
  />);
}
