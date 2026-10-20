import { UseState } from "react";

// 1. Expected shapes
// john do whatever you need to make it work
interface Subtask {
    id: string;
    title: string;
    estimatedMinutes?: number;
    desciption?: string;
}

interface BreakdownResponse {
    subtasks: Subtask[];
}

interface TaskBreakdownProps {
    assignmentId?: string; 
}

// 2. Component
function TaskBreakdown({ assignmentId }: TaskBreakdownProps) {
        const [prompt, setPrompt] = useState("");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  async function handleBreakdown() {
    if (!prompt.trim()) return;
    
    setLoading(true);
    setError(null);

    try {
      // Adjust the endpoint path and payload shape to match John's actual route
      const res = await fetch("/api/tasks/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, prompt }),
      });


      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data: BreakdownResponse = await res.json();
      setSubtasks(data.subtasks);
    } catch (err) {
      console.error("Failed to fetch task breakdown:", err);
      setError("Couldn't break down this assignment. Try again.");
    } finally {
      setLoading(false);
    }
  }

   function toggleComplete(id: string) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

    return (
    <div className="task-breakdown">
      <h2>Break Down This Assignment</h2>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Paste the assignment description here..."
        rows={4}
      />

      <button onClick={handleBreakdown} disabled={loading || !prompt.trim()}>
        {loading ? "Breaking it down..." : "Break it down"}
      </button>

      {error && <p className="error-text">{error}</p>}

      {subtasks.length > 0 && (
        <ul className="subtask-list">
          {subtasks.map((task) => (
            <li key={task.id} className={completedIds.has(task.id) ? "completed" : ""}>
              <label>
                <input
                  type="checkbox"
                  checked={completedIds.has(task.id)}
                  onChange={() => toggleComplete(task.id)}
                />
                <strong>{task.title}</strong>
                {task.estimatedMinutes != null && (
                  <span className="estimate"> ({task.estimatedMinutes} min)</span>
                )}
              </label>
              {task.description && <p className="subtask-description">{task.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TaskBreakdown;