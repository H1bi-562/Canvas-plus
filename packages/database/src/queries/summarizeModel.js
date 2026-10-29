// queries/summarizeModel.js
// UC13 pure summarizer: reduce an assignment's text to a few key sentences.
// Deterministic and dependency-free, so it works with no AI key, in demo and CI,
// and is unit-testable (see apps/web/test/summarizeModel.test.ts). summarize.js
// uses this as the default and as the fallback when the real LLM path fails.

const STOP = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was were will with you your do does how what when where which while into than then these those they them our we us if not can may should must each via".split(" ")
);
// Logistics words worth keeping -- they carry the "what you must do" signal.
const KEY = new Set(
  "due submit submission points page pages word words format cite citation deadline grade graded required requirement include rubric upload turn".split(" ")
);

/** Strip HTML tags and decode the handful of entities Canvas descriptions use. */
export function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'").replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  return text.replace(/([.!?])\s+/g, "$1\u0001").split("\u0001").map(s => s.trim()).filter(Boolean);
}
function words(s) { return s.toLowerCase().match(/[a-z0-9']+/g) || []; }

/**
 * Extractive summary: score each sentence by content-word frequency (with small
 * bumps for lead position and logistics words), then return the top sentences in
 * their original order. Short inputs are returned cleaned, not re-ordered.
 */
export function summarize(text, { maxSentences = 3, maxChars = 400 } = {}) {
  const clean = htmlToText(text);
  if (!clean) return "";
  const sentences = splitSentences(clean);
  if (sentences.length <= maxSentences) return clean.slice(0, maxChars).trim();

  const freq = new Map();
  for (const w of words(clean)) if (!STOP.has(w) && w.length > 2) freq.set(w, (freq.get(w) || 0) + 1);

  const scored = sentences.map((s, i) => {
    const ws = words(s).filter(w => !STOP.has(w) && w.length > 2);
    if (!ws.length) return { i, s, score: 0 };
    let score = ws.reduce((a, w) => a + (freq.get(w) || 0), 0) / Math.sqrt(ws.length);
    if (i < 2) score *= 1.15;                          // lead sentences matter
    if (ws.some(w => KEY.has(w))) score *= 1.2;         // logistics sentences matter
    if (ws.length < 4 || ws.length > 40) score *= 0.6; // avoid fragments / run-ons
    return { i, s, score };
  });

  const picked = [...scored].sort((a, b) => b.score - a.score).slice(0, maxSentences)
    .sort((a, b) => a.i - b.i).map(x => x.s);

  let out = picked.join(" ");
  if (out.length > maxChars) {
    out = out.slice(0, maxChars);
    const lastStop = Math.max(out.lastIndexOf(". "), out.lastIndexOf("! "), out.lastIndexOf("? "));
    if (lastStop > maxChars * 0.5) out = out.slice(0, lastStop + 1);
    out = out.trim();
  }
  return out;
}

/** Summarize an assignment; fall back to a one-line summary of the title. */
export function summarizeAssignment({ title, description } = {}, opts = {}) {
  const body = summarize(description, opts);
  if (body) return body;
  const t = htmlToText(title);
  return t ? `Assignment: ${t}.` : "";
}
