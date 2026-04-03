import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  dangerous: {
    // Next.js 16 App Router does not generate pages-manifest.json in the
    // standalone output. @opennextjs/aws@3.9.16 reads this file unconditionally
    // in createCacheAssets. Disabling incremental cache skips that step.
    // This app has no ISR/static pages and no R2/KV cache configured anyway.
    disableIncrementalCache: true,
  },
});
