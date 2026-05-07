# Cloudflare Tunnel bridge recipe

Use this when the operator wants the recommended production bridge for a public ClawBell site.

## Fit

Best for:

- public custom-domain launches
- operators who can use Cloudflare DNS/Zero Trust
- stronger machine-to-machine auth in front of the local bridge
- reusable production setup docs

## Security model

```text
Public ClawBell app
  -> Cloudflare Access protected bridge hostname
  -> Cloudflare Tunnel
  -> local bridge daemon on 127.0.0.1
  -> OpenClaw agent public-safe session
```

Use two auth layers:

1. Cloudflare Access service token on the bridge hostname.
2. Local bridge bearer token checked by the bridge daemon.

Do not expose OpenClaw Gateway directly.

## Requirements

- a Cloudflare-managed zone/hostname for the bridge, e.g. `soren-bridge.example.com`
- `cloudflared` installed on the OpenClaw host
- Cloudflare Tunnel configured for `http://127.0.0.1:4599`
- Cloudflare Access self-hosted app for the bridge hostname
- Cloudflare Access service token for the ClawBell host

## ClawBell host env vars

```bash
ENABLE_SOREN_BRIDGE=1
SOREN_BRIDGE_URL=https://soren-bridge.example.com/ask
SOREN_BRIDGE_TOKEN=<local-bridge-token>
SOREN_BRIDGE_ACCESS_CLIENT_ID=<cloudflare-access-client-id>
SOREN_BRIDGE_ACCESS_CLIENT_SECRET=<cloudflare-access-client-secret>
```

The ClawBell server should send both Cloudflare Access headers and the local bearer token on bridge requests.

## Smoke tests

1. No Cloudflare Access token: rejected by Cloudflare.
2. Cloudflare token only: reaches bridge but bridge returns 401.
3. Bearer only: rejected by Cloudflare.
4. Both tokens: returns `{ reply }`.
5. Public ClawBell normal chat returns `source: soren-bridge`.
6. Public ClawBell sensitive/operator prompts are blocked before bridge call.
