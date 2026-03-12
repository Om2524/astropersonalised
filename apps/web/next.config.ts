import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const shimPath = path.resolve(__dirname, "node-https-shim.cjs");

      // ── Prevent webpack from externalizing 'https' ──
      // Webpack's ExternalModuleFactoryPlugin reads dependency.request
      // (not data.request), so NormalModuleReplacementPlugin can't help.
      // Instead, wrap every externals function to pass-through on 'https'
      // so webpack falls through to normal resolution via resolve.alias.
      const orig = config.externals;
      const arr: any[] = Array.isArray(orig) ? orig : orig ? [orig] : [];
      config.externals = arr.map((ext: any) => {
        if (typeof ext !== "function") return ext;
        return function (ctx: any, cb: any) {
          const req = typeof ctx === "string" ? ctx : ctx?.request;
          if (req === "https" || req === "node:https") {
            return typeof cb === "function" ? cb() : undefined;
          }
          return ext(ctx, cb);
        };
      });

      // ── Point 'https' at our http shim ──
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
