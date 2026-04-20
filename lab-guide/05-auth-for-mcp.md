# Lab 5: Auth for MCP

A single multi-part lab covering MCP authentication capabilities.

## Objectives

- Register the MCP server as a protected Auth0 API with per-tool scopes
- Implement Protected Resource Metadata (RFC 9728) discovery
- Configure Client ID Metadata (CIMD) for MCP client identification
- Implement on-behalf-of token exchange to scope tokens to a specific MCP server
- Add OAuth 2.0 token validation to the MCP server

---

## Premise

The AI agent's tools run on a separate MCP server. This lab secures the MCP server end-to-end, covering the key capabilities that make up Auth for MCP.

---

## Part A: API Registration for Tools

**What:** Register the MCP server as a protected Auth0 API with per-tool scopes.

### Step A.1: Create the Auth0 API

1. In the Auth0 Dashboard, go to **Applications > APIs > Create API**
2. Configure:

| Setting | Value |
|---------|-------|
| Name | `DevCamp MCP Server` |
| Identifier | `https://devcamp-mcp-server` |
| Signing Algorithm | RS256 |

3. In the **Permissions** tab, add tool-level scopes:

| Permission | Description |
|------------|-------------|
| `mcp:weather:read` | Read weather data |
| `mcp:calendar:read` | Read calendar events |
| `mcp:email:send` | Send emails |
| `mcp:documents:read` | Read documents |

### Step A.2: Create a Confidential Application

This application represents the MCP client (the agent backend). It will be used for on-behalf-of token exchange -- exchanging the user's access token for one scoped to the MCP server.

1. Go to **Applications > Applications > Create Application**
2. Choose **Machine to Machine** and name it `DevCamp MCP Client`
3. Authorize it for the `DevCamp MCP Server` API
4. Grant it all four scopes
5. Note the **Client ID** and **Client Secret** -- these authenticate the token exchange request

### Step A.3: Update Environment Variables

Add to `.env`:

```
# MCP Server (Lab 5)
MCP_SERVER_PORT=3001
MCP_AUTH0_AUDIENCE=https://devcamp-mcp-server
AUTH0_CLIENT_ID_M2M=your-m2m-client-id
AUTH0_CLIENT_SECRET_M2M=your-m2m-client-secret
```

---

## Part B: Protected Resource Metadata (RFC 9728)

**What:** The MCP server advertises its auth requirements so clients can discover how to authenticate before making any tool calls.

### Step B.1: Create the Metadata Handler

Create `server/mcp/metadata.ts`:

```typescript
import { Request, Response } from "express";

/**
 * Protected Resource Metadata (RFC 9728)
 *
 * This endpoint lets MCP clients discover:
 * - Which authorization server to use
 * - What scopes are available
 * - How to present bearer tokens
 * - That client registration uses CIMD (metadata-based)
 */
export function protectedResourceMetadata(req: Request, res: Response) {
  const authDomain = process.env.AUTH0_DOMAIN;

  res.json({
    resource: process.env.MCP_AUTH0_AUDIENCE,
    authorization_servers: [
      `https://${authDomain}`
    ],
    scopes_supported: [
      "mcp:weather:read",
      "mcp:calendar:read",
      "mcp:email:send",
      "mcp:documents:read",
    ],
    bearer_methods_supported: ["header"],
    client_registration_types_supported: ["metadata"],
    resource_documentation: "https://devcamp.example.com/mcp-api-docs",
  });
}
```

### Step B.2: Mount the Endpoint

In `server/mcp/server.ts`, add:

```typescript
import { protectedResourceMetadata } from "./metadata";

