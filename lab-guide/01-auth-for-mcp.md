# Module 01: Auth for MCP (the keystone module)

## Objective

This module wires the mechanism that makes everything downstream possible: registering Nexus's MCP server as an Auth0 resource and giving the first-party Nexus agent a stable, pre-registered identity via CIMD. Once a compliant client, whether internal or external, can discover the server and the agent can present a CIMD identity, OBO token exchange carries the employee's `sub` all the way to tool execution, and Token Vault, CIBA, and FGA all have the identity they need to enforce policy.

In this module you will:

- Stand up the MCP server on port 3001 behind JWT validation.
- Publish `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414) so any compliant MCP client can discover the resource and its issuer.
- Have the agent exchange the user's token for an MCP-audience token, preserving `sub` so downstream FGA and Token Vault still reason about the *human*, not the agent.
- Enforce a distinct scope per tool and return a proper `WWW-Authenticate: Bearer error="insufficient_scope"` response so clients can drive step-up authorization.

### Why we're building this

Without a defined trust boundary, every agent runtime connecting to your MCP server becomes an implicit authorization decision made by whoever wrote the agent, not by the platform. A new agent framework means a new security review, a compromised client has no scope boundary, and an audit log entry that says "agent called tool" tells you nothing about which employee was responsible.

The commercial consequence is direct: enterprise procurement teams require stable client identity and token-scoped tool access in the security questionnaire. CIMD-based agent identity and on-behalf-of token exchange mean partners and new agent runtimes integrate without custom onboarding work on either side, and every tool call is auditable to a specific employee and resource.

## Prerequisites

- No prior modules required. This module establishes the foundation everything else builds on.

## Premise

Your MCP server is a platform for agent clients of two kinds. The first-party Nexus agent connects with a stable `client_id`, pre-registered via CIMD, that survives redeploys and shows up in every audit log. Third-party integrations, including Claude Desktop and partner agents, discover the server through PRM and AS metadata and connect without any configuration on their side. All of them must present a valid token issued for this resource, and when they do, OBO token exchange extracts the employee's identity from that token and carries it through the agent boundary to every tool call downstream. That exchange is the mechanism the rest of the lab depends on.

**MCP (Model Context Protocol)** is a standard surface for advertising tools. With Auth0 in front of it, every tool call is bearer-token-authenticated against a resource server that enforces FGA, Token Vault, and scope checks. The agent is simply a client: you can swap it, add a second one, or run Claude Agent SDK alongside a custom loop, while the guardrails live permanently on the MCP server regardless of which agent you connect.

> [!NOTE]
> Auth0's **Auth for MCP** went GA on April 29, 2026 as part of the Auth for AI Agents (A4AA) product line. It follows the MCP authorization spec (revision 2025-11-25) published at [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification) and layers it on top of OAuth 2.1 so that any conformant MCP client (Claude Desktop, Claude Agent SDK, your own runtime) can discover and call your tools with the user's actual identity. Product overview and canonical docs: [auth0.com/ai](https://auth0.com/ai).

This module wires six Auth for MCP features in one flow:

| Part | Feature | RFC / Spec |
|---|---|---|
| A | Register MCP server as Auth0 API with per-tool scopes | OAuth 2.1 |
| B | CIMD: pre-register the agent as a client | Client ID Metadata Documents (draft) |
| C | Protected Resource Metadata (PRM) | RFC 9728 |
| D | Authorization Server Metadata | RFC 8414 |
| E | On-Behalf-Of token exchange with RFC 8707 resource indicator | RFC 8693 + RFC 8707 |
| F | Per-tool scope enforcement with `WWW-Authenticate` step-up hints | OAuth 2.1 + MCP 2025-11-25 |

## What's provisioned for you

The two Auth0 objects this module depends on are created for you by the CREATE hook when your demo launches. You write the server and client code below; the tenant footprint is already in place.

### The MCP API (resource server)

`https://devcamp-mcp-server` (RS256), with the four per-tool scopes that match the Nexus tools:

