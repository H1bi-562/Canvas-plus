// UC20 settings card: the student's own rewards, and when each one is rolled.
//
// "When" is per reward, not one global rule, because that is how the "Reward" table
// models it: a trigger (any finished work, an assignment, or a study session) plus at
// most one requirement -- a minimum study length, or that the assignment was finished
// on time. The form only offers the requirement that the chosen trigger can satisfy,
// which is the same rule the API enforces, so a student cannot build a reward the
// server will refuse.
//
// Retiring, not deleting: a retired reward stops being rolled and drops out of the
// list, but the row stays so past rolls still name what was won. Retired rewards are
// shown on request and can be brought back.

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  type Reward, type RewardInput,
  createReward, describeTrigger, fetchRewards, restoreReward, retireReward, updateReward
} from "@/lib/rewardsApi";

type Trigger = Reward["trigger"];
type Draft = { name: string; description: string; rarityPercent: string; trigger: Trigger; minStudyMinutes: string; requireOnTime: boolean };

const EMPTY: Draft = { name: "", description: "", rarityPercent: "25", trigger: "any", minStudyMinutes: "", requireOnTime: false };

const TRIGGER_LABELS: Record<Trigger, string> = {
  any: "Any finished assignment or study session",
  assignment: "A finished assignment",
  study_session: "A finished study session"
};

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";

/** A drop chance read as a word, so "4%" reads as what it is. Mirrors rarityTier(). */
function rarityLabel(percent: number) {
  if (percent <= 5) return "Legendary";
  if (percent <= 15) return "Epic";
  if (percent <= 35) return "Rare";
  if (percent <= 60) return "Uncommon";
  return "Common";
}

/** The draft as the API wants it. Requirements the trigger cannot satisfy are dropped. */
function toInput(draft: Draft): RewardInput {
  const minutes = draft.minStudyMinutes.trim();
  return {
    name: draft.name.trim(),
    rarityPercent: Number(draft.rarityPercent),
    description: draft.description.trim() || null,
    trigger: draft.trigger,
    minStudyMinutes: draft.trigger === "assignment" || !minutes ? null : Number(minutes),
    requireOnTime: draft.trigger === "study_session" ? false : draft.requireOnTime
  };
}

