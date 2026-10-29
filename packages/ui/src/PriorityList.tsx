// @canvasplus/ui/PriorityList
// UC15 – the student's most important open work, ranked by the server
// (packages/database/src/queries/priorityModel.js). The web dashboard widget
// and the extension popup both render this, so they look the same; it follows
// the colour theme through the same Tailwind classes as the web components
// (see ../styles.css). Finished work has no rank, so it never shows here.

import { useId } from "react";

export type PriorityLevel = "High" | "Medium" | "Low";

/** The fields the list reads; the web's Assignment and the raw API row both fit. */
export interface PriorityItem {
  id: string;
  title: string;
  courseCode: string | null;
  courseName: string;
  dueAt: string | null;
  priorityScore: number | null;
  /** 1 = most important open assignment; null once finished or locked. */
  priorityRank: number | null;
  priorityReason: string | null;
}

/** The cut-offs every priority label in the app uses. */
export function priorityLevel(score: number): PriorityLevel {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

const LEVEL_STYLES: Record<PriorityLevel, [light: string, dark: string]> = {
  High:   ["bg-red-50 text-red-700",     "bg-red-900/40 text-red-300"],
  Medium: ["bg-amber-50 text-amber-700", "bg-amber-900/40 text-amber-300"],
  Low:    ["bg-green-50 text-green-700", "bg-green-900/40 text-green-300"]
};

/** "due in 5h", "due in 3 days", "2 days overdue". */
export function dueIn(dueAt: string | null, now: number = Date.now()): string {
  if (!dueAt) return "no due date";
  const hours = (new Date(dueAt).getTime() - now) / 3_600_000;
  const span = (h: number) => {
    if (h < 1) return "<1h";
    if (h < 24) return `${Math.round(h)}h`;
    const days = Math.round(h / 24);
    return `${days} ${days === 1 ? "day" : "days"}`;
  };
  return hours < 0 ? `${span(-hours)} overdue` : `due in ${span(hours)}`;
}

interface PriorityListProps<T extends PriorityItem> {
  items: T[];
  darkMode: boolean;
  onSelect: (item: T) => void;
  /** How many of the top-ranked items to show. */
  limit?: number;
  isLoading?: boolean;
  error?: string | null;
}

export default function PriorityList<T extends PriorityItem>({
  items,
  darkMode,
  onSelect,
  limit = 5,
  isLoading = false,
  error = null
}: PriorityListProps<T>) {
  const headingId = useId();
  const ranked = items
    .filter((item) => item.priorityRank != null)
    .sort((a, b) => a.priorityRank! - b.priorityRank!);
  const ink = darkMode ? "text-white" : "text-gray-900";
  const muted = darkMode ? "text-gray-300" : "text-gray-600";
  const now = Date.now();

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={isLoading}
      className={`rounded-lg shadow-sm p-5 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 id={headingId} className={`text-base font-semibold ${ink}`}>Top priorities</h3>
        {!isLoading && !error && ranked.length > 0 && <span className={`text-xs ${muted}`}>{ranked.length} open</span>}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className={`h-12 rounded-md animate-pulse ${darkMode ? "bg-gray-600" : "bg-gray-200"}`} />
          ))}
        </div>
      ) : error ? (
        <p role="alert" className={`text-sm ${darkMode ? "text-red-300" : "text-red-700"}`}>{error}</p>
      ) : ranked.length === 0 ? (
        <p className={`text-sm ${muted}`}>All caught up: nothing open right now.</p>
      ) : (
        <ol className="space-y-1">
          {ranked.slice(0, limit).map((item) => {
            const level = priorityLevel(item.priorityScore ?? 0);
            const [light, dark] = LEVEL_STYLES[level];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`w-full flex items-start gap-3 p-2 rounded-lg text-left text-sm font-normal transition-colors ${
                    darkMode ? "hover:bg-[var(--cp-raised)]" : "hover:bg-gray-50"
                  }`}
                >
                  <span className={`shrink-0 size-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    darkMode ? "bg-[var(--cp-raised)] text-gray-200" : "bg-gray-100 text-gray-700"
                  }`}>
                    {item.priorityRank}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block font-medium truncate ${ink}`}>{item.title}</span>
                    <span className={`block text-xs ${muted}`}>
                      {item.courseCode || item.courseName} · {dueIn(item.dueAt, now)}
                    </span>
                    {item.priorityReason && <span className={`block text-xs ${muted}`}>{item.priorityReason}</span>}
                  </span>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${darkMode ? dark : light}`}>
                    {level} · {item.priorityScore}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
