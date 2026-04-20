# Forsee Mail Worker

Cloudflare Worker for:

- forwarding inbound routed email through Cloudflare Email Routing
- sending transactional email through Cloudflare Email Service
- receiving authenticated internal requests from Convex for daily brief delivery

## Local setup

```bash
cd apps/email-service
pnpm install
```

## Required secrets

```bash
pnpm exec wrangler secret put INTERNAL_API_TOKEN
pnpm exec wrangler secret put EMAIL_FORWARD_TO
```

`EMAIL_FORWARD_TO` can be a single verified destination address or a comma-separated list of verified destinations.

## Optional secrets or vars

Set these if you want to override the built-in defaults:

- `DEFAULT_FROM_EMAIL` — defaults to `briefs@forsee.life`
- `DEFAULT_FROM_NAME` — defaults to `Forsee`
- `DEFAULT_REPLY_TO` — optional reply-to mailbox

## Deploy

```bash
pnpm exec wrangler deploy
```

After deploy:

1. Enable Email Routing in Cloudflare for the zone.
2. Create or verify the destination mailbox addresses in Cloudflare Email Routing.
3. Bind the email Worker to the inbound address you want Cloudflare to process.
4. Onboard the sending domain to Cloudflare Email Service so `briefs@forsee.life` and `noreply@forsee.life` can send mail.
5. Copy the Worker URL into Convex as `CLOUDFLARE_EMAIL_SERVICE_URL`.
6. Reuse the same token value from `INTERNAL_API_TOKEN` in Convex as `CLOUDFLARE_EMAIL_SERVICE_TOKEN`.
