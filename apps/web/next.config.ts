import path from "node:path";
import { createRequire } from "node:module";
import type { NextConfig } from "next";

const require = createRequire(import.meta.url);
const reactQueryDir = path.dirname(require.resolve("@tanstack/react-query/package.json"));

const nextConfig: NextConfig = {
  transpilePackages: [
    "@wishd/plugin-sdk",
    "@wishd/plugin-compound-v3",
    "@wishd/plugin-uniswap",
    "@wishd/plugin-demo-stubs",
    "@wishd/tokens",
  ],
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@modelcontextprotocol/sdk"],
  // Pin tracing root to this repo (worktree-safe). Without this, a sibling
  // lockfile in another worktree confuses Next about workspace root.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@tanstack/react-query$": reactQueryDir,
    };
    return config;
  },
};

export default nextConfig;
