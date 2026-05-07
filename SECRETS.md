# Secrets, backup, and rotation

ClawBell should be public-repo friendly. Secret values must never be committed to Git.

## Recommended backup model

Use this split:

1. **Git**: variable names, placeholders, setup docs, rotation procedure.
2. **Runtime**: host env vars, Cloudflare Worker secrets, launchd/systemd env, or local secret files.
3. **Recovery**: operator-controlled password manager or encrypted secret store.

A private GitHub repo is acceptable for inventories and encrypted secret files, but not for raw plaintext production secrets. If repo-backed secrets are needed, use encryption such as `sops` + `age`, and keep the decryption key outside Git.

## Secrets used by ClawBell

### `ADMIN_TOKEN`

Purpose: protects admin/config/conversation endpoints on the Node app when `REQUIRE_ADMIN_AUTH=1`.

Runtime location: Node host env var.

Backup location: operator password manager / encrypted secret store.

Rotation:

1. Generate a new long random token.
2. Update the host env var.
3. Restart/redeploy the Node service.
4. Verify admin routes reject the old token and accept the new token.

### `SOREN_BRIDGE_TOKEN`

Purpose: authenticates the public app or Worker to the narrow bridge `/ask` endpoint.

Runtime locations:

- public app / Cloudflare Worker secret
- local bridge env var or local secret file

Backup location: operator password manager / encrypted secret store.

Rotation:

1. Generate a new long random token.
2. Update the local bridge runtime secret.
3. Restart the local bridge service.
4. Update the public app/Worker secret.
5. Run smoke checks:
   - unauthenticated bridge `/ask` returns `401`
   - authenticated bridge `/ask` returns `200`
   - public `/api/chat` returns either live bridge source or honest fallback

### `SOREN_BRIDGE_ACCESS_CLIENT_ID` and `SOREN_BRIDGE_ACCESS_CLIENT_SECRET`

Purpose: optional Cloudflare Zero Trust Access service-token headers for defense in depth.

Runtime location: public app / Worker secrets or host env vars.

Backup location: operator password manager / encrypted secret store.

Rotation:

1. Create a replacement service token in Cloudflare Access.
2. Update public app/Worker secrets.
3. Verify bridge access with new Access headers and bearer token.
4. Revoke the old service token.

### Tunnel credentials

Purpose: allow `cloudflared` to run a named tunnel.

Runtime location: local `cloudflared` credential JSON file.

Backup options:

- encrypted backup controlled by the operator, or
- documented recreate procedure using Cloudflare login and tunnel setup commands.

Do not commit tunnel credential JSON to Git.

## Private repo policy

A private repo may contain:

- this procedure
- no-value inventory tables
- encrypted secrets managed by `sops`/`age`
- recovery checklists

A private repo should not contain:

- raw tokens
- Cloudflare API tokens
- tunnel credential JSON
- `.env` files with real values
- runtime logs or conversation data

## Verification

Before making a repo public or tagging a release, run:

```bash
npm run security:smoke
```

Also inspect tracked files:

```bash
git ls-files | grep -Ei '(^|/)(\.env|config\.local|data/|\.wrangler|token|secret|credential|conversation|handoff|log|sqlite|db)'
```

Expected: no tracked runtime secrets/data except placeholder examples and docs.
