# Why Identity Matters for AI

---

## The New Attack Surface

AI agents are the new application layer. They act on behalf of users, call APIs, access sensitive data, and make decisions. Without identity:

- **Who is asking?** The agent has no way to verify the human behind the request.
- **What can they do?** There's no boundary on what data or actions the agent can access.
- **Who approved this?** No audit trail of user consent for agent actions.
- **Which tools are safe?** External tools (MCP servers) have no way to validate the caller.
- **What can they see?** No per-document or per-resource access control.
- **Whose credentials?** No secure way to access third-party APIs on the user's behalf.

---

## The Trust Chain

```
Human User
    │
    ▼
┌─────────────────────┐
│   Chat Interface     │  ← Layer 1: User Authentication
│   (Frontend App)     │     "Who is this human?"
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   AI Agent / LLM     │  ← Layer 2: API Protection + Agent Auth
│   (Backend Service)  │     "Is this request authorized?"
│                      │     CIBA: "Did the user approve this action?"
│                      │     FGA: "Can this user see this document?"
│                      │     Token Vault: "Get the user's 3P credentials"
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   External Services  │  ← Layer 3: MCP Auth
│   (MCP Servers)      │     "Does this agent have valid, scoped credentials?"
│   (Third-Party APIs) │     DCR, PRM, Resource Indicators, Token Validation
└─────────────────────┘
```

Every layer in this chain needs identity. Auth0 provides it.

---

## Real-World Scenarios

### Scenario 1: Sensitive Action Without CIBA
1. User asks agent: "Send an email to my boss saying I quit"
2. Agent calls email tool immediately — no verification, no consent
3. Email sent. Oops.

### Scenario 2: With CIBA
1. User asks agent: "Send an email to my boss saying I quit"
2. Agent triggers CIBA — sends approval request to user's device
3. User reviews and confirms (or rejects) on their phone
4. Only then does the agent execute

### Scenario 3: Document Access Without FGA
1. User asks agent: "Show me the classified report"
2. Agent returns the document — no access check
3. Unauthorized data exposed

### Scenario 4: With FGA
1. User asks agent: "Show me the classified report"
2. FGA check: user has no `viewer` relation to this document
3. Agent responds: "Access denied"

---

## Three Products, One Identity Layer

| Product | What It Secures | Key Capabilities |
|---------|----------------|-----------------|
| **Auth0 (Core)** | The human user | Login, MFA, session management |
| **Auth0 AI for Agents** | The AI agent's actions | CIBA (async consent), FGA (per-object access), Token Vault (3P credentials) |
| **Auth for MCP** | External tool servers | DCR, Protected Resource Metadata, Resource Indicators, Token Validation |

---

## Key Takeaway

> Identity is not optional for AI agents. Every interaction between a user, an agent, and a tool must be authenticated and authorized. Auth0 makes this possible without building it from scratch.
