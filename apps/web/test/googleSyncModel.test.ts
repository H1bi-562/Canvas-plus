// UC3 outbound sync rules. Pure -- no database, no Google, runs in the normal `pnpm test`.
import { test, expect } from "vitest";
import { shouldSync, toGoogleEvent, targetCalendar, SOURCE_NOTE, MAX_EVENT_DAYS } from "@canvasplus/database/queries/googleSyncModel";

const times = { eventStart: "2026-11-20T18:00:00.000Z", eventEnd: "2026-11-20T19:30:00.000Z" };

test("nothing is pushed unless the student opted in and Google is connected", () => {
  expect(shouldSync({ syncToGoogle: true }, { connected: true }, {})).toBe(true);
  expect(shouldSync({ syncToGoogle: false }, { connected: true }, {})).toBe(false);
  expect(shouldSync({ syncToGoogle: true }, { connected: false }, {})).toBe(false);
  expect(shouldSync({}, {}, {})).toBe(false);
});

test("an event already in Google is never pushed again", () => {
  expect(shouldSync({ syncToGoogle: true }, { connected: true }, { googleEventID: "g1" })).toBe(false);
  expect(shouldSync({ syncToGoogle: true }, { connected: true }, { googleEventID: null })).toBe(true);
});

test("the body carries the times as instants Google accepts", () => {
  const body = toGoogleEvent({ title: "Draft the essay", ...times });
  expect(body.start).toEqual({ dateTime: "2026-11-20T18:00:00.000Z" });
  expect(body.end).toEqual({ dateTime: "2026-11-20T19:30:00.000Z" });
  expect(body.summary).toBe("Draft the essay");
});

test("Date objects work as well as ISO strings", () => {
  const body = toGoogleEvent({ title: "Lab", eventStart: new Date(times.eventStart), eventEnd: new Date(times.eventEnd) });
  expect(body.start.dateTime).toBe("2026-11-20T18:00:00.000Z");
});

test("an untitled event falls back to the assignment, never to (No title)", () => {
  expect(toGoogleEvent({ title: null, ...times }, { assignmentTitle: "Essay 2" }).summary).toBe("Essay 2");
  expect(toGoogleEvent({ title: "   ", ...times }, { assignmentTitle: "Essay 2" }).summary).toBe("Essay 2");
  expect(toGoogleEvent({ ...times }, {}).summary).toBe("CanvasPlus event");
});

test("the description names CanvasPlus and links back to Canvas when there is a link", () => {
  expect(toGoogleEvent({ title: "Lab", ...times }, {}).description).toBe(SOURCE_NOTE);
  const linked = toGoogleEvent({ title: "Lab", ...times }, { htmlURL: "https://canvas.test/a/1" });
  expect(linked.description).toContain(SOURCE_NOTE);
  expect(linked.description).toContain("https://canvas.test/a/1");
});

test("times that cannot make a real event are refused before Google is called", () => {
  expect(() => toGoogleEvent({ title: "x", eventStart: null, eventEnd: times.eventEnd })).toThrow(/needs a start and an end/);
  expect(() => toGoogleEvent({ title: "x", eventStart: "not a date", eventEnd: times.eventEnd })).toThrow(/needs a start and an end/);
  expect(() => toGoogleEvent({ title: "x", eventStart: times.eventEnd, eventEnd: times.eventStart })).toThrow(/end has to be after its start/);
  expect(() => toGoogleEvent({ title: "x", eventStart: times.eventStart, eventEnd: times.eventStart })).toThrow(/end has to be after its start/);
});

test("an absurdly long event is refused, which is what a mistyped year looks like", () => {
  const start = new Date("2026-11-20T18:00:00.000Z");
  const tooLong = new Date(start.getTime() + (MAX_EVENT_DAYS + 1) * 86400000).toISOString();
  expect(() => toGoogleEvent({ title: "x", eventStart: start.toISOString(), eventEnd: tooLong })).toThrow(/cannot be longer than/);
  const justUnder = new Date(start.getTime() + (MAX_EVENT_DAYS - 1) * 86400000).toISOString();
  expect(toGoogleEvent({ title: "x", eventStart: start.toISOString(), eventEnd: justUnder }).summary).toBe("x");
});

test("a very long title is cut rather than rejected", () => {
  const body = toGoogleEvent({ title: "x".repeat(2000), ...times });
  expect(body.summary.length).toBe(1024);
});

test("the target calendar is the student's default, or primary when they have none", () => {
  expect(targetCalendar({ defaultCalendar: "work@group.calendar.google.com" })).toBe("work@group.calendar.google.com");
  expect(targetCalendar({ defaultCalendar: "  " })).toBe("primary");
  expect(targetCalendar({})).toBe("primary");
});
