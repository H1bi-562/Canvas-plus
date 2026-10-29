import { Router, type Request, type Response } from "express";
import { query } from "../utils/db";
import { requestSubtaskSuggestions } from "../utils/aiClient";
import { BadAiOutputError, parseSubtask } from "../utils/subtaskParser";
import type { Decomposeinput } from "../utils/decomposePrompt";
import type { AssignmentStatus, Subtask, SubtaskRollup } from "../src/types";

const router = Router();

interface SubtaskRow {
  id: number;
  assignment_id: string;
  title: string;
  estimated_hours: string; 
  status: AssignmentStatus;
  position: number;
}

const toSubtask = (r: SubtaskRow): Subtask => ({
  id: r.id,
  assignmentId: r.assignment_id,
  title: r.title,
  estimatedHours: Number(r.estimated_hours),
  status: r.status,
  position: r.position,
});

function rollup(subtasks: Subtask[]): SubtaskRollup {
  const allHours = subtasks.reduce((sum, s) => sum + s.estimatedHours, 0);
  const remainingHours = subtasks
    .filter((s) => String(s.status) !== "done")
    .reduce((sum, s) => sum + s.estimatedHours, 0);
  return {
    total: subtasks.length,
    done: subtasks.filter((s) => String(s.status) === "done").length,
    remainingHours,
    progressPct: allHours ? Math.round(((allHours - remainingHours) / allHours) * 100) : 0,
  };
}

const recentCalls = new Map<string, number[]>();
function rateLimited(userId: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const calls = (recentCalls.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (calls.length >= max) {
    recentCalls.set(userId, calls);
    return true;
  }
  calls.push(now);
  recentCalls.set(userId, calls);
  return false;
}

router.get("/assignments/:id/subtasks", async (req: Request, res: Response) => {
  const { rows } = await query<SubtaskRow>(
    `SELECT * FROM subtasks WHERE assignment_id = $1 AND user_id = $2 ORDER BY position, id`,
    [req.params.id, String(req.user.id)]
  );
  const subtasks = rows.map(toSubtask);
  res.json({ subtasks, rollup: rollup(subtasks) });
});

// POST ask the AI for suggestions (nothing is saved until the user accepts them)
router.post("/assignments/:id/decompose", async (req: Request, res: Response) => {
  const userId = String(req.user.id);
  const body = req.body as Partial<Decomposeinput>;

  if (typeof body.title !== "string" || !body.title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (rateLimited(userId)) {
    return res.status(429).json({ error: "Too many requests. Wait a minute and try again." });
  }

  try {
    const raw = await requestSubtaskSuggestions({
      title: body.title.trim().slice(0, 300),
      course: body.course,
      description: body.description,
      dueDate: body.dueDate,
      pointsPossible: body.pointsPossible,
    });
    res.json({ suggestions: parseSubtask(raw) });
  } catch (err) {
    if (err instanceof BadAiOutputError) {
      return res.status(502).json({ error: "The AI gave an unusable answer. Try again." });
    }
    console.error("[decompose]", err);
    res.status(500).json({ error: "Failed to generate subtasks" });
  }
});

// POST save the subtasks the user accepted (appended after existing ones)
router.post("/assignments/:id/subtasks", async (req: Request, res: Response) => {
  try {
    const items = parseSubtask((req.body as { subtasks?: unknown }).subtasks);
    const { rows } = await query<SubtaskRow>(
      `INSERT INTO subtasks (assignment_id, user_id, title, estimated_hours, position)
       SELECT $1::text, $2::text, t.title, t.hours,
              t.ord + (SELECT COALESCE(MAX(position), 0) FROM subtasks WHERE assignment_id = $1::text AND user_id = $2::text)
         FROM unnest($3::text[], $4::numeric[]) WITH ORDINALITY AS t(title, hours, ord)
       RETURNING *`,
      [req.params.id, String(req.user.id), items.map((i: { title: any; }) => i.title), items.map((i: { estimatedHours: any; }) => i.estimatedHours)]
    );
    res.status(201).json(rows.map(toSubtask));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid subtasks" });
  }
});

// PATCH edit title, hours, or status
router.patch("/subtasks/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const { title, estimatedHours, status } = req.body as {
    title?: string;
    estimatedHours?: number;
    status?: AssignmentStatus;
  };
  if (status && !["todo", "in_progress", "done"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  if (estimatedHours != null && !(Number(estimatedHours) >= 0)) {
    return res.status(400).json({ error: "estimatedHours must be a non-negative number" });
  }
  if (title != null && !title.trim()) {
    return res.status(400).json({ error: "title can't be empty" });
  }

  const { rows } = await query<SubtaskRow>(
    `UPDATE subtasks
        SET title = COALESCE($3, title),
            estimated_hours = COALESCE($4, estimated_hours),
            status = COALESCE($5, status)
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [id, String(req.user.id), title?.trim() ?? null, estimatedHours ?? null, status ?? null]
  );
  if (!rows[0]) return res.status(404).json({ error: "Subtask not found" });
  res.json(toSubtask(rows[0]));
});

// DELETE
router.delete("/subtasks/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  await query(`DELETE FROM subtasks WHERE id = $1 AND user_id = $2`, [id, String(req.user.id)]);
  res.status(204).end();
});

export default router;