- `mcp:docs:search` — search the document knowledge base
- `mcp:docs:read` — retrieve a specific document
- `mcp:crm:log` — log activity to the CRM via Token Vault
- `mcp:docs:share` — share a document externally (CIBA-gated)

### The Nexus agent client (CIMD)

**Client ID Metadata Documents (CIMD)** is the pre-registered identity of the agent. The MCP authorization spec allows Dynamic Client Registration (DCR, RFC 7591), but DCR is the wrong fit for a production agent: it creates a fresh, ephemeral `client_id` on every install, which breaks audit trails and admin consent. CIMD is the A4AA answer: the agent has a stable `client_id` whose metadata lives in the tenant, survives upgrades, and can be governed like any other workload.

The hook provisions this as a non-interactive (M2M) client authorized against the MCP API with user-delegated access and all four `mcp:*` scopes. Its id, secret, and the MCP audience arrive through your runtime config; there are no `AUTH0_CLIENT_ID_M2M`, `AUTH0_CLIENT_SECRET_M2M`, or `MCP_AUTH0_AUDIENCE` values for you to copy.

> [!IMPORTANT]
> **Dashboard Step A: Enable Token Exchange on the agent client**
>
> The M2M agent client was provisioned for you, but Token Exchange must be opted in explicitly — it is a trust decision, not an automatic default.
>
> 1. Auth0 Dashboard → **Applications → Applications**
>
> *[Screenshot: Applications list page showing docagent-mcp-m2m-{{demoName}} in the table]*
>
> 2. Open **docagent-mcp-m2m-`{{demoName}}`**
> 3. Scroll down to **Advanced Settings → Grant Types**
>
> *[Screenshot: The Advanced Settings → Grant Types tab on the M2M client, with the Token Exchange checkbox unchecked (before enabling)]*
>
> 4. Check **Token Exchange** → **Save Changes**
>
> *[Screenshot: The same Grant Types tab with Token Exchange now checked and Save Changes highlighted]*
>
> Until this is enabled, the OBO exchange returns a `403` and every tool call fails. This is the deliberate first moment of insight in the module: the scaffolding is in place, but the capability requires an explicit trust decision.

> [!IMPORTANT]
> **Dashboard Step B: Observe the CIMD client identity**
>
> Your agent has a stable, pre-registered identity. Compare this to DCR, where a new `client_id` is minted on every install and audit logs become meaningless.
>
> 1. From the same M2M client, copy the **Client ID** shown at the top of the page
>
> *[Screenshot: The M2M client overview page with the Client ID field highlighted]*
>
> 2. In your Codespace terminal: `curl http://localhost:3001/.well-known/client-metadata`
> 3. Confirm the `client_id` in the JSON response matches the one in the Dashboard. This identity survives redeploys and shows up in every token audit log — that is the entire point of CIMD.

> [!NOTE]
> Self-hosting `starter/`? Create the MCP API and an M2M client in your own tenant, grant user-delegated access and Token Exchange, authorize all four scopes, and put the client id, secret, `MCP_AUTH0_AUDIENCE=https://devcamp-mcp-server`, and `MCP_SERVER_PORT=3001` in `starter/.env`.

## Code Steps

### Part C: Protected Resource Metadata (PRM, RFC 9728)

PRM enables an MCP client that knows only your server URL to discover which authorization server issues tokens for it without requiring hardcoded tenant configuration. The client fetches `/.well-known/oauth-protected-resource`, follows the `authorization_servers` pointer to the AS metadata, and completes the discovery chain automatically, allowing Claude Desktop or a partner agent to connect to your MCP server without any setup on their side.

`server/mcp/metadata.js`:

