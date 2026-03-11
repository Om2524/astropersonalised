import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
};

export default nextConfig;
