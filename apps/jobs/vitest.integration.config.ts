import { mergeConfig } from "vitest/config";
import base from "@canvasplus/vitest/node";

export default mergeConfig(base, { test: { include: ["test/**/*.integration.test.ts"], globalSetup: ["../../packages/database/test/integration-setup.ts"], fileParallelism: false } });