export default function RewardSettings({ darkMode }: { darkMode: boolean }) {
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busyID, setBusyID] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (includeRetired: boolean) => {
    try {
      setRewards(await fetchRewards(includeRetired));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => { load(showRetired); }, [load, showRetired]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (adding) return;
    setAdding(true);
    setError(null);
    try {
      await createReward(toInput(draft));
      setDraft(EMPTY);
      await load(showRetired);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAdding(false);
    }
  }

  /** Change one reward in place: the trigger, a requirement, or whether it is retired. */
  async function change(reward: Reward, run: () => Promise<unknown>) {
    if (busyID) return;
    setBusyID(reward.id);
    setError(null);
    try {
      await run();
      await load(showRetired);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyID(null);
    }
  }

  // Changing the trigger clears the requirement the new trigger cannot satisfy, so the
  // saved reward always matches what the row is allowed to hold.
  const retrigger = (reward: Reward, trigger: Trigger) => change(reward, () => updateReward(reward.id, {
    trigger,
    minStudyMinutes: trigger === "assignment" ? null : reward.minStudyMinutes,
    requireOnTime: trigger === "study_session" ? false : reward.requireOnTime
  }));

  const card     = `rounded-lg shadow-sm p-6 ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`;
  const heading  = `font-semibold ${darkMode ? "text-white" : "text-gray-900"}`;
  const muted    = `text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`;
  const field    = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    darkMode ? "bg-[var(--cp-page)] border-gray-600 text-white placeholder-gray-400" : "bg-white border-gray-300 text-gray-900"
  }`;
  const primary  = "inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const iconBtn  = `p-2 rounded-lg transition-colors disabled:opacity-50 ${darkMode ? "hover:bg-[var(--cp-page)] text-gray-300" : "hover:bg-gray-100 text-gray-600"}`;
  const label    = `block text-sm mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`;

  return (
    <div className={card}>
      <h2 className={`${heading} mb-2`}>Rewards</h2>
      <p className={`${muted} mb-5`}>
        Write your own rewards and choose when each one is rolled for. A lower chance makes
        a reward rarer when it does come up.
      </p>

      <form onSubmit={handleAdd} className="space-y-3 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="reward-name">Reward</label>
            <input id="reward-name" className={field} value={draft.name} placeholder="Boba run"
              onChange={e => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="reward-rarity">Chance (%)</label>
            <input id="reward-rarity" className={field} type="number" min="0.5" max="100" step="0.5"
              value={draft.rarityPercent} onChange={e => setDraft({ ...draft, rarityPercent: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="reward-trigger">Roll it after</label>
          <select id="reward-trigger" className={field} value={draft.trigger}
            onChange={e => setDraft({ ...draft, trigger: e.target.value as Trigger })}>
            {(Object.keys(TRIGGER_LABELS) as Trigger[]).map(key => (
              <option key={key} value={key}>{TRIGGER_LABELS[key]}</option>
            ))}
          </select>
        </div>

        {/* Only the requirement the chosen trigger can actually satisfy is offered. */}
        {draft.trigger !== "assignment" && (
          <div>
            <label className={label} htmlFor="reward-minutes">Only after a study session of at least (minutes, optional)</label>
            <input id="reward-minutes" className={field} type="number" min="1" max="1440" placeholder="45"
              value={draft.minStudyMinutes} onChange={e => setDraft({ ...draft, minStudyMinutes: e.target.value })} />
          </div>
        )}
        {draft.trigger !== "study_session" && (
          <label className={`flex items-center gap-2 ${muted}`}>
            <input type="checkbox" checked={draft.requireOnTime}
              onChange={e => setDraft({ ...draft, requireOnTime: e.target.checked })} />
            Only when the assignment was finished on time
          </label>
        )}

        <button type="submit" className={primary} disabled={adding || !draft.name.trim()}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add reward
        </button>
      </form>

      {error && (
        <div role="alert" className={`flex items-start gap-2 mb-4 p-3 rounded-lg text-sm ${
          darkMode ? "bg-red-900/30 border border-red-700 text-red-300" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {rewards === null && <p className={muted}>Loading your rewards…</p>}
      {rewards !== null && rewards.length === 0 && (
        <p className={muted}>No rewards yet. Add one above and it will be rolled for when you finish work.</p>
      )}

      {rewards !== null && rewards.length > 0 && (
        <ul className={`divide-y ${darkMode ? "divide-gray-700" : "divide-gray-100"}`}>
          {rewards.map(reward => (
            <li key={reward.id} className={`py-3 ${reward.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={darkMode ? "text-white" : "text-gray-900"}>
                    {reward.name}
                    <span className={`ml-2 text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      {reward.rarityPercent}% · {rarityLabel(reward.rarityPercent)}
                    </span>
                    {!reward.active && (
                      <span className={`ml-2 text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>· Retired</span>
                    )}
                  </p>
                  <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{describeTrigger(reward)}</p>
                </div>
                {reward.active ? (
                  <button type="button" className={iconBtn} disabled={busyID !== null}
                    aria-label={`Retire ${reward.name}`}
                    onClick={() => change(reward, () => retireReward(reward.id))}>
                    {busyID === reward.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                ) : (
                  <button type="button" className={iconBtn} disabled={busyID !== null}
                    aria-label={`Restore ${reward.name}`}
                    onClick={() => change(reward, () => restoreReward(reward.id))}>
                    {busyID === reward.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  </button>
                )}
              </div>

              {reward.active && (
                <select
                  className={`${field} mt-2`} value={reward.trigger} disabled={busyID !== null}
                  aria-label={`When to roll ${reward.name}`}
                  onChange={e => retrigger(reward, e.target.value as Trigger)}
                >
                  {(Object.keys(TRIGGER_LABELS) as Trigger[]).map(key => (
                    <option key={key} value={key}>{TRIGGER_LABELS[key]}</option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}

      <label className={`flex items-center gap-2 mt-4 ${muted}`}>
        <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} />
        Show retired rewards
      </label>
    </div>
  );
}
