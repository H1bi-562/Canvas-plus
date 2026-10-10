import { requireUser } from "@/lib/server/session";
import { verifyState, exchangeCodeForTokens, saveGrant } from "@/lib/server/canvasAuth";

export async function GET(request: Request) {
  const target = new URL("/settings", process.env.BETTER_AUTH_URL || request.url);
  try {
    const user = await requireUser(request);
    const query = new URL(request.url).searchParams;
    if (query.has("error") || !query.get("code") || !query.get("state")) throw new Error("Canvas authorization failed");
    const userId = verifyState(query.get("state"));
    if (userId !== user.id) throw new Error("Canvas account mismatch");
    await saveGrant(user.id, await exchangeCodeForTokens(query.get("code")));
    target.searchParams.set("canvas", "connected");
  } catch {
    target.searchParams.set("canvas", "error");
  }
  return Response.redirect(target, 303);
}
