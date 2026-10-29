// UC13 summarizer rules. Pure -- no database, runs in the normal `pnpm test`.
import { test, expect } from "vitest";
import { summarize, summarizeAssignment, htmlToText } from "@canvasplus/database/queries/summarizeModel";

test("strips HTML and decodes basic entities", () => {
  expect(htmlToText("<p>a &amp; b&nbsp;c</p>")).toBe("a & b c");
});

test("a short description is returned as-is (cleaned)", () => {
  expect(summarize("<p>Read chapter 4.</p>")).toBe("Read chapter 4.");
});

test("an empty description falls back to the title", () => {
  expect(summarizeAssignment({ title: "Reading Reflection 2", description: "" }))
    .toBe("Assignment: Reading Reflection 2.");
});

test("a long description is reduced to its key sentences, deterministically", () => {
  const desc = "<p>Write a 3-page reflection on the assigned reading. Discuss the main argument and whether you agree. You must cite at least two sources in APA format. This is due Friday at 11:59 PM and is worth 10 points. Late submissions lose 10% per day. Upload a PDF to Canvas.</p>";
  const out = summarize(desc, { maxSentences: 2 });
  expect(out.length).toBeGreaterThan(0);
  expect(out.length).toBeLessThanOrEqual(400);
  expect(out.split(/[.!?]/).filter(s => s.trim()).length).toBeLessThanOrEqual(2);
  expect(out).toContain("reflection");
  expect(summarize(desc)).toBe(summarize(desc));
});

test("empty input yields empty output", () => {
  expect(summarize("")).toBe("");
  expect(summarizeAssignment({ title: "", description: "" })).toBe("");
});
