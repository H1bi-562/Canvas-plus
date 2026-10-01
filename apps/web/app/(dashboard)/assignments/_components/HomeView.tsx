// src/components/home/HomeView.tsx
// UC22 – Customizable Dashboard & Widget Layout.
//
// The home screen is a grid of widgets (widgetRegistry.tsx). In edit mode the
// student drags widgets by their handle, resizes them from the corner, removes
// them, and adds hidden ones back from the widget library. Nothing is stored
// until Save; Cancel throws the draft away. The saved layout lives on the
// server (routes/layout.js), so it follows the student across devices.
//
// Below 768px the grid is replaced by a single stacked column in layout order,
// and editing is disabled: dragging a 12-column grid on a phone is not usable.
//
// The side panel also holds the colour theme picker. Unlike the layout, a theme
// applies (and saves) the moment it is clicked, the way VS Code's does, so
// Cancel does not undo it.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { Check, GripVertical, Loader2, Pencil, Plus, RotateCcw, X } from "lucide-react";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "@/app/(dashboard)/assignments/_components/home.css";
import { WIDGETS, DEFAULT_LAYOUT, type WidgetContext } from "@/app/(dashboard)/assignments/_components/widgetRegistry";
import { fetchLayout, saveLayout, resetLayout, type LayoutItem } from "@/app/(dashboard)/assignments/_api/layoutApi";
import { fetchAnalyticsSummary, localDateKey, type AnalyticsSummary } from "@/lib/analyticsApi";
import { ApiError } from "@/lib/apiClient";
import type { Assignment } from "@/lib/assignmentsApi";
import { THEMES, type ThemeId } from "@/lib/themes";

const Grid = WidthProvider(GridLayout);

const COLS = 12;
const ROW_HEIGHT = 40;
const MARGIN = 16;
const WIDE_QUERY = "(min-width: 768px)";

/** Drop widgets the client does not know (e.g. removed in a later release). */
const known = (layout: LayoutItem[]) => layout.filter((item) => WIDGETS[item.i]);

const plain = (layout: readonly LayoutItem[]): LayoutItem[] =>
  layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));

/** Order-insensitive equality on the grid fields only. */
function sameLayout(a: readonly LayoutItem[], b: readonly LayoutItem[]) {
  const key = (l: readonly LayoutItem[]) =>
    JSON.stringify(plain(l).sort((p, q) => p.i.localeCompare(q.i)));
  return key(a) === key(b);
}

/** Reading order: top to bottom, then left to right. */
const readingOrder = (layout: LayoutItem[]) =>
  [...layout].sort((a, b) => a.y - b.y || a.x - b.x);

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useIsWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
}

interface HomeViewProps {
  darkMode: boolean;
  assignments: Assignment[];
  assignmentsLoading: boolean;
  assignmentsError: string | null;
  onSelectAssignment: (id: string) => void;
  getPriorityColor: (priority: string) => string;
  onOpenSettings: () => void;
  onStudyNow: () => void;
  /** Refresh assignments after a study session changes logged time. */
  onAssignmentsChanged: () => void;
  /** 401 from the API: the session ended. */
  onSignedOut: () => void;
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
}

