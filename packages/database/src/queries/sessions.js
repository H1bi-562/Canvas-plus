import { pool } from "../client";
import { HttpError } from "../errors.js";

function sessionFields(alias) {
  const p = alias ? `${alias}.` : "";
  const activeSegment =
    `EXTRACT(EPOCH FROM (NOW() - COALESCE(${p}"resumedAt", ${p}"startedAt")))::INTEGER`;

  return `
    ${p}id,
    ${p}"userID",
    ${p}"assignmentID",
    ${p}status,
    ${p}"startedAt",
    ${p}"pausedAt",
    ${p}"resumedAt",
    ${p}"endedAt",
    ${p}"durationSeconds",
    CASE WHEN ${p}status = 'active'
         THEN ${p}"durationSeconds" + ${activeSegment}
         ELSE ${p}"durationSeconds"
    END AS "elapsedSeconds"
  `;
}

// Unaliased forms, used by the single-table statements below.
const FIELDS         = sessionFields("");
const ACTIVE_SEGMENT = "EXTRACT(EPOCH FROM (NOW() - COALESCE(\"resumedAt\", \"startedAt\")))::INTEGER";


export async function startSession(userId, body = {}) {
  const { assignmentID } = body || {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // An assignment may only be attached if it belongs to this user. Checking
    // here rather than leaning on the FK keeps one user from timing against
    // another user's assignment id.
    if (assignmentID) {
      const owned = await client.query(
        "SELECT id FROM \"Assignment\" WHERE id = $1 AND \"userID\" = $2",
        [assignmentID, userId]
      );
      if (owned.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new HttpError(404, "Assignment not found" );
      }
    }

    // Refuse a second timer rather than silently abandoning the first, so a
    // double-tap on Start cannot orphan a session the user is still running.
    const open = await client.query(
      `SELECT ${FIELDS} FROM "StudySession"
        WHERE "userID" = $1 AND status IN ('active', 'paused')`,
      [userId]
    );
    if (open.rows.length > 0) {
      await client.query("ROLLBACK");
      throw new HttpError(409, "A study session is already open. End it before starting another.");
    }

    const result = await client.query(
      `INSERT INTO "StudySession" ("userID", "assignmentID", status, "durationSeconds")
       VALUES ($1, $2, 'active', 0)
       RETURNING ${FIELDS}`,
      [userId, assignmentID || null]
    );

    await client.query("COMMIT");
    return result.rows[0];

  } catch (err) {
    if (err instanceof HttpError) throw err;
    await client.query("ROLLBACK");
    // 23505 = the partial unique index caught a concurrent start.
    if (err.code === "23505") {
      throw new HttpError(409, "A study session is already open." );
    }
    // 22P02 = assignmentID in the body was not a valid UUID.
    if (err.code === "22P02") {
      throw new HttpError(400, "Invalid assignment id" );
    }
    console.error("Start session error:", err.message);
    throw new HttpError(500, "Failed to start study session" );
  } finally {
    client.release();
  }
}

export async function endSession(userId, id) {
  try {
    const result = await pool.query(
      `UPDATE "StudySession"
          SET status            = 'completed',
              "endedAt"         = NOW(),
              -- Only an active session has unbanked time; a paused one already
              -- banked its total at the moment it was paused.
              "durationSeconds" = CASE WHEN status = 'active'
                                       THEN "durationSeconds" + ${ACTIVE_SEGMENT}
                                       ELSE "durationSeconds" END,
              "pausedAt"        = NULL,
              "resumedAt"       = NULL,
              "updatedAt"       = NOW()
        WHERE id = $1 AND "userID" = $2 AND status IN ('active', 'paused')
        RETURNING ${FIELDS}`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, "No open study session with that id" );
    }

    return result.rows[0];
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // 22P02 = the id in the path was not a valid UUID.
    if (err.code === "22P02") {
      throw new HttpError(400, "Invalid session id" );
    }
    console.error("End session error:", err.message);
    throw new HttpError(500, "Failed to end study session" );
  }
}

export async function pauseSession(userId, id) {
  try {
    const result = await pool.query(
      `UPDATE "StudySession"
          SET status            = 'paused',
              "durationSeconds" = "durationSeconds" + ${ACTIVE_SEGMENT},
              "pausedAt"        = NOW(),
              "resumedAt"       = NULL,
              "updatedAt"       = NOW()
        WHERE id = $1 AND "userID" = $2 AND status = 'active'
        RETURNING ${FIELDS}`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, "No active study session with that id" );
    }

    return result.rows[0];
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.code === "22P02") {
      throw new HttpError(400, "Invalid session id" );
    }
    console.error("Pause session error:", err.message);
    throw new HttpError(500, "Failed to pause study session" );
  }
}

export async function resumeSession(userId, id) {
  try {
    const result = await pool.query(
      `UPDATE "StudySession"
          SET status      = 'active',
              "resumedAt" = NOW(),
              "pausedAt"  = NULL,
              "updatedAt" = NOW()
        WHERE id = $1 AND "userID" = $2 AND status = 'paused'
        RETURNING ${FIELDS}`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, "No paused study session with that id" );
    }

    return result.rows[0];
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.code === "22P02") {
      throw new HttpError(400, "Invalid session id" );
    }
    console.error("Resume session error:", err.message);
    throw new HttpError(500, "Failed to resume study session" );
  }
}

export async function activeSession(userId) {
  try {
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "StudySession"
        WHERE "userID" = $1 AND status IN ('active', 'paused')`,
      [userId]
    );

    return { session: result.rows[0] || null };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Get active session error:", err.message);
    throw new HttpError(500, "Failed to retrieve active study session" );
  }
}

export async function listSessions(userId, query = {}) {
  const { assignmentID } = query;

  try {
    let query = `
      SELECT ${sessionFields("s")},
             a.title AS "assignmentTitle"
        FROM "StudySession" s
        LEFT JOIN "Assignment" a ON a.id = s."assignmentID"
       WHERE s."userID" = $1
    `;
    const params = [userId];

    if (assignmentID) {
      query += " AND s.\"assignmentID\" = $2";
      params.push(assignmentID);
    }

    query += " ORDER BY s.\"startedAt\" DESC";

    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err.code === "22P02") {
      throw new HttpError(400, "Invalid assignment id" );
    }
    console.error("Get sessions error:", err.message);
    throw new HttpError(500, "Failed to retrieve study sessions" );
  }
}
