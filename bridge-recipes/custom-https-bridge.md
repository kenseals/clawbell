# Custom HTTPS bridge recipe

Use this when the operator has their own reverse proxy, VPS, paid ngrok domain, Fly machine, Railway service, or other HTTPS transport.

## Contract

The bridge must implement:

```http
POST /ask
content-type: application/json
authorization: Bearer <token>
```

Request:

```json
{
  "prompt": "public-safe prompt built by ClawBell",
  "sessionId": "public-clawbell-session"
}
```

Response:

```json
{
  "reply": "text to show visitor"
}
```

Rules:

- return only text, not tools/logs/files/state
- require auth
- keep the public-safe agent separate from private operator/admin channels
- expose only the narrow adapter, never the full OpenClaw Gateway
