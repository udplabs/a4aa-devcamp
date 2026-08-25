## Welcome to Auth0 Dev{Camps} | Agentic AI

> [!TIP]
> Want to run this lab locally later, outside the Codespace? The full source is on GitHub: [github.com/udplabs/a4aa-devcamp](https://github.com/udplabs/a4aa-devcamp).

Your team has built an MCP server for Nexus! It exposes four tools covering:
- document search
- document retrieval
- CRM logging
- external sharing

The internal Nexus agent already uses it. But external partners want to integrate, and Claude Desktop users want to call your tools directly.

The good news: the server works. But it can't distinguish:
- a legitimate first-party agent from a forged request
- which employee is behind which agent

You're shipping that server as a platform, and identity is the bottleneck. Without proof of who—or what—is calling and what they can access, the server can't enforce policy downstream. That leaves the tools open to misuse.

Over the next two hours, you'll close that gap using Auth0's Auth for AI Agents suite.

### An overview of the modules

This lab has **five** core modules. Each one builds on the last to add a full security fabric to the Nexus MCP server.

Here's what each module covers:

1. **One trust boundary for every agent**: ***Auth for MCP***
   - Registers the MCP server as an Auth0 resource
   - Publishes Protected Resource Metadata (PRM) and Authorization Server (AS) discovery for zero-config registration
   - Pre-registers the first-party Nexus agent via CIMD, so it has a stable, auditable identity across deploys
   - Carries the employee's **sub** through the agent boundary via On-Behalf-Of (OBO) token exchange, so every downstream tool call identifies exactly who triggered it

2. **Every agent action has an owner**: ***User Authentication***

   - The MCP server now identifies its callers, but before it can enforce policy downstream, it needs a verified employee in the session
   - Wires Universal Login into every request, so it carries the JWT **sub** that OBO token exchange preserves to the tool
   - Establishes the user context for all downstream authorization decisions

3. **The agent acts as the employee, not a shared bot**: ***Token Vault***

   - When agents act on a user's behalf to reach downstream systems, they need scoped, attributable credentials
   - Replaces the shared bot token with a per-user CRM credential vaulted by Auth0. That token is:
      - retrieved per-call
      - never held in agent memory
   - This eliminates shared secrets and ensures every API call is traceable to a specific user.

4. **Humans approve what can't be undone**: ***Async Authorization (CIBA)***

   - *Not every tool call should execute without confirmation.*
   - When an agent makes a specific request, the MCP server requires out-of-band approval. This happens:
      - Before tool execution
      - On specific tool calls
   - This setup gives users explicit control over sensitive operations.

5. **Access that knows where it ends**: ***Auth0 Fine-Grained Authorization (FGA)*** *(live demo)*

   - Watch FGA enforce document-level access using the **sub** that flows from OBO.
   - An engineer reads only engineering documents
   - HR data remains confidential
   - A viewer role can only read—not share
