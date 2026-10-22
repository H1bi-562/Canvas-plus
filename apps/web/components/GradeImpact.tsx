// src/components/GradeImpact.tsx
// UC14 – where an assignment sits in its course grade: its Canvas grading
// category and weight, its share of the final grade, and a what-if score the
// student can type or drag to watch the course grade move. Nothing is saved.

import { useId, useState } from "react";
import type { Assignment } from "@/lib/assignmentsApi";
import { courseGrade, countsTowardGrade, shareOfGrade } from "@/lib/gradeImpact";

interface GradeImpactProps {
  assignment: Assignment;
  /** Every assignment the student has; the panel uses this one's course. */
  assignments: Assignment[];
  darkMode: boolean;
}

const percent = (value: number) => `${value.toFixed(1)}%`;
const clamp = (value: number) => Math.max(0, Math.min(100, value));

export default function GradeImpact({ assignment, assignments, darkMode }: GradeImpactProps) {
  const inputId = useId();
  const points = assignment.points ?? 0;
  const [whatIf, setWhatIf] = useState(String(assignment.score ?? points));

  const ink = darkMode ? "text-white" : "text-gray-900";
  const muted = darkMode ? "text-gray-300" : "text-gray-600";
  const course = assignments.filter((a) => a.courseID === assignment.courseID);

  const notCounted =
    !course.some((a) => a.groupID) ? "Grade categories arrive from Canvas with the next sync." :
      assignment.completionStatus === "excused" ? "Excused, so it does not count toward your grade." :
        !countsTowardGrade(assignment) ? "Canvas leaves this out of your course grade." :
          !points ? "Worth no points, so it cannot change your grade." : null;

  const share = shareOfGrade(assignment, course) * 100;
  const current = courseGrade(course);
  const score = Number(whatIf);
  const validScore = whatIf.trim() !== "" && Number.isFinite(score) && score >= 0;
  const projected = validScore ? courseGrade(course, { [assignment.id]: score }) : null;
  const delta = current != null && projected != null ? projected - current : null;

  return (
    <section className={`rounded-lg p-4 space-y-3 ${darkMode ? "bg-[var(--cp-page)]" : "bg-gray-50"}`} aria-label="Grade impact">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className={`font-medium ${ink}`}>Grade impact</h3>
        {!notCounted && (
          <span className={`text-sm ${muted}`}>
            {assignment.groupName} · {assignment.groupsWeighted ? `${assignment.groupWeight}% of grade` : "graded by total points"}
          </span>
        )}
      </div>

      {notCounted ? (
        <p className={`text-sm ${muted}`}>{notCounted}</p>
      ) : (
        <>
          <p className={`text-sm ${ink}`}>
            Worth <strong>{percent(share)}</strong> of your final grade
            <span className={muted}> (each point ≈ {(share / points).toFixed(2)}%)</span>
          </p>
          <p className={`text-sm ${muted}`}>
            {current == null ? "No graded work in this course yet." : `Current course grade: ${percent(current)}`}
            {assignment.score != null && ` · You scored ${assignment.score}/${points}`}
          </p>

          <div>
            <label htmlFor={inputId} className={`text-sm font-medium ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
              What if you score
            </label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="range"
                min={0}
                max={points}
                step={points <= 20 ? 0.5 : 1}
                value={validScore ? Math.min(score, points) : 0}
                onChange={(e) => setWhatIf(e.target.value)}
                aria-label="What-if score"
                className="flex-1 accent-blue-600"
              />
              <input
                id={inputId}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={whatIf}
                onChange={(e) => setWhatIf(e.target.value)}
                className={`w-20 text-sm px-2 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  darkMode ? "bg-[var(--cp-card)] border-gray-600 text-white" : "bg-white border-gray-300 text-gray-900"
                }`}
              />
              <span className={`text-sm shrink-0 ${muted}`}>/ {points}</span>
            </div>
          </div>

          {projected != null && (
            <div className="space-y-1.5">
              <p className={`text-sm ${ink}`}>
                Course grade {current != null && <>{percent(current)} → </>}<strong>{percent(projected)}</strong>
                {delta != null && (
                  <span className={`ml-1.5 font-medium ${
                    delta > 0.05 ? (darkMode ? "text-green-300" : "text-green-700")
                      : delta < -0.05 ? (darkMode ? "text-red-300" : "text-red-700") : muted
                  }`}>
                    ({delta >= 0 ? "+" : "−"}{Math.abs(delta).toFixed(1)})
                  </span>
                )}
              </p>
              {/* The projected grade as a bar, with a tick at the current grade. */}
              <div
                role="img"
                aria-label={`Course grade ${current != null ? `${percent(current)} now, ` : ""}${percent(projected)} with this score`}
                className={`relative h-2.5 rounded-full ${darkMode ? "bg-gray-700" : "bg-gray-200"}`}
              >
                <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${clamp(projected)}%` }} />
                {current != null && (
                  <div
                    className={`absolute -top-1 h-4.5 w-0.5 rounded ${darkMode ? "bg-white" : "bg-gray-900"}`}
                    style={{ left: `calc(${clamp(current)}% - 1px)` }}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
