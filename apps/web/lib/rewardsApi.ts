// UC20 – client side of the reward roll: the request the modal makes, and the event the
// rest of the UI fires to ask for one.
//
// POST /api/rewards/roll is the RNG subtask's endpoint and is not in the repo yet. This
// file is the contract the roll modal is built against, so the two can meet:
//
//   body      { trigger: "assignment" | "study_session", sourceID: <that row's id> }
//   201       { roll: RewardRoll }   a roll happened; rewardName is null when it came up empty
//   200/201   { roll: null }         nothing to roll for (no active reward is eligible)
//   409       this assignment / session was already rolled for ("RewardRoll" unique indexes)
//
// Until that route exists the request 404s and RewardRollHost quietly shows nothing.

import { apiRequest } from "@/lib/apiClient";

export type RollTrigger = "assignment" | "study_session";

/** One "RewardRoll" row (packages/database/src/schema.ts), plus the reward's details when it won. */
export interface RewardRoll {
  id: string;
  trigger: RollTrigger;
  rewardID: string | null;
  /** Null when the roll came up empty. */
  rewardName: string | null;
  rewardDescription?: string | null;
  /** The won reward's drop chance in percent, shown as its rarity. */
  rarityPercent?: number | null;
  rolledAt: string;
  claimedAt: string | null;
}

export function rollReward(trigger: RollTrigger, sourceID: string): Promise<{ roll: RewardRoll | null }> {
  return apiRequest("/api/rewards/roll", "POST", { trigger, sourceID });
}

/** What just got finished. label is only for display ("Essay 2", "Study session"). */
export interface RollRequest {
  trigger: RollTrigger;
  sourceID: string;
  label?: string | null;
}

export const REWARD_ROLL_EVENT = "canvasplus:reward-roll";

/**
 * Ask for a reward roll after an assignment is marked done or a study session ends.
 * Fire-and-forget: RewardRollHost (mounted once in the dashboard) does the request and
 * shows the modal, so the component that finished the work does not have to own either.
 */
export function requestRewardRoll(detail: RollRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RollRequest>(REWARD_ROLL_EVENT, { detail }));
}

export type RarityTier = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

/** A name for a drop chance, so "4%" reads as what it is: the lower the chance, the rarer the tier. */
export function rarityTier(rarityPercent: number): RarityTier {
  if (rarityPercent <= 5) return "Legendary";
  if (rarityPercent <= 15) return "Epic";
  if (rarityPercent <= 35) return "Rare";
  if (rarityPercent <= 60) return "Uncommon";
  return "Common";
}

// ── UC20 reward settings: managing the rewards themselves ────────────────────
// The CRUD half, behind /api/rewards. A reward's trigger and its two requirements
// are what decides WHEN it is eligible to be rolled, so the settings screen edits
// them per reward rather than keeping one global rule.

/** One "Reward" row as the API returns it (no owning user id). */
export interface Reward {
  id: string;
  name: string;
  description: string | null;
  /** Drop chance in percent, above 0 and at most 100. */
  rarityPercent: number;
  /** Which finished work may roll it. "any" means either kind. */
  trigger: "any" | RollTrigger;
  /** Only meaningful for study session rolls: the session must last at least this long. */
  minStudyMinutes: number | null;
  /** Only meaningful for assignment rolls: the assignment must have been finished on time. */
  requireOnTime: boolean;
  /** A retired reward is never rolled and is hidden unless asked for. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The fields a student can set. Everything except name and rarityPercent is optional. */
export type RewardInput = Partial<Omit<Reward, "id" | "createdAt" | "updatedAt">> &
  Pick<Reward, "name" | "rarityPercent">;

/** The student's rewards, newest first. Retired ones are left out unless asked for. */
export function fetchRewards(includeInactive = false): Promise<Reward[]> {
  return apiRequest(`/api/rewards${includeInactive ? "?includeInactive=true" : ""}`);
}

export function createReward(input: RewardInput): Promise<Reward> {
  return apiRequest("/api/rewards", "POST", input);
}

/** Change only the fields given; the reward is validated as it will end up. */
export function updateReward(id: string, changes: Partial<RewardInput>): Promise<Reward> {
  return apiRequest(`/api/rewards/${id}`, "PATCH", changes);
}

/** Retire a reward: it stops being rolled, but past rolls keep naming it. */
export function retireReward(id: string): Promise<Reward> {
  return apiRequest(`/api/rewards/${id}`, "DELETE");
}

/** Bring a retired reward back. */
export function restoreReward(id: string): Promise<Reward> {
  return apiRequest(`/api/rewards/${id}`, "PATCH", { active: true });
}

/** How a reward's roll conditions read in one line, for the settings list. */
export function describeTrigger(reward: Pick<Reward, "trigger" | "minStudyMinutes" | "requireOnTime">): string {
  if (reward.trigger === "assignment") {
    return reward.requireOnTime ? "After an assignment finished on time" : "After any finished assignment";
  }
  if (reward.trigger === "study_session") {
    return reward.minStudyMinutes
      ? `After a study session of ${reward.minStudyMinutes} minutes or more`
      : "After any study session";
  }
  const extras = [
    reward.requireOnTime ? "on time assignments" : null,
    reward.minStudyMinutes ? `study sessions of ${reward.minStudyMinutes} minutes or more` : null
  ].filter(Boolean);
  return extras.length ? `After ${extras.join(" or ")}` : "After any assignment or study session";
}
