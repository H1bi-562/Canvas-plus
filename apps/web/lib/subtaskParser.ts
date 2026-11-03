export interface ParsedSubtask {
    title: string;
    estimatedHours: number;
}

export class BadAiOutputError extends Error {
    constructor(message: string) {
        super(`Bad AI Output: ${message}`);
        this.name = "BadAiOutputError";
    }
}

function unwrap(data: unknown): unknown {
    if (typeof data !== "string") return data;
    const cleaned = data.replace(/```(?:json)?/gi, "").trim();
    try {
        return JSON.parse(cleaned);
    } catch (error) {
        throw new BadAiOutputError("response is not valid JSON");

    }
}

export function parseSubtask(raw: unknown, max = 10): ParsedSubtask[] {
    let data = unwrap(raw);

    if (data && typeof data === "object" && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        if (!Array.isArray(obj.subtasks)) {
            const inner = obj.output ?? obj.text ?? obj.content ?? obj.result;
            if (inner !== undefined) data = unwrap(inner);
        }
    }

    const list = Array.isArray(data) ? data : (data as {subtasks?: unknown} | null)?.subtasks;
    if (!Array.isArray(list) || list.length === 0) throw new BadAiOutputError("no subtasks found");

    return list.slice(0, max).map((item, i) => {
        const s = (item ?? {}) as { title?: unknown; estimatedHours?: unknown; hours?: unknown };
        const title = typeof s.title === "string" ? s.title.trim().slice(0,200) : "";
        if (!title) throw new BadAiOutputError(`subtask ${i + 1} has no title`);

        const hours = Number(s.estimatedHours ?? s.hours);
        const estimatedHours = 
            Number.isFinite(hours) && hours > 0
                ? Math.min(40, Math.max(0.5, Math.round(hours * 2) / 2))
                : 1;
         
        return { title, estimatedHours};
    });
}