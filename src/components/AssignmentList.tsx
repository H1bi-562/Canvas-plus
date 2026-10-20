import { useCallback, useEffect, useState } from "react";
import type { Assignment, EstimateSummary } from "../types";
import EstimateEditor from "./EstimateEditor";

interface AssignmentListProps {
  assignments: Assignment[];
    reloadAssignments: () => void;
}

const EMPTY_ESTIMATE: EstimateSummary = {
    perAssignment: [],
    totalHours: 0,
    totalDays: 0,
};

export default function AssignmentList({ assignments, reloadAssignments }: AssignmentListProps) {
    const [estimate, setEstimate] = useState<EstimateSummary>(EMPTY_ESTIMATE);

    const loadEstimate = useCallback(async () => {
        try{
            const res = await fetch("/api/estimate");
            if (!res.ok) { throw new Error("Failed to load estimate");
            setEstimates((await res.json()) as EstimateSummary);
         } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        loadEstimate();
    }, [assignments,loadEstimate]);

    return (
        <div className="assignment-list">
            <p>
                Estimated time to finish everything: {estimate.totalHours} hours (~{estimate.totalDays} days)
            </p>

            {assignments.map((assignment) => {
                const est = estimate.perAssignment.find((e) => e.id === assignment.id);
                return (
                    <div key={assignment.id} className="assignment">
                        <h3>{assignment.title}</h3>

                        {est?.atRisk && <span ClassName="warn">May finish after due date</span>}

                        <EstimateEditor
                            assignment={assignment}
                            estimate={est?.hours ?? 0}
                            onSaved={() => {
                                reloadAssignments();
                                loadEstimate();
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );
}
