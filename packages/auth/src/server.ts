import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@canvasplus/database";
import * as schema from "@canvasplus/database/schema";

export const auth = betterAuth({
  appName: "CanvasPlus",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  advanced: { database: { generateId: "uuid" } },
  session: { expiresIn: 7 * 24 * 60 * 60 },
  databaseHooks: {
    user: {
      create: {
        after: async user => {
          await db.insert(schema.config).values({ userID: user.id }).onConflictDoNothing();
        }
      }
    }
  }
});