```js
export function protectedResourceMetadata(_req, res) {
  const authDomain = process.env.AUTH0_DOMAIN;
  res.json({
    resource: process.env.MCP_AUTH0_AUDIENCE,
    authorization_servers: [`https://${authDomain}`],
    scopes_supported: [
      "mcp:docs:search",
      "mcp:docs:read",
      "mcp:crm:log",
      "mcp:docs:share",
    ],
    bearer_methods_supported: ["header"],
    client_registration_types_supported: ["metadata"],
    resource_documentation: "https://auth0.com/ai",
  });
}
```

### Part D: Authorization Server Metadata

Registered inline on the MCP server in `server/mcp/server.js`:

```js
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    authorization_endpoint: `https://${process.env.AUTH0_DOMAIN}/authorize`,
    token_endpoint: `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    jwks_uri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    scopes_supported: [
      "mcp:docs:search",
      "mcp:docs:read",
      "mcp:crm:log",
      "mcp:docs:share",
    ],
    grant_types_supported: [
      "urn:ietf:params:oauth:grant-type:token-exchange",
    ],
    client_registration_types_supported: ["metadata"],
  });
});
```

### Part E: MCP server JWT validation + routing

`server/mcp/server.js`:

```js
import { protectedResourceMetadata } from "./metadata.js";
import { getJwtValidator, decodeUnverified, bearerFromHeader } from "../platform/jwt.js";
import { canReadDocument, canShareDocument, getDocument, seedTuplesForUser } from "../fga/client.js";
import { getToken, seedVaultForUser } from "../token-vault/vault.js";

// Multi-tenant validator: resolves issuer + audience from the token's `iss` claim.
const validateMCPToken = (req, res, next) => {
  const token = bearerFromHeader(req);
  const payload = token ? decodeUnverified(token) : null;
  let issuer = `https://${process.env.AUTH0_DOMAIN}`;
  let audience = process.env.MCP_AUTH0_AUDIENCE || "";
  // ... resolve per-tenant issuer/audience from token iss
  return getJwtValidator(issuer, audience)(req, res, next);
};

app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
app.get("/.well-known/oauth-authorization-server", (_req, res) => { /* implemented in Part D above */ });

app.get("/mcp/tools", validateMCPToken, (_req, res) => {
  res.json({ tools: TOOLS });
});

