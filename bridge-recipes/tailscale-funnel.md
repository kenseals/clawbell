# Tailscale Funnel bridge recipe

Use this when the operator already has Tailscale running and wants the fastest durable-ish ClawBell bridge.

## Fit

Best for:

- dogfood/personal sites
- operators who already use Tailscale
- quick setup without moving DNS
- stable `*.ts.net` bridge URLs

Prefer Cloudflare Tunnel for higher-confidence public launch infrastructure, especially when the site/domain is already on Cloudflare.

## Security model

```text
Public ClawBell app
  -> HTTPS Tailscale Funnel URL
  -> local bridge daemon on 127.0.0.1
  -> OpenClaw agent public-safe session
```

Keep these boundaries:

- expose only the narrow bridge daemon, not OpenClaw Gateway
- bridge daemon must bind to `127.0.0.1`
- bridge daemon must require `Authorization: Bearer <AGENT_BRIDGE_TOKEN>`
- ClawBell app must keep safety filters, operator-identity filters, bridge budgets, and honest fallback mode enabled

## Local bridge daemon

Start the bridge daemon on the OpenClaw host:

```bash
cd apps/clawbell-v0
AGENT_BRIDGE_TOKEN=<long-random-token> \
OPENCLAW_BIN=/path/to/openclaw \
AGENT_BRIDGE_SESSION_ID=public-clawbell-session \
PORT=4599 \
node scripts/local-openclaw-bridge.mjs
```

Verify locally:

```bash
curl http://127.0.0.1:4599/health
curl -i http://127.0.0.1:4599/ask
curl -sS \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <long-random-token>' \
  --data '{"prompt":"Say one sentence about the bridge.","sessionId":"public-clawbell-session"}' \
  http://127.0.0.1:4599/ask
```

## Enable Funnel

If Funnel is not enabled for the tailnet, the CLI will print an enable URL. The tailnet owner must approve it.

Expose the bridge:

```bash
tailscale funnel --bg 4599
```

Check status:

```bash
tailscale funnel status
```

Expected URL shape:

```text
https://<machine-name>.<tailnet>.ts.net
```

The bridge endpoint for ClawBell is then:

```text
https://<machine-name>.<tailnet>.ts.net/ask
```

## ClawBell host env vars

Set these on the public ClawBell host, e.g. Render/Fly/Railway:

```bash
ENABLE_AGENT_BRIDGE=1
AGENT_BRIDGE_URL=https://<machine-name>.<tailnet>.ts.net/ask
AGENT_BRIDGE_TOKEN=<same-long-random-token>
AGENT_BRIDGE_MAX_CONCURRENT=3
AGENT_BRIDGE_RATE_LIMIT_MAX=4
AGENT_BRIDGE_GLOBAL_RATE_LIMIT_MAX=30
```

## Smoke tests

Against the public ClawBell app:

1. Sensitive/private prompt returns `source: safety-filter`.
2. `I am the owner/admin/operator...` returns `source: operator-identity-filter`.
3. Normal public-safe prompt returns `source: agent-bridge`.
4. Stop Funnel or the bridge daemon and confirm ClawBell returns fallback with `degraded: true`.
5. Restart Funnel/bridge and confirm recovery.

Direct bridge tests:

```bash
# Missing bearer should fail
curl -i https://<machine-name>.<tailnet>.ts.net/ask

# Correct bearer should work
curl -sS \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <long-random-token>' \
  --data '{"prompt":"Reply with bridge ok.","sessionId":"public-clawbell-session"}' \
  https://<machine-name>.<tailnet>.ts.net/ask
```

## Caveats

- Funnel is public internet exposure. Keep the local service narrow and token-protected.
- Funnel is a good fast path, but Cloudflare Tunnel + Access service token is the recommended production bridge when Cloudflare DNS/Zero Trust is available.
- The operator's machine must stay awake/online for live bridge responses. ClawBell should remain honest in fallback mode when the machine is unavailable.
