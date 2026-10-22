import { expect, test, vi } from "vitest";
import { getJson, SignedOutError } from "../lib/api";

test("reads JSON from the web app with the session cookie, and spots a signed-out student", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json([{ id: "a1" }]))
    .mockResolvedValueOnce(Response.json({ error: "Not authenticated" }, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ error: "Request failed" }, { status: 500 }));
  await expect(getJson("https://canvasplus.example/", "/api/assignments", fetcher)).resolves.toEqual([{ id: "a1" }]);
  expect(fetcher).toHaveBeenCalledWith(new URL("https://canvasplus.example/api/assignments"), { credentials: "include" });
  await expect(getJson("https://canvasplus.example/", "/api/layout", fetcher)).rejects.toBeInstanceOf(SignedOutError);
  await expect(getJson("https://canvasplus.example/", "/api/layout", fetcher)).rejects.toThrow("HTTP 500");
});
