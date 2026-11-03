// UC10 task-breakdown rules. Pure -- no database, runs in the normal `pnpm test`.
import { test, expect } from "vitest";
import { decompose } from "@canvasplus/database/queries/decomposeModel";

test("breaks a detailed description into steps", () => {
  const desc = "<p>Write a report on the project. Add a testing section. Submit a PDF to Canvas.</p>";
  const steps = decompose("Final Report", desc);
  expect(steps.length).toBeGreaterThanOrEqual(2);
  expect(steps.length).toBeLessThanOrEqual(6);
  expect(steps[0]).toMatch(/report/i);
  expect(decompose("Final Report", desc)).toEqual(decompose("Final Report", desc));
});

test("a thin description scaffolds a checklist from the title", () => {
  const steps = decompose("Reading Reflection 2", "<p>One-page reflection.</p>");
  expect(steps).toContain("Review the assignment requirements");
  expect(steps.some(s => s.includes("Reading Reflection 2"))).toBe(true);
});

test("empty input still yields a usable checklist ending in submit", () => {
  const steps = decompose("Team Meeting Minutes", "");
  expect(steps.length).toBeGreaterThanOrEqual(2);
  expect(steps[steps.length - 1]).toMatch(/submit/i);
});

test("strips leading filler and caps the list at six", () => {
  const desc = "You must do step one here now. Please do step two here now. Be sure to do step three now. Remember to do step four now. Then do step five here now. Next do step six here now. Finally do step seven now.";
  const steps = decompose("X", desc);
  expect(steps.length).toBeLessThanOrEqual(6);
  expect(steps[0]).toBe("Do step one here now");
});
