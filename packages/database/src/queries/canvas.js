import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { canvasAuth } from "../schema";

export async function saveOAuthGrant(values) {
  const [row] = await db.insert(canvasAuth).values({ ...values, authType: "oauth" }).onConflictDoUpdate({
    target: canvasAuth.userID,
    set: { ...values, authType: "oauth", refreshToken: values.refreshToken ?? sql`${canvasAuth.refreshToken}`, updatedAt: new Date() }
  }).returning({ id: canvasAuth.id });
  return row.id;
}

export async function loadCanvasGrant(userID) {
  const [row] = await db.select().from(canvasAuth).where(eq(canvasAuth.userID, userID));
  return row ?? null;
}

export async function savePersonalGrant(values) {
  const grant = { ...values, authType: "pat", refreshToken: null, expiresAt: null, scope: null };
  await db.insert(canvasAuth).values(grant).onConflictDoUpdate({ target: canvasAuth.userID, set: { ...grant, connectedAt: new Date(), updatedAt: new Date() } });
}

export async function refreshCanvasGrant(userID, values) {
  await db.update(canvasAuth).set({ ...values, refreshToken: values.refreshToken ?? sql`${canvasAuth.refreshToken}`, updatedAt: new Date() }).where(eq(canvasAuth.userID, userID));
}

export async function deleteCanvasGrant(userID) {
  await db.delete(canvasAuth).where(eq(canvasAuth.userID, userID));
}
