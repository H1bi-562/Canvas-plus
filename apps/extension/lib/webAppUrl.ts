export function getWebAppUrl(value = "http://localhost:3000"): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("WXT_WEB_APP_URL must be an HTTP(S) URL without credentials");
  return url.href;
}

export function openWebApp(tabs: { create: (options: { url: string }) => Promise<unknown> }, value?: string) {
  return tabs.create({ url: getWebAppUrl(value) });
}
