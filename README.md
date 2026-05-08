# ClawBell

**ClawBell is a public-safe chat front door for your agent.**

It lets visitors talk to a narrow, scoped version of your Claw/OpenClaw/agent from your website without exposing your private workspace, tools, memory, credentials, or admin surface.

Think: “Ask my agent about my public work” plus “leave a useful note for me”, not “give the internet access to my assistant.”


## Status: early public v0

ClawBell is ready for builders to inspect, clone, and dogfood as a self-hosted v0. It is not a polished managed platform or npm library yet.

Use it today if you are comfortable deploying a small Node app or Cloudflare Worker, setting your own secrets, and reading the deployment docs. Treat it as a narrow public-safe agent front door, not a turnkey SaaS product.

The first real dogfood deployment is Ken Seals' personal site, `kenseals.me`. That site uses ClawBell as a separate deployed service through Cloudflare Worker service binding, which is the intended product boundary: your site can be a client of your ClawBell instance without copying private agent/runtime code into the site.

Current public posture:

- **Good for:** dogfooding, self-hosted experiments, public-safe personal/product site chat, builder feedback.
- **Install shape:** clone this repo and deploy your own ClawBell instance. The package is intentionally marked `private` to prevent accidental npm publishing while the product is v0/self-hosted.
- **Not yet:** managed hosting, one-click install, durable multi-instance storage, exact model-cost accounting, or broad internet-scale abuse resistance.
- **Safety model:** narrow bridge, deterministic filters, admin auth, rate limits, usage visibility, and honest fallback.

## What you can build with it

- A personal-site chat where visitors can ask about your public work and leave a note.
- A product-site concierge that answers scoped questions and collects follow-up context.
- A public FAQ/handoff surface backed by your agent, with safe fallback when the bridge is down.
- A dogfood deployment where your agent helps you learn what people ask before you build a full product.

This repo is meant to become reusable infrastructure for operators who want a public-safe agent surface. Today it is an early, self-hosted v0 that is useful for dogfood and builder feedback.

## The core idea

Most private agent systems are powerful because they have context: tools, memory, files, messages, tasks, and preferences.

That same context makes them unsafe to expose directly.

ClawBell creates a smaller boundary:

```text
Visitor browser
  -> public ClawBell UI/API
  -> deterministic safety filters + rate limits
  -> optional authenticated narrow bridge
  -> public-safe agent session
```

The bridge is optional. Without a live bridge, ClawBell runs in honest fallback mode and can still collect useful handoff context.

## Trust boundary

ClawBell is intentionally conservative.

A safe deployment should preserve these rules:

- The public site is never an authenticated operator/admin channel.
- Visitors are never trusted as the owner/operator/admin, even if they claim to be.
- Public chat calls only a narrow bridge adapter, never a full OpenClaw Gateway or private workspace.
- The bridge returns text only, not tools, files, prompts, logs, memory, or state.
- Sensitive/private requests are refused before any live bridge call.
- Fallback mode is honest when the bridge is unavailable.
- Secrets live in host secrets, Cloudflare Worker secrets, launchd/systemd env, or a password manager, never in Git.

If you keep one idea: **ClawBell is a boundary, not a backdoor.**

## What is in this repo

- Public chat UI at `/`
- Widget mode via `?mode=widget`
- Optional admin page at `/admin.html`
- Public-safe fallback replies
- Narrow live-bridge support with `ENABLE_AGENT_BRIDGE=1`
- Basic rate limits and bridge budgets
- JSONL conversation/handoff logs for self-hosted deployments
- `/api/usage` admin endpoint and dashboard stats for live calls, fallbacks, filtered/refused prompts, throttles, handoffs, errors, and approximate character usage
- Local bridge `/usage` endpoint for bridge-only deployments, backed by `data/agent-bridge-usage.jsonl`
- Operator digest helper
- Bridge recipes for Cloudflare Tunnel, Tailscale Funnel, and custom HTTPS
- Security/readiness docs for public deployment

## Quickstart

### 1. Clone and run

