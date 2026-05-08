# ClawBell deployment notes

ClawBell v0 is self-hosted. The default recommendation is Cloudflare-native when the operator already uses Cloudflare, with the Node server kept as a portable fallback for traditional app hosts.

## Non-negotiable production boundary

Do not expose full private OpenClaw/Gateway context directly.

A safe deployment should look like this:

```text
public browser
  -> public ClawBell app/API
  -> deterministic safety filters and rate limits
  -> optional narrow authenticated bridge
  -> public-safe agent session/runtime
```

The bridge should return text only. It should not expose files, private memory, tools, logs, credentials, or admin actions.

## Option 1: Cloudflare Worker + Assets

Best fit when the operator wants to avoid another app host.

This repo includes:

- `wrangler.jsonc`: Cloudflare Worker config
- `src/cloudflare-worker.js`: Worker API runtime
- `public/`: static ClawBell UI assets served by the Worker Assets binding

Run locally:

```bash
npm run cloudflare:dev
```

Deploy:

```bash
npm run cloudflare:deploy
```

Recommended production vars/secrets:

```bash
REQUIRE_ADMIN_AUTH=1
ADMIN_TOKEN=<long-random-token>
CLAWBELL_CONFIG_JSON=<operator-public-config-json>
RATE_LIMIT_MODE=auto
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=12
```

The default `wrangler.jsonc` includes a `RATE_LIMITER` Durable Object binding. With `RATE_LIMIT_MODE=auto`, Worker deployments use that binding for cross-isolate public-chat rate limits. If you remove the binding or set `RATE_LIMIT_MODE=memory`, rate limits become best-effort per Worker isolate.

Optional trusted headless custom-site config:

```bash
CLAWBELL_SITE_CONFIG_TOKEN=<long-random-token>
```

Optional live bridge:

```bash
ENABLE_AGENT_BRIDGE=1
AGENT_BRIDGE_URL=<https-bridge-url>
AGENT_BRIDGE_TOKEN=<long-random-token>
```

Alias vars such as `ENABLE_CLAWBELL_BRIDGE`, `CLAWBELL_BRIDGE_URL`, and `CLAWBELL_BRIDGE_TOKEN` are also supported.

Worker-mode limitations in this first slice:

- conversation/handoff persistence logs to Worker logs unless a storage binding is added later
- admin config writes return `501`; update `CLAWBELL_CONFIG_JSON` in Worker vars/secrets instead
- public-chat rate limits are durable only when the `RATE_LIMITER` Durable Object binding is deployed; bridge-specific budgets remain in-memory in the Worker and bridge-local in the helper bridge

## Option 2: single-service Node host

Use this when you want a traditional Node server on Fly, Render, Railway, or a small VPS.

```bash
npm start
```

Required production posture:

```bash
REQUIRE_ADMIN_AUTH=1
ADMIN_TOKEN=<long-random-token>
```

Optional live bridge:

```bash
ENABLE_AGENT_BRIDGE=1
AGENT_BRIDGE_URL=<https-bridge-url>
AGENT_BRIDGE_TOKEN=<long-random-token>
```

If no live bridge is configured, ClawBell should run in honest fallback mode.

## Option 3: split edge/site + runtime

Use this when the operator's public website is hosted separately from the ClawBell API or bridge/runtime.

Example shape:

```text
operator website
  -> same-origin /api/chat
  -> operator-owned ClawBell /api/chat
  -> authenticated bridge
  -> public-safe agent session/runtime
```

For headless custom-site mode, keep operator-specific config in the site repo and send it server-to-server with `x-clawbell-site-config-token`. Do not expose the token to browser JavaScript.

## Minimum production auth/safety

Before public launch:

- `ADMIN_TOKEN` protects admin/config/conversation endpoints.
- public chat has rate limiting; Cloudflare Worker deployments should keep the `RATE_LIMITER` Durable Object binding enabled or use an equivalent Cloudflare/WAF control.
- bridge requests require a long random bearer token.
- optional Cloudflare Access service-token auth protects the bridge hostname before tunnel forwarding.
- raw logs and private runtime data are never public.
- no admin route is linked from public chat.
- public-safe prompt/config is reviewed.
- fallback mode is honest when the bridge is unavailable.

## Public repo readiness

Before making the repo public:

- run `npm run security:smoke`
- verify no runtime data, local config, `.wrangler`, logs, JSONL conversations, or token files are tracked
- verify `.env.example` contains placeholders only
- verify operator-specific dogfood docs are not committed to the reusable public repo
- verify `SECURITY.md` and `SECRETS.md` are present
- verify license and README are appropriate for public viewers

## Potential hosted product later

Only build hosted product infrastructure if real pull appears.

Potential paid hosted value:

- no-server setup
- custom domains
- auth/admin dashboard
- hosted logs and summaries
- analytics
- durable rate limits/cost controls
- agent provider connectors
- team/workspace management
- premium priority queue / paid visitor routing
