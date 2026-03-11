# Auth for GenAI: Securing MCP

---

## What Is MCP?

**Model Context Protocol (MCP)** is an open standard for connecting AI models to external tools and data sources. Think of it as a USB-C port for AI:

```
┌─────────┐     MCP      ┌─────────────┐
│  Agent  │◄────────────▶│  MCP Server  │
│  (LLM)  │  (protocol)  │  (Tools)     │
└─────────┘              └─────────────┘
```

MCP servers expose **tools** (functions) and **resources** (data) that any MCP-compatible client can use.

---

## The Problem: MCP Has No Built-In Auth

The MCP specification defines the protocol for communication but **does not prescribe authentication or authorization**. This means:

- Any client can connect to any MCP server
- Tools execute without verifying the caller
- No user context flows through to the tool
- Sensitive operations have no access control

---

## Auth for MCP: The Solution

Auth0's Auth for MCP adds an **OAuth 2.0 layer** to MCP servers:

```
┌─────────┐                        ┌───────────────┐
│  Agent  │──── 1. Auth Request ──▶│    Auth0      │
│         │◀─── 2. Access Token ───│    Tenant     │
│         │                        └───────────────┘
│         │                        ┌───────────────┐
│         │──── 3. MCP Request ───▶│  MCP Server   │
│         │     + Access Token     │  (Protected)  │
│         │◀─── 4. Tool Result ────│               │
└─────────┘                        └───────────────┘
```

---

## How It Works

### 1. MCP Server Registration

Register the MCP server as a **Resource Server** in Auth0:

```
Auth0 Dashboard → APIs → Create API
  - Name: "My MCP Server"
  - Identifier: "https://mcp.example.com"
  - Permissions: weather:read, calendar:read, email:send
```

### 2. OAuth 2.0 Metadata Discovery

The protected MCP server exposes a standard OAuth metadata endpoint:

```
GET /.well-known/oauth-authorization-server

{
  "issuer": "https://your-tenant.auth0.com",
  "authorization_endpoint": "https://your-tenant.auth0.com/authorize",
  "token_endpoint": "https://your-tenant.auth0.com/oauth/token",
  "registration_endpoint": "https://your-tenant.auth0.com/oidc/register"
}
```

### 3. Token Validation on Every Tool Call

```typescript
// MCP Server middleware
server.use(async (request, next) => {
  const token = request.headers.authorization?.split(" ")[1];

  // Validate with Auth0
  const decoded = await validateToken(token, {
    issuer: "https://your-tenant.auth0.com/",
    audience: "https://mcp.example.com"
  });

  // Check tool-specific scopes
  const requiredScope = getRequiredScope(request.method);
  if (!decoded.scope.includes(requiredScope)) {
    throw new UnauthorizedError("Insufficient scope");
  }

  return next();
});
```

---

## Auth for MCP vs Traditional API Auth

| Aspect | Traditional API Auth | Auth for MCP |
|--------|---------------------|--------------|
| Client | Known, registered app | Any MCP-compatible agent |
| Discovery | Hardcoded config | `.well-known` metadata |
| Registration | Manual in dashboard | Dynamic client registration |
| Scopes | Per-API | Per-tool granularity |
| Token flow | Standard OAuth | OAuth + MCP transport |

---

## The Full Picture: AI for Agents + Auth for MCP Together

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐
│  User    │─────▶│  AI Agent    │─────▶│  MCP Server  │
│  (Auth0  │      │  (Auth0 AI   │      │  (Auth for   │
│   Login) │      │   for Agents)│      │   MCP)       │
└──────────┘      └──────────────┘      └──────────────┘
     │                   │                      │
     │      ┌────────────▼──────────────────────▼──┐
     └─────▶│           Auth0 Tenant               │
             │  • User identities                   │
             │  • Agent credentials                  │
             │  • MCP server registration            │
             │  • Scopes & permissions               │
             │  • Consent records                    │
             └─────────────────────────────────────┘
```

**Auth0 AI for Agents** handles the agent's authorization to act on behalf of a user.

**Auth for MCP** handles the MCP server's requirement that callers prove their identity.

Together, they create an end-to-end identity chain from **human** to **agent** to **tool**.

---

## Key Takeaway

> MCP gives AI agents a standard way to use tools. Auth for MCP gives those tools a standard way to verify who's using them and what they're allowed to do.
