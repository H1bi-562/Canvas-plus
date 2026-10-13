// queries/summarize.js
// UC13 Support AI Summarization -- generate a short summary of an assignment.
// Default is the deterministic extractive summary (summarizeModel.js), so it works
// with no API key, in demo, and in CI. When the student has configured an AI key
// (Config.modelKey, stored encrypted), it is used for a real LLM summary, with the
// extractive summary as a safe fallback on any error. The result is stored on
// AssignmentDetail.summary.

import { pool } from "../client";
import { HttpError } from "../errors.js";
import { decrypt } from "../crypto.js";
import { summarizeAssignment, htmlToText } from "./summarizeModel.js";

// OpenAI-compatible endpoint; override with env for any compatible provider.
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

// Optional real-LLM summary. Throws on any failure so the caller can fall back.
async function llmSummary(apiKey, { title, description }) {
  const text = htmlToText(description).slice(0, MAX_INPUT_CHARS);
  if (!text) return "";
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
        max_tokens: 200,
        messages: [
          { role: "system", content: "You summarize a course assignment for a student in 2-3 short, plain-text sentences. Focus on what to do and key requirements (length, format, due date). No preamble." },
          { role: "user", content: `Title: ${title || "Untitled"}\n\nDescription:\n${text}` }
        ]
      })
    });
    if (!res.ok) throw new Error(`LLM request failed (${res.status})`);
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

/** Generate and store an AI summary for one assignment the student owns. */
export async function generateSummary(userID, assignmentID) {
  const assignment = await fetchAssignment(userID, assignmentID);

  let summary = "";
  let source = "extractive";

  const apiKey = await getModelKey(userID);
  if (apiKey) {
    try {
      summary = await llmSummary(apiKey, assignment);
      if (summary) source = "ai";
    } catch (err) {
      console.error("AI summary failed, using extractive fallback:", err.message);
    }
  }
  if (!summary) {
    summary = summarizeAssignment(assignment);
    source = apiKey ? "extractive-fallback" : "extractive";
  }
  if (!summary) throw new HttpError(422, "This assignment has no text to summarize");

  await pool.query(
    `INSERT INTO "AssignmentDetail" ("assignmentID", summary)
     VALUES ($1, $2)
     ON CONFLICT ("assignmentID") DO UPDATE SET summary = EXCLUDED.summary`,
    [assignmentID, summary]
  );

  return { assignmentID, summary, source };
}
