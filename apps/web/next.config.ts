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
      // Intercept at the externals level (runs before resolve.alias) to make
      // webpack emit require("http") wherever it would emit require("https").
      const prevExternals = config.externals;
      config.externals = [
        async ({ request }: { request: string }) => {
          if (request === "https" || request === "node:https") {
            return "commonjs http";
          }
        },
        ...(Array.isArray(prevExternals) ? prevExternals : [prevExternals]),
      ];
    }
    return config;
  },
};

export default nextConfig;
