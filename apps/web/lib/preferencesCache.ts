// UC22 – this browser's copy of the student's theme and dashboard layout.
// The database ("DashboardLayout") stays the source of truth; the copy lets a
// reload paint the saved theme and layout at once, carries a change to the
// student's other tabs, and keeps a theme picked offline until it is saved.

import type { LayoutItem } from "@/app/(dashboard)/assignments/_api/layoutApi";
import { getTheme, type ThemeId } from "@/lib/themes";

export interface CachedPreferences {
  theme: ThemeId;
  /** The layout as the server last returned it (its default included); null before the first sync. */
  layout: LayoutItem[] | null;
  /** The server row's updatedAt the copy matches; changes whenever any device saves. */
  updatedAt: string | null;
  /** Picked here but not confirmed by the server yet; pushed on the next sync. */
  themeDirty: boolean;
}

// Per user, so a shared computer never shows one student another's dashboard.
const keyFor = (userId: string) => `canvasplus:preferences:${userId}`;

/** localStorage can be full, disabled, or hand-edited: anything odd reads as "no copy". */
function parse(raw: string | null): CachedPreferences | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || getTheme(value.theme).id !== value.theme) return null;
    return {
      theme: value.theme,
      layout: Array.isArray(value.layout) ? value.layout : null,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
      themeDirty: value.themeDirty === true
    };
  } catch {
    return null;
  }
}

export function readPreferences(userId: string): CachedPreferences | null {
  try {
    return parse(localStorage.getItem(keyFor(userId)));
  } catch {
    return null;
  }
}

export function writePreferences(userId: string, preferences: CachedPreferences) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(preferences));
  } catch {
    // Private mode or a full quota: the app still works from the server alone.
  }
}

export function clearPreferences(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/** Fires when another tab changes this student's copy (the storage event skips the writing tab). */
export function subscribePreferences(userId: string, onChange: (preferences: CachedPreferences) => void) {
  const listener = (event: StorageEvent) => {
    if (event.key !== keyFor(userId)) return;
    const preferences = parse(event.newValue);
    if (preferences) onChange(preferences);
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
