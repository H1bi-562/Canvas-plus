// queries/decomposeModel.js
// UC10 pure task breakdown: turn an assignment's text into a short checklist of
// actionable steps. Deterministic and dependency-free (reuses htmlToText), so it
// works with no AI key, in demo and CI, and is unit-testable. decompose.js uses it
// as the default and as the fallback when the real LLM path fails.

import { htmlToText } from "./summarizeModel.js";

export const MAX_STEPS = 6;

// Leading filler to drop so a sentence reads like an instruction ("Submit a PDF"
// instead of "You must submit a PDF").
const LEAD = /^(you (?:must|should|will|need to|are expected to|can)|please|be sure to|make sure to|students (?:must|should|will)|remember to|first,?|then,?|next,?|finally,?)\s+/i;

function cleanStep(s) {
  s = s.trim().replace(/\s+/g, " ").replace(LEAD, "").replace(/^[,:;.\s]+/, "").replace(/[.;:,\s]+$/, "");
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Break an assignment into steps. Pulls candidate steps from the description's
 * sentences; if the description is too thin, scaffolds a sensible checklist from
 * the title. Pure -- all rules here so they can be unit-tested.
 */
export function decompose(title, description, { maxSteps = MAX_STEPS } = {}) {
  const text = htmlToText(description);
  const steps = [];
  const seen = new Set();

  if (text) {
    for (const part of text.split(/(?<=[.!?;])\s+/)) {
      const step = cleanStep(part);
      const key = step.toLowerCase();
      if (step.length >= 12 && step.length <= 140 && /[a-z]/i.test(step) && !seen.has(key)) {
        seen.add(key);
        steps.push(step);
        if (steps.length >= maxSteps) break;
      }
    }
  }

  if (steps.length < 2) {
    const t = htmlToText(title).replace(/[.\s]+$/, "") || "the assignment";
    return [
      "Review the assignment requirements",
      `Plan your approach to ${t}`,
      `Complete ${t}`,
      "Review and proofread your work",
      "Submit on Canvas before the due date"
    ].slice(0, maxSteps);
  }
  return steps;
}
