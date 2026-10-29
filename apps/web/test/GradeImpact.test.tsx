import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import GradeImpact from "@/components/GradeImpact";
import type { Assignment } from "@/lib/assignmentsApi";

afterEach(cleanup);

const assignment = (id: string, extra: Partial<Assignment>) => ({
  id, courseID: "c1", points: 10, score: null, groupID: "g1", groupName: "Quizzes", groupWeight: 40,
  groupsWeighted: true, completionStatus: "pending", ...extra
}) as Assignment;

const quiz = assignment("quiz", {});
const course = [
  quiz,
  assignment("graded", { score: 8 }),
  assignment("project", { points: 100, score: 90, groupID: "g2", groupName: "Projects", groupWeight: 60 })
];

test("shows the category, share of grade, and a what-if course grade", () => {
  render(<GradeImpact assignment={quiz} assignments={course} darkMode={false} />);
  expect(screen.getByText("Quizzes · 40% of grade")).toBeTruthy();
  expect(screen.getByText("20.0%")).toBeTruthy(); // 40% split across two 10-point quizzes
  expect(screen.getByText(/Current course grade: 86.0%/)).toBeTruthy(); // 40 × 80% + 60 × 90%

  fireEvent.change(screen.getByLabelText("What if you score"), { target: { value: "5" } });
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Course grade 86.0% now, 80.0% with this score");
  expect(screen.getByText("(−6.0)")).toBeTruthy();
});

test("explains when an assignment cannot move the grade", () => {
  render(<GradeImpact assignment={course[1]} assignments={course.map((a) => ({ ...a, groupID: null }))} darkMode />);
  expect(screen.getByText(/arrive from Canvas with the next sync/)).toBeTruthy();
});
