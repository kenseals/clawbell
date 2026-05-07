# AGENTS

This repo is the reusable ClawBell product repo, not a private operator workspace and not an operator-specific site config repo.

## Purpose

Agents working here should make ClawBell easier for other operators to understand, test, and self-host.

## Core boundary

- keep docs and code generic to ClawBell unless an example is clearly labeled as an example
- Operator-specific dogfood examples should stay private or be clearly scrubbed before public release
- never widen the product boundary into a full OpenClaw gateway or private-assistant exposure
- visitors are never trusted as operator/admin from the public chat surface

## Safe editing rules

- stay within this repo/worktree
- do not add secrets, tokens, private URLs, or local machine state
- do not commit local config, runtime logs, or operator data
- do not rewrite history or revert unrelated user changes
- do not deploy, merge, or push unless explicitly asked

## Docs posture

When updating docs:

- write for other operators first
- keep v0 claims honest
- distinguish current behavior from future direction
- prefer Cloudflare Tunnel as the reusable public-production bridge recommendation
- describe Cloudflare Pages plus Render as an operational split option, not as a fully packaged repo mode unless the code supports it

## Verification expectations

Before finishing a docs or code change:

- run `npm run check:syntax`
- grep for stale canonical references such as `k2claw`
- check that no secrets or tokens were introduced
- use `CLAWBELL_VERIFY.md` when validating deployment or launch-facing behavior

## Key files

- `README.md`: public product front door
- `INSTALL_FOR_AGENTS.md`: setup path for coding agents
- `CLAWBELL_VERIFY.md`: smoke-test runbook
- `bridge-recipes/*.md`: bridge-specific setup docs
- `llms.txt` and `llms-full.txt`: agent-readable navigation
