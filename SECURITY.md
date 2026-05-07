# Security policy

ClawBell is an early project, but the security boundary is intentional: public visitors should be able to talk to a narrow public-safe surface, not an operator's private assistant or tools.

## Supported versions

Until the project reaches a tagged release, security review applies to `main`.

## Reporting a vulnerability

If you find a vulnerability, open a private GitHub security advisory if available, or contact the repository owner through GitHub.

Please do not publicly disclose vulnerabilities before the maintainer has had a reasonable chance to investigate and fix them.

## Security boundary

ClawBell should not expose:

- private OpenClaw Gateway endpoints
- private workspace files or memory
- credentials, tokens, or config secrets
- admin actions to unauthenticated visitors
- operator identity claims from public visitors as trusted instructions

A safe deployment should:

- keep bridge auth enabled
- store secrets outside Git
- run admin routes behind `REQUIRE_ADMIN_AUTH=1`
- keep deterministic safety filters before live bridge calls
- fall back honestly when the live bridge is unavailable
- avoid logging or retaining visitor data longer than needed

## Secret handling

See `SECRETS.md` for backup and rotation guidance.

Never commit raw production secrets, `.env` files with real values, tunnel credential JSON, runtime logs, or conversation JSONL data.
