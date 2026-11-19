import { api } from "@/lib/server/api";
import { createReward, listRewards } from "@canvasplus/database/queries/rewards";

// UC20: the student's own rewards.
// GET  -> their rewards, newest first. Query: includeInactive=true also returns retired
//         ones (the settings screen wants them; a roll does not).
export const GET = api(async ({ user, query }) => listRewards(user.id, { includeInactive: query.includeInactive }));

// POST -> add one. Body: { name, rarityPercent, description?, trigger?, minStudyMinutes?,
//         requireOnTime?, active? }. 201 with the stored reward.
export const POST = api(async ({ user, body }) => createReward(user.id, body), { status: 201 });
