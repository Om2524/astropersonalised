import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No output: "standalone" — Cloudflare Pages uses OpenNext adapter
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
};

export default nextConfig;
