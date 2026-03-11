import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // No output: "standalone" — Cloudflare Pages uses OpenNext adapter
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  experimental: {
    turbo: {
      root: "../..",
    },
  },
};

export default nextConfig;
