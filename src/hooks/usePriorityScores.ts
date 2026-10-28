import { useEffect, useState, type DependencyList } from "react";
import { apiFetch } from "../app/App"
import type { PriorityScore } from "../types";

export default function usePriorityScores(deps: DependencyList = []) {
    const [scores, setScores] = useState<Record<string, PriorityScore[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        apiFetch<PriorityScore[]>("/api/priority-scores")
        .then ((list: PriorityScore[]) => {
            if (cancelled) return;
            setScores(Object.fromEntries(list.map((scores) => [scores.id, scores])));
        })
        .catch((e) => console.error(e))
        .finally(() => {
            if (cancelled) setLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, deps);

    return { scores, loading };
}