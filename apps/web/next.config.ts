import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer, webpack: wp }) => {
    if (isServer) {
      // Replace 'https' and 'node:https' with our http shim.
      // NormalModuleReplacementPlugin fires in beforeResolve (before the
      // externals check in factorize), so it rewrites the request from
      // "https" → shim path, preventing webpack from externalizing it.
      const shimPath = path.resolve(__dirname, "node-https-shim.cjs");
      config.plugins.push(
        new wp.NormalModuleReplacementPlugin(
          /^(node:)?https$/,
          shimPath
        )
      );

      // Belt-and-suspenders: resolve.alias catches any requests that
      // slip past the plugin (e.g. different compilation phases).
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
