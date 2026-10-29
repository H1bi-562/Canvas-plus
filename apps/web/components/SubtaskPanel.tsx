import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { apiFetch } from "../api/client";
import type { Assignment, Subtask, SubtaskRollup, SubtaskSuggestion } from "../types";

interface SubtaskPanelProps {
  assignment: Pick<Assignment, "id" | "title" | "course" | "dueDate" | "pointsPossible" | "description">;
  onChange?: () => void; // lets the parent refresh estimates or scores
}

export default function SubtaskPanel({ assignment, onChange }: SubtaskPanelProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [rollup, setRollup] = useState<SubtaskRollup | null>(null);
  const [suggestions, setSuggestions] = useState<SubtaskSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await apiFetch<{ subtasks: Subtask[]; rollup: SubtaskRollup }>(
      `/api/assignments/${assignment.id}/subtasks`
    );
    setSubtasks(data.subtasks);
    setRollup(data.rollup);
  }, [assignment.id]);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const decompose = () =>
    run(async () => {
      const data = await apiFetch<{ suggestions: SubtaskSuggestion[] }>(
        `/api/assignments/${assignment.id}/decompose`,
        {
          method: "POST",
          body: JSON.stringify({
            title: assignment.title,
            course: assignment.course,
            description: assignment.description,
            dueDate: assignment.dueDate,
            pointsPossible: assignment.pointsPossible,
          }),
        }
      );
      setSuggestions(data.suggestions);
    });

  const acceptSuggestions = () =>
    run(async () => {
      await apiFetch(`/api/assignments/${assignment.id}/subtasks`, {
        method: "POST",
        body: JSON.stringify({ subtasks: suggestions }),
      });
      setSuggestions(null);
      await load();
      onChange?.();
    });

  const toggleDone = (s: Subtask) =>
    run(async () => {
      await apiFetch(`/api/subtasks/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: s.status === "done" ? "todo" : "done" }),
      });
      await load();
      onChange?.();
    });

  const remove = (s: Subtask) =>
    run(async () => {
      await apiFetch(`/api/subtasks/${s.id}`, { method: "DELETE" });
      await load();
      onChange?.();
    });

  function editSuggestion(i: number, patch: Partial<SubtaskSuggestion>) {
    setSuggestions((prev) => prev && prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border p-3">
      {rollup && rollup.total > 0 && (
        <div>
          <div className="h-2 w-full rounded bg-gray-200">
            <div className="h-2 rounded bg-green-500" style={{ width: `${rollup.progressPct}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-600">
            {rollup.done}/{rollup.total} done · {rollup.remainingHours}h left
          </p>
        </div>
      )}

      <ul className="space-y-1">
        {subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.status === "done"}
              disabled={busy}
              onChange={() => toggleDone(s)}
            />
            <span className={`flex-1 text-sm ${s.status === "done" ? "text-gray-400 line-through" : ""}`}>
              {s.title} <span className="text-gray-500">({s.estimatedHours}h)</span>
            </span>
            <button disabled={busy} onClick={() => remove(s)} aria-label={`Remove ${s.title}`}>
              <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
            </button>
          </li>
        ))}
      </ul>

      {suggestions ? (
        <div className="space-y-2 rounded bg-gray-50 p-2">
          <p className="text-sm font-medium">Suggested breakdown (edit before adding)</p>
          {suggestions.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="flex-1 rounded border px-2 py-1 text-sm"
                value={s.title}
                onChange={(e) => editSuggestion(i, { title: e.target.value })}
              />
              <input
                className="w-20 rounded border px-2 py-1 text-sm"
                type="number"
                min={0.5}
                step={0.5}
                value={s.estimatedHours}
                onChange={(e) => editSuggestion(i, { estimatedHours: Number(e.target.value) })}
              />
              <button
                onClick={() => setSuggestions(suggestions.filter((_, idx) => idx !== i))}
                aria-label="Remove suggestion"
              >
                <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
              disabled={busy || suggestions.length === 0 || suggestions.some((s) => !s.title.trim())}
              onClick={acceptSuggestions}
            >
              Add subtasks
            </button>
            <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={() => setSuggestions(null)}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <button
          className="flex items-center gap-1 rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={decompose}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Working..." : "Break down with AI"}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}