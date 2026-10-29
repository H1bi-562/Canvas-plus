// Toolbar popup: the student's top priorities (UC15) in their chosen colour
// theme (UC22), from the web app's own API. Clicking an assignment opens it on
// Canvas, where it is submitted; the next refresh then drops it from the list.

import { StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import PriorityList, { type PriorityItem } from "@canvasplus/ui/PriorityList";
import { getTheme, type ThemeId } from "@canvasplus/ui/themes";
import { getJson, SignedOutError } from "../../lib/api";
import { getWebAppUrl, openWebApp } from "../../lib/webAppUrl";
import "./style.css";

const WEB_APP_URL = getWebAppUrl(import.meta.env.WXT_WEB_APP_URL);
// The last theme seen, so the next open paints in it before /api/layout answers.
const THEME_KEY = "canvasplus:theme";

type Row = PriorityItem & { htmlURL: string | null };

function cachedTheme(): ThemeId {
  try {
    return getTheme(localStorage.getItem(THEME_KEY)).id;
  } catch {
    return getTheme(null).id;
  }
}

const open = (url: string) => void openWebApp(browser.tabs, url).catch(console.error);

function Popup() {
  const [themeId, setThemeId] = useState(cachedTheme);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const darkMode = getTheme(themeId).mode === "dark";

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeId;
  }, [themeId]);

  useEffect(() => {
    // The same theme row the web app saves to, so both always match.
    getJson<{ theme: string }>(WEB_APP_URL, "/api/layout").then(({ theme }) => {
      const id = getTheme(theme).id;
      setThemeId(id);
      try {
        localStorage.setItem(THEME_KEY, id);
      } catch {
        // Storage blocked: the default paints first next time.
      }
    }).catch(() => {}); // A signed-out student is reported by the request below.

    // The stored copy at once, then the server's re-sync from Canvas if it was stale.
    getJson<Row[]>(WEB_APP_URL, "/api/assignments")
      .then((first) => {
        setRows(first);
        return getJson<Row[]>(WEB_APP_URL, "/api/assignments?refresh=stale");
      })
      .then(setRows)
      .catch((err) => {
        if (err instanceof SignedOutError) setSignedOut(true);
        else setError(`Could not reach CanvasPlus at ${new URL(WEB_APP_URL).host}. ${err.message}`);
      });
  }, []);

  const ink = darkMode ? "text-white" : "text-gray-900";
  const muted = darkMode ? "text-gray-300" : "text-gray-600";
  const button = "text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded-lg transition-colors";

  return (
    <main className="p-3 space-y-3">
      <header className="flex items-center justify-between gap-3">
        <h1 className={`text-lg font-semibold ${ink}`}>CanvasPlus</h1>
        <button type="button" className={button} onClick={() => open(WEB_APP_URL)}>Open dashboard</button>
      </header>

      {signedOut ? (
        <section className={`rounded-lg shadow-sm p-5 text-center ${darkMode ? "bg-[var(--cp-card)]" : "bg-white"}`}>
          <p className={`text-sm mb-3 ${muted}`}>Sign in to CanvasPlus to see your top priorities.</p>
          <button type="button" className={button} onClick={() => open(new URL("/login", WEB_APP_URL).href)}>Sign in</button>
        </section>
      ) : (
        <PriorityList
          items={rows ?? []}
          darkMode={darkMode}
          isLoading={rows === null && !error}
          // Keep showing the stored list if only the refresh failed.
          error={rows ? null : error}
          onSelect={(row) => open(row.htmlURL ?? WEB_APP_URL)}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Popup /></StrictMode>);