export default function HomeView({
  darkMode,
  assignments,
  assignmentsLoading,
  assignmentsError,
  onSelectAssignment,
  getPriorityColor,
  onOpenSettings,
  onStudyNow,
  onAssignmentsChanged,
  onSignedOut,
  themeId,
  onThemeChange
}: HomeViewProps) {
  const wide = useIsWide();

  // ── Layout ────────────────────────────────────────────────────────────────
  const [saved, setSaved] = useState<LayoutItem[] | null>(null);
  const [draft, setDraft] = useState<LayoutItem[] | null>(null); // non-null = editing
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) {
      onSignedOut();
      return null;
    }
    return err instanceof ApiError ? err.message : fallback;
  }, [onSignedOut]);

  useEffect(() => {
    let cancelled = false;
    fetchLayout()
      .then((res) => { if (!cancelled) setSaved(known(res.layout)); })
      .catch((err) => {
        if (cancelled) return;
        // Still show a usable home screen; saving will surface the real problem.
        setSaved(DEFAULT_LAYOUT);
        setLayoutError(handleError(err, "Could not load your saved layout, showing the default."));
      });
    return () => { cancelled = true; };
  }, [handleError]);

  const editing = draft !== null;
  const layout = draft ?? saved;

  // ── Analytics summary, shared by every analytics widget ───────────────────
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const needsSummary = useMemo(
    () => (layout ?? []).some((item) => WIDGETS[item.i]?.usesSummary),
    [layout]
  );

  const loadSummary = useCallback(async () => {
    const request = ++requestRef.current;
    setSummaryError(null);
    try {
      const next = await fetchAnalyticsSummary({ from: localDateKey(-29), to: localDateKey() });
      if (request === requestRef.current) setSummary(next);
    } catch (err) {
      if (request !== requestRef.current) return;
      setSummaryError(handleError(err, "Could not load analytics."));
    }
  }, [handleError]);

  // Fetch once, the first time an analytics widget is on screen.
  useEffect(() => {
    if (needsSummary && !summary && !summaryError) loadSummary();
  }, [needsSummary, summary, summaryError, loadSummary]);

  // Assignment changes (sync, demo data, Mark done) can move every chart.
  useEffect(() => {
    if (summary) loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);

  const ctx: WidgetContext = {
    darkMode,
    assignments,
    assignmentsLoading,
    assignmentsError,
    onSelectAssignment,
    getPriorityColor,
    onOpenSettings,
    onStudyNow,
    onSessionEnd: onAssignmentsChanged, // the assignments effect above refreshes the summary
    summary,
    summaryError,
    onRetrySummary: loadSummary
  };

  // ── Edit actions ──────────────────────────────────────────────────────────
  const startEditing = () => {
    setLayoutError(null);
    setDraft(saved ?? DEFAULT_LAYOUT);
  };
  const cancelEditing = () => {
    setLayoutError(null);
    setDraft(null);
  };

  const removeWidget = (id: string) => setDraft((d) => d && d.filter((item) => item.i !== id));

  const addWidget = (id: string) => setDraft((d) => {
    if (!d) return d;
    const spec = WIDGETS[id];
    const bottom = d.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    return [...d, { i: id, x: 0, y: bottom, w: Math.min(spec.defaultW, COLS), h: spec.defaultH }];
  });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setLayoutError(null);
    try {
      // Matching the default is stored as "no custom layout", so a student who
      // resets keeps getting future improvements to the default.
      const res = sameLayout(draft, DEFAULT_LAYOUT) ? await resetLayout() : await saveLayout(draft);
      setSaved(known(res.layout));
      setDraft(null);
    } catch (err) {
      setLayoutError(handleError(err, "Could not save your layout."));
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const ink = darkMode ? "text-white" : "text-gray-900";
  const muted = darkMode ? "text-gray-300" : "text-gray-600";
  const panel = darkMode ? "bg-[var(--cp-card)]" : "bg-white";
  const ghostButton = `inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
    darkMode ? "border-gray-600 text-gray-200 hover:bg-[var(--cp-card)]" : "border-gray-300 text-gray-700 hover:bg-gray-100"
  }`;
  const primaryButton =
    "inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60";

  const hidden = editing ? Object.keys(WIDGETS).filter((id) => !draft.some((item) => item.i === id)) : [];
  const dirty = editing && saved !== null && !sameLayout(draft, saved);

  return (
    <div className={`flex-1 overflow-y-auto px-4 py-6 ${darkMode ? "home-dark" : ""}`}>
      <div className="max-w-6xl mx-auto">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h2 className={`text-xl font-semibold ${ink}`}>{editing ? "Customize your dashboard" : "Dashboard"}</h2>
            <p className={`text-sm ${muted}`}>
              {editing
                ? "Drag widgets by the handle, resize from the bottom-right corner, then Save."
                : "Your assignments, timer and study stats in one place."}
            </p>
          </div>

          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={ghostButton} onClick={() => setDraft(DEFAULT_LAYOUT)}>
                <RotateCcw className="w-4 h-4" /> Reset to default
              </button>
              <button type="button" className={ghostButton} onClick={cancelEditing} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={primaryButton} onClick={save} disabled={saving || !dirty}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          ) : (
            wide && saved && (
              <button type="button" className={ghostButton} onClick={startEditing}>
                <Pencil className="w-4 h-4" /> Customize
              </button>
            )
          )}
        </div>

        {layoutError && (
          <div role="alert" className={`mb-2 p-3 rounded-lg text-sm ${
            darkMode ? "bg-red-900/30 border border-red-700 text-red-300" : "bg-red-50 border border-red-200 text-red-700"
          }`}>
            {layoutError}
          </div>
        )}

        {!layout ? (
          <div className={`flex items-center gap-2 py-16 justify-center ${muted}`}>
            <Loader2 className="w-5 h-5 animate-spin" /> Loading your dashboard…
          </div>
        ) : !wide ? (
          // Narrow screens: one column, in the order the student arranged.
          <div className="space-y-4 mt-2">
            {readingOrder(layout).map((item) => {
              const Widget = WIDGETS[item.i].Component;
              return (
                <div
                  key={item.i}
                  className="overflow-y-auto"
                  style={{ maxHeight: item.h * ROW_HEIGHT + (item.h - 1) * MARGIN }}
                >
                  <Widget {...ctx} />
                </div>
              ); })}
          </div>
        ) : (
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-0">
              {layout.length === 0 && (
                <p className={`text-sm text-center py-16 ${muted}`}>
                  Your dashboard is empty. Add widgets from the library.
                </p>
              )}
              <Grid
                className={editing ? "home-grid-editing" : ""}
                layout={layout.map((item) => ({ ...item, minW: WIDGETS[item.i].minW, minH: WIDGETS[item.i].minH }))}
                cols={COLS}
                rowHeight={ROW_HEIGHT}
                margin={[MARGIN, MARGIN]}
                containerPadding={[0, MARGIN]}
                isDraggable={editing}
                isResizable={editing}
                draggableHandle=".widget-drag-handle"
                resizeHandles={["se"]}
                onLayoutChange={(next: Layout[]) => { if (editing) setDraft(plain(next)); }}
              >
                {layout.map((item) => {
                  const spec = WIDGETS[item.i];
                  const Widget = spec.Component;
                  return (
                    <div key={item.i} className={`flex flex-col ${editing ? "widget-editing rounded-lg" : ""}`}>
                      {editing && (
                        <div className={`flex items-center justify-between gap-2 px-2 py-1 rounded-t-lg ${
                          darkMode ? "bg-[var(--cp-raised)] text-gray-200" : "bg-blue-50 text-gray-700"
                        }`}>
                          <span className="widget-drag-handle flex items-center gap-1 text-sm font-medium cursor-move select-none flex-1">
                            <GripVertical className="w-4 h-4" aria-hidden="true" /> {spec.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeWidget(item.i)}
                            className={`p-1 rounded ${darkMode ? "hover:bg-[var(--cp-raised)]" : "hover:bg-blue-100"}`}
                            aria-label={`Remove ${spec.title}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {/* While editing, widgets are previews: no accidental timer starts or clicks. */}
                      <div className={`flex-1 min-h-0 overflow-y-auto ${editing ? "pointer-events-none select-none" : ""}`}>
                        <Widget {...ctx} />
                      </div>
                    </div>
                  );
                })}
              </Grid>
            </div>

            {editing && (
              <aside
                className={`w-64 shrink-0 rounded-lg shadow-sm p-4 mt-4 sticky top-0 ${panel}`}
                aria-label="Widget library"
              >
                <h3 className={`font-semibold mb-1 ${ink}`}>Theme</h3>
                <p className={`text-xs mb-3 ${muted}`}>Applies and saves right away.</p>
                <div className="grid grid-cols-1 gap-1.5 mb-5" role="radiogroup" aria-label="Colour theme">
                  {THEMES.map((theme) => {
                    const selected = theme.id === themeId;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onThemeChange(theme.id)}
                        className={`flex items-center gap-2.5 p-1.5 rounded-lg border text-left transition-colors ${
                          selected
                            ? "border-blue-600"
                            : (darkMode ? "border-gray-600 hover:bg-[var(--cp-raised)]" : "border-gray-200 hover:bg-gray-50")
                        }`}
                      >
                        {/* A tiny window in the theme's own colours: page, card, text, accent. */}
                        <span
                          data-theme={theme.id}
                          aria-hidden="true"
                          className="relative w-12 h-8 shrink-0 rounded border border-black/10 bg-[var(--cp-page)] overflow-hidden"
                        >
                          <span className="absolute left-1 top-1 right-1 bottom-1 rounded-sm bg-[var(--cp-card)]" />
                          <span className="absolute left-2 top-2 w-5 h-0.5 rounded bg-[var(--cp-ink)]" />
                          <span className="absolute left-2 top-3.5 w-3 h-0.5 rounded bg-[var(--cp-ink)] opacity-60" />
                          <span className="absolute left-2 bottom-2 w-4 h-1 rounded-sm bg-[var(--cp-accent)]" />
                        </span>
                        <span className={`flex-1 text-sm ${ink}`}>{theme.label}</span>
                        {selected && <Check className="w-4 h-4 text-blue-600" strokeWidth={3} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>

                <h3 className={`font-semibold mb-1 ${ink}`}>Widget library</h3>
                <p className={`text-xs mb-3 ${muted}`}>Widgets not on your dashboard.</p>
                {hidden.length === 0 ? (
                  <p className={`text-sm ${muted}`}>Every widget is already on your dashboard.</p>
                ) : (
                  <ul className="space-y-2">
                    {hidden.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => addWidget(id)}
                          className={`w-full text-left p-2 rounded-lg border transition-colors ${
                            darkMode ? "border-gray-600 hover:bg-[var(--cp-raised)]" : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <span className={`flex items-center gap-1.5 text-sm font-medium ${ink}`}>
                            <Plus className="w-4 h-4" /> {WIDGETS[id].title}
                          </span>
                          <span className={`block text-xs mt-0.5 ${muted}`}>{WIDGETS[id].description}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
