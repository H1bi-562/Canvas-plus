import { api } from "@/lib/server/api";
import { buildAuthorizeUrl, signState } from "@/lib/server/canvasAuth";

export const GET = api(async ({ user, query }) => {
  const authorizeURL = buildAuthorizeUrl(signState(user.id));
  return query.redirect === "1" ? Response.redirect(authorizeURL) : { authorizeURL };
});
