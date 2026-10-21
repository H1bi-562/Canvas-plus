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

export interface UserConfig {
    paceMultiplier: number; //.75 fast , 1.0 normal, 1.25 slow
    hoursPerDay: number;
}

export interface AssignmentEstimate {
    id: string;
    hours: number;
    projectedFinish: string;
    atRisk: boolean;
}

export interface EstimateSummary {
    totalHours: number;
    totalDays: number;
    perAssignment: AssignmentEstimate[];
}

export type PriorityLevel = "low" | "medium" | "high";

export interface PriorityScore {
    id: string;
    score: number;
    level: PriorityLevel;
    breakdown: {urgency: number, impact: number, effort: number};
}
  
