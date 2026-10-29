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

    for (const { course, groups = [], assignments } of byCourse) {
      // Course rows are shared across students, so only shared metadata is
      // written here -- never "grade".
      const { rows: [courseRow] } = await client.query(
        `INSERT INTO "Course"
           (name, "courseCode", department, semester, "canvasBaseURL", "canvasCourseID", "applyGroupWeights")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ("canvasBaseURL", "canvasCourseID") DO UPDATE SET
           name         = EXCLUDED.name,
           "courseCode" = EXCLUDED."courseCode",
           department   = COALESCE(EXCLUDED.department, "Course".department),
           semester     = COALESCE(EXCLUDED.semester, "Course".semester),
           "applyGroupWeights" = EXCLUDED."applyGroupWeights",
           "updated_at" = NOW()
         RETURNING id`,
        [
          course.name,
          course.course_code || null,
          departmentFrom(course.course_code),
          course.term?.name || null,
          baseURL,
          String(course.id),
          Boolean(course.apply_assignment_group_weights)
        ]
      );

      // UC14: the course's grading categories, shared like the course itself.
      const groupIDs = new Map();
      for (const group of groups) {
        const { rows: [groupRow] } = await client.query(
          `INSERT INTO "AssignmentGroup" ("courseID", "canvasGroupID", name, weight)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ("courseID", "canvasGroupID") DO UPDATE SET
             name = EXCLUDED.name, weight = EXCLUDED.weight
           RETURNING id`,
          [courseRow.id, String(group.id), group.name, Number(group.group_weight) || 0]
        );
        groupIDs.set(String(group.id), groupRow.id);
      }

      for (const a of assignments) {
        // Canvas's view of the submission is refreshed every sync. The student's
        // own "completedAt" is deliberately absent here, so sync never clears it.
        const sub = a.submission || {};

        // xmax = 0 only on a freshly inserted row, which tells created from updated.
        const { rows: [row] } = await client.query(
          `INSERT INTO "Assignment"
             ("userID", "courseID", title, description, points, "dueAt", "availableUntil",
              "canvasAssignmentID", "htmlURL", "syncedAt",
              "submittedAt", "submissionState", late, missing, excused, score, "groupID")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13, $14, $15, $16)
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
             excused           = EXCLUDED.excused,
             score             = EXCLUDED.score,
             "groupID"         = EXCLUDED."groupID"
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
            sub.excused ?? null,
            sub.score ?? null,
            // No group for work Canvas leaves out of the final grade, so it never counts.
            a.omit_from_final_grade ? null : groupIDs.get(String(a.assignment_group_id)) ?? null
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

/** When this student's assignments were last pulled from Canvas, or null if never. */
export async function lastSyncedAt(userID) {
  const { rows: [row] } = await pool.query(
    "SELECT MAX(\"syncedAt\") AS at FROM \"Assignment\" WHERE \"userID\" = $1",
    [userID]
  );
  return row.at;
}
