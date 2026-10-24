// UC23 step 4 – the feature tour. One card per core feature that works on main today.
// Rule: check every bullet against the component it describes before changing it, and add a
// card only when a feature ships (not yet: Smart Scheduler, Focus Mode site blocking, Break into Tasks).
import { BarChart3, CalendarDays, ClipboardList, LayoutDashboard, Settings, Timer, type LucideIcon } from "lucide-react";

export interface TourCard {
  id: string;
  icon: LucideIcon;
  title: string;
  bullets: string[];
  /** Where the feature lives in the app. The tour cannot link there: the wizard must be finished first. */
  where: string;
}

export const TOUR_CARDS: TourCard[] = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "Your dashboard",
    bullets: [
      "Widgets for Top Priorities, Assignments, Study Timer, Study Stats, At Risk, Time per Course, On-time Rate, Estimated vs. Actual, and Weekly Workload.",
      "Click Customize to drag, resize, add, or remove widgets, then Save. Cancel throws changes away; Reset to default brings back the standard layout.",
      "Your layout and theme follow your account to any device."
    ],
    where: "Home → Customize"
  },
  {
    id: "assignments",
    icon: ClipboardList,
    title: "Assignments from Canvas",
    bullets: [
      "Your courses and assignments sync from Canvas, with due dates and priority badges.",
      "Open an assignment for an AI summary and a grade-impact what-if that shows how a score would move your course grade.",
      "Mark an assignment done once you have finished it."
    ],
    where: "Home → open an assignment"
  },
  {
    id: "timer",
    icon: Timer,
    title: "Study timer",
    bullets: [
      "Under “What are you working on?”, pick an assignment or General study.",
      "Start, Pause, Resume, End. Paused time is not counted, and the timer keeps running if you close the page.",
      "Set how long you expect an assignment to take, or use the suggested estimate."
    ],
    where: "Focus"
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Study analytics",
    bullets: [
      "Pick a range: Last 7 days, Last 30 days, Last 90 days, or This semester.",
      "Tiles for Study time, Focus, Sessions, and Study streak, plus an At risk list of assignments due soon with little time logged.",
      "Charts for Time per course, On-time completion, Estimated vs. actual, and Weekly workload."
    ],
    where: "Analytics"
  },
  {
    id: "calendar",
    icon: CalendarDays,
    title: "Calendar",
    bullets: [
      "Month and week views of your Canvas due dates.",
      "Your Google Calendar events appear alongside them once Google is connected.",
      "Choose which sources the calendar shows."
    ],
    where: "Calendar"
  },
  {
    id: "settings",
    icon: Settings,
    title: "Settings and the browser extension",
    bullets: [
      "Reconnect Canvas or Google Calendar any time.",
      "Run setup again to go through this wizard once more.",
      "The CanvasPlus browser extension shows your top priorities and opens your dashboard in one click."
    ],
    where: "Profile (Settings), and your browser toolbar"
  }
];
