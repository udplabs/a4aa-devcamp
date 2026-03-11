# Auth0 AI for Agents

---

## What Is It?

Auth0 AI for Agents extends Auth0's identity platform to cover **AI agent workflows**. It answers the question:

> "How does an AI agent prove it's allowed to act on behalf of a specific user?"

---

## The Problem

Traditional OAuth flows assume a human is present to click "Authorize." But AI agents operate autonomously. They need to:

1. **Obtain tokens** scoped to a specific user without a browser redirect
2. **Request permission** for sensitive actions asynchronously
3. **Access third-party APIs** with the user's credentials (not the agent's)
4. **Respect boundaries** - different tools need different permission levels

---

## Core Concepts

### 1. Tool-Level Authorization

Each tool the agent can call is associated with required scopes:

```typescript
// Define what permissions a tool needs
const weatherTool = {
  name: "get_weather",
  scopes: ["weather:read"]  // Low risk - auto-approved
};

const emailTool = {
  name: "send_email",
  scopes: ["email:send"]    // High risk - requires user consent
};
```

### 2. Async User Consent

When an agent needs elevated permissions, it triggers an async authorization flow:

```
Agent: "I need email:send permission to complete this task"
    │
    ▼
Auth0: Sends consent request to user
    │
    ▼
User: Reviews and approves/denies in their app
    │
    ▼
Agent: Receives scoped token (or denial)
```

### 3. Token Exchange

The agent exchanges its own credentials + user context for a scoped token:

```
Agent Token + User Assertion  →  Auth0  →  Scoped Access Token
(machine-to-machine)           (token      (acts on behalf of
                                exchange)   specific user)
```

---

## Architecture Pattern

```
┌──────────────────────────────────────────────────┐
│                  Your Application                 │
│                                                   │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐ │
│  │   Chat    │───▶│  Agent    │───▶│  Tools    │ │
│  │   UI      │    │  (LLM)   │    │           │ │
│  └───────────┘    └─────┬─────┘    └─────┬─────┘ │
│                         │                │        │
│                    ┌────▼────────────────▼────┐   │
│                    │   Auth0 AI for Agents    │   │
│                    │                          │   │
│                    │  • getTokenForTool()     │   │
│                    │  • requestConsent()      │   │
│                    │  • validatePermission()  │   │
│                    └────────────┬─────────────┘   │
│                                 │                  │
└─────────────────────────────────┼──────────────────┘
                                  │
                            ┌─────▼─────┐
                            │   Auth0   │
                            │  Tenant   │
                            └───────────┘
```

---

## Integration Points

### Frontend (React)
- `@auth0/auth0-react` for user login
- Access token attached to API calls

### Backend (Node.js)
- `express-oauth2-jwt-bearer` for API protection
- Token exchange for agent-to-tool authorization
- CIBA (Client-Initiated Backchannel Authentication) for async consent

### Tool Definitions
- Each tool declares required scopes
- Agent checks authorization before execution
- Unauthorized tools trigger consent flow

---

## Key Differentiator

Auth0 AI for Agents doesn't replace your agent framework (LangChain, CrewAI, Vercel AI SDK, etc.). It **wraps around your tools** to add identity:

```typescript
// Without Auth0 - tool executes blindly
function sendEmail(to, subject, body) {
  return emailService.send(to, subject, body);
}

// With Auth0 AI for Agents - tool checks identity first
async function sendEmail(to, subject, body, agentContext) {
  const token = await auth0AI.getTokenForTool("send_email", agentContext);
  if (!token) {
    return await auth0AI.requestUserConsent("email:send", agentContext);
  }
  return emailService.send(to, subject, body, { authorization: token });
}
```
