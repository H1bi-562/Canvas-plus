// UC23 – the in-app walkthrough's stops. Each one names the page it lives on and the
// data-tour marker of the real element it outlines. Rule: describe only features that
// work on main, and check the text against the component before changing it.

export interface SkipContext {
  /** Screen at least 768 px wide (HomeView hides Customize below that). */
  wide: boolean;
  assignmentCount: number;
}

export interface WalkthroughStep {
  id: string;
  path: string;
  /** data-tour value to outline; null shows a centered popup (the theme picker). */
  marker: string | null;
  title: string;
  text: string;
  skip?: (ctx: SkipContext) => boolean;
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  { id: "home", path: "/assignments", marker: "home-grid", title: "Your dashboard",
    text: "Widgets for your priorities, assignments, study timer and stats, all in one place." },
  { id: "customize", path: "/assignments", marker: "customize", title: "Customize",
    text: "Drag, resize, add or remove widgets, then Save. Your layout follows your account.",
    skip: (ctx) => !ctx.wide },
  { id: "assignments", path: "/assignments", marker: "assignment-card", title: "Your assignments",
    text: "Synced from Canvas. Open one for an AI summary, a grade-impact what-if, and Mark done.",
    skip: (ctx) => ctx.assignmentCount === 0 },
  { id: "timer", path: "/focus", marker: "focus-picker", title: "Study timer",
    text: "Pick what you're working on, then Start, Pause, Resume or End. Paused time isn't counted, and the timer keeps running if you close the page." },
  { id: "analytics", path: "/analytics", marker: "analytics-range", title: "Study analytics",
    text: "Choose a range to see study time, focus, streaks, at-risk work, and charts by course." },
  { id: "calendar", path: "/calendar", marker: "calendar-view", title: "Calendar",
    text: "Switch between month and week views of your due dates, plus Google events once connected." },
  { id: "settings", path: "/settings", marker: "settings-accounts", title: "Accounts and setup",
    text: "Reconnect Canvas or Google here, or use Run setup again to replay this tour." },
  { id: "theme", path: "/assignments", marker: null, title: "Pick a theme",
    text: "Choose how CanvasPlus looks. You can change it any time under Customize." }
];

export function activeSteps(ctx: SkipContext): WalkthroughStep[] {
  return WALKTHROUGH_STEPS.filter((step) => !step.skip?.(ctx));
}
