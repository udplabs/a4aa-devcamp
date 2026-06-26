# Module 01: Auth for MCP (the keystone module)

## Objective *(~25 min)*

This module wires the mechanism that makes everything downstream possible: registering Nexus's MCP server as an Auth0 resource and giving the first-party Nexus agent two things it needs to call tools on behalf of users. The first is a stable published identity via CIMD (Client ID Metadata Documents). The second is a confidential M2M client that performs the OBO token exchange. Once both are in place, every tool call carries the employee's `sub` all the way to tool execution, and Token Vault, CIBA, and FGA all have the identity they need to enforce policy.

By the end you will understand:

- How the MCP server is set up behind JWT validation on port 3001.
- How `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414) enable zero-config client discovery.
- What CIMD is and why a URL-based agent identity is better than an ephemeral UUID from Dynamic Client Registration.
- How the M2M confidential client performs OBO token exchange, preserving the user's `sub` through the agent boundary.
- How a distinct scope per tool enforces least-privilege and enables `WWW-Authenticate` step-up hints for clients.

### Why we're building this

Without a defined trust boundary, every agent runtime connecting to your MCP server becomes an implicit authorization decision made by whoever wrote the agent, not by the platform. A new agent framework means a new security review, a compromised client has no scope boundary, and an audit log entry that says "agent called tool" tells you nothing about which employee was responsible.

The commercial consequence is direct: enterprise procurement teams require stable client identity and token-scoped tool access in the security questionnaire. CIMD-based agent identity and on-behalf-of token exchange mean partners and new agent runtimes integrate without custom onboarding work on either side, and every tool call is auditable to a specific employee and resource.

## Prerequisites

- No prior modules required. This module establishes the foundation everything else builds on.

## Premise

Your MCP server is a platform for agent clients of two kinds. The first-party Nexus agent connects with a stable published identity via CIMD, and uses a confidential M2M client to exchange user tokens for MCP-scoped tokens. Third-party integrations discover the server through PRM and AS metadata and connect without any configuration on their side. All of them must present a valid token, and when they do, OBO token exchange carries the employee's identity through the agent boundary to every tool call downstream.

**MCP (Model Context Protocol)** is a standard surface for advertising tools. With Auth0 in front of it, every tool call is bearer-token-authenticated against a resource server that enforces FGA, Token Vault, and scope checks. The agent is simply a client. You can swap it, add a second one, or run Claude Agent SDK alongside a custom loop, while the guardrails live permanently on the MCP server regardless of which agent you connect.

> [!NOTE]
> Auth0's **Auth for MCP** went GA on April 29, 2026 as part of the Auth for AI Agents (A4AA) product line. It follows the MCP authorization spec (revision 2025-11-25) and layers it on top of OAuth 2.1 so any conformant MCP client can discover and call your tools with the user's actual identity. Product overview: [auth0.com/ai](https://auth0.com/ai).

This module wires six Auth for MCP features in one flow:

| Part | Feature | RFC / Spec |
|---|---|---|
| A | Register MCP server as Auth0 API with per-tool scopes | OAuth 2.1 |
| B | CIMD: publish the agent's identity as a metadata document URL | Client ID Metadata Documents (draft) |
| C | Protected Resource Metadata (PRM) | RFC 9728 |
| D | Authorization Server Metadata | RFC 8414 |
| E | On-Behalf-Of token exchange with RFC 8707 resource indicator | RFC 8693 + RFC 8707 |
| F | Per-tool scope enforcement with `WWW-Authenticate` step-up hints | OAuth 2.1 + MCP 2025-11-25 |

## What's provisioned for you

Part A (registering the MCP API resource server with its four per-tool scopes) was handled automatically by Provision Resources. Your tenant already has:

- **The MCP API (resource server)**: `https://devcamp-mcp-server` (RS256), with the four per-tool scopes:
  - `mcp:docs:search`: search the document knowledge base
  - `mcp:docs:read`: retrieve a specific document
  - `mcp:crm:log`: log activity to the CRM via Token Vault
  - `mcp:docs:share`: share a document externally (CIBA-gated)

