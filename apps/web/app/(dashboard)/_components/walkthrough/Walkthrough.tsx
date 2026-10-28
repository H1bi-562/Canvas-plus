"use client";

// UC23 – the in-app walkthrough. After the setup wizard, it moves across the real pages,
// dims the screen, outlines the feature it describes, and explains it in a small popup.
// Ending it in any way records onboarding step "tour", so it shows once until Run setup again.
// Loaded with next/dynamic only while it is running, so returning users never download it.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { THEMES } from "@canvasplus/ui/themes";
import { saveOnboardingStep } from "@/lib/onboardingApi";
import { useDashboard } from "@/app/(dashboard)/_components/DashboardProvider";
import { WALKTHROUGH_STEPS, type SkipContext } from "./walkthroughSteps";

const WIDE_QUERY = "(min-width: 768px)"; // matches HomeView
const PAD = 6;
const POPUP_WIDTH = 320;

interface Rect { top: number; left: number; width: number; height: number }

interface WalkthroughProps {
  /** Called once when the tour ends (it has already been recorded or attempted). */
  onEnd: () => void;
  /** How long to wait for a feature to appear before skipping its stop. */
  markerTimeoutMs?: number;
}

export default function Walkthrough({ onEnd, markerTimeoutMs = 8000 }: WalkthroughProps) {
  const { assignments, themeId, changeTheme, darkMode } = useDashboard();
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const direction = useRef<1 | -1>(1);
  const ended = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const context = useCallback((): SkipContext => ({
    wide: typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY).matches : true,
    assignmentCount: assignments.length
  }), [assignments.length]);

  const isActive = useCallback((i: number) => !WALKTHROUGH_STEPS[i].skip?.(context()), [context]);
  const step = WALKTHROUGH_STEPS[index];
  const active = WALKTHROUGH_STEPS.map((_, i) => i).filter(isActive);
  const position = active.indexOf(index) + 1;
  const isFirst = active[0] === index;
  const isLast = active[active.length - 1] === index;

  /** Record the tour and close. Runs once, whatever ends it. */
  const end = useCallback((result: "done" | "skipped") => {
    if (ended.current) return;
    ended.current = true;
    saveOnboardingStep("tour", result).catch((err) => console.error("Could not record the walkthrough:", err));
    onEnd();
  }, [onEnd]);

  /** Move to the next (or previous) stop that is not skipped; past the end means done. */
  const go = useCallback((dir: 1 | -1) => {
    direction.current = dir;
    let i = index + dir;
    while (i >= 0 && i < WALKTHROUGH_STEPS.length && !isActive(i)) i += dir;
    if (i >= WALKTHROUGH_STEPS.length) return end("done");
    if (i < 0) return;
    setRect(null);
    setStatus("loading");
    setIndex(i);
  }, [index, isActive, end]);

  // Go to the stop's page when the stop changes.
  useEffect(() => {
    if (!ended.current && pathname !== step.path) router.push(step.path);
    // Only when the stop changes; a page change is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // A page change the tour did not cause (e.g. the browser's Back button) ends it as skipped.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (ended.current) return;
    if (pathname !== lastPath.current && pathname !== step.path) end("skipped");
    lastPath.current = pathname;
  }, [pathname, step.path, end]);

  // Find the outlined element once its page has rendered; skip the stop if it never appears.
  useEffect(() => {
    if (ended.current || pathname !== step.path) return;
    if (!step.marker) { setRect(null); setStatus("ready"); return; }
    let target: Element | null = null;
    let observer: ResizeObserver | undefined;
    const measure = () => {
      if (!target) return;
      const r = target.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const startedAt = Date.now();
    const poll = window.setInterval(() => {
      target = document.querySelector(`[data-tour="${step.marker}"]`);
      if (target) {
        window.clearInterval(poll);
        (target as HTMLElement).scrollIntoView?.({ block: "center" });
        measure();
        setStatus("ready");
        window.addEventListener("resize", measure);
        // Pages scroll inner containers, not the window: listen in the capture phase.
        document.addEventListener("scroll", measure, true);
        if (typeof ResizeObserver === "function") { observer = new ResizeObserver(measure); observer.observe(target); }
      } else if (Date.now() - startedAt >= markerTimeoutMs) {
        window.clearInterval(poll);
        go(direction.current);
      }
    }, 50);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
      observer?.disconnect();
    };
    // go is intentionally read fresh only when a stop times out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pathname, markerTimeoutMs]);

  // Keyboard: Esc ends, arrows move, Tab stays inside the popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); end("skipped"); }
      else if (e.key === "ArrowRight" && status === "ready") go(1);
      else if (e.key === "ArrowLeft" && !isFirst) go(-1);
      else if (e.key === "Tab" && dialogRef.current) {
        const items = dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [end, go, isFirst, status]);

  // Each stop: move focus into the popup so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (status === "ready") dialogRef.current?.focus();
  }, [status, index]);

  // ── Placement ─────────────────────────────────────────────────────────
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;
  const box = rect && { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
  let popupStyle: React.CSSProperties;
  if (box) {
    const below = box.top + box.height + 12;
    const top = below + 220 > viewportH && box.top > 240 ? Math.max(12, box.top - 12 - 220) : Math.min(below, viewportH - 232);
    const left = Math.min(Math.max(12, box.left), Math.max(12, viewportW - POPUP_WIDTH - 12));
    popupStyle = { top, left, width: POPUP_WIDTH };
  } else {
    popupStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: POPUP_WIDTH };
  }

  const ink = darkMode ? "text-white" : "text-gray-900";
  const muted = `text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`;
  const primary = "inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded-lg disabled:opacity-50";
  const secondary = `inline-flex items-center gap-2 text-sm py-2 px-4 rounded-lg border ${darkMode ? "border-gray-600 text-gray-200" : "border-gray-300 text-gray-700"}`;

  return (
    <>
      {/* Blocks clicks on the page during the tour; dims it when nothing is outlined. */}
      <div aria-hidden="true" className={`fixed inset-0 z-[60] ${box ? "" : "bg-black/50"}`} />
      {box && (
        <div data-testid="walkthrough-spotlight" aria-hidden="true"
          className="fixed z-[61] rounded-lg border-2 border-blue-500 pointer-events-none transition-all duration-200"
          style={{ ...box, boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />
      )}
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="walkthrough-title" tabIndex={-1}
        className={`fixed z-[62] rounded-lg shadow-xl p-4 focus:outline-none ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`}
        style={popupStyle}>
        <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          Stop {position} of {active.length}
        </p>
        <h2 id="walkthrough-title" className={`font-semibold mb-1 ${ink}`}>{step.title}</h2>
        <p className={`${muted} mb-3`}>{step.text}</p>
        {status === "loading" && (
          <p className={`${muted} mb-3 inline-flex items-center gap-2`}><Loader2 className="w-4 h-4 animate-spin" />Loading…</p>
        )}
        {step.id === "theme" && (
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-1.5 mb-3">
            {THEMES.map((theme) => {
              const selected = theme.id === themeId;
              return (
                <button key={theme.id} type="button" role="radio" aria-checked={selected} onClick={() => changeTheme(theme.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm ${
                    selected ? "border-blue-600 ring-2 ring-blue-600/30" : darkMode ? "border-gray-600" : "border-gray-300"} ${ink}`}>
                  {theme.label}
                  {selected && <Check className="w-4 h-4 text-blue-600" />}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!isFirst && <button type="button" onClick={() => go(-1)} className={secondary}>Back</button>}
          <button type="button" onClick={() => (isLast ? end("done") : go(1))} disabled={status !== "ready"} className={primary}>
            {isLast ? "Done" : "Next"}
          </button>
          <button type="button" onClick={() => end("skipped")} className={`ml-auto text-sm underline ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
            Skip tour
          </button>
        </div>
      </div>
    </>
  );
}
