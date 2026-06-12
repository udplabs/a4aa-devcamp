## The Story

RetailZero built its name on wholesale. Bulk B2B orders outrun consumer retail three to one, and the deal desk is where those orders actually get made. Reps pull catalog pricing, draft quotes, route them to finance, and commit final terms all day, every day. Every cycle burns salaried hours, and every non-standard discount adds a round trip. On roughly 60% of wholesale RFPs, the first vendor to quote is the one who wins.

So last quarter RetailZero shipped **Z-Merchant**, an AI agent built to collapse that loop. It looks up catalog prices and buyer tiers, drafts quote documents in the rep's Google Workspace, posts to the deal-desk triage channel in Slack, and commits final terms to the order system. It works, and it is fast.

## The Challenge(s)

Z-Merchant works in the demo, but it cannot ship to production. The security team flagged four blockers, and none of them are about the model:

1. **No identity.** Anyone can talk to the agent. It has no idea which rep is making a request, so there is no way to scope access or audit what it does.

2. **No access boundaries.** Z-Merchant can see every wholesale account. A rep pulling a competitor's pricing or another team's book has nothing stopping them.

3. **No per-user credentials.** When the agent writes a Google Doc or posts to Slack, it uses a shared bot token. If that token leaks, every rep's workspace is exposed, and you cannot revoke one person without breaking everyone.

4. **No trust boundary.** The tools Z-Merchant calls run on a Model Context Protocol (MCP) server that accepts any caller. A forged request could commit a quote, read pricing data, or post to Slack with nothing to validate it.

Every one of these is an identity problem. Nothing ties the agent to the rep on whose behalf it acts.

## The Solution

You will close that gap with Auth0's Auth for AI Agents suite. Across four core modules plus an optional bonus, Z-Merchant goes from unsupervised automation to a trusted colleague at the deal desk:

- **User Authentication** gives the agent a verified rep identity on every request.
- **Fine-Grained Authorization (FGA)** scopes each rep to the accounts they own or manage, enforced live against a real store. You witness this module rather than code it.
- **Token Vault** holds each rep's federated Google and Slack credentials and hands the agent a short-lived, scoped token for exactly one downstream call.
- **Auth for MCP** turns the MCP server into the trust boundary, with on-behalf-of token exchange so every downstream call knows which rep triggered it.
- **Async Authorization (CIBA)**, the optional bonus, puts a human in the loop for the actions that cost money, requiring out-of-band rep approval before a non-standard quote commits.

Your Auth0 tenant is provisioned for you on launch, so there is no dashboard setup to wire by hand.

## The Journey

You work in a running build of Z-Merchant, not slides. Two things are in front of you the whole time:

- **The in-app lab guide.** Open it from the **Lab guide** button in the UI. It renders these same module pages with copy-ready code, so you can read a step and apply it without leaving the app.
- **Z-Merchant itself.** The chat surface is the live agent. As you wire up each module, you talk to Z-Merchant the way a rep would, then watch the result land through the live event panel: every token exchange, every access decision, every credential mint as it happens.

Most modules are hands-on. You configure something in Auth0, connect it with a few lines of code, and confirm it at a checkpoint before moving on. One module, Fine-Grained Authorization, runs as a live demo you watch rather than build. A closing end-to-end run takes one deal through every control at once.

Over the next two hours, you will resolve each blocker in turn. By the end, Z-Merchant is identity-aware, access-controlled, credential-safe, and trust-bounded.

Let's go.