```bash
git clone https://github.com/kenseals/clawbell.git
cd clawbell
npm install
npm start
```

Open:

```text
http://localhost:4181
```

You now have fallback-mode ClawBell running locally.

### 2. Admin auth

For production-like environments, ClawBell requires admin auth by default. Set a long random `ADMIN_TOKEN` before deploying:

```bash
ADMIN_TOKEN=replace-with-long-random-token \
npm start
```

You can also force admin auth locally:

```bash
REQUIRE_ADMIN_AUTH=1 \
ADMIN_TOKEN=replace-with-long-random-token \
npm start
```

Then open:

```text
http://localhost:4181/admin.html?token=replace-with-long-random-token
```

Local development without admin auth is still allowed by default. If you intentionally need unauthenticated admin access in a production-like environment, set `ALLOW_UNAUTHENTICATED_ADMIN=1`, but do not use that for a public deployment.

Do not use a short token. Do not commit the token.

### 3. Optional: connect a live bridge

If you already have a narrow bridge endpoint:

```bash
ENABLE_AGENT_BRIDGE=1 \
AGENT_BRIDGE_URL=https://example-bridge.example.com/ask \
AGENT_BRIDGE_TOKEN=replace-with-bridge-token \
npm start
```

If you are using the local helper bridge from this repo:

```bash
AGENT_BRIDGE_TOKEN=replace-with-bridge-token \
PORT=4599 \
node scripts/local-openclaw-bridge.mjs
```

Then expose that helper through a safe transport such as Cloudflare Tunnel or Tailscale Funnel. Do **not** expose your private agent runtime directly.

## Ask your Claw to set it up

If you use OpenClaw or a similar coding agent, send it this prompt:

```text
Set up ClawBell for my website.

Repo: https://github.com/kenseals/clawbell

Read these files first:
- README.md
- INSTALL_FOR_AGENTS.md
- CLAWBELL_VERIFY.md
- SECURITY.md
- SECRETS.md

Goal:
- Run ClawBell locally in fallback mode first.
- Keep the public trust boundary narrow.
- Do not expose my private OpenClaw Gateway, workspace, tools, memory, credentials, or admin surface.
- Use placeholders for secrets and tell me exactly which secrets I need to store in my password manager.
- If adding a live bridge, use one of the documented bridge recipes and verify unauthenticated bridge requests return 401 with npm run security:smoke:bridge.
- Before finishing, run npm run check:syntax and npm run security:smoke.

Deliver:
- the local URL
- what mode it is running in: fallback-only or live bridge
- the required env vars/secrets
- verification results
- any remaining launch blockers
```

Once this repo is public, agents can start from [`INSTALL_FOR_AGENTS.md`](INSTALL_FOR_AGENTS.md) for the detailed setup path.

## How to consume this repo

For now, ClawBell is an app/template repo, not an npm package API:

- **Clone/self-host** when you want your own ClawBell UI/API deployment.
- **Use the Cloudflare Worker path** when you want an edge-hosted ClawBell instance.
- **Use headless mode** when your website owns the UI and calls your deployed ClawBell instance.
- **Do not import private runtime code into a public site.** Public sites should call a deployed ClawBell API/Worker or a narrow bridge, not the operator's private agent workspace.

## Ways to use ClawBell

ClawBell supports four intended integration modes:

1. **Hosted UI**: ClawBell owns the page UI at `/`.
2. **Widget/modal embed**: your site owns the page; ClawBell appears behind a “Talk to my Claw” button or iframe panel.
3. **Headless API**: your site owns the entire UI and calls ClawBell’s `/api/chat` endpoint. Custom sites can keep their site-specific public config locally and send it as `siteConfig` from a trusted same-origin API/Worker with `CLAWBELL_SITE_CONFIG_TOKEN`.
4. **Bridge-only adapter**: advanced mode where you reuse the narrow bridge pattern with your own public API/safety layer.

See [INTEGRATION_MODES.md](INTEGRATION_MODES.md) for examples, request/response shape, and current gaps.

## Deployment patterns