- **The Nexus SPA application**: your browser app for user login, already configured for your Codespace URL.

**Two clients are NOT provisioned for you.** You create both manually in this module. Your only manual Dashboard steps are Parts B and C below.

> [!NOTE]
> **Two clients, two purposes:**
> - **CIMD native app** (public, `is_first_party: false`): the agent's published identity document. Anyone can fetch the URL to learn what the agent is and what scopes it needs. This is what CIMD is — a stable, self-hosted identity that shows up in audit logs.
> - **M2M confidential app** (has a client_secret): performs the actual OBO token exchange server-side. Authorized directly against the MCP API resource server.

## Dashboard Steps

### Part B: Register the agent's CIMD identity

The Nexus MCP server publishes a metadata document at `/.well-known/client-metadata` on port 3001. Auth0 can fetch this URL and register the agent from it — the URL itself becomes the `client_id`.

**Step 1: Open the metadata document in your browser**

```
https://<your-codespace>-3001.app.github.dev/.well-known/client-metadata
```

You will see:

```json
{
  "client_id": "https://<your-codespace>-3001.app.github.dev/.well-known/client-metadata",
  "client_name": "Nexus Agent (DevCamp)",
  "allowed_scopes": ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"]
}
```

> [!IMPORTANT]
> The `client_id` field is the URL of this document. That is the point of CIMD: the agent's identity is self-described and self-hosted. Compare this to Dynamic Client Registration (DCR, RFC 7591), where a new opaque UUID is minted on every install and audit logs become meaningless across deploys.

**Step 2: Make port 3001 public in your Codespace**

Auth0 needs to fetch the metadata document to register the agent. Port 3001 is private by default — Auth0 will receive a 302 redirect to GitHub's login page instead of the JSON.

1. In the Codespace VS Code editor, open the **PORTS** tab (bottom panel)
2. Find port **3001**
3. Right-click → **Port Visibility → Public**

*You should see: the visibility icon on port 3001 changes to show it is publicly accessible.*

**Step 3: Register in Auth0 using Import from URL**

1. Auth0 Dashboard → **Applications → Applications → Create Application**
2. Select **Import from URL**
3. Paste the metadata document URL and click **Preview**

*You should see: Auth0 fetches the document and shows a preview with `client_name` and `allowed_scopes` from your metadata.*

4. Click **Create**

*You should see: Auth0 creates a Native application with the metadata URL as the `client_id`. This is the agent's published identity — not used for OBO exchange, but visible in Auth0 logs wherever the agent's identity is referenced.*

### Part C: Create the M2M client for OBO token exchange

The OBO exchange requires a confidential **Custom API client** (`app_type: resource_server`) authorized against the MCP API with a user-delegated grant. Create it from the resource server screen.

1. Auth0 Dashboard → **APIs → `devcamp-mcp-server` → Applications tab**
2. Click **Create & Authorize New Application**
3. Name it `docagent-mcp-m2m` and select **Custom API Client**
4. Authorize it with all four `mcp:*` scopes

*You should see: a new application listed in the API's Applications tab with all four scopes granted.*

> [!IMPORTANT]
> **Enable On-Behalf-Of Token Exchange**
>
> This toggle is a security posture choice and must be opted in explicitly — it is not enabled by default.
>
> 1. Auth0 Dashboard → **Applications → Applications** → open **`docagent-mcp-m2m`**
> 2. Scroll to the **Token Exchange** section
>
> *You should see: the Token Exchange section with the On-Behalf-Of toggle off.*
>
> 3. Toggle on **On-Behalf-Of Token Exchange** → **Save**
>
> Until this is enabled, the OBO exchange returns a `403` and every tool call fails. This is the deliberate first moment of insight in the module: the scaffolding is in place, but the capability requires an explicit trust decision.

**Step 3: Add the M2M credentials to `.env`**

From the `docagent-mcp-m2m` application settings, copy the **Client ID** and **Client Secret**. Open `demo-app/.env` and add:

