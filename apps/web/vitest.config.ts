import { defineConfig, mergeConfig } from "vitest/config";
import config from "@canvasplus/vitest/react";
import { fileURLToPath } from "node:url";

export default mergeConfig(config, defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } }, test: { include: ["test/**/*.test.{ts,tsx}"], exclude: ["**/*.integration.test.ts"] } }));
