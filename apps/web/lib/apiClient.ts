import { authClient } from "@canvasplus/auth/client";

export const API_BASE = "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, method: string = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    throw new ApiError("Could not reach the server. Make sure the backend is running.", 0);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // A body is not guaranteed on every error path.
  }

  if (res.status === 401) {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("session-expired"));
    throw new ApiError("You are not signed in.", 401);
  }
  if (!res.ok) {
    throw new ApiError((json && typeof json === "object" && "error" in json && typeof json.error === "string" ? json.error : `Request failed (${res.status})`), res.status);
  }
  return json as T;
}

/** Revoke the session server-side and clear the auth cookie. */
export async function logout() {
  const result = await authClient.signOut();
  if (result.error) throw new ApiError(result.error.message || "Sign out failed", result.error.status);
}