app.post("/mcp/tools/call", validateMCPToken, async (req, res) => {
  const { name, arguments: args } = req.body;
  const payload = req.auth?.payload || {};
  const userSub = payload.sub;
  const userEmail = payload.email;
  const tokenScopes = (payload.scope || "").split(" ").filter(Boolean);

  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return res.status(404).json({ error: `Unknown tool: ${name}` });

  if (!tokenScopes.includes(tool.requiredScope)) {
    return res.status(403).json({
      error: "Insufficient scope",
      required: tool.requiredScope,
    });
  }

  await seedTuplesForUser(userSub, userEmail, req.tenant);
  await seedVaultForUser(userSub, req.tenant, bearerFromHeader(req));

  try {
    const result = await executeToolLogic(name, args, userSub, req.tenant, bearerFromHeader(req));
    res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### Part E: fill in `executeToolLogic`

Same file — four tools, each guarded by the FGA or Token Vault check from earlier modules:

```js
async function executeToolLogic(name, args, userSub, tenant, userAccessToken) {
  switch (name) {
    case "search_documents": {
      const { query } = args;
      const lower = query.toLowerCase();
      const matches = DOCUMENTS.filter(doc =>
        doc.title.toLowerCase().includes(lower) ||
        doc.snippet.toLowerCase().includes(lower) ||
        doc.department.toLowerCase().includes(lower) ||
        doc.id.toLowerCase().includes(lower)
      );
      const accessible = [];
      for (const doc of matches) {
        if (await canReadDocument(userSub, doc.id, tenant)) {
          accessible.push({ id: doc.id, title: doc.title, department: doc.department, classification: doc.classification, snippet: doc.snippet });
        }
      }
      return { success: true, query, results: accessible, total: accessible.length };
    }
    case "get_document": {
      const { documentId } = args;
      if (!(await canReadDocument(userSub, documentId, tenant))) {
        return { success: false, error: `Access denied: you do not have read access to document:${documentId}.` };
      }
      const doc = getDocument(documentId);
      return doc ? { success: true, document: doc } : { success: false, error: `Document ${documentId} not found.` };
    }
    case "log_crm_activity": {
      const { action, documentId, documentTitle, notes } = args;
      const tokenResult = await getToken(userSub, "crm", tenant, userAccessToken);
      if (!tokenResult) return { success: false, error: "No CRM account linked. Ask the user to connect their CRM." };
      const apiBase = process.env.CRM_API_URL || `http://localhost:${process.env.CRM_PORT || 3002}`;
      const r = await fetch(`${apiBase}/crm/activities`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenResult.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, documentId, documentTitle, notes, userId: userSub }),
      });
      if (!r.ok) return { success: false, error: `CRM API error: ${r.statusText}` };
      const data = await r.json();
      return { success: true, ...data };
    }
    case "share_document": {
      const { documentId, documentTitle, recipientEmail } = args;
      if (!(await canShareDocument(userSub, documentId, tenant))) {
        return { success: false, error: `Access denied: you do not have share permissions for document:${documentId}.` };
      }
      // CIBA approval confirmed upstream before this tool is invoked
      return { success: true, shared: { documentId, documentTitle: documentTitle || documentId, recipientEmail, sharedAt: new Date().toISOString(), sharedBy: userSub } };
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
```

### Part E: OBO token exchange in the client

The token exchange below is the heart of Auth for MCP. The agent's backend holds the user's Auth0 access token (audience = your app API). To call the MCP server, it needs a token with the MCP server as its audience, but it must preserve the user's `sub` so FGA and Token Vault still reason about the human, not the agent. RFC 8693 token exchange plus RFC 8707's resource indicator achieve exactly that: they mint a scoped token that cannot be replayed against any other API, which hardens every downstream resource server against lateral movement and token theft and keeps the blast radius of any single compromise contained to one audience.

`server/mcp/client.js`:

```js
async getToken(userAccessToken) {
  const cfg = this.resolveConfig(userAccessToken); // per-tenant M2M creds + MCP audience
  const cacheKey = userAccessToken.slice(-16);
  const cached = cachedTokens.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  if (cached) cachedTokens.delete(cacheKey);

  const response = await fetch(`https://${cfg.auth0Domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: userAccessToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
      audience: cfg.audience,
      resource: cfg.audience,          // RFC 8707 resource indicator
      client_id: cfg.clientId,         // CIMD pre-registered client
      client_secret: cfg.clientSecret,
    }),
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.statusText}`);
  const data = await response.json();
  cachedTokens.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 });
  return data.access_token;
}

async listTools(userAccessToken) {
  const token = await this.getToken(userAccessToken);
  const r = await fetch(`${this.config.serverUrl}/mcp/tools`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { tools } = await r.json();
  return tools;
}

async callTool(name, args, userAccessToken) {
  const token = await this.getToken(userAccessToken);
  const r = await fetch(`${this.config.serverUrl}/mcp/tools/call`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  });
  if (r.status === 403) {
    const error = await r.json();
    throw new Error(`MCP authorization failed: insufficient scope. Required: ${error.required}`);
  }
  if (!r.ok) throw new Error(`MCP ${name} failed: ${r.status}`);
  const { content } = await r.json();
  return JSON.parse(content[0].text);
}
```

### Part E: route the agent's tool calls through MCP

`server/llm.js` — after the CIBA gate, all tools route through `executeTool`, which wraps the MCP client and performs the OBO exchange:

```js
import { executeTool } from "./tools/registry.js";

