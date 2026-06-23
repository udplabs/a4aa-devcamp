### Summary

## Welcome to Auth0 dev{camp} | Agentic AI

You built Nexus's MCP server: it exposes four tools covering document search, document retrieval, CRM logging, and external sharing. The first-party Nexus agent already uses it, third-party partners want to integrate, and Claude Desktop users want to call your tools directly. The server works, but it cannot distinguish a legitimate first-party agent from a forged request, and when a valid agent connects, it has no way to know which employee is behind it.

You are the team shipping that server as a platform. The bottleneck is identity. Without proof of who is calling and which employee they represent, the server cannot enforce any policy downstream, leaving sensitive operations exposed to misuse. Over the next two hours, you will close that gap using Auth0's Auth for AI Agents suite.

### Overview of Modules

This lab consists of **five (5)** core modules, each adding one security layer to the Nexus MCP server deployment. Your Auth0 tenant is provisioned for you on launch. Most modules are hands-on; one, Fine-Grained Authorization, runs as a live demo to illustrate enforcement in action rather than as a coding exercise.

Here is what we will get into:

1. **The Trust Boundary**: ***Auth for MCP***

   *Register the MCP server as an Auth0 resource and publish PRM plus AS discovery so any compliant client finds it with zero configuration. Pre-register the first-party Nexus agent via CIMD so it has a stable, auditable identity across deploys. OBO token exchange carries the employee's `sub` through the agent boundary, ensuring every tool call downstream identifies exactly who triggered it.*

2. **Who Goes There?**: ***User Authentication***

   *The MCP server now identifies its callers, but before it can enforce policy downstream, it needs a verified employee in the session. Wire Universal Login so every request carries the JWT `sub` that CIMD's OBO exchange will preserve to the tool, establishing the user context for all downstream authorization decisions.*

3. **The Keychain**: ***Token Vault***

   *When agents act on behalf of users to access downstream systems, they need scoped, attributable credentials. Replace the shared bot token with a per-user CRM credential vaulted by Auth0, retrieved per-call, and never held in agent memory, eliminating shared secrets and ensuring every API call is traceable to a specific user.*

4. **Approve It, or It Doesn't Happen**: ***Async Authorization (CIBA)***

   *Not every tool call should execute without confirmation. When an agent requests an external document share, the MCP server requires out-of-band approval from the employee before it executes, giving users explicit control over sensitive operations.*

5. **The Guest List**: ***Auth0 Fine-Grained Authorization (FGA)*** *(live demo)*

   *With the agent-identity pipeline in place, watch FGA enforce document-level access using the `sub` that flows from OBO. An engineer reads only engineering documents, HR data remains confidential, and a viewer cannot share what they are permitted only to read.*