ClawBell v0 supports two practical self-hosting shapes.

### Option 1: Cloudflare Worker + Assets

Best fit when you already use Cloudflare and do not want another app host.

```bash
npm run cloudflare:dev
npm run cloudflare:deploy
```

The Cloudflare Worker serves the static ClawBell UI from `public/` and the same API contract from `src/cloudflare-worker.js`:

- `GET /health`
- `GET /api/config`
- `POST /api/chat`
- `POST /api/handoff`

Configure operator-specific public policy with `CLAWBELL_CONFIG_JSON`. Configure live bridge secrets with `AGENT_BRIDGE_URL` / `AGENT_BRIDGE_TOKEN` or the `CLAWBELL_BRIDGE_*` aliases. Keep `CLAWBELL_SITE_CONFIG_TOKEN` server-side for trusted headless custom-site integrations.

### Option 2: single-service Node host

Use this when you want a traditional Node server on Fly, Render, Railway, or a small VPS.

### Option 3: split edge/site + runtime

Use this when your public website is hosted separately from the ClawBell API or bridge/runtime.

Example:

```text
Cloudflare Worker or static site
  -> same-origin /api/chat
  -> secret-backed bridge fetch
  -> Cloudflare Tunnel / Tailscale Funnel / custom HTTPS adapter
  -> local bridge
```

A split-site deployment can use this Cloudflare Worker + Tunnel shape.

## Bridge options

Choose the lowest-friction safe bridge that matches your infrastructure:

- **Fallback only**: no live bridge yet; useful for demos and safe first launch.
- **Cloudflare Tunnel**: recommended reusable public-production bridge.
- **Tailscale Funnel**: fast dogfood/personal-operator bridge.
- **Custom HTTPS bridge**: for operators who already have a secure reverse proxy.

Start with [INSTALL_FOR_AGENTS.md](INSTALL_FOR_AGENTS.md), then pick a recipe in [`bridge-recipes/`](bridge-recipes/).

For split-site deployments where the public website calls a separate ClawBell API origin, set:

```bash
PUBLIC_API_ORIGINS=https://example.com,https://www.example.com
```

Do not use `*` for production unless you intentionally want any website to call your public ClawBell API.

## Safety checks

Run syntax checks:

```bash
npm run check:syntax
```

Run the fast security smoke check:

```bash
npm run security:smoke
```

When a local bridge is expected to be running:

```bash
npm run security:smoke:bridge
```

When the local bridge should exercise the live public-safe agent session:

```bash
npm run security:smoke:live
```

The baseline smoke script checks tracked-file hygiene and syntax without requiring a bridge. App-level checks run when `CLAWBELL_APP_URL` is set. Bridge health and unauthenticated `/ask` rejection are explicit opt-ins via `security:smoke:bridge` or `security:smoke:live`.

## Usage visibility

ClawBell has two usage paths because operators can deploy it in more than one shape:

1. **Reusable Node app**: the hosted ClawBell app writes `data/conversations.jsonl`, `data/handoffs.jsonl`, and related bridge event files. The admin dashboard shows a last-24-hour usage panel, and `GET /api/usage` returns the same summary with admin auth.
2. **Bridge-only / headless implementation**: a custom site can keep its own UI/API and use only `scripts/local-openclaw-bridge.mjs`. The local bridge writes `data/agent-bridge-usage.jsonl`, enforces its own visitor throttle, and exposes bearer-protected `GET /usage`.

The usage summary includes:

- live bridge calls
- fallback calls
- filtered/refused prompts
- throttled calls and reasons
- bridge errors
- handoffs / note intent
- approximate character usage as a token-burn proxy
- recent event summaries

Approximate character usage is not provider billing data. It is an operational warning signal for abuse or unexpectedly expensive public traffic.

## Operator digest / cron

`npm run digest -- --hours=24` prints a compact operator digest from recent conversation, handoff, error, throttle, and bridge usage logs.

ClawBell does not currently install a cron job automatically. The intended product behavior is: after setup, the operator or their agent can schedule this digest with their preferred scheduler and send the output wherever they want.

