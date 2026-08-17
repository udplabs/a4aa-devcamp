## Welcome to Auth0 Dev{Camps} | Agentic AI

> [!TIP]
> Want to run this lab locally later, outside the Codespace? The full source is on GitHub: [github.com/udplabs/a4aa-devcamp](https://github.com/udplabs/a4aa-devcamp).

Your team has built a Nexus's MCP server! It exposes four tools covering:
- document search
- document retrieval
- CRM logging,
- and external sharing. 

The internal Nexus agent already uses it, but  external third-party partners want to integrate and Claude Desktop users want to call your tools directly. 

The good news is that the server works, but it cannot distinguish:
- a legitimate first-party agent from a forged request
- which employee is behind which agent.

You are the team shipping that server as a platform and the bottleneck is identity. Without proof of who (or what) is calling and what their access is, the server cannot enforce policy downstream which leaves the tools exposed to misuse. 

Over the next two hours, you will close that gap using Auth0's Auth for AI Agents suite.

### An overview of the Modules

This lab consists of **five (5)** core modules, each adding on the previous one to build a full security fabric to the Nexus MCP server. 

Here is what we will get into:

1. **One trust boundary for every agent**: ***Auth for MCP***
   - Registers the MCP server as an Auth0 resource
   - Publish Protected Resource Metadata (PRM) plus Authorization Server (AS) discovery for zero configuration registration. 
   - Pre-register the first-party Nexus agent via CIMD so it has a stable, auditable identity across deploys. 
   - On-Behalf-Of (OBO) token exchange carries the employee's **sub** through the agent boundary, ensuring every tool call downstream identifies exactly who triggered it.

2. **Every agent action has an owner**: ***User Authentication***

   - The MCP server now identifies its callers, but before it can enforce policy downstream, it needs a verified employee in the session. 
   - Wire Universal Login so every request carries the JWT **sub** that the OBO token exchange will preserve to the tool
   - This establishes the user context for all downstream authorization decisions.*

3. **The agent acts as the employee, not a shared bot**: ***Token Vault***

   - When agents act OBO users to access systems, they need to have scoped, attributable credentials. 
   - Replace the shared bot token with a per-user CRM credential vaulted by Auth0. This token is:
      - retrieved per-call
      - never held in agent memory
   - This eliminates shared secrets and ensures every API call is traceable to a specific user.

4. **Humans approve what can't be undone**: ***Async Authorization (CIBA)***

   - *Not every tool call should execute without confirmation.*
   - When an agent makes a specific request the MCP server requires out-of-band approval. This occurs: 
      - Before tool execution
      - On specific tool calls
   - This setup gives users explicit control over sensitive operations.

5. **Access that knows where it ends**: ***Auth0 Fine-Grained Authorization (FGA)*** *(live demo)*

   - Watch FGA enforce document-level access using the **sub** that flows from OBO. 
   - An engineer reads only engineering documents
   - HR data remains confidential
   - A viewer role cannot share what they are permitted only to read.*
