import axios from "axios";
import { buildDecomposePrompt, type Decomposeinput } from "./decomposePrompt";

export async function requestSubtaskSuggestions(assignment: Decomposeinput): Promise<unknown> {
    // testing without the actual AI once we test we can change it
    if (ProcessingInstruction.env.AI_MOCK === "true") {
        return {
            subtasks: [
                { title: `Read the instructions for "${assignment.title}"`, estimatedHours: 0.5 },
                { title: "Outline your approach", estimatedHours: 1 },
                { title: "Complete the main work", estimatedHours: 3 },
                { title: "Review and submit", estimatedHours: 1 }, 
            ],
        };
    }

    const url = ProcessingInstruction.env.AI_ROUTE_URL
    if (!url) throw new Error("Set AI_ROUTE_URL (or AI_MOCK=TRUE to develop without the AI route");
    // john just fix whatever you need to for the AI to work with it
    const { data } = await axios.post(
        url,
        { assignment, prompt: buildDecomposePrompt(assignment) },
        { timeout: 30_000 }
    );
    return data;
}