## The Story

You built Nexus's MCP server: it exposes four tools covering document search, document retrieval, CRM logging, and external sharing. Your first-party Nexus agent already uses it, third-party partners want to integrate, and Claude Desktop users want to call your tools directly. Multiple agents and multiple clients are routing through the same server on behalf of company employees. The server works today; what it cannot do is tell those clients apart or prove which employee any of them is acting for.

## The Challenge(s)

The MCP server works, but it cannot ship. Five blockers stand between today's demo and a production deployment, and none of them are about the model:

1. **No mechanism to distinguish clients.** The MCP server cannot tell a first-party agent (your own Nexus agent with a stable CIMD identity) from a third-party integration from a forged request. There are no discovery documents for compliant clients to find, and no token validation to enforce before a tool executes.

2. **No user identity flowing through the agent boundary.** Even if a caller presents a token, the server does not know which employee is behind it. Downstream systems cannot scope access to a person, OBO token exchange is not wired, and there is nothing to audit.

3. **No per-user credentials for downstream systems.** When Nexus logs CRM activity, it uses a shared service account: impossible to attribute, dangerous if it leaks, and a manual burden when employees leave.

4. **No approval gate on irreversible actions.** An agent can share a document with any external recipient, at any time, without confirmation. A mistyped email or a compromised session sends a confidential file outside the org with no recourse.

5. **No access control at the document level.** With the user's identity in the token, FGA can enforce relationship-based access, but only if that identity actually flows to the check. Without OBO carrying `sub` end-to-end, the check is meaningless.

Every one of these is an identity problem. Nothing ties the server, or the agents connecting to it, to the employee on whose behalf they act.

## The Solution

You will close that gap with Auth0's Auth for AI Agents suite. CIMD and OBO Token Exchange are the mechanisms that make everything else possible: once the agent has a stable identity and carries the employee's `sub` through the exchange, Token Vault, CIBA, and FGA all have the signals they need. Across five core modules, Nexus goes from an open platform to a production-ready MCP server deployment:

- **Auth for MCP** makes the MCP server the trust boundary. It handles JWT validation, PRM and AS discovery documents, and on-behalf-of token exchange so every tool call is scoped to a resource and a caller.
- **User Authentication** gives the server a verified employee identity on every request, so everything downstream reasons about the human, not the agent.
- **Token Vault** holds each employee's federated CRM credential and hands the server a short-lived, scoped token for exactly one downstream call.
- **Async Authorization (CIBA)** puts a human in the loop for irreversible external sharing: the agent proposes, the employee approves from their device, then it executes.
- **Fine-Grained Authorization (FGA)** scopes each employee to the documents they are authorized to read and share, enforced live at the data boundary. You witness this module rather than code it.

### The Business Case

The five controls in this lab are not purely security requirements; they are the conditions under which enterprise customers will buy. Each maps directly to one of three commercial outcomes:

- **Drive revenue through world-class experiences**: Zero-config discovery via PRM and stable CIMD identities let you safely expose your MCP server to trusted third-party agents and partners, unlocking integrations you couldn't support before. CIBA does the inverse for friction: background agents run every pre-approved task silently, and only interrupt a human device for the one action that's genuinely high-stakes.
- **Stay ahead of the curve**: A single, standardized authorization engine means you can swap in a new agent framework or model without re-architecting security, and Universal Login plugs directly into the IdP you already run, so User Authentication ships with zero migration. Token Vault offloads the burden of managing and auditing agent credentials, freeing developers to focus on building. FGA's fine-grained permission boundaries are the guarantee that earns enterprise and buyer trust.
- **Reduce risk and protect your brand**: Token Vault keeps high-risk credentials out of your application database entirely, shrinking the attack surface. CIMD gives every agent a distinct, auditable, revocable identity, closing the blind spot a shared service account creates. CIBA enforces an un-bypassable human approval on irreversible actions, so no rogue or compromised agent acts alone on your most consequential operations.

## The Journey

You work in a running build of Nexus, not slides. Two things are in front of you the whole time:

- **The in-app lab guide.** Open it from the **Lab guide** button in the UI. It renders these same module pages with copy-ready code, so you can read a step and apply it without leaving the app.
- **Nexus itself.** The chat surface is the live agent. As you work through each module, you talk to Nexus the way an employee would, then watch the result land through the live event panel: every token exchange, every access decision, every credential mint as it happens.

Most modules are hands-on. You configure something in Auth0, walk through the implementation in the editor, and confirm it at a checkpoint before moving on. One module, Fine-Grained Authorization, runs as a live demo you watch rather than configure. A closing end-to-end run takes one document request through every control at once.

Over the next two hours, you will close each gap in turn. By the end, Nexus is secured from end to end: clients are identified, employees are authenticated, credentials stay scoped and short-lived, approval gates protect external shares, and access is enforced at the document boundary.

Let's go.
