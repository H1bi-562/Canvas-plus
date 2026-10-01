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
        a.title         AS "assignmentTitle",
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
    // Verify the assignment belongs to this user
    const check = await pool.query(
      "SELECT id FROM \"Assignment\" WHERE id = $1 AND \"userID\" = $2",
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

    return result.rows[0];
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
       RETURNING ce.id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, "Calendar event not found" );
    }

    return { message: "Event deleted", id: result.rows[0].id };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("Delete calendar event error:", err.message);
    throw new HttpError(500, "Failed to delete calendar event" );
  }
}
