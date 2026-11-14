// UC20 – listens for "roll for a reward" requests from anywhere in the dashboard, asks
// the server for the roll, and shows the result in RewardRollModal. Mounted once (in
// DashboardProvider) so the modal survives the panel that triggered it closing.

import { useEffect, useState } from "react";
import RewardRollModal from "@/components/RewardRollModal";
import { REWARD_ROLL_EVENT, rollReward, type RewardRoll, type RollRequest } from "@/lib/rewardsApi";

interface PendingRoll {
  roll: RewardRoll;
  label: string | null;
}

export default function RewardRollHost({ darkMode }: { darkMode: boolean }) {
  // A queue, not a single slot: ending a session and marking its assignment done
  // back to back are two rolls, shown one after the other.
  const [queue, setQueue] = useState<PendingRoll[]>([]);

  useEffect(() => {
    let mounted = true;

    const onRequest = async (event: Event) => {
      const detail = (event as CustomEvent<RollRequest>).detail;
      if (!detail?.sourceID) return;
      try {
        const { roll } = await rollReward(detail.trigger, detail.sourceID);
        if (mounted && roll) setQueue((pending) => [...pending, { roll, label: detail.label ?? null }]);
      } catch {
        // A roll is a bonus. Already rolled for (409), no roll endpoint yet (404), or the
        // server being unreachable must never get in the way of the work just finished.
      }
    };

    window.addEventListener(REWARD_ROLL_EVENT, onRequest);
    return () => {
      mounted = false;
      window.removeEventListener(REWARD_ROLL_EVENT, onRequest);
    };
  }, []);

  const current = queue[0];
  if (!current) return null;

  return (
    <RewardRollModal
      key={current.roll.id}
      darkMode={darkMode}
      roll={current.roll}
      label={current.label}
      onClose={() => setQueue((pending) => pending.slice(1))}
    />
  );
}
