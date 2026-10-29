import { browser } from "wxt/browser";
import { getWebAppUrl } from "../lib/webAppUrl";

const SETTINGS_KEY = "canvasplus:focus-settings";
const WEB_APP_URL = new URL(
  getWebAppUrl(import.meta.env.WXT_WEB_APP_URL)
);

const WEB_APP_ORIGIN = WEB_APP_URL.origin;
const WEB_APP_MATCH = `${WEB_APP_URL.protocol}//${WEB_APP_URL.hostname}/*`;

type FocusSettingsMessage = {
  source: "canvasplus-web";
  type: "FOCUS_SETTINGS";
  enabled: boolean;
  sites: string[];
};

function send(settings: { enabled: boolean; sites: string[] }) {
  void browser.runtime.sendMessage({
    source: "canvasplus-web",
    type: "FOCUS_SETTINGS",
    enabled: settings.enabled,
    sites: settings.sites,
  }).catch(() => {
    // The extension may be reloading during development.
  });
}

export default defineContentScript({
  matches: [WEB_APP_MATCH],
  runAt: "document_start",
  main() {
    window.addEventListener("message", (event: MessageEvent<FocusSettingsMessage>) => {
      if (event.source !== window || event.origin !== WEB_APP_ORIGIN) return;
      if (event.data?.source !== "canvasplus-web" || event.data.type !== "FOCUS_SETTINGS") return;
      send({ enabled: event.data.enabled === true, sites: Array.isArray(event.data.sites) ? event.data.sites : [] });
    });

    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { enabled?: unknown; sites?: unknown };
      send({
        enabled: saved.enabled === true,
        sites: Array.isArray(saved.sites) ? saved.sites.filter((site): site is string => typeof site === "string") : [],
      });
    } catch {
      // The web app will publish a fresh value after it hydrates.
    }
  },
});
