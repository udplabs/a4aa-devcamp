# Auth for MCP: Securing the Model Context Protocol

---

## What Is MCP?

**Model Context Protocol (MCP)** is an open standard for connecting AI models to external tools and data sources.

```
┌─────────┐     MCP      ┌─────────────┐
│  Agent  │◄────────────▶│  MCP Server  │
│  (LLM)  │  (protocol)  │  (Tools)     │
└─────────┘              └─────────────┘
```

MCP servers expose **tools** (functions) and **resources** (data) that any MCP-compatible client can use.

---

## The Problem: MCP Has No Built-In Auth

The MCP specification defines the protocol but **does not prescribe authentication**:

- Any client can connect to any MCP server
- Tools execute without verifying the caller
- No user context flows through
- Sensitive operations have no access control

---

## Five Capabilities of Auth for MCP

### 1. API Registration for Tools

Register the MCP server as a **Resource Server** in Auth0 with per-tool scopes:

```
Auth0 Dashboard → APIs → Create API
  - Identifier: "https://mcp.example.com"
  - Permissions: mcp:weather:read, mcp:calendar:read, mcp:email:send
```

Each tool has a required scope. M2M applications are authorized with specific scopes.

---

### 2. Protected Resource Metadata (RFC 9728)

The MCP server advertises its auth requirements:

```
GET /.well-known/oauth-protected-resource

{
  "resource": "https://mcp.example.com",
  "authorization_servers": ["https://your-tenant.auth0.com"],
  "scopes_supported": ["mcp:weather:read", "mcp:calendar:read", "mcp:email:send"],
  "bearer_methods_supported": ["header"]
}
```

MCP clients read this metadata **before authenticating** — they know exactly what they need.

---

### 3. Dynamic Client Registration (DCR)

MCP clients register themselves instead of being pre-configured:

```
POST https://your-tenant.auth0.com/oidc/register
{
  "client_name": "My MCP Agent",
  "grant_types": ["client_credentials"],
  "token_endpoint_auth_method": "client_secret_post"
}

→ { "client_id": "...", "client_secret": "..." }
```

New agents can connect without manual dashboard configuration.

---

### 4. Token Scoping via Resource Indicators (RFC 8707)

When requesting tokens, specify which MCP server the token is for:

```
POST /oauth/token
{
  "grant_type": "client_credentials",
  "audience": "https://mcp.example.com",
  "resource": "https://mcp.example.com"  ← Resource Indicator
}
```

The MCP server validates that the token's `aud` claim matches its own identifier. Tokens for Server A can't be used on Server B.

---

### 5. OAuth 2.0 Token Validation

Every tool call is validated:

```typescript
const validateMCPToken = auth({
  issuerBaseURL: `https://${AUTH0_DOMAIN}`,
  audience: "https://mcp.example.com",
});

app.post("/mcp/tools/call", validateMCPToken, (req, res) => {
  const scopes = req.auth.payload.scope.split(" ");
  const required = scopeMap[toolName];

  if (!scopes.includes(required)) {
    return res.status(403).json({ error: "Insufficient scope" });
  }
  // Execute tool...
});
```

---

## The MCP Auth Flow (All 5 Together)

```
MCP Client                   MCP Server                    Auth0
    │                            │                            │
    │── GET /.well-known/prm ───▶│                            │
    │◀── PRM metadata ──────────│                            │
    │                            │                            │
    │── POST /oidc/register ────────────────────────────────▶│  (DCR)
    │◀── client_id, secret ──────────────────────────────────│
    │                            │                            │
    │── POST /oauth/token (resource=...) ──────────────────▶│  (Resource Indicator)
    │◀── access_token ───────────────────────────────────────│
    │                            │                            │
    │── POST /mcp/tools/call ───▶│                            │
    │   + Bearer token           │── Validate JWT ──────────▶│  (Token Validation)
    │                            │── Check scope              │
    │◀── Tool result ───────────│                            │
```

---

## Key Takeaway

> MCP gives AI agents a standard way to use tools. Auth for MCP gives those tools a standard way to verify who's using them and what they're allowed to do — through discovery, registration, scoping, and validation.