```
AUTH0_CLIENT_ID_M2M=<client-id-from-dashboard>
AUTH0_CLIENT_SECRET_M2M=<client-secret-from-dashboard>
```

**Step 4: Restart the app**

Stop the running app (`Ctrl+C`) and restart:

```bash
npm run dev
```

The MCP client is now configured and can perform OBO token exchanges.

## Code Steps

> [!NOTE]
> This code is already implemented in the demo-app. The steps below are a structured walk-through. Open each file in your editor as you go. You are not writing new code in this module.

### Part B: CIMD metadata endpoint

The MCP server serves the agent's identity document at `/.well-known/client-metadata`. The `client_id` is derived from the request URL — the endpoint returns itself as the identity.

`server/mcp/cimd.js` and `server/mcp/server.js`:

```js
app.get("/.well-known/client-metadata", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host  = req.headers["x-forwarded-host"]  || req.headers.host;
  const clientId = `${proto}://${host}/.well-known/client-metadata`;
  res.json({
    client_id: clientId,   // the URL is the identity
    client_name: "Nexus Agent (DevCamp)",
    allowed_scopes: ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"],
  });
});
```

This is what Auth0 fetched when you registered the CIMD app in Part B. The same URL appears in Auth0 logs wherever the agent's identity is referenced.

### Part C: Protected Resource Metadata (PRM, RFC 9728)

PRM enables an MCP client that knows only your server URL to discover which authorization server issues tokens for it, without any hardcoded configuration.

`server/mcp/metadata.js`:

```js
export function protectedResourceMetadata(_req, res) {
  res.json({
    resource: process.env.MCP_AUTH0_AUDIENCE,
    authorization_servers: [`https://${process.env.AUTH0_DOMAIN}`],
    scopes_supported: ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"],
    bearer_methods_supported: ["header"],
    client_registration_types_supported: ["metadata"],
    resource_documentation: "https://auth0.com/ai",
  });
}
```

### Part D: Authorization Server Metadata

`server/mcp/server.js`:

```js
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    token_endpoint: `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    jwks_uri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    scopes_supported: ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"],
    grant_types_supported: ["urn:ietf:params:oauth:grant-type:token-exchange"],
    client_registration_types_supported: ["metadata"],
  });
});
```

### Part E: OBO token exchange

The agent's backend holds the user's access token. To call the MCP server, it exchanges that token for one scoped to the MCP API, preserving the user's `sub` so FGA and Token Vault still reason about the human, not the agent.

`server/mcp/client.js`:

```js
body: JSON.stringify({
  grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
  subject_token: userAccessToken,
  subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
  audience: cfg.audience,
  resource: cfg.audience,          // RFC 8707 resource indicator
  client_id: cfg.clientId,         // M2M confidential client (opaque UUID)
  client_secret: cfg.clientSecret, // M2M client secret
}),
```

The `client_id` here is the M2M app's opaque UUID — the confidential exchanger you created in Part C. The CIMD native app's URL is the agent's *published identity*; the M2M client is its *exchange credential*. Both are necessary but serve different roles.

### Part E: route the agent's tool calls through MCP

`server/llm.js`, after the CIBA gate (explained in Module 04), all tools route through `executeTool`:

```js
import { executeTool } from "./tools/registry.js";

// inside processMessage, after the CIBA gate (explained in Module 04):
result = await executeTool(toolName, parameters, user.accessToken);
```

`executeTool` calls `mcpClient.callTool`, which calls `getToken` (the OBO exchange) before every MCP request.

## Checkpoint

> [!IMPORTANT]
> Confirm each of the following before moving on:
>
> 1. `curl https://<your-codespace>-3001.app.github.dev/.well-known/client-metadata` returns JSON where `client_id` is the URL itself.
> 2. `curl https://<your-codespace>-3001.app.github.dev/.well-known/oauth-protected-resource` returns JSON with `resource`, `authorization_servers`, `scopes_supported`.
> 3. `curl https://<your-codespace>-3001.app.github.dev/.well-known/oauth-authorization-server` returns JSON with `issuer`, `token_endpoint`, the four scopes, and `"metadata"` in `client_registration_types_supported`.
> 4. `curl -i https://<your-codespace>-3001.app.github.dev/mcp/tools` without a bearer returns 401 with a `WWW-Authenticate` header.

