// queries/decompose.js
// UC10 Decomposable Tasks -- break an assignment into a short checklist of steps.
// Default is the deterministic breakdown (decomposeModel.js), so it works with no
// API key, in demo, and in CI. When the student has configured an AI key
// (Config.modelKey, stored encrypted), it is used for a smarter breakdown, with the
// deterministic one as a safe fallback. The result is stored on
// AssignmentDetail.subtasks (a JSON array of strings).

import { pool } from "../client";
import { HttpError } from "../errors.js";
import { decrypt } from "../crypto.js";
import { htmlToText } from "./summarizeModel.js";
import { decompose, MAX_STEPS } from "./decomposeModel.js";

const OPENAI_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const LLM_TIMEOUT_MS = 15000;
const MAX_INPUT_CHARS = 6000;

async function fetchAssignment(userID, assignmentID) {
  const { rows } = await pool.query(
    `SELECT title, description
       FROM "Assignment"
      WHERE id = $1 AND "userID" = $2`,
    [assignmentID, userID]
  );
  if (rows.length === 0) throw new HttpError(404, "Assignment not found");
  return rows[0];
}

async function getModelKey(userID) {
  const { rows } = await pool.query(
    `SELECT "modelKey"
       FROM "Config"
      WHERE "userID" = $1`,
    [userID]
  );
  const enc = rows[0]?.modelKey;
  if (!enc) return null;
  try { return decrypt(enc); } catch { return null; }
}

// Optional real-LLM breakdown. Throws on any failure so the caller can fall back.
async function llmSubtasks(apiKey, { title, description }) {
  const text = htmlToText(description).slice(0, MAX_INPUT_CHARS);
  if (!text) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.3,
        max_tokens: 300,
        messages: [
          { role: "system", content: "You break a course assignment into 3 to 6 short, actionable steps a student can check off. Reply with ONLY a JSON array of strings, no prose." },
          { role: "user", content: `Title: ${title || "Untitled"}\n\nDescription:\n${text}` }
        ]
      })
    });
    if (!res.ok) throw new Error(`LLM request failed (${res.status})`);
    const data = await res.json();
    const content = (data?.choices?.[0]?.message?.content || "").trim();
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(s => String(s).trim()).filter(Boolean).slice(0, MAX_STEPS);
  } finally {
    clearTimeout(timer);
  }
}

/** Generate and store a subtask checklist for one assignment the student owns. */
export async function generateSubtasks(userID, assignmentID) {
  const assignment = await fetchAssignment(userID, assignmentID);

  let subtasks = [];
  let source = "extractive";

  const apiKey = await getModelKey(userID);
  if (apiKey) {
    try {
      subtasks = await llmSubtasks(apiKey, assignment);
      if (subtasks.length) source = "ai";
    } catch (err) {
      console.error("AI breakdown failed, using deterministic fallback:", err.message);
    }
  }
  if (!subtasks.length) {
    subtasks = decompose(assignment.title, assignment.description);
    source = apiKey ? "extractive-fallback" : "extractive";
  }
  if (!subtasks.length) throw new HttpError(422, "This assignment has no text to break into tasks");

  await pool.query(
    `INSERT INTO "AssignmentDetail" ("assignmentID", subtasks)
     VALUES ($1, $2)
     ON CONFLICT ("assignmentID") DO UPDATE SET subtasks = EXCLUDED.subtasks`,
    [assignmentID, JSON.stringify(subtasks)]
  );

  return { assignmentID, subtasks, source };
}
