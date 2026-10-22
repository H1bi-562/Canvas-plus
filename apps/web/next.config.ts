import { config } from "dotenv";
import type { NextConfig } from "next";

config({ path: "../../.env", quiet: true });

const nextConfig: NextConfig = { transpilePackages: ["@canvasplus/auth", "@canvasplus/database", "@canvasplus/ui"], devIndicators: false, agentRules: false };
export default nextConfig;
