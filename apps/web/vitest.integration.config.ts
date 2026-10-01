import { defineConfig, mergeConfig } from "vitest/config";
import config from "@canvasplus/vitest/node";
import { fileURLToPath } from "node:url";

export default mergeConfig(config, defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } }, test: { include: ["test/**/*.integration.test.ts"], fileParallelism: false, globalSetup: "../../packages/database/test/integration-setup.ts" } }));
