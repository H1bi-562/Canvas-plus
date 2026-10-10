import { mergeConfig } from "vitest/config";
import config from "@canvasplus/vitest/node";

export default mergeConfig(config, { test: { include: ["test/**/*.test.ts"] } });
