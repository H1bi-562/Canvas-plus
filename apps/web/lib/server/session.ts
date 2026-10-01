import { auth } from "@canvasplus/auth/server";

export async function requireUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw Object.assign(new Error("Not authenticated"), { status: 401 });
  return session.user;
}
