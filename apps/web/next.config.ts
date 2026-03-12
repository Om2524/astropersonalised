import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    turbo: {
      root: "../..",
    },
  },
};

export default nextConfig;
