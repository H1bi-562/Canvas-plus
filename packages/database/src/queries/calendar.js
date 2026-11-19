import { pool } from "../client";
import { HttpError } from "../errors.js";


export async function listEvents(userId, query = {}) {
  const { month } = query; // e.g. "2026-05"

  try {
    let query = `
      SELECT
        ce.id,
        ce.title,
        ce.calendar,
        ce."eventStart",
        ce."eventEnd",
        ce."assignmentID",
        ce."googleEventID",
        a.title         AS "assignmentTitle",
        a."htmlURL"     AS "assignmentURL",
        a.points,
        ad."priorityScore"
      FROM "CalendarEvent" ce
      JOIN "Assignment" a ON a.id = ce."assignmentID"
      LEFT JOIN "AssignmentDetail" ad ON ad."assignmentID" = a.id
      WHERE a."userID" = $1
    `;
    const params = [userId];

    if (month) {
      // Filter to events starting within the given month
      query += " AND TO_CHAR(ce.\"eventStart\", 'YYYY-MM') = $2";
      params.push(month);
    }

    query += " ORDER BY ce.\"eventStart\" ASC";

    const result = await pool.query(query, params);
    return result.rows;

  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Get calendar events error:", err.message);
    throw new HttpError(500, "Failed to retrieve calendar events" );
  }
}

export async function createEvent(userId, body = {}) {
  const { assignmentID, title, calendar, eventStart, eventEnd } = body;

  if (!assignmentID || !eventStart || !eventEnd) {
    throw new HttpError(400, "assignmentID, eventStart, and eventEnd are required");
  }

  try {
    // Verify the assignment belongs to this user. Its title and Canvas link come back
    // too, so a caller pushing this event to Google (UC3) does not need a second query.
    const check = await pool.query(
      "SELECT id, title, \"htmlURL\" FROM \"Assignment\" WHERE id = $1 AND \"userID\" = $2",
      [assignmentID, userId]
    );
    if (check.rows.length === 0) {
      throw new HttpError(404, "Assignment not found" );
    }

    // Insert CalendarEvent (UC12 – data storage)
    const result = await pool.query(
      `INSERT INTO "CalendarEvent" ("assignmentID", title, calendar, "eventStart", "eventEnd")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [assignmentID, title || null, calendar || "primary", eventStart, eventEnd]
    );

    return { ...result.rows[0], assignmentTitle: check.rows[0].title, assignmentURL: check.rows[0].htmlURL };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Create calendar event error:", err.message);
    throw new HttpError(500, "Failed to store calendar event" );
  }
}

export async function deleteEvent(userId, id) {
  try {
    // Join through Assignment to verify ownership
    const result = await pool.query(
      `DELETE FROM "CalendarEvent" ce
       USING "Assignment" a
       WHERE ce.id = $1
         AND ce."assignmentID" = a.id
         AND a."userID" = $2
       RETURNING ce.id, ce."googleEventID"`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, "Calendar event not found" );
    }

    // googleEventID is returned, not acted on here: removing the copy in Google is the
    // caller's job (UC3), and the local delete must stand whether or not that succeeds.
    return { message: "Event deleted", id: result.rows[0].id, googleEventID: result.rows[0].googleEventID };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Delete calendar event error:", err.message);
    throw new HttpError(500, "Failed to delete calendar event" );
  }
}

/**
 * UC3: remember which Google event this CanvasPlus event was copied to, so it is never
 * pushed twice and can be removed from Google when it is deleted here. Passing null
 * clears the link (the copy is gone from Google, or the push is being retried).
 */
export async function setEventGoogleID(userId, id, googleEventID) {
  const result = await pool.query(
    `UPDATE "CalendarEvent" ce
        SET "googleEventID" = $3
       FROM "Assignment" a
      WHERE ce.id = $1
        AND ce."assignmentID" = a.id
        AND a."userID" = $2
      RETURNING ce.id, ce."googleEventID"`,
    [id, userId, googleEventID]
  );
  if (result.rows.length === 0) throw new HttpError(404, "Calendar event not found");
  return result.rows[0];
}
