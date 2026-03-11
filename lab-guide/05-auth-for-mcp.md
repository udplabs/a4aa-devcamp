# Lab 5: Auth for MCP

A single multi-part lab covering all five MCP authentication capabilities.

## Objectives

- Register the MCP server as a protected Auth0 API with per-tool scopes
- Implement Protected Resource Metadata (RFC 9728) discovery
- Implement Dynamic Client Registration for MCP clients
- Use Resource Indicators (RFC 8707) to scope tokens to a specific MCP server
- Add OAuth 2.0 token validation to the MCP server

---

## Premise

The AI agent's tools run on a separate MCP server. This lab secures the MCP server end-to-end, covering the five key capabilities that make up Auth for MCP.

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

### Step A.2: Create an M2M Application

1. Go to **Applications > Applications > Create Application**
2. Choose **Machine to Machine** and name it `DevCamp MCP Client`
3. Authorize it for the `DevCamp MCP Server` API
4. Grant it all four scopes

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
  "bearer_methods_supported": ["header"]
}
```

---

## Part C: Dynamic Client Registration

**What:** MCP clients register themselves with Auth0 dynamically instead of being pre-configured.

### Step C.1: Create the DCR Logic

Create `server/mcp/dcr.ts`:

```typescript
/**
 * Dynamic Client Registration (DCR)
 *
 * In production, the MCP client would POST to Auth0's /oidc/register endpoint.
 * For this lab, we simulate the DCR flow.
 */

interface DCRRequest {
  client_name: string;
  grant_types: string[];
  token_endpoint_auth_method: string;
  redirect_uris?: string[];
}

interface DCRResponse {
  client_id: string;
  client_secret: string;
  client_name: string;
  grant_types: string[];
  token_endpoint_auth_method: string;
  registration_client_uri: string;
}

// Simulated registered clients
const registeredClients = new Map<string, DCRResponse>();

/**
 * Register a new client dynamically.
 *
 * In production: POST https://{domain}/oidc/register
 */
export async function registerClient(
  auth0Domain: string,
  request: DCRRequest
): Promise<DCRResponse> {
  // In production, this would be:
  // const response = await fetch(`https://${auth0Domain}/oidc/register`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(request),
  // });

  // Simulated response
  const clientId = `dcr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const clientSecret = `secret_${Math.random().toString(36).substring(2, 16)}`;

  const registration: DCRResponse = {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: request.client_name,
    grant_types: request.grant_types,
    token_endpoint_auth_method: request.token_endpoint_auth_method,
    registration_client_uri: `https://${auth0Domain}/oidc/register/${clientId}`,
  };

  registeredClients.set(clientId, registration);

  console.log(`[DCR] Client registered: ${request.client_name} (${clientId})`);

  return registration;
}

/**
 * Look up a dynamically registered client.
 */
export function getRegisteredClient(clientId: string): DCRResponse | undefined {
  return registeredClients.get(clientId);
}
```

### Step C.2: Update the MCP Client to Use DCR

In `server/mcp/client.ts`, add DCR discovery before token acquisition:

```typescript
import { registerClient } from "./dcr";

// In the MCPClient class, add a method:
async discoverAndRegister(): Promise<void> {
  // Step 1: Discover the protected resource metadata
  const prmResponse = await fetch(
    `${this.config.serverUrl}/.well-known/oauth-protected-resource`
  );
  const prm = await prmResponse.json();

  console.log(`[MCP Client] Discovered resource: ${prm.resource}`);
  console.log(`[MCP Client] Auth server: ${prm.authorization_servers[0]}`);
  console.log(`[MCP Client] Scopes: ${prm.scopes_supported.join(", ")}`);

  // Step 2: Dynamically register with the authorization server
  const registration = await registerClient(this.config.auth0Domain, {
    client_name: "DevCamp MCP Agent",
    grant_types: ["client_credentials"],
    token_endpoint_auth_method: "client_secret_post",
  });

  console.log(`[MCP Client] Dynamically registered as: ${registration.client_id}`);

  // Store the credentials for future token requests
  this.config.clientId = registration.client_id;
  this.config.clientSecret = registration.client_secret;
}
```

---

## Part D: Token Scoping via Resource Indicators (RFC 8707)

**What:** When requesting tokens, specify which MCP server the token is for using the `resource` parameter.

### Step D.1: Update Token Requests

In `server/mcp/client.ts`, update the `getToken()` method to include the resource indicator:

```typescript
private async getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const response = await fetch(
    `https://${this.config.auth0Domain}/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        audience: this.config.audience,
        // RFC 8707: Resource Indicator — scopes the token to this specific MCP server
        resource: this.config.audience,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get MCP token: ${response.statusText}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}
```

### Step D.2: Validate the Audience on the MCP Server

In `server/mcp/server.ts`, the `express-oauth2-jwt-bearer` middleware already validates the `aud` claim. Verify it's configured:

```typescript
const validateMCPToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.MCP_AUTH0_AUDIENCE, // Token must be scoped to THIS resource
});
```

This ensures tokens issued for a different MCP server are rejected.

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
    registration_endpoint: `https://${process.env.AUTH0_DOMAIN}/oidc/register`,
    scopes_supported: [
      "mcp:weather:read",
      "mcp:calendar:read",
      "mcp:email:send",
      "mcp:documents:read",
    ],
  });
});

// List available tools (MCP tools/list) — protected
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

// Execute a tool (MCP tools/call) — protected + scope enforcement
app.post("/mcp/tools/call", validateMCPToken, (req, res) => {
  const { name, arguments: args } = req.body;
  const tokenScopes = (req as any).auth?.payload?.scope?.split(" ") || [];

  console.log(`[MCP Server] Tool call: ${name}, scopes: ${tokenScopes}`);

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
    console.log(`[MCP Server] DENIED — Required: ${requiredScope}, have: ${tokenScopes}`);
    return res.status(403).json({
      error: "Insufficient scope",
      required: requiredScope,
      provided: tokenScopes,
    });
  }

  const result = executeToolLocally(name, args);
  console.log(`[MCP Server] Tool ${name} executed successfully`);
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

## Step E.2: Test All Five Capabilities

### Test 1: Protected Resource Metadata (Part B)

```bash
curl http://localhost:3001/.well-known/oauth-protected-resource | jq .
```

### Test 2: OAuth Metadata (Part A)

```bash
curl http://localhost:3001/.well-known/oauth-authorization-server | jq .
```

### Test 3: Unauthenticated Tool List (Token Validation — Part E)

```bash
curl http://localhost:3001/mcp/tools
```

Expected: `401 Unauthorized`

### Test 4: Unauthenticated Tool Call (Token Validation — Part E)

```bash
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"send_email","arguments":{"to":"victim@example.com","subject":"spam","body":"hacked"}}'
```

Expected: `401 Unauthorized`

### Test 5: Full Flow via Chat

1. Log in and send: **"What's the weather in Paris?"**
2. The agent should call the MCP server with a valid token
3. Check server logs to see the token validation chain

---

## Checkpoint

At this point you have:
- [x] **Part A:** MCP server registered as Auth0 API with per-tool scopes
- [x] **Part B:** Protected Resource Metadata endpoint (RFC 9728)
- [x] **Part C:** Dynamic Client Registration logic
- [x] **Part D:** Resource indicators in token requests (RFC 8707)
- [x] **Part E:** OAuth 2.0 token validation on every MCP tool call

---

**Next: [Lab 6 — End-to-End Test](./06-end-to-end.md)**
