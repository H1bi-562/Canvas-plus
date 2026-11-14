// UC20 – the reward "roll" shown after an assignment is marked done or a study session
// ends. Jace Orozco
//
// The roll has already happened on the server by the time this opens (see RewardRollHost),
// so the dice here are only suspense: a short spin, then the stored result is revealed.
// Nothing about the outcome is decided in the browser.

import { useEffect, useRef, useState } from "react";
import { Dices, Gift, Sparkles, X } from "lucide-react";
import { rarityTier, type RarityTier, type RewardRoll } from "@/lib/rewardsApi";

interface RewardRollModalProps {
  darkMode: boolean;
  roll: RewardRoll;
  /** What was just finished, e.g. the assignment title. */
  label?: string | null;
  onClose: () => void;
}

/** How long the dice spin before the reveal. */
export const ROLL_MS = 1400;

const TIER_STYLE: Record<RarityTier, { light: string; dark: string }> = {
  Common:    { light: "bg-gray-100 text-gray-700",     dark: "bg-gray-700 text-gray-200" },
  Uncommon:  { light: "bg-green-50 text-green-700",    dark: "bg-green-900/40 text-green-300" },
  Rare:      { light: "bg-blue-50 text-blue-700",      dark: "bg-blue-900/40 text-blue-300" },
  Epic:      { light: "bg-purple-50 text-purple-700",  dark: "bg-purple-900/40 text-purple-300" },
  Legendary: { light: "bg-amber-50 text-amber-700",    dark: "bg-amber-900/40 text-amber-300" }
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function RewardRollModal({ darkMode, roll, label = null, onClose }: RewardRollModalProps) {
  // Students who turned animations off skip the spin and see the result straight away.
  const [revealed, setRevealed] = useState(prefersReducedMotion);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (revealed) return;
    const handle = window.setTimeout(() => setRevealed(true), ROLL_MS);
    return () => window.clearTimeout(handle);
  }, [revealed]);

  // Read through a ref so the focus effect below runs once per open, not once per parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Take focus while open, hand it back on close, and let Esc dismiss.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    buttonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  const won = roll.rewardName !== null;
  const tier = won && roll.rarityPercent != null ? rarityTier(roll.rarityPercent) : null;
  const heading = darkMode ? "text-white" : "text-gray-900";
  const muted = darkMode ? "text-gray-300" : "text-gray-600";
  const title = !revealed ? "Rolling for a reward…" : won ? "You won a reward!" : "No reward this time";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reward-roll-title"
        className={`relative rounded-lg shadow-xl max-w-sm w-full p-6 text-center ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`}
      >
        <button
          type="button"
          aria-label="Close reward roll"
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {label && <p className={`text-xs font-medium uppercase tracking-wide mb-3 px-6 ${muted}`}>Finished: {label}</p>}

        <div className="flex justify-center mb-4" aria-hidden="true">
          {!revealed
            ? <Dices className="w-14 h-14 text-purple-600 animate-spin motion-reduce:animate-none" />
            : won
              ? <Gift className="w-14 h-14 text-green-600" />
              : <Sparkles className={`w-14 h-14 ${darkMode ? "text-gray-500" : "text-gray-400"}`} />}
        </div>

        {/* Announced once on open and again when the result lands. */}
        <div aria-live="polite">
          <h2 id="reward-roll-title" className={`text-xl font-semibold ${heading}`}>{title}</h2>

          {revealed && won && (
            <div className="mt-3">
              <p className={`text-2xl font-bold ${heading}`}>{roll.rewardName}</p>
              {roll.rewardDescription && <p className={`mt-1 text-sm ${muted}`}>{roll.rewardDescription}</p>}
              {tier && (
                <span className={`inline-block mt-3 text-xs font-medium px-2.5 py-1 rounded-full ${darkMode ? TIER_STYLE[tier].dark : TIER_STYLE[tier].light}`}>
                  {tier} · {roll.rarityPercent}% chance
                </span>
              )}
            </div>
          )}

          {revealed && !won && (
            <p className={`mt-2 text-sm ${muted}`}>
              Every finished assignment and study session gets a roll. Better luck on the next one.
            </p>
          )}
        </div>

        <button
          ref={buttonRef}
          type="button"
          onClick={revealed ? onClose : () => setRevealed(true)}
          className={`mt-6 w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
            revealed
              ? "bg-green-600 hover:bg-green-700 text-white"
              : (darkMode ? "border border-gray-600 text-gray-200 hover:bg-[var(--cp-page)]" : "border border-gray-300 text-gray-700 hover:bg-gray-50")
          }`}
        >
          {!revealed ? "Skip" : won ? "Nice!" : "Close"}
        </button>
      </div>
    </div>
  );
}
