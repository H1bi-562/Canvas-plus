import { useCallback, useEffect, useState } from "react";
import type { Assignment } from "../shared/types";
import EstimateEditor from "./EstimateEditor";

interface AssignmentListProps {
    assignments: Assignment[];
    reloadAssignments: () => void;
}

const EMPTY: EstimateSummary = {perAssignment: [], totalHours: 0, totalDays: 0};

export default function AssignmentList({ assignments, reloadAssignments }: AssignmentListProps) {
    const [estimates, setEstimates] = useState<EstimateSummary>(EMPTY);

    const loadEstimates = useCallback(async () => {
        const res = await fetch("/api/estimates");
        setEstimates((await res.json()) as EstimateSummary);
    }, []);

    useEffect(() => {
        loadEstimates();
    }, [assignments,loadEstimates]);

    return (
        <>
      <p>
        Estimated time to finish everything: {estimates.totalHours}h (~{estimates.totalDays} days)
      </p>

      {assignments.map((a) => {
        const est = estimates.perAssignment.find((e) => e.id === a.id);
        return (
          <div key={a.id}>
            <h4>{a.title}</h4>
            {est?.atRisk && <span className="warn">May finish after due date</span>}
            <EstimateEditor
              assignment={a}
              suggestedHours={est?.hours ?? 0}
              onSaved={() => {
                reloadAssignments();
                loadEstimates();
              }}
            />
          </div>
        );
      })}
    </>
  );
}