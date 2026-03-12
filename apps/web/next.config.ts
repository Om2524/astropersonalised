import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer && Array.isArray(config.externals)) {
      // Prevent webpack from externalizing 'https' — Cloudflare Workers
      // doesn't have node:https, but the ws library imports it at module
      // load time. By bundling it instead of externalizing, webpack's
      // module map resolves p("https") to our http shim.
      config.externals = config.externals.map((external: unknown) => {
        if (typeof external !== "function") return external;
        return async (ctx: { request?: string }) => {
          if (ctx.request === "https" || ctx.request === "node:https") {
            return; // Don't externalize — resolve via alias below
          }
          return (external as Function)(ctx);
        };
      });
      const shimPath = path.resolve(__dirname, "node-https-shim.cjs");
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        https: shimPath,
        "node:https": shimPath,
      };
    }
    return config;
  },
};

export default nextConfig;
