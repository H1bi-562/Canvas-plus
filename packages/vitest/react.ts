import react from "@vitejs/plugin-react";
import { mergeConfig } from "vitest/config";
import base from "./node.ts";

export default mergeConfig(base, { plugins: [react()], test: { environment: "jsdom", globals: false } });
