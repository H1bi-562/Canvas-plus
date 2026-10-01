import { pool } from "../client";

function departmentFrom(courseCode) {
  const match = (courseCode || "").match(/^([A-Z]{2,5})\b/);
  return match ? match[1] : null;
}

function toPoints(pointsPossible) {
  return pointsPossible == null ? null : Math.round(Number(pointsPossible));
}

export async function storeAssignments(userID, baseURL, byCourse) {
  const client = await pool.connect();
  let created = 0;
  let updated = 0;
  try {
    await client.query("BEGIN");

    for (const { course, assignments } of byCourse) {
      // Course rows are shared across students, so only shared metadata is
      // written here -- never "grade".
      const { rows: [courseRow] } = await client.query(
        `INSERT INTO "Course"
           (name, "courseCode", department, semester, "canvasBaseURL", "canvasCourseID")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("canvasBaseURL", "canvasCourseID") DO UPDATE SET
           name         = EXCLUDED.name,
           "courseCode" = EXCLUDED."courseCode",
           department   = COALESCE(EXCLUDED.department, "Course".department),
           semester     = COALESCE(EXCLUDED.semester, "Course".semester),
           "updated_at" = NOW()
         RETURNING id`,
        [
          course.name,
          course.course_code || null,
          departmentFrom(course.course_code),
          course.term?.name || null,
          baseURL,
          String(course.id)
        ]
      );

      for (const a of assignments) {
        // Canvas's view of the submission is refreshed every sync. The student's
        // own "completedAt" is deliberately absent here, so sync never clears it.
        const sub = a.submission || {};

        // xmax = 0 only on a freshly inserted row, which tells created from updated.
        const { rows: [row] } = await client.query(
          `INSERT INTO "Assignment"
             ("userID", "courseID", title, description, points, "dueAt", "availableUntil",
              "canvasAssignmentID", "htmlURL", "syncedAt",
              "submittedAt", "submissionState", late, missing, excused)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13, $14)
           ON CONFLICT ("userID", "canvasAssignmentID") DO UPDATE SET
             "courseID"        = EXCLUDED."courseID",
             title             = EXCLUDED.title,
             description       = EXCLUDED.description,
             points            = EXCLUDED.points,
             "dueAt"           = EXCLUDED."dueAt",
             "availableUntil"  = EXCLUDED."availableUntil",
             "htmlURL"         = EXCLUDED."htmlURL",
             "syncedAt"        = NOW(),
             "submittedAt"     = EXCLUDED."submittedAt",
             "submissionState" = EXCLUDED."submissionState",
             late              = EXCLUDED.late,
             missing           = EXCLUDED.missing,
             excused           = EXCLUDED.excused
           RETURNING (xmax = 0) AS inserted`,
          [
            userID,
            courseRow.id,
            a.name,
            a.description || null,
            toPoints(a.points_possible),
            a.due_at || null,
            a.lock_at || null,
            String(a.id),
            a.html_url || null,
            sub.submitted_at || null,
            sub.workflow_state || null,
            sub.late ?? null,
            sub.missing ?? null,
            sub.excused ?? null
          ]
        );
        if (row.inserted) created += 1; else updated += 1;
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    courses:     byCourse.length,
    assignments: created + updated,
    created,
    updated,
    syncedAt:    new Date().toISOString()
  };
}
