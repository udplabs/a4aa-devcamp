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
Auth0 Dashboard > APIs > Create API
  - Identifier: "https://mcp.example.com"
  - Permissions: mcp:weather:read, mcp:calendar:read, mcp:email:send
```

Each tool has a required scope. Applications are authorized with specific scopes.

---

### 2. Protected Resource Metadata (RFC 9728)

The MCP server advertises its auth requirements:

```
GET /.well-known/oauth-protected-resource

{
  "resource": "https://mcp.example.com",
  "authorization_servers": ["https://your-tenant.auth0.com"],
  "scopes_supported": ["mcp:weather:read", "mcp:calendar:read", "mcp:email:send"],
  "bearer_methods_supported": ["header"],
  "client_registration_types_supported": ["metadata"]
}
```

MCP clients read this metadata **before authenticating** -- they know exactly what they need.

---

### 3. Client ID Metadata (CIMD)

MCP clients are pre-configured in the Auth0 Dashboard with metadata that describes their identity and capabilities:

```
Auth0 Dashboard > Applications > Create Application
  - Name: "My MCP Agent"
  - Type: Machine to Machine
  - Authorized APIs: mcp.example.com
  - Scopes: mcp:weather:read, mcp:calendar:read

→ client_id + client_secret (pre-configured, admin-controlled)
```

Unlike Dynamic Client Registration (DCR), clients don't self-register at runtime. An administrator pre-approves each client, controlling exactly which tools it can access.

---

### 4. On-Behalf-Of Token Exchange

When the agent needs to call an MCP tool, it exchanges the user's access token for one scoped to the MCP server:

```
POST /oauth/token
{
  "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
  "subject_token": "<user's access token>",
  "subject_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "audience": "https://mcp.example.com",
  "client_id": "...",
  "client_secret": "..."
}
```

The resulting token carries the **user's identity** (`sub` claim) and targets the MCP server's audience. The MCP server knows both *who* is making the request and *what* they're allowed to do.

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
    │◀── PRM metadata ──────────│  (includes CIMD support)   │
    │                            │                            │
    │   (client_id is pre-configured via CIMD -- no runtime   │
    │    registration needed)                                  │
    │                            │                            │
    │── POST /oauth/token ──────────────────────────────────▶│  (Token Exchange)
    │   grant_type=token-exchange                             │
    │   subject_token=<user token>                            │
    │   audience=https://mcp.example.com                      │
    │◀── access_token (user identity + MCP audience) ────────│
    │                            │                            │
    │── POST /mcp/tools/call ───▶│                            │
    │   + Bearer token           │── Validate JWT ──────────▶│  (Token Validation)
    │                            │── Check scope + user       │
    │◀── Tool result ───────────│                            │
```

---

## Key Takeaway

> MCP gives AI agents a standard way to use tools. Auth for MCP gives those tools a standard way to verify who's using them and what they're allowed to do -- through discovery, client identity, token exchange, and validation. User context flows end-to-end, so MCP servers always know both the client and the user behind every request.
