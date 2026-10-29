import { useEffect, useRef } from "react";
import { type GoogleEvent, eventsOnDay, timeLabel, timedLayout } from "@/lib/googleCalendarApi";

import type { Assignment as SharedAssignment } from "@/lib/assignmentsApi";

export type CalendarAssignment = Pick<SharedAssignment, "id" | "title" | "dueDate" | "dueAt" | "priority">;

interface WeekViewProps {
  darkMode: boolean;
  /** The Sunday the week starts on. */
  weekStart: Date;
  /** Already filtered by the source toggles. */
  assignments: CalendarAssignment[];
  events: GoogleEvent[];
  onSelectAssignment: (id: string) => void;
  onSelectEvent: (event: GoogleEvent) => void;
}

const HOUR_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const COLUMNS = { gridTemplateColumns: "4rem repeat(7, minmax(0, 1fr))" };

export const priorityChip = (priority: CalendarAssignment["priority"]) =>
  priority === "High"
    ? "bg-red-100 text-red-700 hover:bg-red-200"
    : priority === "Medium"
      ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
      : "bg-green-100 text-green-700 hover:bg-green-200";

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function WeekView({ darkMode, weekStart, assignments, events, onSelectAssignment, onSelectEvent }: WeekViewProps) {
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
  const nowTop = (now.getHours() + now.getMinutes() / 60) * HOUR_PX;

  // Open at 7 AM rather than midnight; the rest of the day is a scroll away.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX;
  }, []);

  const border = darkMode ? "border-gray-700" : "border-gray-200";
  const muted = darkMode ? "text-gray-400" : "text-gray-500";
  const hourLine = darkMode ? "rgb(55 65 81)" : "rgb(229 231 235)";
  const eventChip = darkMode ? "bg-[var(--cp-raised)] text-gray-200 hover:bg-gray-700" : "bg-gray-100 text-gray-800 hover:bg-gray-200";

  return (
    <div className={`rounded-lg shadow-sm overflow-hidden mb-6 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`}>
      {/* One scroller for headers and hours keeps their columns aligned with or without a scrollbar. */}
      <div ref={scroller} className="max-h-[40rem] overflow-y-auto">
        <div className={`sticky top-0 z-20 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`}>
          {/* Day headers */}
          <div className={`grid border-b ${border}`} style={COLUMNS}>
            <div />
            {days.map(day => {
              const isToday = day.toDateString() === now.toDateString();
              return (
                <div key={day.getTime()} aria-current={isToday ? "date" : undefined} className={`p-2 text-center border-l ${border} ${darkMode ? "bg-[var(--cp-raised)]" : "bg-gray-50"}`}>
                  <div className={`text-xs font-medium ${muted}`}>{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
                  <div className={`text-lg font-semibold ${isToday ? "text-blue-600" : (darkMode ? "text-white" : "text-gray-900")}`}>{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* All-day row: Canvas due dates (with their due time) and all-day Google events */}
          <div className={`grid border-b ${border}`} style={COLUMNS}>
            <div className={`p-2 text-xs text-right ${muted}`}>All day</div>
            {days.map(day => (
              <div key={day.getTime()} className={`p-1 space-y-1 min-h-10 border-l ${border}`}>
                {assignments.filter(a => a.dueDate === dateKey(day)).map(assignment => (
                  <button
                    type="button"
                    key={assignment.id}
                    title={assignment.title}
                    onClick={() => onSelectAssignment(assignment.id)}
                    className={`block w-full text-left text-xs p-1 rounded truncate cursor-pointer ${priorityChip(assignment.priority)}`}
                  >
                    {assignment.dueAt && <span className="font-medium mr-1">{timeLabel(assignment.dueAt)}</span>}
                    {assignment.title}
                  </button>
                ))}
                {eventsOnDay(events, day).filter(e => e.allDay).map(event => (
                  <button
                    type="button"
                    key={event.id}
                    title={event.title}
                    onClick={() => onSelectEvent(event)}
                    style={{ borderLeftColor: event.color }}
                    className={`block w-full text-left text-xs p-1 rounded border-l-4 truncate cursor-pointer ${eventChip}`}
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Hour grid */}
        <div className="grid" style={COLUMNS}>
          <div>
            {HOURS.map(hour => (
              <div key={hour} style={{ height: HOUR_PX }} className={`pr-2 pt-0.5 text-right text-xs ${muted}`}>
                {new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" })}
              </div>
            ))}
          </div>
          {days.map(day => (
            <div
              key={day.getTime()}
              className={`relative border-l ${border}`}
              style={{
                height: 24 * HOUR_PX,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${HOUR_PX - 1}px, ${hourLine} ${HOUR_PX - 1}px ${HOUR_PX}px)`
              }}
            >
              {timedLayout(events, day).map(({ event, top, minutes, lane, lanes }) => (
                <button
                  type="button"
                  key={event.id}
                  title={`${timeLabel(event.start)} ${event.title}`}
                  onClick={() => onSelectEvent(event)}
                  style={{
                    top: (top / 60) * HOUR_PX,
                    height: (minutes / 60) * HOUR_PX - 2,
                    left: `${(lane / lanes) * 100}%`,
                    width: `calc(${100 / lanes}% - 2px)`,
                    borderLeftColor: event.color
                  }}
                  className={`absolute overflow-hidden text-left text-xs px-1 py-0.5 rounded border-l-4 cursor-pointer ${eventChip}`}
                >
                  <span className="block font-medium truncate">{event.title}</span>
                  <span className={`block truncate ${muted}`}>{timeLabel(event.start)}</span>
                </button>
              ))}
              {day.toDateString() === now.toDateString() && (
                <div aria-hidden="true" className="absolute left-0 right-0 h-0.5 bg-red-500 z-10" style={{ top: nowTop }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
