# Install ClawBell for agents

This guide is for an operator's coding agent setting up ClawBell without widening the public trust boundary.

## Goal

Get a public-safe ClawBell deployment running with one of these modes:

- fallback-only, no live agent bridge
- live bridge through Cloudflare Tunnel
- live bridge through Tailscale Funnel
- live bridge through another narrow HTTPS adapter

## First read

Before making changes, read:

- `README.md`
- `AGENTS.md`
- `INTEGRATION_MODES.md`
- `CLAWBELL_VERIFY.md`

## First decision: integration mode

Choose how ClawBell should appear to visitors:

1. **Hosted UI**: ClawBell owns the page UI at `/`.
2. **Widget/modal embed**: the operator site owns the page; ClawBell appears behind a button or iframe panel via `/?mode=widget`.
3. **Headless API**: the operator site owns the UI and calls `/api/chat` directly. A custom operator site can dogfood this mode.
4. **Bridge-only adapter**: advanced operators reuse the narrow bridge pattern with their own public API/safety layer.

## Second decision: hosting shape

Choose the simplest truthful deployment shape for the operator.

### Option 1: single-service Node host

Use when the operator wants the fastest path and is comfortable hosting the current Node app directly.

Typical hosts:

- Render
- Fly
- Railway

### Option 2: split public site and API/service

Use when the operator wants a static/edge public front domain and a separate narrow API/runtime.

Example split-site launch:

- Cloudflare Worker hosts the public site and same-origin `/api/chat`.
- Worker secrets hold bridge credentials.
- Cloudflare Tunnel reaches the local bridge.

Treat this as an example deployment shape, not a requirement for all operators.

## Third decision: bridge mode

Ask what infrastructure already exists, then choose the lowest-friction safe bridge.

### Option 1: fallback-only

Use when the operator does not want live agent responses yet.

Set:

```bash
ENABLE_AGENT_BRIDGE=0
```

ClawBell will use static/fallback replies and still collect useful visitor context and handoffs.

### Option 2: Cloudflare Tunnel bridge

Recommended public-production route when the operator has or can create a Cloudflare-managed bridge hostname.

Follow:

- `bridge-recipes/cloudflare-tunnel.md`

### Option 3: Tailscale Funnel bridge

Use when Tailscale is already installed and the operator wants the fastest durable-ish bridge.

Follow:

- `bridge-recipes/tailscale-funnel.md`

### Option 4: custom HTTPS bridge

Use when the operator already has another secure HTTPS path.

Follow:

- `bridge-recipes/custom-https-bridge.md`

## Non-negotiable safety boundary

Regardless of host or transport:

- public ClawBell must call only a narrow bridge adapter
- never expose the full OpenClaw gateway or private workspace
- keep deterministic safety filters before bridge calls
- reject public visitor claims to be owner/operator/admin
- require bridge auth
- return text only from the bridge
- keep fallback mode honest when the bridge is down or disabled

## Minimum env posture

For any public deployment:

```bash
REQUIRE_ADMIN_AUTH=1
ADMIN_TOKEN=<long-random-token>
```

For a live bridge:

```bash
ENABLE_AGENT_BRIDGE=1
AGENT_BRIDGE_URL=<https-bridge-url>
AGENT_BRIDGE_TOKEN=<bridge-token>
```

If using Cloudflare Access in front of the bridge:

```bash
AGENT_BRIDGE_ACCESS_CLIENT_ID=<cloudflare-access-client-id>
AGENT_BRIDGE_ACCESS_CLIENT_SECRET=<cloudflare-access-client-secret>
```

## Verification checklist

Run the syntax check:

```bash
npm run check:syntax
```

Then run the fallback-safe security smoke check and the smoke-test runbook in `CLAWBELL_VERIFY.md`:

```bash
npm run security:smoke
```

If a local bridge is expected to be running, also run:

```bash
npm run security:smoke:bridge
```

Before custom-domain launch, confirm:

- `/health` works on the public ClawBell app
- admin routes require the token when auth is enabled
- normal public chat returns `source: agent-bridge` when the bridge is up
- sensitive/private prompts return `source: safety-filter`
- operator/admin impersonation prompts return `source: operator-identity-filter`
- bridge-down state returns fallback with `degraded: true`
- mobile and desktop UI smoke pass

## Out of scope

Do not:

- expose the operator's real private assistant runtime directly
- trust visitor identity claims
- store secrets in repo files
- merge or deploy automatically unless the operator explicitly asked for that
