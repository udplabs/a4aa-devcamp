# Module 05: Auth for MCP (the keystone module)

## Objective

This is the keystone. Everything you built so far (the rep's identity, the FGA decisions, the vaulted credentials) now moves behind a single bearer-authenticated boundary: an MCP (Model Context Protocol) server. The agent stops being the trust boundary and becomes just one more client. By the end of this module, every tool call crosses a token-exchange boundary that preserves the rep's `sub` all the way to execution.

In this module you will:

- Stand up the MCP server on port 3001 behind JWT validation.
- Publish `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414) so any compliant MCP client can discover the resource and its issuer.
- Have the agent exchange the rep's user token for an MCP-audience token, preserving `sub` so downstream FGA and Token Vault still reason about the *human*, not the agent.
- Enforce a distinct scope per tool and return a proper `WWW-Authenticate: Bearer error="insufficient_scope"` response so clients can drive step-up authorization.

## Prerequisites

- You completed **Module 02** (rep identity on every request), witnessed **Module 03** (FGA), and built **Module 04** (Token Vault). This module routes those handlers through a secured MCP server.

## Premise

So far, every security control has lived on the agent backend. That works, but it means the agent runtime becomes the trust boundary for *every* tool. If a future version of Z-Merchant uses a different framework, or if an adjacent agent (say, the AR collections agent) wants to reuse the same wholesale tools, they would each re-implement the same FGA + Token Vault + audit plumbing.

**MCP (Model Context Protocol)** fixes that. It is a standard surface for advertising tools, and with Auth0 in front of it, every tool call is bearer-token-authenticated against a resource server that enforces FGA, Token Vault, and scope checks. The agent is just a client. Swap it, add a second one, Claude Agent SDK vs custom loop; the guardrails live on the MCP server regardless.

> [!NOTE]
> Auth0's **Auth for MCP** went GA on April 29, 2026 as part of the Auth for AI Agents (A4AA) product line. It follows the MCP authorization spec (revision 2025-11-25) published at [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification) and layers it on top of OAuth 2.1 so that any conformant MCP client (Claude Desktop, Claude Agent SDK, your own runtime) can discover and call your tools with the rep's actual identity. Product overview and canonical docs: [auth0.com/ai](https://auth0.com/ai).

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

`https://devcamp-mcp-server` (RS256), with the four per-tool scopes:

- `mcp:quote:read`
- `mcp:docs:create`
- `mcp:slack:post`
- `mcp:quote:commit`

### The Z-Merchant agent client (CIMD)

**Client ID Metadata Documents (CIMD)** is the pre-registered identity of the agent. The MCP authorization spec allows Dynamic Client Registration (DCR, RFC 7591), but DCR is the wrong fit for a production agent: it creates a fresh, ephemeral `client_id` on every install, which breaks audit trails and admin consent. CIMD is the A4AA answer: the agent has a stable `client_id` whose metadata lives in the tenant, survives upgrades, and can be governed like any other workload.

The hook provisions this as a non-interactive (M2M) client authorized against the MCP API, with **Client Credentials** and **Token Exchange** grants (plus **CIBA** for the bonus) and all four `mcp:*` scopes. Its id, secret, and the MCP audience arrive through your runtime config; there are no `AUTH0_CLIENT_ID_M2M`, `AUTH0_CLIENT_SECRET_M2M`, or `MCP_AUTH0_AUDIENCE` values for you to copy. Also confirm your tenant has the **token exchange** feature enabled, since the on-behalf-of exchange below depends on it.

> [!NOTE]
> Self-hosting `starter/`? Create the MCP API and an M2M client in your own tenant, grant Client Credentials + Token Exchange (+ CIBA), authorize all four scopes, and put the client id, secret, `MCP_AUTH0_AUDIENCE=https://devcamp-mcp-server`, and `MCP_SERVER_PORT=3001` in `starter/.env`.

## Code Steps

### Part C: Protected Resource Metadata (PRM, RFC 9728)

PRM is how an MCP client that only knows your server URL figures out *which* authorization server issues tokens for it. Without it, the client has to hardcode the Auth0 tenant. With it, the client fetches `/.well-known/oauth-protected-resource`, follows the `authorization_servers` pointer to the AS metadata, and completes the discovery chain without any configuration on the agent side.

`server/mcp/metadata.ts`:

```ts
export function protectedResourceMetadata(_req, res) {
  const authServer = `https://${process.env.AUTH0_DOMAIN}`;
  res.json({
    resource: process.env.MCP_AUTH0_AUDIENCE,
    authorization_servers: [authServer],
    bearer_methods_supported: ["header"],
    scopes_supported: [
      "mcp:quote:read", "mcp:docs:create",
      "mcp:slack:post", "mcp:quote:commit",
    ],
    resource_documentation: `${authServer}/.well-known/openid-configuration`,
  });
}
```

### Part D: Authorization Server Metadata

Same file:

```ts
export async function authorizationServerMetadata(_req, res) {
  const issuer = `https://${process.env.AUTH0_DOMAIN}`;
  const wk = await fetch(`${issuer}/.well-known/openid-configuration`).then(r => r.json());
  res.json({
    issuer: wk.issuer,
    authorization_endpoint: wk.authorization_endpoint,
    token_endpoint: wk.token_endpoint,
    jwks_uri: wk.jwks_uri,
    scopes_supported: [
      "mcp:quote:read", "mcp:docs:create",
      "mcp:slack:post", "mcp:quote:commit",
    ],
    grant_types_supported: [
      "authorization_code",
      "client_credentials",
      "urn:ietf:params:oauth:grant-type:token-exchange",
      "urn:openid:params:grant-type:ciba",
    ],
    client_registration_types_supported: ["cimd"],
  });
}
```

### Part E: MCP server JWT validation + routing

`server/mcp/server.ts`:

```ts
import { auth } from "express-oauth2-jwt-bearer";
import { protectedResourceMetadata, authorizationServerMetadata } from "./metadata";
import { canReadAccount, canCommitQuote, getAccount, getCatalogEntry, seedTuplesForUser } from "../fga/client";
import { getToken, seedVaultForUser } from "../token-vault/vault";

const validateMCPToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.MCP_AUTH0_AUDIENCE,
});

app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
app.get("/.well-known/oauth-authorization-server", authorizationServerMetadata);

app.get("/mcp/tools", validateMCPToken, (_req, res) => {
  res.json({ tools: TOOLS });
});

app.post("/mcp/tools/call", validateMCPToken, async (req, res) => {
  const { name, arguments: args } = req.body;
  const payload = (req as any).auth?.payload || {};
  const userSub = payload.sub;
  const userEmail = payload.email;
  const scopeString = payload.scope || "";

  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return res.status(404).json({ error: `Unknown tool: ${name}` });

  if (!scopeString.split(" ").includes(tool.requiredScope)) {
    return res.status(403).json({
      error: "insufficient_scope",
      required: tool.requiredScope,
    });
  }

  seedTuplesForUser(userSub, userEmail);
  seedVaultForUser(userSub);

  try {
    const result = await executeToolLogic(name, args, userSub);
    res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

### Part E: fill in `executeToolLogic`

Same file:

```ts
async function executeToolLogic(name, args, userSub) {
  switch (name) {
    case "get_catalog_and_buyer_tier": {
      if (!canReadAccount(userSub, args.accountId)) {
        throw new Error(`FGA deny: account:${args.accountId}`);
      }
      const account = getAccount(args.accountId);
      const sku = getCatalogEntry(args.sku);
      return { account, sku, tier: account.tier };
    }
    case "create_google_doc": {
      const entry = await getToken(userSub, "google");
      if (!entry) throw new Error("google not linked");
      const r = await fetch(`http://localhost:${process.env.THIRD_PARTY_API_PORT || 3002}/google/docs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${entry.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return r.json();
    }
    case "post_slack_triage": {
      const entry = await getToken(userSub, "slack");
      if (!entry) throw new Error("slack not linked");
      const r = await fetch(`http://localhost:${process.env.THIRD_PARTY_API_PORT || 3002}/slack/chat.postMessage`, {
        method: "POST",
        headers: { Authorization: `Bearer ${entry.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return r.json();
    }
    case "commit_quote_terms": {
      if (!canCommitQuote(userSub, args.accountId)) {
        throw new Error(`FGA deny: commit account:${args.accountId}`);
      }
      return { committed: { accountId: args.accountId, quoteId: args.quoteId, discountPercent: args.discountPercent, paymentTerms: args.paymentTerms || "net-30", committedAt: new Date().toISOString() } };
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
```

### Part E: OBO token exchange in the client

The token exchange below is the heart of Auth for MCP. The agent's backend holds the rep's Auth0 access token (audience = your app API). To call the MCP server, it needs a token with the MCP server as its audience, but it must preserve the rep's `sub` so FGA and Token Vault still reason about the human, not the agent. RFC 8693 token exchange plus RFC 8707's resource indicator achieve exactly that: they mint a scoped token that cannot be replayed against any other API, which hardens every downstream resource server against lateral movement and token theft and keeps the blast radius of any single compromise contained to one audience.

`server/mcp/client.ts`:

```ts
private async getToken(userAccessToken: string): Promise<string> {
  const cacheKey = userAccessToken.slice(-16);
  const cached = cachedTokens.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: userAccessToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
    audience: this.config.audience,
    resource: this.config.audience,        // RFC 8707 resource indicator
    client_id: this.config.clientId,       // CIMD pre-registered client
    client_secret: this.config.clientSecret,
    scope: "mcp:quote:read mcp:docs:create mcp:slack:post mcp:quote:commit",
  });

  const r = await fetch(`https://${this.config.auth0Domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`OBO exchange failed: ${r.status} ${await r.text()}`);
  const { access_token, expires_in } = await r.json();
  cachedTokens.set(cacheKey, { token: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 });
  return access_token;
}

async listTools(userAccessToken: string) {
  const token = await this.getToken(userAccessToken);
  const r = await fetch(`${this.config.serverUrl}/mcp/tools`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { tools } = await r.json();
  return tools;
}

async callTool(name: string, args: Record<string, any>, userAccessToken: string) {
  const token = await this.getToken(userAccessToken);
  const r = await fetch(`${this.config.serverUrl}/mcp/tools/call`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  });
  if (r.status === 403) {
    const err = await r.json();
    throw new Error(`MCP denied ${name} -- insufficient scope (need ${err.required})`);
  }
  if (!r.ok) throw new Error(`MCP ${name} failed: ${r.status}`);
  const { content } = await r.json();
  return JSON.parse(content[0].text);
}
```

### Part E: route the agent's tool calls through MCP

`server/llm.ts` replace `executeToolLocally`:

```ts
import { createMCPClient } from "./mcp/client";
const mcpClient = createMCPClient();

// inside processMessage, after CIBA gate:
const result = await mcpClient.callTool(toolName, parameters, user.accessToken!);
```

Do the same in `server/simulator.ts`.

### Part F: start the MCP server

`server/index.ts`:

```ts
import { startMCPServer } from "./mcp/server";
startMCPServer();
```

## Checkpoint

> [!IMPORTANT]
> Confirm each of the following before moving on:
>
> 1. `curl http://localhost:3001/.well-known/oauth-protected-resource` -> JSON with `resource`, `authorization_servers`, `scopes_supported`. This is the RFC 9728 discovery document a fresh MCP client reads first.
> 2. `curl http://localhost:3001/.well-known/oauth-authorization-server` -> issuer, jwks_uri, token_endpoint, the four scopes, `urn:ietf:params:oauth:grant-type:token-exchange` in `grant_types_supported`, and `"cimd"` in `client_registration_types_supported`.
> 3. `curl -i http://localhost:3001/mcp/tools` without a bearer -> 401 with a `WWW-Authenticate: Bearer realm="..."` header pointing back to the PRM URL.
> 4. Log into the SPA and send a quote prompt. You should observe the backend log emit:
>    - `OBO exchange audience=https://devcamp-mcp-server resource=https://devcamp-mcp-server client_id=<CIMD>`
>    - `MCP call: get_catalog_and_buyer_tier -- FGA allow`
> 5. Revoke `mcp:docs:create` on the M2M app; next Google Doc call -> `403` with body `{ "error": "insufficient_scope", "required": "mcp:docs:create" }`. A compliant MCP client treats this as the step-up signal and re-requests the missing scope on the next OBO exchange.
> 6. The `sub` in the MCP access token matches the rep's user id; confirm by logging `req.auth.payload.sub` on the MCP server. If this drifts to the CIMD client id, FGA and Token Vault will key off the agent instead of the human, the exact failure mode A4AA is designed to prevent.

## What you learned

Every tool call now leaves the agent runtime, crosses a bearer-authenticated boundary, and is evaluated against the rep's actual identity on a resource server that enforces FGA, Token Vault, and scope. The agent backend stops being the trust boundary. Concretely, you just implemented the full A4AA "Auth for MCP" pattern:

- **Discovery without config.** RFC 9728 PRM and RFC 8414 AS metadata let a new MCP client point at your server URL and resolve the issuer, scopes, and grant types on its own. No hardcoded tenant values on the agent side.
- **Stable agent identity.** CIMD replaces dynamic client registration so the agent has a long-lived, auditable `client_id` that survives redeploys and shows up in tenant logs.
- **User-on-behalf-of, not agent-on-behalf-of.** RFC 8693 + RFC 8707 mint a token whose audience is the MCP server but whose `sub` is still the rep. FGA and Token Vault keep working because they key off the human.
- **Graceful step-up.** `403 insufficient_scope` tells the client exactly which scope is missing, so the next OBO exchange can request it and retry.

Why this matters beyond the lab:

- **Opex.** Multiple agents (Claude Agent SDK build, custom runtime, the Q4 AR collections launch) now inherit one authorization engine from one MCP server. One codepath to review, one set of audit logs, one place to update when a scope changes.
- **GTM.** A resource server with PRM, scope enforcement, and CIMD-based client identity is what a procurement team wants to see in the security questionnaire. It shortens the review cycle from months to weeks, which is the difference between closing in this fiscal year and slipping into next.

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
      exchanged the rep's token on-behalf-of, preserving <code>sub</code> all the way to tool execution;
  </li>
  <li style="list-style-type:'✅ '">
      enforced per-tool scopes with a graceful <code>insufficient_scope</code> step-up response.
  </li>
</ul>

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
