### Summary

## Welcome to Auth0 dev{camp} | Agentic AI

RetailZero built its name on wholesale. Bulk B2B orders outrun consumer retail three to one, and the deal desk is where those orders actually get made. Reps pull pricing, draft quotes, route to finance, and commit terms all day, every day. Every cycle burns salaried hours, and on roughly 60% of wholesale RFPs the first vendor to quote is the one who wins.

So last quarter RetailZero shipped **Z-Merchant**, an AI assistant built to collapse that loop. It looks up catalog prices and buyer tiers, drafts quote documents in the rep's Google Workspace, pings the deal-desk channel in Slack, and commits final terms to the order system. It works, and it is fast. The catch: it cannot ship to production, because nothing ties it to the rep on whose behalf it acts.

As newly minted RetailZero contract engineers for the next two hours, we will close that gap and build the Identity Bridge for Z-Merchant, through the lens of Auth0's Auth for AI Agents suite of features.

### Overview of Modules

This lab consists of **four (4)** core modules plus an **optional bonus**, each building on the last until Z-Merchant goes from unsupervised automation to a trusted colleague at the deal desk. Your Auth0 tenant is provisioned for you on launch, so there is no dashboard setup to wire by hand. Most modules are hands-on; one, Fine-Grained Authorization, runs as a live demo you witness rather than code.

This will jumpstart your understanding of the Auth0 platform and the role it plays in securing AI agents today!

Here is what we will get into:

1. **Who Goes There?**: ***User Authentication***

   *Give Z-Merchant a way to know exactly which rep is talking to it. The rep logs in, and every call into the agent carries a validated token instead of an anonymous request.*

2. **The Guest List**: ***Auth0 Fine-Grained Authorization (FGA)*** *(live demo)*

   *Not every rep should see every account. Watch Auth0 FGA enforce the relationship graph live against a real store, so a rep reads and commits only on the accounts they own or manage, and a query outside their book gets a clean deny at the data boundary.*

3. **The Keychain**: ***Token Vault***

   *Z-Merchant has to write Google Docs and post to Slack on the rep's behalf. Use Token Vault to hold each rep's federated credentials, refresh them automatically, and hand the agent a short-lived, scoped token for exactly one downstream call. Credentials never sit in agent memory.*

4. **The Trust Boundary**: ***Auth for MCP***

   *Z-Merchant's tools run on a Model Context Protocol (MCP) server that should never accept an anonymous caller. Make the MCP server the trust boundary, with on-behalf-of token exchange so every downstream call knows which rep triggered it and the agent runtime becomes just a client.*

**Bonus.** **Approve It, or It Doesn't Happen**: ***Async Authorization via Client-Initiated Backchannel Authentication (CIBA)***

   *For the actions that actually cost money, add a human in the loop. Z-Merchant can prepare a steep discount, but it cannot commit until the rep approves a signed binding message from their own device. The agent proposes, the human disposes.*
