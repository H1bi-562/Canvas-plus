import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { account } from "../schema";

const isGoogle = userID => and(eq(account.userId, userID), eq(account.providerId, "google"));

/** The Better Auth row linked by Settings -> Connect Google Calendar. Tokens stay inside Better Auth. */
export async function loadGoogleAccount(userID) {
  const [row] = await db.select({ id: account.id }).from(account).where(isGoogle(userID));
  return row ?? null;
}

export async function deleteGoogleAccount(userID) {
  const rows = await db.delete(account).where(isGoogle(userID)).returning({ id: account.id });
  return rows.length > 0;
}