> [!NOTE]
> Auth0 Universal Login is already wired in the app. Module 02 explains how it works. For now, just click **Log In** and use `alice@docagent.demo` to proceed with steps 5 and 6.

> 5. Log in and send a document search. Confirm the backend log emits:
>    - `[MCP Client] Exchanging user token for MCP-scoped token...`
>    - `[MCP Client] Token exchange successful -- MCP token acquired`
>    - `[MCP Server] Tool call: search_documents, sub=auth0|...`
>    - `[FGA] Check: user:auth0|... can_read document:... -> ALLOWED`
> 6. In the Auth0 Dashboard, navigate to **Applications → Applications → docagent-mcp-m2m → APIs tab → `devcamp-mcp-server`** and deselect `mcp:docs:share`. Prompt Nexus: *"Share the Q3 roadmap with external@partner.com."* A **Device Approval Required** card will appear. Approve it: `curl -X POST http://localhost:3000/api/ciba/approve/<authReqId>`. After approval, the MCP server should respond with `403 { "error": "Insufficient scope", "required": "mcp:docs:share" }`. Re-enable the scope when done.

## What you learned

Every tool call now leaves the agent runtime, crosses a bearer-authenticated boundary, and is evaluated against the user's actual identity on a resource server that enforces FGA, Token Vault, and scope. The agent backend stops being the trust boundary. Concretely, you just walked through the full A4AA "Auth for MCP" pattern:

- **CIMD: stable published identity.** The CIMD native app gives the agent a URL-based identity that survives redeploys. Anyone can fetch it to learn what the agent is. Compare this to DCR (RFC 7591), where a new opaque UUID is minted on every install and audit logs become meaningless across deploys.
- **M2M client: confidential OBO exchanger.** The M2M client is authorized directly against the MCP API and performs token exchanges with its own credentials. The `sub` from the user's token is preserved in the issued MCP token so FGA and Token Vault key off the human, not the agent.
- **Discovery without config.** RFC 9728 PRM and RFC 8414 AS metadata let a new MCP client point at your server URL and resolve the issuer, scopes, and grant types on its own.
- **Graceful step-up.** `403 insufficient_scope` tells the client exactly which scope is missing, so the next OBO exchange can request it and retry.

Why this matters beyond the lab:

- **Opex.** Multiple agents (Claude Agent SDK, custom runtime, a future mobile client) now inherit one authorization engine from one MCP server, eliminating the burden of maintaining separate auth logic across each client.
- **GTM.** A resource server with PRM, scope enforcement, CIMD identity, and a verified M2M exchanger is what a procurement team wants to see in the security questionnaire. It shortens the review cycle from months to weeks.

### Further reading

- Auth for AI Agents product overview: [auth0.com/ai](https://auth0.com/ai)
- MCP authorization spec (2025-11-25): [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)
- RFC 9728 Protected Resource Metadata, RFC 8414 AS Metadata, RFC 8693 Token Exchange, RFC 8707 Resource Indicators

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this module.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      published the agent's CIMD identity by registering its metadata document URL in Auth0;
  </li>
  <li style="list-style-type:'✅ '">
      created an M2M confidential client from the MCP API resource server screen and enabled Token Exchange;
  </li>
  <li style="list-style-type:'✅ '">
      understood how RFC 9728 and RFC 8414 discovery documents enable zero-config client integration;
  </li>
  <li style="list-style-type:'✅ '">
      confirmed OBO token exchange preserves the user's <code>sub</code> all the way to tool execution.
  </li>
</ul>

The MCP server now has a trust boundary. Every caller is validated and every tool call is scoped to a resource and an identity. The next step is ensuring that identity is a verified employee, not just a token. Module 02 wires that.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
