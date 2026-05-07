# ClawBell integration modes

ClawBell should be easy to use in more than one shape. The trust boundary is the same in every mode: visitors talk to a public-safe surface, not the operator's private agent runtime.

## Mode 1: Hosted UI

ClawBell owns the page UI.

```text
visitor -> https://your-clawbell.example.com/ -> ClawBell UI + API
```

Best for:

- quickest self-hosted launch
- product demos
- operators who do not already have a custom site UI

Current support:

- `GET /` serves the full chat UI.
- `GET /api/config` loads public owner/starter config.
- `POST /api/chat` sends messages.

Try locally:

```bash
npm start
open http://localhost:4181/
```

## Mode 2: Widget / modal embed

The operator's site owns the page. ClawBell owns a floating launcher and modal/panel, usually embedded as an iframe.

```text
visitor -> operator site -> button -> iframe/modal ClawBell widget
```

Best for:

- adding ClawBell to an existing site without rebuilding the site
- a “Talk to my Claw” button
- low-friction product installs

Current support:

- `/?mode=widget` hides the host-site intro and starts in closed widget mode.
- Any iframe context also activates widget mode.

Basic embed example:

```html
<iframe
  src="https://your-clawbell.example.com/?mode=widget"
  title="Talk to my Claw"
  style="position: fixed; inset: auto 1rem 1rem auto; width: 420px; height: 680px; border: 0; z-index: 9999;"
></iframe>
```

Important:

- If embedding cross-origin, the ClawBell host must allow the parent origin in CSP/frame settings.
- If the operator site calls the ClawBell API directly, configure `PUBLIC_API_ORIGINS`.
- Do not put bridge secrets in iframe URLs or browser JS.

Needed improvements:

- Provide a polished copy-paste embed snippet.
- Provide a small loader script for a button/modal install.
- Document frame/CSP settings explicitly.

## Mode 3: Headless API

The operator's site owns the entire UI. ClawBell provides only the public-safe chat API and safety/bridge layer.

```text
visitor -> operator site custom UI -> /api/chat -> ClawBell safety + bridge
```

Best for:

- custom websites where the chat should feel native
- terminal-style UI, command palettes, or product-specific UX
- teams that want ClawBell's backend boundary but not its frontend

Example headless deployment:

```text
operator site UI -> same-origin /api/chat -> edge/API layer -> bridge
```

Request shape:

```http
POST /api/chat
content-type: application/json
```

```json
{
  "message": "What is ClawBell?",
  "visitorId": "stable-anonymous-id",
  "history": [
    { "role": "user", "text": "Earlier user message" },
    { "role": "assistant", "text": "Earlier assistant reply" }
  ]
}
```

Response shape:

```json
{
  "reply": "ClawBell is...",
  "noteIntent": false,
  "source": "agent-bridge"
}
```

Possible `source` values:

- `agent-bridge`: live public-safe bridge answered.
- `fallback`: fallback mode answered.
- `safety-filter`: deterministic sensitive-info filter answered.
- `operator-identity-filter`: visitor claimed to be owner/operator/admin and was refused.

Frontend rule:

- Show degraded/fallback state honestly when `source` is `fallback` or `degraded` is true.
- Preserve a stable anonymous `visitorId` locally if you want per-visitor budgets/history.
- Send only recent public chat history. Never send private site/user data by default.

## Mode 4: Bridge-only adapter

Advanced operators may use only the local bridge pattern and write their own public API/safety layer.

```text
custom public API -> authenticated narrow bridge -> public-safe agent session
```

Best for:

- teams with their own app/API
- operators who only want the local OpenClaw bridge recipe
- experiments that do not need the ClawBell UI or Node app

Important:

- You must recreate the public-safe filters, rate limits, and operator-identity boundary yourself.
- Do not expose OpenClaw Gateway directly.
- Bridge should remain narrow and authenticated.

## Recommended product packaging

For public launch, ClawBell should make these paths explicit:

1. `npm start` for Hosted UI.
2. `/?mode=widget` + embed snippet for Widget/modal.
3. `/api/chat` contract for Headless API.
4. bridge recipes for advanced adapters.

## Current gaps to track

- A first-class embed snippet / loader script.
- A polished demo for widget/modal mode.
- A stable documented API schema and error/degraded responses.
- CORS/CSP docs for cross-origin embedding.
- A clean example of a headless custom UI integration.
