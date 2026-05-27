# Securing AI Agents with Auth0

A hands-on workshop where you take a working AI agent and make it production-ready using Auth0 — in under two hours, with minimal code.

## What you'll experience

You'll work with **Z-Merchant**, a B2B wholesale quote agent built for RetailZero. It already works — it drafts quotes, checks pricing, creates documents, and posts to Slack. Your job is to close four security gaps that stand between it and production.

Each module maps to an Auth0 capability:

| Module | Auth0 Capability | What it solves |
|--------|-----------------|----------------|
| 1 | User Authentication | The agent doesn't know who's talking to it |
| 2 | Fine-Grained Authorization | The agent can see every account, not just yours |
| 3 | Token Vault | The agent uses shared bot credentials for Google and Slack |
| 4 | Auth for MCP | The agent's tools are open to any caller |

There's also an **optional bonus module** — **Async Authorization (CIBA)** — for high-stakes actions that need out-of-band human approval.

## How it works

This isn't a traditional coding lab. The app is pre-built. For each module, you'll:

1. **Understand why** — what's the security gap and what does Auth0 do about it
2. **Configure** — set up the Auth0 feature (scopes, relationships, providers)
3. **Connect** — write 2-3 lines of code that wire it in
4. **Witness** — watch Auth0 in action through a live event panel that narrates every token exchange, access check, and credential mint in real time

## Prerequisites

A browser with access to GitHub. That's it.

Your environment runs entirely in GitHub Codespaces — no local installs, no dependencies, no laptop restrictions. Your Auth0 tenant is provisioned automatically when you launch.

## Time

~2.5 hours total:
- **30 minutes** — kickoff presentation and story setup
- **~2 hours** — hands-on modules

## Ready?

Click **Launch** to provision your environment. While it spins up, you'll get a short briefing on RetailZero and your mission.
