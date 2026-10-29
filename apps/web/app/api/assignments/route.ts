import { api } from "@/lib/server/api";
import { syncIfStale } from "@/lib/server/canvasSync";
import { listAssignments, createAssignment } from "@canvasplus/database/queries/assignments";

export const GET = api(async ({ user, query }) => {
  // UC15: ?refresh=stale pulls fresh submission status from Canvas first when the stored copy is old.
  if (query.refresh === "stale") await syncIfStale(user.id);
  return listAssignments(user.id, query);
});

export const POST = api(async ({ user, body }) => createAssignment(user.id, body), { status: 201 });
