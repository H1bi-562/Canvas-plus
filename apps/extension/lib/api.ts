// Reads the signed-in student's data from the web app's API. The extension's
// host permission for the web app lets the session cookie ride along, so the
// popup needs no token of its own and the web app needs no CORS headers.

export class SignedOutError extends Error {}

export async function getJson<T>(webAppUrl: string, path: string, fetcher: typeof fetch = fetch): Promise<T> {
  const res = await fetcher(new URL(path, webAppUrl), { credentials: "include" });
  if (res.status === 401) throw new SignedOutError("Not signed in to CanvasPlus.");
  if (!res.ok) throw new Error(`CanvasPlus returned HTTP ${res.status}.`);
  return res.json() as Promise<T>;
}