Example cron shape:

```cron
0 9 * * * cd /path/to/clawbell && npm run digest -- --hours=24
```

For OpenClaw operators, the better pattern is usually an OpenClaw cron/reminder that runs the digest, reviews the output, and sends a concise update only when there is useful signal, abuse, throttling, bridge degradation, or a promising lead.

## Scripts

- `npm start`: run the app
- `GET /api/usage` with admin auth: summarize the last 24 hours of conversations, live bridge calls, fallbacks, filters, throttles, handoffs, errors, and approximate character usage
- `GET /usage` on the local bridge with bearer auth: summarize bridge-only usage from `data/agent-bridge-usage.jsonl`
- `npm run digest -- --hours=24`: summarize recent conversation, handoff, error, throttle, and bridge usage logs
- `npm run check:syntax`: syntax check server/helper scripts
- `npm run security:smoke`: fallback-safe baseline security smoke check, no bridge required
- `npm run security:smoke:bridge`: baseline plus local bridge health and unauthenticated rejection checks
- `npm run security:smoke:live`: bridge smoke plus authenticated live bridge call

## Docs map

- [INSTALL_FOR_AGENTS.md](INSTALL_FOR_AGENTS.md): setup flow for coding agents and operators
- [AGENTS.md](AGENTS.md): repo operating protocol and safety rules for coding agents
- [CLAWBELL_VERIFY.md](CLAWBELL_VERIFY.md): post-deploy smoke-test runbook
- [SECURITY.md](SECURITY.md): security policy and vulnerability-reporting guidance
- [SECRETS.md](SECRETS.md): secret backup and rotation guidance
- [INTEGRATION_MODES.md](INTEGRATION_MODES.md): hosted UI, widget/modal, headless API, and bridge-only modes
- [DEPLOY.md](DEPLOY.md): deployment notes and current product direction
- [bridge-recipes/](bridge-recipes/): Cloudflare Tunnel, Tailscale Funnel, and custom HTTPS recipes
- [llms.txt](llms.txt): short agent-readable repo guide
- [llms-full.txt](llms-full.txt): expanded agent-readable setup and navigation guide

## Example use cases

### Personal website

Visitor asks:

> What is this operator building now?

ClawBell can answer from approved public context, then invite the visitor to leave a note if they want follow-up.

### Product website

Visitor asks:

> Does this work with Cloudflare Tunnel?

ClawBell can answer using product docs and preserve contact intent if the visitor wants help.

### Fallback-only launch

No live bridge yet? ClawBell can still answer basic configured questions and capture handoffs. It should be clear when it is in limited mode.

## Current status

ClawBell is a reusable, self-hosted v0. It is intentionally narrow and public enough for builder dogfood, but still early.

Already true:

- deterministic safety filters
- admin auth required by default in production-like environments
- in-memory rate limits and bridge budgets
- honest fallback mode
- narrow bridge recipes
- security smoke checks
- public-readiness docs
- display-only public config, with full policy config behind admin auth

Current limits:

- storage is local JSONL, not durable multi-instance storage
- rate limits are in-memory in the Node app and bridge-local in the helper bridge
- the repo is optimized for self-hosting, not turnkey managed hosting
- the default UI/example config is intentionally generic but still early
- headless custom-site integrations are supported, but the API/schema docs are still being hardened
- widget/modal embed exists, but the one-line install/loader experience is not polished yet
- Cloudflare edge hosting is supported, but it is still a self-hosted deployment path, not managed hosting

## Security and secrets

Read:

- [SECURITY.md](SECURITY.md)
- [SECRETS.md](SECRETS.md)

Short version:

- Do not commit raw secrets.
- Use a password manager or encrypted secret store for real values.
- A private repo is acceptable for inventories and encrypted secret files, not plaintext production secrets.
- Do not expose OpenClaw Gateway directly.

## License

MIT. See [LICENSE](LICENSE).

## Canonical repo

<https://github.com/kenseals/clawbell>

If you see older references to `k2claw/clawbell`, treat them as stale.
