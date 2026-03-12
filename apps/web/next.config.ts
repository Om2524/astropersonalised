import type { NextConfig } from "next";
import path from "path";
import webpack from "webpack";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Replace 'https' and 'node:https' with our http shim.
      // NormalModuleReplacementPlugin intercepts BEFORE externals check,
      // so webpack bundles the shim instead of externalizing to node:https
      // (which doesn't exist on Cloudflare Workers).
      const shimPath = path.resolve(__dirname, "node-https-shim.cjs");
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^(node:)?https$/,
          shimPath
        )
      );
    }
    return config;
  },
};

export default nextConfig;
