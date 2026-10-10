import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/apiClient";
import {
  type CalendarSource,
  type GoogleEvent,
  type GoogleStatus,
  eventsOnDay,
  fetchGoogleEvents,
  fetchGoogleStatus,
  fetchHiddenSources,
  saveHiddenSources,
  timeLabel
} from "@/lib/googleCalendarApi";
import WeekView, { type CalendarAssignment, priorityChip } from "./WeekView";


interface CalendarViewProps {
  darkMode: boolean;
  assignments: CalendarAssignment[];
  isLoading?: boolean;
  onSelectAssignment: (id: string) => void;
}

type View = "month" | "week";

const dateLabel = (date: Date) => date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** "Fri, Oct 10, 9:00 AM – 10:30 AM", or "Fri, Oct 10 – Sun, Oct 12 · All day". */
function whenLabel(event: GoogleEvent) {
  if (event.allDay) {
    const first = new Date(`${event.start}T00:00:00`);
    const last = new Date(`${event.end}T00:00:00`);
    last.setDate(last.getDate() - 1); // Google's all-day end date is exclusive
    return `${dateLabel(first)}${last > first ? ` – ${dateLabel(last)}` : ""} · All day`;
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  const endLabel = start.toDateString() === end.toDateString() ? timeLabel(event.end) : `${dateLabel(end)}, ${timeLabel(event.end)}`;
  return `${dateLabel(start)}, ${timeLabel(event.start)} – ${endLabel}`;
}

export default function CalendarView({
  darkMode,
  assignments,
  isLoading = false,
  onSelectAssignment
}: CalendarViewProps) {
  const today = new Date();
  const [view, setView] = useState<View>("month");
  // A day inside the month or week being shown.
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const year = cursor.getFullYear();
  const month = cursor.getMonth(); // 0-based
  const weekStart = new Date(year, month, cursor.getDate() - cursor.getDay()); // Sunday
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const title = view === "month"
    ? cursor.toLocaleString(undefined, { month: "long", year: "numeric" })
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).formatRange(weekStart, new Date(weekEnd.getTime() - 1));
  // The range Google events are fetched for, as numbers so the effect can depend on them.
  const rangeStart = (view === "month" ? new Date(year, month, 1) : weekStart).getTime();
  const rangeEnd = (view === "month" ? new Date(year, month + 1, 1) : weekEnd).getTime();
  const step = (direction: 1 | -1) => setCursor(c => view === "month"
    ? new Date(c.getFullYear(), c.getMonth() + direction, 1)
    : new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7 * direction));

  // Sources the student switched off; saved to their account (CalendarConfig.filteredEvents).
  const [hidden, setHidden] = useState<CalendarSource[]>([]);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<GoogleEvent | null>(null);

  const showCanvas = !hidden.includes("canvas");
  const showGoogle = Boolean(google?.connected) && !hidden.includes("google");

  useEffect(() => {
    fetchHiddenSources().then(setHidden).catch(() => {});
    fetchGoogleStatus().then(setGoogle).catch(() => setGoogleError("Could not check the Google Calendar connection."));
  }, []);

  // Google events are fetched live for the month or week on screen; nothing is stored.
  useEffect(() => {
    if (!showGoogle) return;
    let stale = false;
    setGoogleLoading(true);
    setGoogleError(null);
    fetchGoogleEvents(new Date(rangeStart), new Date(rangeEnd))
      .then(events => { if (!stale) setGoogleEvents(events); })
      .catch(err => {
        if (stale) return;
        setGoogleEvents([]);
        setGoogleError(err instanceof ApiError ? err.message : "Could not load Google Calendar events.");
      })
      .finally(() => { if (!stale) setGoogleLoading(false); });
    return () => { stale = true; };
  }, [showGoogle, rangeStart, rangeEnd]);

  /** Apply at once and save in the background, like the theme picker. */
  const toggleSource = (source: CalendarSource) => {
    const next = hidden.includes(source) ? hidden.filter(s => s !== source) : [...hidden, source];
    setHidden(next);
    saveHiddenSources(next).catch(err => console.error("Could not save calendar filters:", err));
  };

  const generateCalendar = () => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
    const weeks = [];
    let currentWeek = new Array(firstDayOfWeek).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const calendarWeeks = generateCalendar();
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Get assignments for a specific date
  const getAssignmentsForDate = (day: number) => {
    if (!day) return [];
    const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return assignments.filter(a => a.dueDate === dateString);
  };

  const navButton = `p-2 rounded-lg transition-colors ${darkMode ? "text-gray-300 hover:bg-[var(--cp-raised)]" : "text-gray-600 hover:bg-gray-100"}`;
  const muted = darkMode ? "text-gray-300" : "text-gray-700";

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-6"
      aria-busy={isLoading || googleLoading}
      aria-label={isLoading ? "Loading calendar assignments" : "Calendar"}
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" aria-label={`Previous ${view}`} onClick={() => step(-1)} className={navButton}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className={`text-xl font-semibold min-w-44 text-center ${darkMode ? "text-white" : "text-gray-900"}`}>{title}</h2>
            <button type="button" aria-label={`Next ${view}`} onClick={() => step(1)} className={navButton}>
              <ChevronRight className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()))} className={`${navButton} text-sm font-medium`}>
              Today
            </button>

            {/* Month / week switch */}
            <div role="group" aria-label="Calendar view" className={`ml-2 inline-flex rounded-lg border p-0.5 ${darkMode ? "border-gray-600" : "border-gray-300"}`}>
              {(["month", "week"] as const).map(option => (
                <button
                  type="button"
                  key={option}
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                  className={`px-3 py-1 text-sm font-medium rounded-md capitalize transition-colors ${
                    view === option ? "bg-blue-600 text-white" : (darkMode ? "text-gray-300 hover:bg-[var(--cp-raised)]" : "text-gray-600 hover:bg-gray-100")
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Source toggles */}
          <div className={`flex flex-wrap items-center gap-4 text-sm ${muted}`}>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showCanvas} onChange={() => toggleSource("canvas")} className="w-4 h-4 accent-blue-600" />
              Canvas assignments
            </label>
            {google?.configured && (
              <span className="inline-flex items-center gap-2">
                <label className={`inline-flex items-center gap-2 ${google.connected ? "cursor-pointer" : "opacity-60"}`}>
                  <input
                    type="checkbox"
                    checked={showGoogle}
                    disabled={!google.connected}
                    onChange={() => toggleSource("google")}
                    className="w-4 h-4 accent-blue-600"
                  />
                  Google Calendar
                </label>
                {!google.connected && <Link href="/settings" className="text-blue-600 hover:underline">Connect in Settings</Link>}
              </span>
            )}
          </div>
        </div>

        {googleError && <p role="alert" className="mb-4 text-sm text-red-600">{googleError}</p>}

        {view === "week" ? (
          <WeekView
            darkMode={darkMode}
            weekStart={weekStart}
            assignments={showCanvas ? assignments : []}
            events={showGoogle ? googleEvents : []}
            onSelectAssignment={onSelectAssignment}
            onSelectEvent={setSelectedEvent}
          />
        ) : (
        /* Calendar Grid */
          <div className={`rounded-lg shadow-sm overflow-hidden mb-6 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`}>
            {/* Week day headers */}
            <div className={`grid grid-cols-7 border-b ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
              {weekDays.map(day => (
                <div key={day} className={`p-3 text-center text-sm font-medium ${darkMode ? "text-gray-300 bg-[var(--cp-raised)]" : "text-gray-700 bg-gray-50"}`}>
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7">
              {calendarWeeks.flat().map((day, index) => {
                const dayAssignments = day && showCanvas ? getAssignmentsForDate(day) : [];
                const dayEvents = day && showGoogle ? eventsOnDay(googleEvents, new Date(year, month, day)) : [];
                const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

                return (
                  <div
                    key={index}
                    aria-current={isToday ? "date" : undefined}
                    className={`min-h-28 p-2 border-r border-b ${darkMode ? "border-gray-700" : "border-gray-200"} ${
                      day ? (darkMode ? "bg-[var(--cp-card)]" : "bg-white") : (darkMode ? "bg-[var(--cp-page)]" : "bg-gray-50")
                    } ${isToday ? (darkMode ? "bg-blue-900/30" : "bg-blue-50") : ""}`}
                  >
                    {day && (
                      <>
                        <div className={`text-sm font-medium mb-2 ${
                          isToday ? "text-blue-600" : (darkMode ? "text-white" : "text-gray-900")
                        }`}>
                          {day}
                        </div>

                        {/* Study blocks */}
                        <div className="space-y-1">
                          {isLoading && showCanvas && [5, 6, 8, 10].includes(day) ? (
                            <Skeleton className={`h-5 w-full ${darkMode ? "bg-gray-600" : "bg-gray-200"}`} />
                          ) : (
                            dayAssignments.map(assignment => (
                              <button
                                type="button"
                                key={assignment.id}
                                onClick={() => onSelectAssignment(assignment.id)}
                                className={`block w-full text-left text-xs p-1 rounded cursor-pointer ${priorityChip(assignment.priority)}`}
                              >
                                {assignment.title}
                              </button>
                            ))
                          )}

                          {/* Google Calendar events, edged in their calendar's colour */}
                          {dayEvents.map(event => (
                            <button
                              type="button"
                              key={event.id}
                              onClick={() => setSelectedEvent(event)}
                              style={{ borderLeftColor: event.color }}
                              className={`block w-full text-left text-xs p-1 rounded border-l-4 truncate cursor-pointer ${
                                darkMode ? "bg-[var(--cp-raised)] text-gray-200 hover:bg-gray-700" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                              }`}
                            >
                              {!event.allDay && <span className="font-medium mr-1">{timeLabel(event.start)}</span>}
                              {event.title}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Smart Scheduler Button */}
        <div className="flex justify-center">
          <button className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white py-4 px-12 rounded-lg shadow-lg transition-all transform hover:scale-105 text-lg font-semibold">
            Run Smart Scheduler
          </button>
        </div>
      </div>

      {selectedEvent && <EventDialog event={selectedEvent} darkMode={darkMode} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}

function EventDialog({ event, darkMode, onClose }: { event: GoogleEvent; darkMode: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const muted = darkMode ? "text-gray-300" : "text-gray-600";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-event-title"
        onClick={e => e.stopPropagation()}
        className={`rounded-lg shadow-xl max-w-md w-full p-6 space-y-3 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="google-event-title" className={`text-lg font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>{event.title}</h2>
          <button type="button" aria-label="Close event details" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className={`text-sm ${muted}`}>{whenLabel(event)}</p>
        <p className={`flex items-center gap-2 text-sm ${muted}`}>
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: event.color }} aria-hidden="true" />
          {event.calendarName}
        </p>
        {event.location && (
          <p className={`flex items-center gap-2 text-sm ${muted}`}>
            <MapPin className="w-4 h-4 shrink-0" />
            {event.location}
          </p>
        )}
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            Open in Google Calendar <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