// inside processMessage, after the CIBA gate:
result = await executeTool(toolName, parameters, user.accessToken);
```

`executeTool` calls `mcpClient.callTool`, which calls `getToken` (the OBO exchange) before every MCP request. The same pattern applies in `server/simulator.js`.

### Part F: start the MCP server

`server/index.js`:

```js
import { startMCPServer } from "./mcp/server.js";
startMCPServer();
```

## Checkpoint

> [!IMPORTANT]
> Confirm each of the following before moving on:
>
> 1. `curl http://localhost:3001/.well-known/oauth-protected-resource` → JSON with `resource`, `authorization_servers`, `scopes_supported`. This is the RFC 9728 discovery document a fresh MCP client reads first.
> 2. `curl http://localhost:3001/.well-known/oauth-authorization-server` → issuer, jwks_uri, token_endpoint, the four Nexus scopes, `urn:ietf:params:oauth:grant-type:token-exchange` in `grant_types_supported`, and `"metadata"` in `client_registration_types_supported`.
> 3. `curl -i http://localhost:3001/mcp/tools` without a bearer → 401 with a `WWW-Authenticate: Bearer realm="..."` header pointing back to the PRM URL.
> 4. Log into the SPA and send a document search. You should observe the backend log emit:
>    - `[MCP Client] Exchanging user token for MCP-scoped token...`
>    - `[MCP Client] Token exchange successful -- MCP token acquired`
>    - `[MCP Server] Tool call: search_documents, sub=auth0|...`
>    - `[FGA] Check: user:auth0|... can_read document:... -> ALLOWED`
> 5. Revoke `mcp:docs:share` on the M2M app; next share request → `403` with body `{ "error": "Insufficient scope", "required": "mcp:docs:share" }`. A compliant MCP client treats this as the step-up signal and re-requests the missing scope on the next OBO exchange.
> 6. The `sub` in the MCP access token matches the user's Auth0 id; confirm by logging `req.auth.payload.sub` on the MCP server. If this drifts to the CIMD client id, FGA and Token Vault will key off the agent instead of the human — the exact failure mode A4AA is designed to prevent.

## What you learned

Every tool call now leaves the agent runtime, crosses a bearer-authenticated boundary, and is evaluated against the user's actual identity on a resource server that enforces FGA, Token Vault, and scope. The agent backend stops being the trust boundary. Concretely, you just implemented the full A4AA "Auth for MCP" pattern:

- **Discovery without config.** RFC 9728 PRM and RFC 8414 AS metadata let a new MCP client point at your server URL and resolve the issuer, scopes, and grant types on its own. No hardcoded tenant values on the agent side.
- **Stable agent identity.** CIMD replaces dynamic client registration so the agent has a long-lived, auditable `client_id` that survives redeploys and shows up in tenant logs.
- **User-on-behalf-of, not agent-on-behalf-of.** RFC 8693 + RFC 8707 mint a token whose audience is the MCP server but whose `sub` is still the user. FGA and Token Vault keep working because they key off the human.
- **Graceful step-up.** `403 insufficient_scope` tells the client exactly which scope is missing, so the next OBO exchange can request it and retry.

Why this matters beyond the lab:

- **Opex.** Multiple agents (Claude Agent SDK build, custom runtime, a future mobile client) now inherit one authorization engine from one MCP server, eliminating the burden of maintaining separate auth logic across each client implementation.
- **GTM.** A resource server with PRM, scope enforcement, and CIMD-based client identity is what a procurement team wants to see in the security questionnaire. It shortens the review cycle from months to weeks.

### Further reading

- Auth for AI Agents product overview: [auth0.com/ai](https://auth0.com/ai)
- MCP authorization spec (2025-11-25): [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)
- RFC 9728 Protected Resource Metadata, RFC 8414 AS Metadata, RFC 8693 Token Exchange, RFC 8707 Resource Indicators

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this module.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      stood up the MCP server behind JWT validation as the single trust boundary;
  </li>
  <li style="list-style-type:'✅ '">
      published RFC 9728 and RFC 8414 discovery documents so any compliant client configures itself;
  </li>
  <li style="list-style-type:'✅ '">
      exchanged the user's token on-behalf-of, preserving <code>sub</code> all the way to tool execution;
  </li>
  <li style="list-style-type:'✅ '">
      enforced per-tool scopes with a graceful <code>Insufficient scope</code> step-up response.
  </li>
</ul>

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
