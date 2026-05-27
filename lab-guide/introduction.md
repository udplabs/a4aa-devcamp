# Mission Briefing

## The World

RetailZero's wholesale channel is the business. Bulk B2B orders outrun consumer retail three-to-one, and the deal desk is where those orders get made. Reps pull pricing, draft quotes, route to finance, and commit terms — all day, every day. Every cycle costs hours of salaried time. Every non-standard discount compounds the delay. First-to-quote wins on roughly 60% of wholesale RFPs.

## The Agent

Last quarter, RetailZero shipped **Z-Merchant** — an AI agent built to collapse the quote cycle. It can:

- Look up catalog prices and buyer tiers
- Draft quote documents in the rep's Google Workspace
- Post to the deal-desk triage channel in Slack
- Commit final terms to the order system

It works. It's fast. But it can't ship to production.

## The Problem

The security team flagged four blockers before Z-Merchant can go live:

1. **No identity** — Anyone can talk to it. The agent has no idea which rep is making a request, so there's no way to scope access or audit actions.

2. **No access boundaries** — It can see every wholesale account. A rep querying a competitor's pricing or another team's book has nothing stopping them.

3. **No per-user credentials** — When Z-Merchant writes a Google Doc or posts to Slack, it uses a shared bot token. If that token leaks, every rep's workspace is exposed. There's no way to revoke access for one person without breaking it for everyone.

4. **No trust boundary** — Z-Merchant's tools run on an MCP server that accepts any caller. A forged request could trigger a quote commit, access pricing data, or post to Slack — with no validation.

## Your Mission

Over the next two hours, you'll resolve each blocker using Auth0. By the end, Z-Merchant is production-ready — identity-aware, access-controlled, credential-safe, and trust-bounded.

## How You'll Work

Each module tells you what to configure in Auth0, where to connect it (2-3 lines of code), and shows you the platform in action through the live event panel. You'll see every token exchange, every access decision, and every credential mint as it happens.

Let's go.
