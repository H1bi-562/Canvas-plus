// services/canvasSync.js
// Canvas assignment sync -- pull a student's active courses and their assignments
// from Canvas and upsert them into "Course" / "Assignment".
//
// Works the same whether the student connected with OAuth2 or a personal access
// token: it only ever asks canvasAuth.getValidAccessToken() for a token.
//
// Read-only by design. Every call to Canvas is a GET; nothing is submitted,
// edited, or messaged.

import axios from "axios";
import { storeAssignments } from "@canvasplus/database/queries/canvasSync";
import * as canvasAuth from "./canvasAuth.js";

const { CanvasAuthError } = canvasAuth;

// Canvas caps per_page (usually at 100) and paginates with Link headers.
const PAGE_SIZE = 100;
// A runaway Link chain should fail loudly rather than loop forever.
const MAX_PAGES = 50;

// ── Canvas REST client ────────────────────────────────────────────────────

/** The rel="next" URL from a Canvas Link header, or null on the last page. */
function nextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Pagination links come from the response, so they are untrusted input. Following
 * one to another host would send the student's token there.
 */
function assertSameOrigin(baseURL, url) {
  if (new URL(url).origin !== new URL(baseURL).origin) {
    throw new CanvasAuthError("Canvas returned a pagination link to a different host.", 502);
  }
}

/** Map a failed Canvas call to an error the route can return as-is. */
function toCanvasError(err, what) {
  if (err instanceof CanvasAuthError) return err;
  const status = err.response?.status;
  if (status === 401) {
    // 409, not 401: the UI treats our 401 as "your Canvas-Plus session ended".
    return new CanvasAuthError(
      "Canvas no longer accepts the stored token (it may have been deleted or expired). Reconnect your Canvas account.",
      409
    );
  }
  if (status === 403) {
    return new CanvasAuthError(`Canvas denied access while reading ${what}.`, 403);
  }
  const detail = status ? `Canvas returned HTTP ${status}` : err.message;
  return new CanvasAuthError(`Could not read ${what} from Canvas: ${detail}`, 502);
}

/** GET every page of a Canvas list endpoint. */
async function canvasGetAll(baseURL, token, path, params = {}) {
  const items = [];
  let url   = `${baseURL}${path}`;
  let query = { per_page: PAGE_SIZE, ...params };

  for (let page = 0; url; page += 1) {
    if (page >= MAX_PAGES) {
      throw new CanvasAuthError(`Canvas returned more than ${MAX_PAGES} pages for ${path}.`, 502);
    }
    assertSameOrigin(baseURL, url);

    let res;
    try {
      res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params:  query,
        timeout: 15000
      });
    } catch (err) {
      throw toCanvasError(err, path);
    }

    items.push(...res.data);
    url = nextLink(res.headers.link);
    // The next link already carries the full query string.
    query = undefined;
  }
  return items;
}

// ── Mapping Canvas objects to our columns ─────────────────────────────────

/** "CECS 491B-02" -> "CECS". Null when the code does not start with a subject. */


/** "Assignment"."points" is INTEGER; Canvas allows 2.5. */


/**
 * Canvas lists date-restricted courses with only an id and
 * access_restricted_by_date. There is nothing to show for them, and their
 * assignments endpoint would 403, so they are skipped.
 */
function isReadableCourse(course) {
  return !course.access_restricted_by_date && Boolean(course.name);
}

// ── Sync ──────────────────────────────────────────────────────────────────

/**
 * Pull the student's active courses and assignments and upsert them.
 * Returns counts for the UI. Safe to run repeatedly.
 */
async function syncAssignments(userID) {
  const grant = await canvasAuth.loadGrant(userID);
  if (!grant) {
    throw new CanvasAuthError("Canvas is not connected for this account.", 404);
  }
  const token   = await canvasAuth.getValidAccessToken(userID);
  const baseURL = grant.canvasBaseURL;

  // All network reads happen before the transaction opens, so a slow Canvas
  // never holds database locks.
  const courses = (await canvasGetAll(baseURL, token, "/api/v1/courses", {
    enrollment_state: "active",
    "include[]": "term"
  })).filter(isReadableCourse);

  const byCourse = [];
  for (const course of courses) {
    const assignments = await canvasGetAll(
      baseURL, token, `/api/v1/courses/${course.id}/assignments`,
      // include[]=submission embeds the student's own submission (on-time rate, UC21).
      { order_by: "due_at", "include[]": "submission" }
    );
    byCourse.push({ course, assignments });
  }

  return storeAssignments(userID, baseURL, byCourse);
}

export {
  canvasGetAll,
  assertSameOrigin,
  nextLink,
  syncAssignments
};
