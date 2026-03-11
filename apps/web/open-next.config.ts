/**
 * OpenNext configuration for Cloudflare Pages deployment.
 *
 * Uses the cloudflare-node wrapper and edge converter to run
 * Next.js server-side rendering on Cloudflare Workers runtime.
 *
 * @see https://opennext.js.org/cloudflare
 */
import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
    },
  },
};

export default config;
