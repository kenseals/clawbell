# ClawBell

ClawBell is a public-safe website chat for operators who want visitors to talk to a narrow version of their agent without exposing the operator's private workspace, tools, memory, or admin surface.

The first public ClawBell instance is for Ken Seals' site, but this repo is the reusable product repo. The default docs, trust model, and setup guidance are written for other operators who want to self-host the same pattern.

## Why this exists

Most agent setups are private by design. They are useful for the operator, but they are not safe to put directly in front of the public internet.

ClawBell exists to create a smaller boundary:

- visitors can ask public questions
- visitors can leave useful context or contact intent
- operators can optionally connect a narrow live bridge to a public-safe agent session
- the public surface never becomes an operator or admin channel

This repo is intentionally opinionated about that trust boundary.

## Who it is for

ClawBell is a fit for:

- founders, creators, and operators who want a public conversational front door
- people already running an OpenClaw or agent workflow privately
- teams that want a lightweight handoff surface before building a full support or sales system
- operators who prefer a narrow bridge over exposing a full agent gateway

ClawBell is not a fit if you want anonymous visitors to access your real private assistant, internal tools, or admin controls.

## How it works

At a high level:

```text
Visitor browser
  -> ClawBell web app
  -> deterministic safety filters and rate limits
  -> optional narrow authenticated bridge
  -> public-safe agent session
```

The bridge is optional. Without one, ClawBell can still run in honest fallback mode and collect useful handoff context.

## Trust boundary

ClawBell is designed around a narrow public-safe boundary:

- the public site is never an authenticated operator/admin channel
- visitors are never trusted as the owner, operator, or admin
- the app should call only a narrow bridge adapter, never a full OpenClaw gateway or private workspace
- the bridge should return text only, not tools, files, prompts, logs, or state
- sensitive/private requests should be refused before any live bridge call
- fallback mode should stay honest when the bridge is unavailable

If you keep only one idea from this repo, keep that one.

## What is in this repo

- public chat UI at `/`
- widget mode via `?mode=widget`
- optional admin page at `/admin.html`
- fallback replies for no-bridge or degraded operation
- narrow bridge support via `ENABLE_SOREN_BRIDGE=1`
- JSONL conversation and handoff logging
- operator digest helper
- bridge setup recipes for Cloudflare Tunnel, Tailscale Funnel, and custom HTTPS

## Quickstart

### 1. Run locally

```bash
npm start
```

Then open `http://localhost:4181`.

### 2. Optional admin auth

```bash
REQUIRE_ADMIN_AUTH=1 \
ADMIN_TOKEN=replace-with-long-random-token \
npm start
```

Then open `/admin.html?token=replace-with-long-random-token`.

### 3. Optional live bridge

If you already have a narrow bridge endpoint:

```bash
ENABLE_SOREN_BRIDGE=1 \
SOREN_BRIDGE_URL=https://example-bridge.example.com/ask \
SOREN_BRIDGE_TOKEN=replace-with-bridge-token \
npm start
```

If you are running the local helper bridge from this repo:

```bash
SOREN_BRIDGE_TOKEN=replace-with-bridge-token \
PORT=4599 \
node scripts/local-openclaw-bridge.mjs
```

The public app should point at that helper through one of the documented bridge transports, not expose the private runtime directly.

## Example use cases

- a personal site where visitors can ask about the operator's public work and leave a note
- a product site where visitors can ask scoped questions about the product and request follow-up
- an event, portfolio, or community page with a small public FAQ plus handoff path
- an operator dogfood setup where the public surface is intentionally narrower than the private agent

Ken's site is the first dogfood instance and reference example, not the default product assumption.

## Deploy patterns

ClawBell v0 is a Node app that serves both the UI and API from `server.mjs`.

Common deployment shapes:

### Option 1: single-service Node host

Best current fit for this repo. Deploy the app to a host like Render, Fly, or Railway and set env vars there.

### Option 2: split public site and bridge runtime

Useful for the current Ken launch shape:

- Cloudflare Pages can host the public site or front domain
- Render can continue hosting the ClawBell v0 Node/API service
- the live agent bridge stays separate and narrow

This split is operational guidance, not a promise that this repo is already packaged as a Pages-native app.

## Bridge options

Use the lowest-friction safe bridge that matches the operator's infrastructure:

- fallback only: no live bridge yet
- Cloudflare Tunnel: recommended reusable public-production bridge
- Tailscale Funnel: fast dogfood or personal-operator bridge
- custom HTTPS bridge: for other secure reverse-proxy setups

Start with [INSTALL_FOR_AGENTS.md](INSTALL_FOR_AGENTS.md), then pick a recipe in [`bridge-recipes/`](bridge-recipes/).

## Docs map

- [INSTALL_FOR_AGENTS.md](INSTALL_FOR_AGENTS.md): setup flow for coding agents and operators
- [AGENTS.md](AGENTS.md): repo operating protocol and safety rules for coding agents
- [CLAWBELL_VERIFY.md](CLAWBELL_VERIFY.md): post-deploy smoke-test runbook
- [DEPLOY.md](DEPLOY.md): deployment notes and current product direction
- [CLAWBELL_BRIDGE_PLAN.md](CLAWBELL_BRIDGE_PLAN.md): bridge architecture background for the current Ken launch
- [llms.txt](llms.txt): short agent-readable repo guide
- [llms-full.txt](llms-full.txt): expanded agent-readable setup and navigation guide

## Scripts

- `npm start`: run the app
- `npm run digest -- --hours=24`: summarize recent conversation/handoff logs
- `npm run check:syntax`: Node syntax check for the server and helper scripts

## Current status

ClawBell is a reusable v0. It is public-safe in concept and intentionally narrow, but still early.

What is already true:

- the app has deterministic safety filters
- the app has admin auth gating when enabled
- the app has rate limits and bridge budgets
- the app supports honest fallback mode
- the bridge recipes document the narrow-bridge pattern

Current limits:

- storage is local JSONL, not durable multi-instance storage
- rate limits are in-memory
- the repo is optimized for self-hosting, not turnkey managed hosting
- the current UI and example config are still shaped by the first Ken-site deployment
- Cloudflare Pages plus Render is an operational pattern, not a finished one-click packaging flow in this repo

## Canonical repo

Canonical GitHub repo:

- <https://github.com/kenseals/clawbell>

If you see older references to `k2claw/clawbell`, treat them as stale.
