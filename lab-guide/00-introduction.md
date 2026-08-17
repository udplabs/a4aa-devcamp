Your team has built a Nexus's MCP server! It exposes four tools covering:
- document search
- document retrieval
- CRM logging,
- and external sharing. 

The internal Nexus agent already uses it, but  external third-party partners want to integrate and Claude Desktop users want to call your tools directly. 

The good news is that the server works, but it cannot distinguish:
- a legitimate first-party agent from a forged request
- which employee is behind which agent.

## The Challenges

The MCP server works, but it cannot ship yet. Five blockers stand between today's demo and a production deployment:

1. **No mechanism to distinguish clients.** The MCP server cannot tell a first-party agent (your own Nexus agent) from a third-party integration from a forged request.

2. **User identities are not flowing through the agent boundary.** Even if an agent presents a token, the server does not know which employee is behind it. Downstream systems cannot scope access to a real person.

3. **No per-user credentials for downstream systems.** When Nexus logs CRM activity, it uses a shared service account. This makes it impossible to track and dangerous if the credentials leak.

4. **No approval gate on irreversible actions.** An agent can share a document with any external recipient, at any time, without confirmation.

5. **No access control at the document level.** With the user's identity in the token, FGA can enforce relationship-based access, but only if that identity actually flows to the check. Without OBO carrying **sub** end-to-end, the check is meaningless.

Every one of these is an identity problem. Nothing is currently tieing the authorization chain together.

## The Solution

With Auth0 for AI Agents, we're going to close this gap. Using CIMD and OBO Token Exchange, we cangive the agent a stable identity and carry the employee's **sub** through the exchange so Token Vault, CIBA, and FGA all have the signals they need. Across five core modules, Nexus goes from an open platform to a production-ready MCP server deployment:

- **Auth for MCP** makes the MCP server the trust boundary via CIMD, PRM, and token exchange
- **User Authentication** gives the server a verified employee identity on every request, even when it comes from an agent.
- **Token Vault** holds each employee's credential and hands the server a short-lived, scoped token for exactly one downstream call.
- **Async Authorization (CIBA)** puts a human in the loop for irreversible external sharing. The agent proposes the action, and it only executes once the employee approves it.
- **Fine-Grained Authorization (FGA)** scopes each employee to the documents they are authorized to read and share. This module runs as a live demonstration you watch in action.

### The Business Case

The five controls in this lab are not purely security requirements. They are the conditions that our enterprise customers see every day. Each maps directly to one of three commercial outcomes:

- **Drive revenue through world-class experiences**: Zero-config discovery via PRM and stable CIMD identities let you safely expose your MCP server to trusted third-party agents and partners, unlocking integrations you couldn't support before. CIBA does the inverse for friction: background agents run every pre-approved task silently, and only interrupt a human device for the one action that's genuinely high-stakes.
- **Stay ahead of the curve**: A single, standardized authorization engine means you can swap in a new agent framework or model without re-architecting security, and Universal Login can plug directly into the systems you already run, so User Authentication can ship with nearly zero migration. Token Vault offloads the burden of managing and auditing agent credentials, freeing developers to focus on building. FGA's fine-grained permission boundaries are the guarantee that earns enterprise and buyer trust.
- **Reduce risk and protect your brand**: Token Vault keeps high-risk credentials out of your application database entirely, shrinking the attack surface. CIMD gives every agent a distinct, auditable, revocable identity, closing the blind spot a shared service account creates. CIBA enforces an un-bypassable human approval on irreversible actions, so no rogue or compromised agent acts alone on your most consequential operations.

## The Journey

As the developer, you will work in a running build of Nexus. Two things are in front of you the whole time:

- **The in-app lab guide.** Open it from the **Lab guide** button in the UI. It renders these same module pages with copy-ready code, so you can read a step and apply it without leaving the app.
- **Nexus itself.** Each of the five core modules builds and configures one control in turn. The chat interface unlocks once every module passes its checkpoint, so you talk to Nexus the way an employee would for the first time in the closing end-to-end run, watching the result land through the live event panel: every token exchange, access decision, and credential mint as it happens.

Most modules are hands-on. You configure something in Auth0, walk through the implementation in the editor, and confirm it at a checkpoint before moving on. One module, Fine-Grained Authorization, has nothing to configure; you preview its expected behavior on the page and confirm it live later. The closing end-to-end run then takes one document request through every control at once.

Over the next two hours, you will close each gap in turn. By the end, Nexus is secured from end to end: clients are identified, employees are authenticated, credentials stay scoped and short-lived, approval gates protect external shares, and access is enforced at the document boundary.

#### <span style="font-variant: small-caps">Let's go!</span>
