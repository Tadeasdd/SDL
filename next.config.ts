import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
  outputFileTracingIncludes: { "/**": ["./examples/**/*"] },
};

export default config;
