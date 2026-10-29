import { browser } from "wxt/browser";

const SETTINGS_KEY = "canvasplus:focus-settings";
const RULE_ID_START = 1000;
const MAX_BLOCKED_SITES = 100;

type FocusSettings = {
  enabled: boolean;
  sites: string[];
};

function normalizeDomain(value: string): string | null {
  const text = value.trim();
  if (!text) return null;

  try {
    const url = new URL(text.includes("://") ? text : `https://${text}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

function domainsFromSites(sites: string[]): string[] {
  return [...new Set(sites.map(normalizeDomain).filter((site): site is string => Boolean(site)))].slice(0, MAX_BLOCKED_SITES);
}

async function applyBlocking(settings: FocusSettings) {
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .map((rule) => rule.id)
    .filter((id) => id >= RULE_ID_START && id < RULE_ID_START + MAX_BLOCKED_SITES);

  const domains = domainsFromSites(settings.sites);
  const addRules = settings.enabled
    ? domains.map((domain, index) => ({
        id: RULE_ID_START + index,
        priority: 1,
        action: { type: "block" as const },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ["main_frame" as const],
        },
      }))
    : [];

  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

async function restoreBlocking() {
  const saved = await browser.storage.local.get(SETTINGS_KEY);
  const settings = saved[SETTINGS_KEY] as Partial<FocusSettings> | undefined;
  await applyBlocking({
    enabled: settings?.enabled === true,
    sites: Array.isArray(settings?.sites) ? settings.sites.filter((site): site is string => typeof site === "string") : [],
  });
}
  export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (
      !message ||
      typeof message !== "object" ||
      (message as { type?: unknown }).type !== "FOCUS_SETTINGS"
    ) {
      return;
    }

    const incoming = message as {
      enabled?: unknown;
      sites?: unknown;
    };

    const settings: FocusSettings = {
      enabled: incoming.enabled === true,
      sites: Array.isArray(incoming.sites)
        ? incoming.sites.filter(
            (site): site is string => typeof site === "string"
          )
        : [],
    };

    void applyBlocking(settings).catch((error) =>
      console.error("CanvasPlus blocking update failed", error)
    );
  });

  browser.runtime.onInstalled.addListener(() => {
    void restoreBlocking();
  });

  browser.runtime.onStartup.addListener(() => {
    void restoreBlocking();
  });
});
