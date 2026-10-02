## Objective *(~20 min)*

<!-- TODO: Flow screenshot here - Agent Identity and MCP server with arrow between. -->

Here's what we're going to do:
- Register your MCP server as an Auth0 resource
- Give your first-party agent the two things it needs to call tools on behalf of users:
  - A first-class identity via **Agent as Principal** with its own `agent_id`
  - A confidential M2M client (linked to that agent) that performs an OBO token exchange

Once both items are in place, every tool call carries the employee's **sub** *and* the agent's **agent_id** (as `act.sub`) all the way to tool execution. 

That gives Token Vault, CIBA, and FGA the identity they need to enforce policy and gives you an agent identity that survives client credential rotation.

By the end, you'll (hopefully) understand:

- How JWT validation protects the MCP server, and why the server only ever validates tokens rather than exchanging them itself — that job belongs to the client crossing into it.
- How `/.well-known/oauth-protected-resource` (PRM) and `/.well-known/oauth-authorization-server` (RFC 8414 AS metadata) enable zero-config client discovery.
- What Agent as Principal is and why a durable `agent_id` is better than treating an M2M client's own credentials as the agent's identity.
- How the M2M client performs OBO token exchange with its own credentials, preserving the user's **sub** through the agent boundary while — once linked to the agent record — also carrying the agent's `agent_id` as `act.sub`.
- How a distinct scope per tool enforces least-privilege and enables **WWW-Authenticate** step-up hints for clients.

## Features shown by RFC

This module wires six features in one flow:

| Part | Feature | RFC / Spec |
|---|---|---|
| A | Register MCP API + Backend API as Auth0 resource servers (per-tool scopes live on the Backend API) | OAuth 2.1 |
| B | Agent as Principal: register the agent as a first-class Auth0 identity | Early Access ([auth0.com/docs/ai-agents-mcp/agent-as-principal](https://auth0.com/docs/ai-agents-mcp/agent-as-principal)) |
| C | Protected Resource Metadata (PRM) | RFC 9728 |
| D | Authorization Server Metadata | RFC 8414 |
| E | On-Behalf-Of token exchange with RFC 8707 resource indicator | RFC 8693 + RFC 8707 |
| F | Per-tool scope enforcement with **WWW-Authenticate** step-up hints | OAuth 2.1 + MCP 2025-11-25 |

## What's provisioned for you

The previous section already registered the MCP API and Backend API resource servers for you.

Your tenant already has:

- **The MCP API (resource server)**: `devcamp-mcp-server` (RS256), with one broad scope, `chat:send`, which proves the user can access the Nexus Agent chat interface.
- **The Nexus Backend API (resource server)**: `devcamp-docagent-api` (RS256), with the four fine-grained per-tool scopes the OBO exchange targets:
  - `mcp:docs:search`: search the document knowledge base
  - `mcp:docs:read`: retrieve a specific document
  - `mcp:crm:log`: log activity to the CRM via Token Vault
  - `mcp:docs:share`: share a document externally (CIBA-gated)

- **The Nexus SPA application**: your browser app for user login, already configured for your Codespace URL.

The Nexus Backend API was also provisioned with `agent_subject_claims` set to `"auth0-v1"`. This makes it so that `sub_profile`/`act.sub` claims are automatically added to tokens once the M2M client below is linked to an agent record.

**Only two things aren't provisioned for you.** You will create both in this module.

## Dashboard steps

> [!NOTE]
> **Two things:**
> - **Agent record (Agent as Principal)**: the agent's unique Auth0 identity. This makes the agent a first-class object with its own `agent_id`. This identity is what shows up in the exchanged token's `act.sub` claim and in Auth0 logs independent of whichever M2M client happens to authenticate it.
> - **M2M confidential app**: performs the actual OBO token exchange server-side. It is authorized against **both** the MCP API (the audience it exchanges from) and the Nexus Backend API (the audience it exchanges into, where the four per-tool scopes live). Once linked to the agent record, its exchanged tokens carry the agent's `agent_id` forward.

### Part A: Register the agent as a first-class Auth0 identity

<!-- TODO: Need to validate that the Agent as principal is turned on for every tenant by default. -->

<!-- TODO: Flow screenshot here - Agent Identity -->

**Step 1: Create the agent record**

1. Auth0 Dashboard → **Agents** → **Create New Agent**
2. Name it ***exactly*** `Nexus Agent (DevCamp)`, the app looks this up by name
3. Click **Create**

*You should see: the new agent record with a generated **Agent ID** in the form `agt_...`.*

<!-- TODO: put in a screenshot here for what it looks like -->

**Step 2: Note the Agent ID**

Copy the **agt_...** value somewhere handy. You'll confirm it shows up as `act.sub` on the exchanged token later in this module once the M2M client is linked to it (Part B, Step 4).

### Part B: Create the M2M client for OBO token exchange

<!-- TODO: Flow screenshot here - MCP OBO token exchange-->

The OBO exchange takes a token scoped to the MCP API (the user's login audience) and exchanges it for one scoped to the Nexus Backend API.

Becasue it sits between two resources, the M2M client that performs this exchange needs to have access on **both** resource servers: the MCP API it exchanges *from*, and the Backend API it exchanges *into*.

**Step 1: Create the M2M client**

1. Auth0 Dashboard → **Applications → APIs → Nexus MCP Server**
2. Click **Add Application**
5. Name it `docagent-mcp-obo`

**Step 2: Confirm scopes on both APIs**

Creating the client from the Nexus MCP Server's Applications tab authorizes it there automatically.

If yuo want to confirm it also has access on the Nexus Backend API:

- **Nexus MCP Server**: `docagent-mcp-obo` should already be authorized for `chat:send` for **User-delegated Access**.
- **Nexus Backend API**: Auth0 Dashboard → **Applications → APIs → Nexus Backend API → Applications tab**
  - confirm `docagent-mcp-obo` is listed with all four **mcp:\*** scopes granted for **user-delegated access**:
    - `mcp:docs:search`
    - `mcp:docs:read`
    - `mcp:crm:log`
    - `mcp:docs:share`

This shows the scopes a *user's* token *can* carry through this client.

![docagent-mcp-obo API Access tab with all four mcp:* scopes granted](images/01-obo-api-access-scopes.png)

**Step 3: Enable On-Behalf-Of Token Exchange on the client**

This toggle is a security posture choice and must be opted in explicitly. It is not enabled by default.

1. On Auth0 Dashboard → **Applications → Applications → docagent-mcp-obo → Settings**
2. Scroll to the **Token Exchange** section
3. Toggle on **On-Behalf-Of Token Exchange** → **Save**

![Token Exchange section with On-Behalf-Of Token Exchange toggled on](images/01-obo-token-exchange-enabled.png)

**Step 4: Link the M2M client to the agent record**

1. Auth0 Dashboard → **Agents** → **Nexus Agent (DevCamp)** → **Applications** tab
2. Click **Add Application**
3. Select `docagent-mcp-obo` and confirm

<!-- TODO: this step needs a screenshot of the Agent's Applications tab with `docagent-mcp-obo` added. -->

**Step 5: Add the M2M credentials to `.env`**

From the `docagent-mcp-obo` application settings, copy the **Client ID** and **Client Secret**. Open `demo-app/.env` and add:

```
AUTH0_OBO_CLIENT_ID=<client-id-from-dashboard>
AUTH0_OBO_CLIENT_SECRET=<client-secret-from-dashboard>
```

**Step 6: Restart the app**

If the app doesn't auto-refresh, stop the running app (`Ctrl+C`) and restart:

```bash
npm run dev
```

The MCP client is now configured and can perform OBO token exchanges.

> [!CAUTION]
> # **Do not log in yet.** The next modulke walks you through logging in for the first time.

## Code steps

> [!NOTE]
> This code is already implemented in the demo-app. **You are not writing new code in this DevCamp.**

### Agent as Principal claims

The Nexus Backend API opts into agent-aware claims at provisioning time, before you ever create the agent record.

**server/platform/provision.js**:

```js
await createResourceServer(ctx, {
  identifier: BACKEND_API_IDENTIFIER,
  name: "Nexus Backend API",
  scopes: BACKEND_SCOPES,
  rbac: true,
  // Opts this API into agent-aware claims (sub_profile, act.sub = agent_id)
  // once docagent-mcp-obo is linked to an Agent record.
  agentSubjectClaims: true,
});
```

which sets `agent_subject_claims: "auth0-v1"` on the resource server via the Management API. Once `docagent-mcp-obo` is linked to the `Nexus Agent (DevCamp)` record (Part B, Step 4 above), every OBO-exchanged token targeting this API carries the agent's `agent_id` as `act.sub`.

You can see this directly: **server/mcp/server.js** logs the full decoded token payload on every tool call. After completing Part B, Step 4 above, make a tool call and look for the `act` claim in that log line. Its `sub` will equal the `agt_...` value from Part B.

### JWT validation

Every call to `/mcp/tools` and `/mcp/tools/call` runs through `validateMCPToken` first. It checks the token's `aud` claim against the Backend API audience and rejects anything else with a 401, so a token minted for the wrong resource never reaches a tool.

**server/mcp/server.js**:

```js
const validateMCPToken = (req, res, next) => {
  const token = bearerFromHeader(req);
  const payload = token ? decodeUnverified(token) : null;
  let issuer = `https://${process.env.AUTH0_DOMAIN}`;
  let audience = process.env.AUTH0_TOOL_AUDIENCE || "";

  if (payload?.iss) {
    const tenant = tenantResolver.getByDomain(new URL(payload.iss).host);
    if (tenant) {
      issuer = tenant.issuer;
      audience = process.env.AUTH0_TOOL_AUDIENCE || audience;
      req.tenant = tenant;
    }
  }
  return getJwtValidator(issuer, audience)(req, res, next);
};
```

This is the MCP server's own half of the boundary, separate from the OBO exchange below. The client (the agent's backend) exchanges tokens. The server only ever validates them — it never calls out to Auth0 to authorize an inbound request. Publishing its resource identity via PRM and checking the `aud`/scope on what it receives is the whole job.

The server *does* act as its own client for one thing: downstream calls it makes on the user's behalf. The Token Vault exchange behind `log_crm_activity` (see *The agent acts as the employee, not a shared bot*) is the same OBO pattern, one hop further down the chain, with the MCP server now standing in the position the agent's backend holds here.

### Protected Resource Metadata (PRM, RFC 9728)

PRM enables an MCP client that knows only your server URL to discover which authorization server issues tokens for it without any hardcoded configuration.

**server/mcp/metadata.js**:

```js
export function protectedResourceMetadata(_req, res) {
  res.json({
    resource: process.env.AUTH0_TOOL_AUDIENCE,
    authorization_servers: [`https://${process.env.AUTH0_DOMAIN}`],
    scopes_supported: ["mcp:docs:search", "mcp:docs:read", "mcp:crm:log", "mcp:docs:share"],
    bearer_methods_supported: ["header"],
    client_registration_types_supported: ["metadata"],
    resource_documentation: "https://auth0.com/ai",
  });
}
```

### Authorization Server Metadata

**server/mcp/server.js**:

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

### OBO token exchange

The agent's backend holds the user's access token. To call the MCP server, it exchanges that token for one scoped to the Backend API. The user's **sub** is preserved so FGA and Token Vault evaluate identity against the human rather than the agent.

**server/mcp/client.js**:

```js
body: JSON.stringify({
  grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
  subject_token: userAccessToken,
  subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
  requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
  audience: cfg.audience,
  scope: "mcp:docs:search mcp:docs:read mcp:crm:log mcp:docs:share",
  client_id: cfg.clientId,         // M2M confidential client (opaque UUID)
  client_secret: cfg.clientSecret, // M2M client secret
}),
```

The `client_id` here is the M2M app's opaque UUID, the confidential exchanger you created. The agent record's `agent_id` is the agent's *durable identity*; the M2M client is its *exchange credential*, now linked to that identity. Both are necessary and serve different roles.

### Route the agent's tool calls through MCP

**server/llm.js**, before triggering, all tools route through **executeTool**:

```js
import { executeTool } from "./tools/registry.js";

// inside processMessage, after the CIBA gate (explained in Module 04):
result = await executeTool(toolName, parameters, user.accessToken);
```

**executeTool** calls **mcpClient.callTool**, which calls **getToken** (the OBO exchange) before every MCP request.

## Checkpoint

<!-- TODO: screenshot - Run Checks panel with all conditions passing (reused UI, first appearance) -->

Use the **Run Checks** button on the left of the Nexus app page. The in-app verifier confirms these conditions automatically:

- An agent named **Nexus Agent (DevCamp)** exists and is linked (`agent_id`) to `docagent-mcp-obo`.
- The Nexus Backend API has **agent_subject_claims** set to `"auth0-v1"`.
- The Protected Resource Metadata endpoint returns **resource**, **authorization_servers**, and **scopes_supported**.
- The AS Metadata endpoint returns **issuer**, **token_endpoint**, the four scopes, and **"metadata"** in **client_registration_types_supported**.
- An unauthenticated **GET /mcp/tools** returns **401** with a **WWW-Authenticate** header.
- The On-Behalf-Of Token Exchange toggle is active on your M2M client, and it holds a user-delegated grant on the Nexus Backend API.

> [!TIP]
> If a check fails, the result row shows the exact reason. Fix the flagged item and click **Re-run checks**.


<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    What we learned
  </summary>

Every tool call now leaves the agent runtime, crosses a bearer-authenticated boundary, and is evaluated against the user's actual identity on a resource server that enforces scope. The trust boundary moves from the agent backend to the MCP server. That same boundary is where FGA and Token Vault plug in later. This module builds the identity pipe they both depend on, but doesn't wire either one up yet.

The two sides of that boundary have different jobs, and it's worth naming them separately:
- **The MCP server (resource server) publishes and validates.** It advertises its resource identity and required scopes via PRM, then checks every incoming token's `aud` and scope. It never initiates a token exchange to authorize a caller.
- **The agent's backend (client) exchanges.** Before it can call a tool, it exchanges the user's token for one scoped to the MCP server's Backend API audience. That's the OBO exchange in `server/mcp/client.js`.

Concretely, you just walked through the full A4AA "Auth for MCP" pattern:

- **Agent as Principal: durable agent identity.** The agent record gives the agent an `agent_id` that survives M2M client credential rotation. It shows up as `act.sub` on every OBO-exchanged token once the client is linked, and as `event.agent` in Actions at token-issuance time, giving you a real identity to key audit and policy off of, rather than a proxy for "whichever client happened to authenticate." Multi-hop delegation preserves this through nested `act` claims.
- **M2M client: confidential OBO exchanger.** The M2M client is authorized against both the MCP API and the Backend API, and performs token exchanges with its own credentials. The issued token preserves the **sub** from the user's token, so FGA and Token Vault evaluate identity against the human rather than the agent — and now also carries the agent's `agent_id` alongside it.
- **Discovery without config.** RFC 9728 PRM and RFC 8414 AS metadata let a new MCP client point at your server URL and resolve the issuer, scopes, and grant types on its own.
- **Graceful step-up.** **403 insufficient_scope** tells the client exactly which scope is missing, so the next OBO exchange can request it and retry.

Why this matters beyond the lab:

- **Opex.** Multiple agents (Claude Agent SDK, custom runtime, a future mobile client) inherit one authorization engine from one MCP server. You eliminate the burden of maintaining separate auth logic across each client.
- **GTM.** A resource server with PRM, scope enforcement, a durable agent identity, and a verified M2M exchanger is what a procurement team wants to see in the security questionnaire. It shortens the review cycle from months to weeks.

</details>

---

<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    Further reading
  </summary>

- Agent as Principal (Early Access): [auth0.com/docs/ai-agents-mcp/agent-as-principal](https://auth0.com/docs/ai-agents-mcp/agent-as-principal)
- Auth for AI Agents product overview: [auth0.com/ai](https://auth0.com/ai)
- MCP authorization spec (2025-11-25): [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)
- RFC 9728 Protected Resource Metadata, RFC 8414 AS Metadata, RFC 8693 Token Exchange, RFC 8707 Resource Indicators

</details>

---

#### <span style="font-variant: small-caps">Congrats!</span>

*You've completed this module.*

You've successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      Registered the agent as a first-class Auth0 identity and linked it to the M2M client;
  </li>
  <li style="list-style-type:'✅ '">
      Created an M2M confidential client authorized it on the Backend API, and enabled Token Exchange;
  </li>
  <li style="list-style-type:'✅ '">
      Understood how CIMD and PRM discovery documents enable zero-config client integration;
  </li>
  <li style="list-style-type:'✅ '">
      Confirmed OBO token exchange preserves the user's <b>sub</b> all the way to tool execution.
  </li>
</ul>

The MCP server now has a trust boundary. 

It validates every caller and scopes every tool call to a resource and an identity. 

The next module onboards a second agent, a third party's this time, through the real-world trust path: a self-published discovery document and a manual admin review.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>




