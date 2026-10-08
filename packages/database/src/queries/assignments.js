import { pool } from "../client";
import { HttpError } from "../errors.js";
import * as progress from "./assignmentProgress.js";
import * as estimate from "./estimate.js";


export async function listAssignments(userId, query = {}) {
  const { courseID } = query;

  try {
    let query = `
      SELECT
        a.id,
        a.title,
        a.description,
        a.points,
        a."dueAt",
        a."availableUntil",
        a."courseID",
        c.name         AS "courseName",
        c.department,
        c."courseCode",
        a."htmlURL",
        a."canvasAssignmentID",
        -- Demo rows come from services/demoData.js; the UI labels them.
        (c."canvasBaseURL" = 'demo://canvas-plus') AS "isDemo",
        ad.summary,
        ad.subtasks,
        ad."priorityScore",
        -- UC21 inputs: the student's estimate, Canvas's submission, and "Mark done"
        ad."estimatedMinutes",
        ad."estimateSource",
        a."submittedAt",
        a."submissionState",
        a.late,
        a.missing,
        a.excused,
        a."completedAt",
        COALESCE(logged.seconds, 0)::INTEGER AS "loggedSeconds"
      FROM "Assignment" a
      JOIN "Course" c ON c.id = a."courseID"
      LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
      -- Active study time from finished sessions on this assignment (UC24).
      LEFT JOIN LATERAL (
        SELECT SUM(s."durationSeconds") AS seconds
          FROM "StudySession" s
         WHERE s."assignmentID" = a.id AND s."userID" = a."userID" AND s.status = 'completed'
      ) logged ON TRUE
      WHERE a."userID" = $1
    `;
    const params = [userId];

    if (courseID) {
      query += " AND a.\"courseID\" = $2";
      params.push(courseID);
    }

    query += " ORDER BY a.\"dueAt\" ASC NULLS LAST";

    const result = await pool.query(query, params);
    // One status combining Canvas's submission with the student's own "Mark done".
    return result.rows.map((row) => ({
      ...row,
      completionStatus: progress.completionStatus(row)
    }));

  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Get assignments error:", err.message);
    throw new HttpError(500, "Failed to retrieve assignments" );
  }
}

export async function getAssignment(userId, id) {
  try {
    const result = await pool.query(
      `SELECT
        a.*,
        c.name          AS "courseName",
        c.department,

        ad.summary,
        ad.subtasks,
        ad."priorityScore"
       FROM "Assignment" a
       JOIN "Course" c ON c.id = a."courseID"
       LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
       WHERE a.id = $1 AND a."userID" = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, "Assignment not found" );
    }

    return result.rows[0];
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Get assignment error:", err.message);
    throw new HttpError(500, "Failed to retrieve assignment" );
  }
}

export async function createAssignment(userId, body = {}) {
  const {
    title, description, points, dueAt, availableUntil,
    courseID, courseName, department, semester
  } = body;

  if (!title || !courseID || !courseName) {
    throw new HttpError(400, "title, courseID, and courseName are required");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert Course so we don't create duplicates on repeated syncs (UC12)
    await client.query(
      `INSERT INTO "Course" (id, name, department, semester)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [courseID, courseName, department || null, semester || null]
    );

    // Insert Assignment (UC12 – data storage)
    const assignResult = await client.query(
      `INSERT INTO "Assignment"
         ("userID", "courseID", title, description, points, "dueAt", "availableUntil")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, courseID, title, description || null,
        points ?? null, dueAt || null, availableUntil || null]
    );

    await client.query("COMMIT");
    return assignResult.rows[0];

  } catch (err) {
    if (err instanceof HttpError) throw err;
    await client.query("ROLLBACK");
    console.error("Create assignment error:", err.message);
    throw new HttpError(500, "Failed to store assignment" );
  } finally {
    client.release();
  }
}

export async function saveAssignmentDetails(userId, id, body = {}) {
  const { summary, subtasks, priorityScore } = body;

  try {
    // Verify the assignment belongs to this user first
    const check = await pool.query(
      "SELECT id FROM \"Assignment\" WHERE id = $1 AND \"userID\" = $2",
      [id, userId]
    );
    if (check.rows.length === 0) {
      throw new HttpError(404, "Assignment not found" );
    }

    // Upsert AssignmentDetail (UC12 – AI content storage)
    const result = await pool.query(
      `INSERT INTO "AssignmentDetail" ("assignmentID", summary, subtasks, "priorityScore")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("assignmentID")
       DO UPDATE SET
         summary       = COALESCE($2, "AssignmentDetail".summary),
         subtasks      = COALESCE($3, "AssignmentDetail".subtasks),
         "priorityScore" = COALESCE($4, "AssignmentDetail"."priorityScore")
       RETURNING *`,
      [id,
        summary || null,
        subtasks ? JSON.stringify(subtasks) : null,
        priorityScore ?? null]
    );

    return result.rows[0];
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Update assignment details error:", err.message);
    throw new HttpError(500, "Failed to save assignment details" );
  }
}

export async function setAssignmentEstimate(userId, id, body = {}) {
  try {
    const source = body?.source === "ai" ? "ai" : "student";
    return await progress.setEstimate(userId, id, body?.minutes, source);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof progress.ProgressError) {
      throw new HttpError(err.status, err.message );
    }
    console.error("Set estimate error:", err.message);
    throw new HttpError(500, "Failed to save estimate" );
  }
}

export async function suggestAssignmentEstimate(userId, id) {
  try {
    return await estimate.suggestEstimate(userId, id);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Suggest estimate error:", err.message);
    throw new HttpError(500, "Failed to suggest an estimate" );
  }
}

export async function setAssignmentCompletion(userId, id, body = {}) {
  try {
    return await progress.setCompleted(userId, id, body?.completed);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof progress.ProgressError) {
      throw new HttpError(err.status, err.message );
    }
    console.error("Set completion error:", err.message);
    throw new HttpError(500, "Failed to update completion" );
  }
}

export async function deleteAssignment(userId, id) {
  try {
    const result = await pool.query(
      "DELETE FROM \"Assignment\" WHERE id = $1 AND \"userID\" = $2 RETURNING id",
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, "Assignment not found" );
    }

    return { message: "Assignment deleted", id: result.rows[0].id };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Delete assignment error:", err.message);
    throw new HttpError(500, "Failed to delete assignment" );
  }
}
