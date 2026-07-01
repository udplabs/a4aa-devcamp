# The Ghost at the Deal Desk

## The Scenario

RetailZero's wholesale channel is the business. Bulk B2B orders outrun consumer retail three-to-one, and the deal desk is where those orders actually get made. Reps pull pricing, draft quotes, route to finance, and commit terms, all day, every day. Last quarter, RetailZero launched Z-Merchant, an AI agent designed to collapse that loop. Z-Merchant can look up catalog prices and buyer tiers, draft quote documents in the rep's Google Workspace, ping the triage channel in Slack, and commit final terms to the order system.

The capability is obvious. The risk showed up just as fast. Without a tether to the rep's identity, the agent was a black box to the security team. How do we guarantee Z-Merchant only reads the accounts that rep actually owns? How do we stop it from rubber-stamping a 40% discount and a net-120 payment term without a real human saying yes? And when Z-Merchant calls Google or Slack, whose credentials is it using?

## The Mission

You are the lead engineer building the Identity Bridge for RetailZero's wholesale channel. Your job is to take Z-Merchant from "unsupervised automation" to "identity-aware agent," without losing the speed that made it worth building in the first place.

You are not just configuring a server. You are implementing the digital equivalent of a delegation-of-authority policy. When Z-Merchant talks to the catalog, Google Docs, Slack, or the order system through the Model Context Protocol (MCP), it is not acting as an anonymous bot. It is acting as a verified proxy for the logged-in rep, with their scopes, their accounts, and their approval when the deal gets big enough to matter.

## The Arc

### 1. The Handshake

You will start by giving Z-Merchant its own identity through Client ID Metadata (CIMD). Every agent that calls into RetailZero's tool plane is pre-approved, named, and scoped by an administrator. No dynamic self-registration, no unknown clients reaching the MCP server. When the agent presents its credentials, the MCP server knows exactly which agent is calling, and what it is allowed to touch.

### 2. The Hand-off

You will implement On-Behalf-Of token exchange with an RFC 8707 resource indicator. When Z-Merchant asks the catalog tool for a tier price, it carries the rep's identity and a token audience-bound to the MCP server. Every downstream call, whether it lands on the catalog, the order system, or the Slack bridge, knows which rep triggered it. The sub claim stays intact across every hop.

### 3. The Guest List

Not every rep should see every account. You will wire in Fine-Grained Authorization (FGA) so that when Z-Merchant asks "what's the tier price for Acme," the MCP tool checks the relationship graph before it answers. A rep sees only the accounts they own. A sales manager sees the accounts owned by their team. A rep querying an account outside their book gets a clean deny, enforced at the data boundary, not in the prompt.

### 4. The Keychain

Z-Merchant doesn't live in a vacuum. To draft a quote, it has to write a Google Doc. To route to the deal desk, it has to post in Slack. You will use Token Vault to hold each rep's federated Google and Slack credentials, refresh them automatically, and hand the agent a short-lived, scoped token for exactly one downstream call. Reps link their Workspace and Slack once. The vault manages the rest. Credentials never sit in agent memory, never leak into a prompt, and never get passed between tools.

### 5. The Deadman's Switch

For the actions that actually cost money, you will build a human-in-the-loop gate with Client-Initiated Backchannel Authentication (CIBA). Z-Merchant can prepare a 25% discount on a quote for Acme, but it cannot hit commit until Auth0 confirms a fresh, biometric approval from the rep's device, with the binding message "Approve 25% discount, net-60 on Acme Q3 quote" signed into the auth request. The agent proposes. The human disposes. Nothing moves without both.

## The Outcome

By the end of this lab, you will have turned Z-Merchant from a liability into a trusted colleague at the deal desk. You will leave with a reference architecture that proves agentic commerce does not have to be a security trade-off. It just needs a better ID card, a clear view of who owns what, a secure keychain for third-party systems, and a human in the loop when the dollars get real. The business outcome is measurable: fewer quote-desk cycles, faster close on wholesale deals, and a compliance posture that holds up when a finance or audit stakeholder asks who approved what.
