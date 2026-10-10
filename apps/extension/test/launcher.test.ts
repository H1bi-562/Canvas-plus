import { expect, test, vi } from "vitest";
import { openWebApp, getWebAppUrl } from "../lib/webAppUrl";

test("launches a single tab at the configured HTTP(S) address", async () => {
  expect(getWebAppUrl()).toBe("http://localhost:3000/");
  expect(getWebAppUrl("https://canvasplus.example/app")).toBe("https://canvasplus.example/app");
  expect(() => getWebAppUrl("javascript:alert(1)")).toThrow();
  const create = vi.fn().mockResolvedValue({});
  await openWebApp({ create }, "https://canvasplus.example");
  expect(create).toHaveBeenCalledExactlyOnceWith({ url: "https://canvasplus.example/" });
});
