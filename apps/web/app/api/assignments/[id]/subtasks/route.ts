import { api } from "@/lib/server/api";
import { generateSubtasks } from "@canvasplus/database/queries/decompose";

// UC10: break the assignment into a subtask checklist (and store it).
export const POST = api(async ({ user, params }) => generateSubtasks(user.id, params.id));
