import { api } from "@/lib/server/api";
import { disconnect } from "@/lib/server/canvasAuth";

export const DELETE = api(async ({ user }) => {
  const { removed, revokedAtCanvas } = await disconnect(user.id);
  if (!removed) return Response.json({ error: "Canvas is not connected." }, { status: 404 });
  return { message: "Canvas disconnected.", revokedAtCanvas };
});
