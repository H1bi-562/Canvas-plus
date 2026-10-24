"use client";

// UC23 step 4 – a card per core feature, then the theme picker and Finish.

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { THEMES, type ThemeId } from "@canvasplus/ui/themes";
import { TOUR_CARDS } from "./tourCards";
import { stepStyles } from "./stepStyles";

interface TourStepProps {
  darkMode: boolean;
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  /** Mark onboarding finished and open the dashboard; errors are shown by the wizard. */
  onFinish: () => Promise<void>;
}

export default function TourStep({ darkMode, themeId, onThemeChange, onFinish }: TourStepProps) {
  // 0..5 are cards; TOUR_CARDS.length is the theme picker.
  const [position, setPosition] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const s = stepStyles(darkMode);
  const picker = position === TOUR_CARDS.length;

  const finish = async () => {
    setFinishing(true);
    await onFinish();
    setFinishing(false);
  };

  if (picker) {
    return (
      <>
        <h2 className={`text-lg font-semibold mb-2 ${s.strong}`}>Pick a theme</h2>
        <p className={`${s.muted} mb-4`}>You can change it later under Customize on the home screen.</p>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
          {THEMES.map((theme) => {
            const selected = theme.id === themeId;
            return (
              <button key={theme.id} type="button" role="radio" aria-checked={selected} onClick={() => onThemeChange(theme.id)}
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                  selected ? "border-blue-600 ring-2 ring-blue-600/30" : darkMode ? "border-gray-600 hover:bg-[var(--cp-page)]" : "border-gray-300 hover:bg-gray-50"
                }`}>
                <span className={`text-sm ${s.strong}`}>{theme.label}</span>
                {selected && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setPosition(TOUR_CARDS.length - 1)} disabled={finishing} className={s.secondary}>Previous</button>
          <button type="button" onClick={() => void finish()} disabled={finishing} className={s.primary}>
            {finishing && <Loader2 className="w-4 h-4 animate-spin" />}
            Finish
          </button>
        </div>
      </>
    );
  }

  const card = TOUR_CARDS[position];
  const Icon = card.icon;
  return (
    <>
      <p className={`text-xs font-medium uppercase tracking-wide mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Card {position + 1} of {TOUR_CARDS.length}</p>
      <div className={`rounded-lg border p-5 mb-4 ${darkMode ? "border-gray-600" : "border-gray-200"}`}>
        <div className="flex items-center gap-3 mb-3">
          <Icon className="w-6 h-6 text-blue-600" aria-hidden="true" />
          <h2 className={`text-lg font-semibold ${s.strong}`}>{card.title}</h2>
        </div>
        <ul className={`list-disc pl-5 space-y-1.5 ${s.muted}`}>
          {card.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>
        <p className={`mt-4 text-sm ${s.strong}`}><span className="font-medium">Where to find it:</span> {card.where}</p>
      </div>
      <div className="flex items-center gap-1.5 mb-5" aria-hidden="true">
        {TOUR_CARDS.map((c, i) => <span key={c.id} className={`h-2 w-2 rounded-full ${i === position ? "bg-blue-600" : darkMode ? "bg-gray-600" : "bg-gray-300"}`} />)}
      </div>
      <div className="flex flex-wrap gap-3">
        {position > 0 && <button type="button" onClick={() => setPosition(position - 1)} className={s.secondary}>Previous</button>}
        <button type="button" onClick={() => setPosition(position + 1)} className={s.primary}>Next</button>
        <button type="button" onClick={() => setPosition(TOUR_CARDS.length)} className={s.secondary}>Skip tour</button>
      </div>
    </>
  );
}
