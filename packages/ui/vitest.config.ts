import { mergeConfig } from "vitest/config";
import config from "@canvasplus/vitest/react";

export default mergeConfig(config, { test: { include: ["test/**/*.test.tsx"] } });
