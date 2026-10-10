import { requireUser } from "./session";
import { CanvasAuthError } from "./canvasAuth";

type Context = {
  user: Awaited<ReturnType<typeof requireUser>>;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
};
type RouteContext = { params?: Promise<Record<string, string>> };

export function api(handler: (context: Context) => Promise<unknown>, options: { status?: number; developmentOnly?: boolean } = {}) {
  return async (request: Request, route: RouteContext = {}) => {
    try {
      if (options.developmentOnly && process.env.NODE_ENV === "production") return Response.json({ error: "Not found" }, { status: 404 });
      const user = await requireUser(request);
      const mutates = !["GET", "HEAD"].includes(request.method);
      const origin = request.headers.get("origin");
      if (mutates && origin && origin !== new URL(process.env.BETTER_AUTH_URL || request.url).origin) {
        return Response.json({ error: "Untrusted origin" }, { status: 403 });
      }
      let body: Record<string, unknown> = {};
      if (mutates && request.method !== "DELETE") {
        if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "Expected JSON" }, { status: 415 });
        const text = await request.text();
        if (text.length > 1_000_000) return Response.json({ error: "Request too large" }, { status: 413 });
        const parsed: unknown = text ? JSON.parse(text) : {};
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "Expected an object" }, { status: 400 });
        body = parsed as Record<string, unknown>;
      }
      const params = await route.params ?? {};
      if (params.id && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.id)) return Response.json({ error: "Invalid id" }, { status: 400 });
      const data = await handler({ user, body, params, query: Object.fromEntries(new URL(request.url).searchParams) });
      return data instanceof Response ? data : Response.json(data, { status: options.status ?? 200 });
    } catch (error) {
      if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
      if (error instanceof CanvasAuthError && [502, 503].includes(error.status)) return Response.json({ error: error.message }, { status: error.status });
      const failure = error as { status?: number; code?: string; message?: string };
      if (failure.code === "22P02" || failure.code === "22007") return Response.json({ error: "Invalid input" }, { status: 400 });
      const status = failure.status && failure.status >= 400 && failure.status < 500 ? failure.status : 500;
      if (status === 500) console.error("API request failed:", error);
      return Response.json({ error: status === 500 ? "Request failed" : failure.message }, { status });
    }
  };
}
