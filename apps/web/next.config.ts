import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wishd/plugin-sdk", "@wishd/plugin-compound-v3"],
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
