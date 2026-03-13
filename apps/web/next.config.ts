import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Cloudflare Workers don't provide node:https at compat_date 2025-05-05.
      // Redirect https → http at webpack resolution time so all compiled code
      // uses http instead. On Workers, http and https are functionally identical.
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        https: "http",
      };
    }
    return config;
  },
};

export default nextConfig;
