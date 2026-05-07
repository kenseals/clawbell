# ClawBell deployment notes

ClawBell can run in two broad shapes:

1. **Single-service Node app**: the current `server.mjs` serves UI + API from one host.
2. **Split edge/site + runtime**: a public site or Worker owns the domain and calls a narrow bridge/runtime.

A split-site deployment can use a Cloudflare Worker plus Cloudflare Tunnel while the reusable product repo keeps the Node app as the simplest self-hostable package.

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

## Option 1: single-service Node host

Best fit for this repo as packaged today.

Typical hosts:

- Fly.io
- Render
- Railway
- a small VPS

Required posture:

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

## Option 2: split edge/site + runtime

Use this when the operator wants a static/edge public domain and a separate narrow bridge/runtime.

Example shape:

```text
Cloudflare Worker or static site
  -> same-origin /api/chat
  -> secret-backed bridge fetch
  -> Cloudflare Tunnel / Tailscale Funnel / custom HTTPS adapter
  -> local bridge
```

This shape can reduce vendor sprawl when the operator already uses Cloudflare for DNS, Workers, secrets, and tunnels.

## Minimum production auth/safety

Before public launch:

- `ADMIN_TOKEN` protects admin/config/conversation endpoints when the Node app is deployed.
- public chat has rate limiting.
- bridge requests require a long random bearer token.
- optional Cloudflare Access service-token auth protects the bridge hostname before tunnel forwarding.
- raw logs and JSONL data are never public.
- no admin route is linked from public chat.
- persistent storage location is configured intentionally.
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
