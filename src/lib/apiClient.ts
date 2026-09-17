// src/lib/apiClient.ts
// One fetch wrapper for every Canvas-Plus API call.
//
// Auth is an httpOnly cookie (UC4), so there is no token to attach: the browser
// sends it because of credentials: 'include'. A 401 therefore always means the
// Canvas-Plus session itself ended -- Canvas credential problems come back as
// 409 so the UI can tell the two apart.

// The Express API listens on 3000 (see PORT in .env). VITE_API_BASE overrides it,
// e.g. for a deployed API or a second local server on another port.
export const API_BASE: string = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, method: string = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('Could not reach the server. Make sure the backend is running.', 0);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // A body is not guaranteed on every error path.
  }

  if (res.status === 401) {
    throw new ApiError('You are not signed in.', 401);
  }
  if (!res.ok) {
    throw new ApiError(json?.error || `Request failed (${res.status})`, res.status);
  }
  return json as T;
}

/** Revoke the session server-side and clear the auth cookie. */
export function logout(): Promise<{ message: string }> {
  return apiRequest('/api/auth/logout', 'POST');
}
