import { useState } from "react";
import type { Assignment } from "../types";

interface EstimateEditorProps {
  assignment: Assignment;
  suggestedHours: number;
  onSaved?: (updated: Assignment) => void;
}

export default function EstimateEditor({ assignment, suggestedHours, onSaved }: EstimateEditorProps) {
  const [hours, setHours] = useState<number>(assignment.manualEstimateHours ?? suggestedHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOverridden = assignment.manualEstimateHours != null;

  async function save(value: number | null): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${assignment.id}/estimate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualEstimateHours: value }),
      });
      if (!res.ok) throw new Error("Failed to save estimate");
      onSaved?.((await res.json()) as Assignment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="estimate-editor">
      <label>
        Estimated hours
        <input
          type="number"
          min="0"
          step="0.5"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          disabled={saving}
        />
      </label>

      <button disabled={saving || hours < 0} onClick={() => save(hours)}>
        {saving ? "Saving..." : "Save"}
      </button>

      {isOverridden && (
        <button
          disabled={saving}
          onClick={() => {
            setHours(suggestedHours);
            save(null);
          }}
        >
          Reset to suggested ({suggestedHours}h)
        </button>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}