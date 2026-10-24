// UC23 – the wizard's theme pick. DashboardProvider (which owns theme sync on the dashboard)
// is not mounted on /onboarding, so this mirrors its changeTheme + pushTheme rules: apply at
// once, mark this browser's copy dirty, save, then mark it clean with the server's row. If the
// save fails, the copy stays dirty and the dashboard pushes it on its next sync.
import type { ThemeId } from "@canvasplus/ui/themes";
import { saveTheme } from "@/app/(dashboard)/assignments/_api/layoutApi";
import { readPreferences, writePreferences } from "@/lib/preferencesCache";

export async function applyThemeChoice(userId: string, id: ThemeId): Promise<void> {
  document.documentElement.dataset.theme = id;
  const local = readPreferences(userId);
  writePreferences(userId, { theme: id, layout: local?.layout ?? null, updatedAt: local?.updatedAt ?? null, themeDirty: true });
  try {
    const res = await saveTheme(id);
    // A newer pick replaced this one while it was saving: leave that pick's state alone.
    if (readPreferences(userId)?.theme !== id) return;
    writePreferences(userId, { theme: id, layout: res.layout, updatedAt: res.updatedAt, themeDirty: false });
  } catch (err) {
    console.error("Could not save theme; the dashboard will retry:", err);
  }
}
