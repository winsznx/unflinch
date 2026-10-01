import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // next dev would otherwise write AGENTS.md and CLAUDE.md into the repo root.
  agentRules: false,
  turbopack: { root: process.cwd() },
  // Committed runs are read from disk at request time; ship them with the functions that serve them.
  outputFileTracingIncludes: {
    "/runs/[id]": ["./evidence/live/**/*"],
    "/runs/[id]/receipt": ["./evidence/live/**/*"],
    "/runs/[id]/recording": ["./evidence/live/**/*"],
    "/proof": ["./evidence/live/**/*", "./evidence/hashes.json"],
  },
};

export default nextConfig;