// RFC 9728: Protected Resource Metadata
app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
```

### Step B.3: Test the Endpoint

```bash
curl http://localhost:3001/.well-known/oauth-protected-resource | jq .
```

Expected response:

```json
{
  "resource": "https://devcamp-mcp-server",
  "authorization_servers": ["https://your-tenant.us.auth0.com"],
  "scopes_supported": ["mcp:weather:read", "mcp:calendar:read", "mcp:email:send", "mcp:documents:read"],
  "bearer_methods_supported": ["header"],
  "client_registration_types_supported": ["metadata"]
}
```

Note the `client_registration_types_supported: ["metadata"]` field -- this tells MCP clients that this server uses Client ID Metadata (CIMD) for client identification, not Dynamic Client Registration (DCR).

---

## Part C: Client ID Metadata (CIMD)

**What:** MCP clients are pre-configured in the Auth0 Dashboard with metadata that describes who they are and what they're allowed to do. Unlike Dynamic Client Registration (DCR) where clients register themselves at runtime, CIMD associates metadata directly with a pre-existing client ID.

### Why CIMD instead of DCR?

| | DCR | CIMD |
|---|---|---|
| **Registration** | Clients self-register at runtime via `/oidc/register` | Clients are pre-configured in Auth0 Dashboard |
| **Control** | Any client can register (open endpoint) | Only admin-approved clients exist |
| **Metadata** | Client provides its own metadata | Admin defines and controls metadata |
| **Security** | Requires protecting the registration endpoint | No registration endpoint to protect |
| **Setup** | Runtime complexity | One-time dashboard configuration |

CIMD is the recommended approach for production MCP deployments. The client's identity and capabilities are established upfront by an administrator, not self-declared at runtime.

### Step C.1: Configure Client Metadata in Auth0

The application you created in Step A.2 already has a client_id. Now associate metadata with it:

1. In the Auth0 Dashboard, go to **Applications > Applications > DevCamp MCP Client**
2. In the **Settings** tab, verify these fields:
   - **Name:** `DevCamp MCP Client`
   - **Description:** `Voyager travel concierge MCP agent`
   - **Application Type:** Machine to Machine
3. In the **APIs** tab, confirm it's authorized for `DevCamp MCP Server` with the required scopes

The client_id, name, description, and authorized scopes together form the client's metadata profile. Auth0 uses this metadata to enforce which tools the client can access.

### Step C.2: Create the CIMD Module

Create `server/mcp/cimd.ts`:

```typescript
/**
 * Client ID Metadata (CIMD)
 *
 * Instead of Dynamic Client Registration (DCR) where clients
 * register at runtime, CIMD uses pre-configured client metadata
 * from the Auth0 Dashboard.
 *
 * The client_id is known ahead of time and its metadata
 * (name, description, allowed scopes) is managed by an admin.
 */

export interface ClientMetadata {
  client_id: string;
  client_name: string;
  description: string;
  allowed_scopes: string[];
}

/**
 * Retrieve metadata for a pre-configured MCP client.
 *
 * In production, this could call the Auth0 Management API
 * to fetch the application's metadata dynamically.
 * For this lab, we return the known configuration.
 */
