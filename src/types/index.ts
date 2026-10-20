// src/types/index.ts
export type AssignmentType = "reading" | "quiz" | "project" | "homework" | "exam";
export type AssignmentStatus = "todo" | "in-progress" | "completed";

export interface Assignment {
    id: string;
    title: string;
    course: string;
    dueDate: string;
    pointsPossible: number;
    courseWeight: number;
    type: AssignmentType;
    status: AssignmentStatus;
    manualEstimateHours?: number | null;
}

export interface AssignmetnEstimate {
    id: string;
    hours: number;
    projectedFinish: string;
    atRisk: boolean;
}

export interface EstimateSummary {
    totalHours: number;
    totalDays: number;
    perAssignment: AssignmetnEstimate[];
}

export type Priority = "low" | "medium" | "high";

export interface PriorityScore {
    id: string;
    score: number;
    level: Priority;
    breakdown: {urgency: number, impact: number, effort: number};
}
  
