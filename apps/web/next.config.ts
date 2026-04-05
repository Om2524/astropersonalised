import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["convex", "@convex-dev/auth", "@convex-dev/polar"],
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Force convex to use native WebSocket instead of ws library.
      // The convex package's "node" export condition pulls in ws@8.18.0,
      // which uses createRequire("https") at runtime — a dynamic require
      // that bypasses all build-time patches. Cloudflare Workers provide
      // native WebSocket, so ws is unnecessary.
      const convexEsmBrowser = path.join(
        process.cwd(),
        "node_modules/convex/dist/esm/browser"
      );
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.join(convexEsmBrowser, "index-node.js")]: path.join(
          convexEsmBrowser,
          "index.js"
        ),
        [path.join(convexEsmBrowser, "simple_client-node.js")]: path.join(
          convexEsmBrowser,
          "simple_client.js"
        ),
      };

      // Intercept any remaining static https requires at the externals level.
      const prevExternals = config.externals;
      config.externals = [
        async ({ request }: { request: string }) => {
          if (request === "https" || request === "node:https") {
            return "commonjs http";
          }
        },
        ...(Array.isArray(prevExternals) ? prevExternals : [prevExternals]),
      ];

      // @opennextjs/cloudflare@1.17.1 reads pages-manifest.json from the
      // standalone output unconditionally (build.js:69). App Router projects
      // don't generate this file. Emit an empty shim so it exists in
      // .next/server/ and is copied into .next/standalone/.next/server/
      // before OpenNext's bundler runs.
      config.plugins.push({
        apply(compiler: import("webpack").Compiler) {
          compiler.hooks.afterEmit.tap("PagesManifestShim", () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fs = require("fs") as typeof import("fs");
            const manifestPath = path.join(
              compiler.outputPath,
              "pages-manifest.json"
            );
            if (!fs.existsSync(manifestPath)) {
              fs.writeFileSync(manifestPath, "{}");
            }
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;
