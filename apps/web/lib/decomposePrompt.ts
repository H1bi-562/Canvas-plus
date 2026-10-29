export interface Decomposeinput {
    title: string;
    course?: string;
    description?: string;
    dueDate?: string;
    pointsPossible?: number;
}

// canvas descriptions
export function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function buildDecomposePrompt(a: Decomposeinput): string {
    const instructions = [
         "You help students break large assignments into smaller, concrete subtasks.",
        "Return ONLY valid JSON, with no markdown and no commentary, in exactly this shape:",
        '{"subtasks":[{"title":"...","estimatedHours":1.5}]}',
        "Rules: 3 to 8 subtasks, ordered in the sequence a student should do them,",
        "each title under 100 characters and starting with a verb,",
        "estimatedHours between 0.5 and 8 in steps of 0.5.",
    ].join("\n");

    const description = a.description ? stripHtml(a.description).slice(0,4000) : "(no description provided)"

    const details = [
        `Assignment: ${a.title}`,
        a.course ? `Course: ${a.course}` : "",
        a.dueDate ? `Due: ${a.dueDate}` : "",
        a.pointsPossible != null ? `Points: ${a.pointsPossible}` : "",
        `Desciption: ${description}` , 
    ]

        .filter(Boolean)
        .join("\n");
    
    return `${instructions}\n\n${details}`;
}