export function getClientMetadata(clientId: string): ClientMetadata {
  return {
    client_id: clientId,
    client_name: "DevCamp MCP Agent",
    description: "Voyager travel concierge MCP client",
    allowed_scopes: [
      "mcp:weather:read",
      "mcp:calendar:read",
      "mcp:email:send",
      "mcp:documents:read",
    ],
  };
}
```

### Step C.3: Verify Client Configuration

The MCP client no longer needs a `discoverAndRegister()` method. It already knows its client_id (from environment variables) and the metadata is managed in Auth0. The client simply uses its credentials for the token exchange in Part D.

---

## Part D: On-Behalf-Of Token Exchange

**What:** The agent exchanges the user's access token for a new token scoped to the MCP server. This replaces the client_credentials flow -- user identity propagates all the way to the MCP server.

### Why token exchange instead of client_credentials?

With client_credentials, the MCP server only knows that a trusted M2M client is calling -- it has no visibility into which user initiated the request. With on-behalf-of token exchange:

- The user's identity (`sub` claim) flows through to the MCP server
- The MCP server can make per-user authorization decisions
- Audit logs show exactly which user triggered each tool call
- No separate M2M token grants are needed -- the user's session drives access

### Step D.1: Update the MCP Client Token Method

In `server/mcp/client.ts`, update the `getToken()` method to perform a token exchange:

```typescript
private async getToken(userAccessToken: string): Promise<string> {
  // Check cache (keyed by user token to support multiple users)
  const cacheKey = userAccessToken.slice(-16);
  if (cachedTokens.has(cacheKey)) {
    const cached = cachedTokens.get(cacheKey)!;
    if (Date.now() < cached.expiresAt) {
      return cached.token;
    }
    cachedTokens.delete(cacheKey);
  }

  console.log("[MCP Client] Exchanging user token for MCP-scoped token...");

  const response = await fetch(
    `https://${this.config.auth0Domain}/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: userAccessToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
        audience: this.config.audience,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.statusText} - ${error}`);
  }

  const data = await response.json();
  cachedTokens.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });

  console.log("[MCP Client] Token exchange successful — MCP token acquired");
  return data.access_token;
}
```

Key differences from the old client_credentials flow:

| | Client Credentials | Token Exchange |
|---|---|---|
| `grant_type` | `client_credentials` | `urn:ietf:params:oauth:grant-type:token-exchange` |
| User context | None -- M2M only | User's `sub` claim propagates |
| Input | Just client_id + secret | User's access token + client credentials |
| `audience` | MCP server identifier | MCP server identifier (same) |
| `subject_token` | N/A | User's current access token |

### Step D.2: Update Tool Methods to Accept User Token

Update `listTools()` and `callTool()` to pass the user's access token:

```typescript
async listTools(userAccessToken: string): Promise<any[]> {
  const token = await this.getToken(userAccessToken);
  const response = await fetch(`${this.config.serverUrl}/mcp/tools`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`MCP listTools failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.tools;
}

async callTool(name: string, args: Record<string, any>, userAccessToken: string): Promise<any> {
  const token = await this.getToken(userAccessToken);

  console.log(`[MCP Client] Calling tool: ${name}`);

  const response = await fetch(
    `${this.config.serverUrl}/mcp/tools/call`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, arguments: args }),
    }
  );

  if (response.status === 403) {
    const error = await response.json();
    throw new Error(
      `MCP authorization failed: insufficient scope. Required: ${error.required}`
    );
  }

  if (!response.ok) {
    throw new Error(`MCP callTool failed: ${response.statusText}`);
  }

  const data = await response.json();
  return JSON.parse(data.content[0].text);
}
```

### Step D.3: Validate the Audience on the MCP Server

In `server/mcp/server.ts`, the `express-oauth2-jwt-bearer` middleware validates the `aud` claim. The exchanged token's audience is `https://devcamp-mcp-server`, so the existing validation still works:

```typescript
const validateMCPToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.MCP_AUTH0_AUDIENCE, // Token must target THIS MCP server
});
```

The difference from before: the validated token now also contains the user's `sub` claim, so the MCP server knows who initiated the request.

---

## Part E: OAuth 2.0 Token Validation on MCP Server

**What:** The MCP server validates every incoming bearer token.

### Step E.1: Implement the Full MCP Server

Open `server/mcp/server.ts` and implement the complete server:

```typescript
import express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import { protectedResourceMetadata } from "./metadata";

const app = express();
app.use(express.json());

// OAuth 2.0 token validation
const validateMCPToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.MCP_AUTH0_AUDIENCE,
});

// RFC 9728: Protected Resource Metadata
app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);

// OAuth 2.0 Authorization Server Metadata (for MCP client discovery)
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    authorization_endpoint: `https://${process.env.AUTH0_DOMAIN}/authorize`,
    token_endpoint: `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    jwks_uri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    scopes_supported: [
      "mcp:weather:read",
      "mcp:calendar:read",
      "mcp:email:send",
      "mcp:documents:read",
    ],
    grant_types_supported: [
      "urn:ietf:params:oauth:grant-type:token-exchange",
    ],
    client_registration_types_supported: ["metadata"],
  });
});

// List available tools (MCP tools/list) -- protected
app.get("/mcp/tools", validateMCPToken, (_req, res) => {
  console.log("[MCP Server] Tools list requested");
  res.json({
    tools: [
      {
        name: "get_weather",
        description: "Check destination weather and travel conditions",
        inputSchema: {
          type: "object",
          properties: { location: { type: "string", description: "Destination city" } },
          required: ["location"],
        },
        requiredScope: "mcp:weather:read",
      },
      {
        name: "get_calendar",
        description: "View your trip itinerary and scheduled activities",
        inputSchema: {
          type: "object",
          properties: { date: { type: "string", description: "Date (YYYY-MM-DD)" } },
        },
        requiredScope: "mcp:calendar:read",
      },
      {
        name: "send_email",
        description: "Send a booking confirmation or travel update email",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["to", "subject", "body"],
        },
        requiredScope: "mcp:email:send",
      },
      {
        name: "get_document",
        description: "Retrieve a document by ID",
        inputSchema: {
          type: "object",
          properties: { documentId: { type: "string" } },
          required: ["documentId"],
        },
        requiredScope: "mcp:documents:read",
      },
    ],
  });
});

// Execute a tool (MCP tools/call) -- protected + scope enforcement
app.post("/mcp/tools/call", validateMCPToken, (req, res) => {
  const { name, arguments: args } = req.body;
  const tokenScopes = (req as any).auth?.payload?.scope?.split(" ") || [];
  const userSub = (req as any).auth?.payload?.sub || "unknown";

  console.log(`[MCP Server] Tool call: ${name}, user: ${userSub}, scopes: ${tokenScopes}`);

  const scopeMap: Record<string, string> = {
    get_weather: "mcp:weather:read",
    get_calendar: "mcp:calendar:read",
    send_email: "mcp:email:send",
    get_document: "mcp:documents:read",
  };

  const requiredScope = scopeMap[name];
  if (!requiredScope) {
    return res.status(404).json({ error: `Unknown tool: ${name}` });
  }

  // Enforce per-tool scopes
  if (!tokenScopes.includes(requiredScope)) {
    console.log(`[MCP Server] DENIED -- Required: ${requiredScope}, have: ${tokenScopes}`);
    return res.status(403).json({
      error: "Insufficient scope",
      required: requiredScope,
      provided: tokenScopes,
    });
  }

  const result = executeToolLocally(name, args);
  console.log(`[MCP Server] Tool ${name} executed successfully for user ${userSub}`);
  res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
});

function executeToolLocally(name: string, args: any): any {
  switch (name) {
    case "get_weather":
      return {
        location: args.location,
        temperature: `${Math.floor(Math.random() * 30 + 5)}°C`,
        condition: ["Sunny", "Cloudy", "Rainy", "Partly Cloudy"][Math.floor(Math.random() * 4)],
        humidity: `${Math.floor(Math.random() * 60 + 30)}%`,
      };
    case "get_calendar":
      return {
        events: [
          { time: "9:00 AM", title: "Airport Check-in (Terminal 2)" },
          { time: "11:30 AM", title: "Flight to Bali (GA-412)" },
          { time: "3:00 PM", title: "Hotel Check-in (The Mulia Resort)" },
          { time: "7:00 PM", title: "Dinner Reservation (La Lucciola)" },
        ],
      };
    case "send_email":
      return {
        success: true,
        to: args.to,
        subject: args.subject,
        messageId: `msg-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
    case "get_document":
      return {
        documentId: args.documentId,
        title: `Document: ${args.documentId}`,
        content: "Document content retrieved via MCP.",
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function startMCPServer() {
  const port = parseInt(process.env.MCP_SERVER_PORT || "3001");
  app.listen(port, () => {
    console.log(`[MCP Server] Running on http://localhost:${port}`);
    console.log(`[MCP Server] PRM: http://localhost:${port}/.well-known/oauth-protected-resource`);
    console.log(`[MCP Server] OAuth: http://localhost:${port}/.well-known/oauth-authorization-server`);
  });
}

export default app;
```

---

## Step E.2: Test All Capabilities

### Test 1: Protected Resource Metadata (Part B)

```bash
curl http://localhost:3001/.well-known/oauth-protected-resource | jq .
```

### Test 2: OAuth Metadata (Part A)

```bash
curl http://localhost:3001/.well-known/oauth-authorization-server | jq .
```

### Test 3: Unauthenticated Tool List (Token Validation -- Part E)

```bash
curl http://localhost:3001/mcp/tools
```

Expected: `401 Unauthorized`

### Test 4: Unauthenticated Tool Call (Token Validation -- Part E)

```bash
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"send_email","arguments":{"to":"victim@example.com","subject":"spam","body":"hacked"}}'
```

Expected: `401 Unauthorized`

### Test 5: Full Flow via Chat

1. Log in and send: **"What's the weather in Paris?"**
2. The agent should exchange your user token for an MCP-scoped token
3. Check server logs to see the token validation chain and the user identity flowing through

---

## Checkpoint

At this point you have:
- [x] **Part A:** MCP server registered as Auth0 API with per-tool scopes
- [x] **Part B:** Protected Resource Metadata endpoint (RFC 9728) with CIMD support
- [x] **Part C:** Client ID Metadata -- pre-configured client identity
- [x] **Part D:** On-behalf-of token exchange for user-scoped MCP access
- [x] **Part E:** OAuth 2.0 token validation on every MCP tool call

---

**Next: [Lab 6 -- End-to-End Test](./06-end-to-end.md)**
