# Lab 4: MCP Server with Auth for MCP

**Duration:** ~25 minutes

## Objectives

- Build an MCP server that exposes tools over the Model Context Protocol
- Register the MCP server as a protected Auth0 API
- Add OAuth 2.0 token validation to the MCP server
- Connect the AI agent to the MCP server with proper credentials
- Test the full chain: User → Agent → MCP Server → Tool

---

## Concept: Why MCP + Auth?

In the previous lab, tools ran inside the same Express process as the agent. In practice, tools often live on **separate servers** - your company's internal APIs, third-party services, or shared MCP servers.

**Auth for MCP** ensures that:
1. Only authorized agents can connect to the MCP server
2. Each tool call carries a valid token
3. The MCP server can verify which user the agent is acting for
4. Scopes are enforced per-tool

---

## Step 1: Register the MCP Server as an Auth0 API

1. In the [Auth0 Dashboard](https://manage.auth0.com), go to **Applications > APIs > Create API**
2. Configure:

| Setting | Value |
|---------|-------|
| Name | `DevCamp MCP Server` |
| Identifier | `https://devcamp-mcp-server` |
| Signing Algorithm | RS256 |

3. In the **Permissions** tab, add:

| Permission | Description |
|------------|-------------|
| `mcp:weather:read` | Read weather data |
| `mcp:calendar:read` | Read calendar events |
| `mcp:email:send` | Send emails |

4. In the **Machine to Machine Applications** tab, authorize your backend application and grant it all three scopes.

---

## Step 2: Update Environment Variables

Add the MCP server configuration to `.env`:

```
# Existing vars...
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=https://devcamp-ai-api
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://devcamp-ai-api

# New: MCP Server config
MCP_SERVER_PORT=3001
MCP_AUTH0_AUDIENCE=https://devcamp-mcp-server
AUTH0_CLIENT_ID_M2M=your-m2m-client-id
AUTH0_CLIENT_SECRET_M2M=your-m2m-client-secret
```

> **Where to get M2M credentials:** In Auth0 Dashboard → Applications → Create Application → Machine to Machine → Authorize it for the MCP Server API.

---

## Step 3: Build the MCP Server

Create `server/mcp/server.ts`:

```typescript
import express from "express";
import { auth } from "express-oauth2-jwt-bearer";

const app = express();
app.use(express.json());

// OAuth 2.0 token validation for MCP
const validateMCPToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.MCP_AUTH0_AUDIENCE,
});

// OAuth 2.0 metadata discovery endpoint
// This is how MCP clients discover how to authenticate
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  res.json({
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    authorization_endpoint: `https://${process.env.AUTH0_DOMAIN}/authorize`,
    token_endpoint: `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    jwks_uri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    scopes_supported: [
      "mcp:weather:read",
      "mcp:calendar:read",
      "mcp:email:send",
    ],
  });
});

// List available tools (MCP tools/list)
app.get("/mcp/tools", validateMCPToken, (req, res) => {
  res.json({
    tools: [
      {
        name: "get_weather",
        description: "Get current weather for a location",
        inputSchema: {
          type: "object",
          properties: {
            location: { type: "string", description: "City name" },
          },
          required: ["location"],
        },
        requiredScope: "mcp:weather:read",
      },
      {
        name: "get_calendar",
        description: "Get upcoming calendar events",
        inputSchema: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date (YYYY-MM-DD)" },
          },
        },
        requiredScope: "mcp:calendar:read",
      },
      {
        name: "send_email",
        description: "Send an email",
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
    ],
  });
});

// Execute a tool (MCP tools/call)
app.post("/mcp/tools/call", validateMCPToken, (req, res) => {
  const { name, arguments: args } = req.body;
  const tokenScopes = (req as any).auth?.payload?.scope?.split(" ") || [];

  // Get required scope for the tool
  const scopeMap: Record<string, string> = {
    get_weather: "mcp:weather:read",
    get_calendar: "mcp:calendar:read",
    send_email: "mcp:email:send",
  };

  const requiredScope = scopeMap[name];
  if (!requiredScope) {
    return res.status(404).json({ error: `Unknown tool: ${name}` });
  }

  // Check if the token has the required scope
  if (!tokenScopes.includes(requiredScope)) {
    return res.status(403).json({
      error: "Insufficient scope",
      required: requiredScope,
      provided: tokenScopes,
    });
  }

  // Execute the tool
  const result = executeToolLocally(name, args);
  res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
});

function executeToolLocally(name: string, args: any): any {
  switch (name) {
    case "get_weather":
      return {
        location: args.location,
        temperature: `${Math.floor(Math.random() * 30 + 5)}°C`,
        condition: ["Sunny", "Cloudy", "Rainy", "Partly Cloudy"][
          Math.floor(Math.random() * 4)
        ],
        humidity: `${Math.floor(Math.random() * 60 + 30)}%`,
      };

    case "get_calendar":
      return {
        events: [
          { time: "9:00 AM", title: "Team Standup" },
          { time: "11:00 AM", title: "Design Review" },
          { time: "2:00 PM", title: "Sprint Planning" },
          { time: "4:30 PM", title: "1:1 with Manager" },
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

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function startMCPServer() {
  const port = parseInt(process.env.MCP_SERVER_PORT || "3001");
  app.listen(port, () => {
    console.log(`MCP Server running on http://localhost:${port}`);
    console.log(`OAuth metadata: http://localhost:${port}/.well-known/oauth-authorization-server`);
  });
}

