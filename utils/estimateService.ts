import type {
    Assignment,
    AssignmentType,
    AssignmentEstimate,
    EstimateSummary,
    UserConfig,
} from '../src/types';

// the default hours per assignment type, before the user adjustments
const BASE_HOURS: Record<AssignmentType, number> = {
    reading: 1,
    quiz: 1,
    homework: 2,
    project: 5,
    exam: 6,
};

export const DEFAULT_CONFIG: UserConfig = {
    paceMultiplier: 1.0,
    hoursPerDay: 3,
};

export function estimateAssignmentsHours(
    assignments: Assignment[],
    config: UserConfig = DEFAULT_CONFIG
): number{
    let totalHours = 0;
    for (const assignment of assignments) {
        if (assignment.manualEstimateHours != null) {
            totalHours += assignment.manualEstimateHours;
        } else {
            const base = BASE_HOURS[assignment.type] ?? 2;
            const pointsFactor = 1 + Math.min(assignment.pointsPossible || 0, 200) / 400; // up to an additional 50% for points
            const hours = base * pointsFactor * config.paceMultiplier;
            totalHours += Math.round(hours * 2) / 2; // round to the nearest half hour
        }
    }
    return totalHours;
} 

export function estimateTimeToFinish(
    assignments: Assignment[],
    config: UserConfig = DEFAULT_CONFIG,
    now: Date = new Date()
): EstimateSummary {
    const remaining = assignments 
        .filter((a) => a.status !== "completed")
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const perAssignment: AssignmentEstimate[] = [];
    let totalHours = 0;
    for (const a of remaining) {
        const hours = estimateAssignmentsHours([a], config);
        totalHours += hours;

        const daysNeeded = Math.ceil(totalHours / config.hoursPerDay);
        const finishDate = new Date(now);
        finishDate.setDate(finishDate.getDate() + daysNeeded);

        perAssignment.push({ 
            id: a.id,
            hours,
            projectedFinish: finishDate.toISOString(),
            atRisk: finishDate > new Date(a.dueDate),
        });
    }

    return {
        totalHours: totalHours,
        totalDays: Math.ceil(totalHours / config.hoursPerDay),
        perAssignment,
    };
}
