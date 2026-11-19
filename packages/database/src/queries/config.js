import { eq } from "drizzle-orm";
import { db } from "../client";
import { config, calendarConfig } from "../schema";
import { encrypt } from "../crypto.js";
import { HttpError } from "../errors.js";

export async function getConfig(userId) {
  const [row] = await db.select({
    id: config.id, canvasURL: config.canvasURL, canvasKey: config.canvasKey,
    calendarKey: config.calendarKey, modelKey: config.modelKey, updatedAt: config.updatedAt,
    defaultCalendar: calendarConfig.defaultCalendar, filteredEvents: calendarConfig.filteredEvents,
    // UC3: whether CanvasPlus events are copied out to the student's Google Calendar.
    // A missing CalendarConfig row means they never chose, which is the same as off.
    syncToGoogle: calendarConfig.syncToGoogle
  }).from(config).leftJoin(calendarConfig, eq(calendarConfig.configID, config.id)).where(eq(config.userID, userId));
  if (!row) throw new HttpError(404, "Config not found for this user");
  for (const key of ["canvasKey", "calendarKey", "modelKey"]) row[key] = row[key] ? "configured" : null;
  row.syncToGoogle = row.syncToGoogle ?? false;
  return row;
}

export async function saveConfig(userId, body = {}) {
  const values = { updatedAt: new Date() };
  for (const key of ["canvasURL", "canvasKey", "calendarKey", "modelKey"]) {
    if (body[key] == null) continue;
    if (typeof body[key] !== "string" || body[key].length > 8192) throw new HttpError(400, `Invalid ${key}`);
    values[key] = key === "canvasURL" ? body[key] : encrypt(body[key]);
  }
  if (body.defaultCalendar != null && typeof body.defaultCalendar !== "string") throw new HttpError(400, "Invalid defaultCalendar");
  if (body.filteredEvents != null && !Array.isArray(body.filteredEvents)) throw new HttpError(400, "Invalid filteredEvents");
  // UC3: an opt in to writing to someone's real calendar has to be an explicit boolean.
  if (body.syncToGoogle != null && typeof body.syncToGoogle !== "boolean") throw new HttpError(400, "Invalid syncToGoogle");
  await db.transaction(async tx => {
    const [row] = await tx.update(config).set(values).where(eq(config.userID, userId)).returning({ id: config.id });
    if (!row) throw new HttpError(404, "Config not found for this user");
    if (body.defaultCalendar != null || body.filteredEvents != null || body.syncToGoogle != null) {
      const preferences = {
        defaultCalendar: body.defaultCalendar ?? undefined,
        filteredEvents: body.filteredEvents ?? undefined,
        syncToGoogle: body.syncToGoogle ?? undefined
      };
      await tx.insert(calendarConfig).values({ configID: row.id, ...preferences }).onConflictDoUpdate({ target: calendarConfig.configID, set: { ...preferences, updatedAt: new Date() } });
    }
  });
  return { message: "Config saved successfully" };
}
