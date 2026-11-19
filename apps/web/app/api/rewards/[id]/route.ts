import { api } from "@/lib/server/api";
import { deleteReward, getReward, updateReward } from "@canvasplus/database/queries/rewards";

// UC20: one of the student's rewards. Anyone else's id is a 404, never a 403, so the
// API does not confirm that another student's reward exists.
export const GET = api(async ({ user, params }) => getReward(user.id, params.id));

// Change only the fields in the body; the reward is validated as it will end up.
export const PATCH = api(async ({ user, params, body }) => updateReward(user.id, params.id, body));

// Retire it: active = false, so it stops being rolled and leaves the default list while
// the roll history keeps naming what was won. PATCH { active: true } brings it back.
export const DELETE = api(async ({ user, params }) => deleteReward(user.id, params.id));
