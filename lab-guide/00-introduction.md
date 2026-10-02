Your team has built an MCP server for Nexus CRM! It exposes four tools covering:
- document search
- document retrieval
- CRM logging
- external sharing

Your internal Nexus agent already uses it, but external partners and customers want to use their agents to call your tools directly.

The server works, but it currently can't distinguish a first-party agent from a third party agent, or which user is behind which agent.

## The challenges

You have identitifed 5 blockers between where the server is now and a production deployment:

1. **No way to distinguish agents.** The MCP server cannot tell a first-party agent (your own Nexus agent) from a third-party agent from a forged request.

2. **User identities are not flowing through the agent boundary.** Even if an agent presents a token, the MCP server does not know which user is behind it. Because of this, downstream systems cannot scope access to a real person.

3. **There are no per-user credentials for downstream systems.** When the Nexus server logs CRM activity, it uses a shared service account. This makes it impossible to track and dangerous if the credentials leak.

4. **No approval flow for irreversible actions.** An agent can share a document with external recipients without confirmation from the human it's acting for.

5. **No access control at the document level.** With the user's identity in the token, FGA can enforce relationship-based access, but only if that identity actually flows to the check. Without the token carrying the user's **sub** end-to-end, the check is meaningless.

## The solution

![end to end flow](images/end-to-end.png)

With Auth0 for AI Agents, we're going to close these gaps. Using Agent as Principal and OBO Token Exchange, we give the agent a durable identity and carry the employee's **sub** through the exchange. Once that is in place, token Vault, CIBA, and FGA all have the signals they need. We will be setting up:

- **Auth for MCP** - makes the MCP server the trust boundary.
- **User Authentication** - works as it always has.
- **Token Vault** - forces a short-lived, scoped token for exactly one downstream third party API call.
- **Async Authorization (CIBA)** - puts a human in the loop for irreversible tool calls.
- **Fine-Grained Authorization (FGA)** scopes each employee to the documents they are authorized to read and share.

### The business case

These five controls aren't just security requirements—they're what your enterprise customers demand every day. Each maps directly to one of three commercial outcomes:

- **Drive revenue through world-class experiences**: PRM and Agent as Principal let you safely expose your MCP server to trusted partners, unlocking integrations you couldn't support before. CIBA cuts friction the same way: agents run pre-approved tasks silently and only interrupt a human for the one action that's genuinely high-stakes.
- **Stay ahead of the curve**: A single, standardized authorization engine lets you swap in a new agent framework or model without re-architecting security. And because Universal Login plugs directly into the systems you already run, User Authentication ships with nearly zero migration. Token Vault offloads the burden of managing and auditing agent credentials, freeing developers to focus on building. FGA's fine-grained permission boundaries earn enterprise and buyer trust.
- **Reduce risk and protect your brand**: Token Vault keeps high-risk credentials out of your application database entirely, shrinking the attack surface. Agent as Principal gives every agent a distinct, auditable, revocable identity, closing the blind spot a shared service account creates. CIBA requires human approval on irreversible actions, with no exceptions—so no rogue or compromised agent acts alone on your most consequential operations.

## The journey

As the developer, you'll work in a running build of Nexus. You will need to set up and use:

- **The in-app lab guide.** Open it from the **Lab guide** button in the UI.
- **Nexus itself.** Each of the core modules builds and configures one control in turn. The chat interface unlocks once every module passes its checkpoint. In the closing end-to-end run, you talk to Nexus the way an employee would for the first time, watching every token exchange, access decision, and credential mint land through the live event panel.

Most modules are hands-on. You'll be configuring something in Auth0, walk through the implementation in the editor, and confirm it at a checkpoint before moving on. The Fine-Grained Authorization module has nothing to configure, you'll preview its expected behavior on the lab and confirm it live later.

Over the next two hours, you'll close each gap in turn. By the end, you'll have closed every gap identified today.

#### <span style="font-variant: small-caps">Let's go!</span>
