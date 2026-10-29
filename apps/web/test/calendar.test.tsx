import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CalendarView from "../app/(dashboard)/calendar/_components/CalendarView";
import { eventsOnDay, timeLabel, timedLayout, type GoogleEvent } from "@/lib/googleCalendarApi";

const mocks = vi.hoisted(() => ({
  status: vi.fn(async () => ({ configured: false, connected: false })),
  events: vi.fn(async (_start: Date, _end: Date): Promise<unknown[]> => []),
  save: vi.fn(async () => ({}))
}));
vi.mock("@/lib/googleCalendarApi", async importOriginal => ({
  ...await importOriginal<object>(),
  fetchGoogleStatus: mocks.status,
  fetchGoogleEvents: mocks.events,
  fetchHiddenSources: async () => [],
  saveHiddenSources: mocks.save
}));
afterEach(() => { cleanup(); vi.resetAllMocks(); }); // reset restores the vi.fn defaults above

const event = (start: string, end: string, allDay = false): GoogleEvent => ({
  id: start, calendarName: "Personal", color: "#33b679", title: "Shift", start, end, allDay, location: null, htmlLink: null
});
const at = (day: number, hour = 0) => new Date(2026, 9, day, hour).toISOString(); // local time, October 2026
const days = (e: GoogleEvent) => [8, 9, 10, 11, 12, 13, 14].filter(d => eventsOnDay([e], new Date(2026, 9, d)).length);

test("eventsOnDay places events on every local day they overlap", () => {
  expect(days(event(at(10, 9), at(10, 10)))).toEqual([10]);
  expect(days(event(at(10, 23), at(11, 1)))).toEqual([10, 11]); // crosses midnight
  expect(days(event(at(10, 22), at(11, 0)))).toEqual([10]); // ends exactly at midnight
  expect(days(event(at(10), at(10)))).toEqual([10]); // zero length
  expect(days(event("2026-10-10", "2026-10-11", true))).toEqual([10]);
  expect(days(event("2026-10-10", "2026-10-13", true))).toEqual([10, 11, 12]); // end date is exclusive
});

test("timedLayout clips events to the day and puts overlaps side by side", () => {
  const layout = timedLayout([
    event(at(10, 9), at(10, 11)),
    event(at(10, 10), at(10, 12)), // overlaps the 9-11 event
    event(at(9, 23), at(10, 1)), // started the night before
    event(at(10, 13), at(10, 13)), // zero length gets a minimum height
    event("2026-10-10", "2026-10-11", true) // all-day events belong to the all-day row
  ], new Date(2026, 9, 10));
  expect(layout.map(l => [l.top, l.minutes, l.lane])).toEqual([[0, 60, 0], [540, 120, 0], [600, 120, 1], [780, 15, 0]]);
  expect(layout.every(l => l.lanes === 2)).toBe(true);
});

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("the Canvas toggle hides assignments, saves the choice, and today follows the shown month", async () => {
  await act(async () => {
    render(<CalendarView darkMode={false} assignments={[{ id: "a1", title: "Essay", dueDate: todayKey(), dueAt: null, priority: "High" }]} onSelectAssignment={() => {}} />);
  });
  expect(screen.getByRole("button", { name: "Essay" })).toBeTruthy();
  expect(document.querySelector("[aria-current=date]")?.textContent).toContain(String(new Date().getDate()));
  expect(screen.queryByLabelText("Google Calendar")).toBeNull(); // server not configured

  fireEvent.click(screen.getByLabelText("Canvas assignments"));
  expect(screen.queryByRole("button", { name: "Essay" })).toBeNull();
  expect(mocks.save).toHaveBeenCalledWith(["canvas"]);

  fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  expect(document.querySelector("[aria-current=date]")).toBeNull();
});

test("connected Google events show on the grid and open a details dialog", async () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9);
  mocks.status.mockResolvedValueOnce({ configured: true, connected: true });
  mocks.events.mockResolvedValueOnce([{ ...event(start.toISOString(), new Date(start.getTime() + 3600_000).toISOString()), htmlLink: "https://calendar.google.com/event?eid=1" }]);
  await act(async () => {
    render(<CalendarView darkMode={false} assignments={[]} onSelectAssignment={() => {}} />);
  });

  fireEvent.click(screen.getByRole("button", { name: /Shift/ }));
  expect(screen.getByRole("dialog").textContent).toContain("Personal");
  expect(screen.getByRole("link", { name: /Open in Google Calendar/ }).getAttribute("href")).toBe("https://calendar.google.com/event?eid=1");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();

  fireEvent.click(screen.getByLabelText("Google Calendar"));
  expect(screen.queryByRole("button", { name: /Shift/ })).toBeNull();
});

test("week view places timed events on the hour grid, due dates in the all-day row, and steps by a week", async () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30);
  const dueAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).toISOString();
  mocks.status.mockResolvedValue({ configured: true, connected: true });
  mocks.events.mockResolvedValue([event(start.toISOString(), new Date(start.getTime() + 3600_000).toISOString())]);
  await act(async () => {
    render(<CalendarView darkMode={false} assignments={[{ id: "a1", title: "Essay", dueDate: todayKey(), dueAt, priority: "High" }]} onSelectAssignment={() => {}} />);
  });

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "week" })); });
  expect(screen.getByRole("button", { name: "week" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: /Shift/ }).style.top).toBe(`${9.5 * 48}px`);
  expect(screen.getByRole("button", { name: /Essay/ }).textContent).toContain(timeLabel(dueAt));
  const [from, to] = mocks.events.mock.lastCall!;
  expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(7);

  const thisWeek = screen.getByRole("heading").textContent;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Next week" })); });
  expect(screen.getByRole("heading").textContent).not.toBe(thisWeek);
  expect(screen.queryByRole("button", { name: /Essay/ })).toBeNull();
});