export default app;
```

---

## Step 4: Create the MCP Client in the Agent

Create `server/mcp/client.ts` - this is how the agent talks to the MCP server:

```typescript
interface MCPClientConfig {
  serverUrl: string;
  auth0Domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export class MCPClient {
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  // Get an access token for the MCP server using client credentials
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

  // List available tools from the MCP server
  async listTools(): Promise<any[]> {
    const token = await this.getToken();
    const response = await fetch(`${this.config.serverUrl}/mcp/tools`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`MCP listTools failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tools;
  }

  // Call a tool on the MCP server
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const token = await this.getToken();
    const response = await fetch(`${this.config.serverUrl}/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, arguments: args }),
    });

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
}

// Create the MCP client instance
export function createMCPClient(): MCPClient {
  return new MCPClient({
    serverUrl: `http://localhost:${process.env.MCP_SERVER_PORT || 3001}`,
    auth0Domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CLIENT_ID_M2M!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET_M2M!,
    audience: process.env.MCP_AUTH0_AUDIENCE!,
  });
}
```

---

## Step 5: Update the Tool Executor to Use MCP

Update `server/tools/registry.ts` to route tool execution through the MCP client:

```typescript
import { createMCPClient } from "../mcp/client";

const mcpClient = createMCPClient();

export async function executeTool(
  toolName: string,
  parameters: Record<string, any>
): Promise<any> {
  console.log(`Executing tool via MCP: ${toolName}`, parameters);

  try {
    const result = await mcpClient.callTool(toolName, parameters);
    console.log(`MCP tool result:`, result);
    return result;
  } catch (error: any) {
    console.error(`MCP tool execution failed: ${error.message}`);
    throw error;
  }
}
```

---

## Step 6: Start the MCP Server

Update `server/index.ts` to also start the MCP server:

```typescript
import { startMCPServer } from "./mcp/server";

// At the bottom of the file, after the Express app starts:
startMCPServer();
```

Or update `package.json` to run both servers:

```json
{
  "scripts": {
    "dev": "concurrently \"tsx watch server/index.ts\" \"tsx watch server/mcp/server-standalone.ts\" \"vite\"",
    "dev:api": "tsx watch server/index.ts",
    "dev:mcp": "tsx watch server/mcp/server-standalone.ts",
    "dev:client": "vite"
  }
}
```

---

## Step 7: Test the MCP Integration

### Test 1: MCP Discovery
Open a terminal and test the OAuth metadata endpoint:

```bash
curl http://localhost:3001/.well-known/oauth-authorization-server | jq .
```

You should see the Auth0 OAuth metadata.

### Test 2: Unauthenticated MCP Access

```bash
curl http://localhost:3001/mcp/tools
```

Should return `401 Unauthorized`.

### Test 3: Full Flow Through the Chat
1. Log in to the chat app
2. Send: "What's the weather in Paris?"
3. The agent should:
   - Detect the weather intent
   - Check authorization (auto-approved for weather)
   - Call the MCP server with a valid token
   - Return the weather data

4. Send: "Send an email to my boss"
5. The agent should:
   - Detect the email intent
   - Check authorization (consent required)
   - Show the approval dialog
   - After approval, call the MCP server
   - Return the confirmation

### Test 4: Check the Logs
Look at your server logs to see the full chain:

```
[Express API] Authenticated request from user: auth0|abc123
[Express API] Tool authorization check: send_email → requires consent
[Express API] User auth0|abc123 approved tool: send_email
[Express API] Executing tool via MCP: send_email
[MCP Server]  Token validated. Scopes: mcp:email:send
[MCP Server]  Tool executed: send_email → success
```

---

## Understanding the Full Auth Chain

```
┌─────────┐   Auth0    ┌──────────┐  JWT      ┌──────────┐  M2M Token  ┌──────────┐
│  User   │──Login────▶│ Frontend │──Bearer──▶│  Agent   │──Bearer───▶│   MCP    │
│ (Human) │            │ (React)  │  Token    │ (Express)│  Token     │  Server  │
└─────────┘            └──────────┘           └──────────┘            └──────────┘
                            │                      │                       │
                       Auth0 SPA SDK          JWT Validation          JWT Validation
                       + Universal Login      + Agent Auth            + Scope Check
                                              + Token Exchange
```

**Layer 1 - User Auth:** Human logs in via Auth0 → gets access token
**Layer 2 - API Protection:** Frontend sends token to Express → JWT validated
**Layer 3 - Agent Auth:** Agent checks if it can use the tool → may request consent
**Layer 4 - MCP Auth:** Agent gets M2M token → MCP server validates + checks scopes

---

## Checkpoint

At this point you have:
- [x] MCP server running with OAuth 2.0 protection
- [x] MCP server registered as Auth0 API
- [x] Agent authenticates to MCP server via client credentials
- [x] Tools served over MCP with per-tool scope enforcement
- [x] Full auth chain from user to agent to MCP tool

---

**Next: [Lab 5 - End-to-End Test](./05-mcp-tools.md)**
