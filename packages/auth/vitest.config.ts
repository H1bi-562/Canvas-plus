import { mergeConfig } from "vitest/config";
import base from "@canvasplus/vitest/node";

export default mergeConfig(base, { test: { passWithNoTests: true } });
