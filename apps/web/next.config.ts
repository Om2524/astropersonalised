import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Cloudflare Workers (compat_date 2025-03-07) provides node:http but
    // not node:https. The ws library requires("https") which webpack wraps
    // into its own module system — unreachable by wrangler's esbuild alias.
    // Aliasing at the webpack level ensures the bundled output never
    // references "https". Workers use fetch() internally so http vs https
    // is functionally identical.
    config.resolve.alias = {
      ...config.resolve.alias,
      https: "http",
      "node:https": "node:http",
    };
    return config;
  },
};

export default nextConfig;
