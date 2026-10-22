import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import PriorityList, { dueIn, type PriorityItem } from "../src/PriorityList";

afterEach(cleanup);

const item = (id: string, rank: number | null, score: number | null = 50): PriorityItem => ({
  id, title: id, courseCode: "CECS 491", courseName: "Senior Project", dueAt: null,
  priorityScore: score, priorityRank: rank, priorityReason: rank ? "Due soon" : null
});

test("shows the top-ranked open work in rank order and hides finished work", () => {
  const onSelect = vi.fn();
  const items = [item("third", 3, 30), item("done", null, null), item("first", 1, 90), item("second", 2, 55)];
  render(<PriorityList items={items} darkMode={false} limit={2} onSelect={onSelect} />);
  const buttons = screen.getAllByRole("button");
  expect(buttons.map((b) => b.textContent)).toEqual([
    expect.stringContaining("first"),
    expect.stringContaining("second")
  ]);
  expect(buttons[0].textContent).toContain("High · 90");
  expect(buttons[1].textContent).toContain("Medium · 55");
  expect(screen.getByText("3 open")).toBeTruthy();
  fireEvent.click(buttons[1]);
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(items[3]);
});

test("empty and error states", () => {
  render(<PriorityList items={[item("done", null)]} darkMode onSelect={() => {}} />);
  expect(screen.getByText(/All caught up/)).toBeTruthy();
  cleanup();
  render(<PriorityList items={[]} darkMode={false} error="Could not load" onSelect={() => {}} />);
  expect(screen.getByRole("alert").textContent).toBe("Could not load");
});

test("due phrases", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
  expect(dueIn(null, now)).toBe("no due date");
  expect(dueIn(at(5), now)).toBe("due in 5h");
  expect(dueIn(at(30), now)).toBe("due in 1 day");
  expect(dueIn(at(-50), now)).toBe("2 days overdue");
});
