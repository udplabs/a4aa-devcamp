## Objective *(~20 min)*

This module wires the mechanism that makes everything else possible. Here's what you'll do:
- Register Nexus's MCP server as an Auth0 resource
- Give the first-party Nexus agent the two things it needs to call tools on behalf of users
  - The first is a durable, first-class identity via **Agent as Principal** — an Auth0 agent record with its own `agent_id`
  - The second is a confidential M2M client, linked to that agent, that performs the OBO token exchange

Once both items are in place, every tool call carries the employee's **sub** *and* the agent's **agent_id** (as `act.sub`) all the way to tool execution. That gives Token Vault, CIBA, and FGA the identity they need to enforce policy, and gives you an agent identity that survives client credential rotation.

By the end, you'll understand:

- How JWT validation protects the MCP server on port 3001.
- How `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414) enable zero-config client discovery.
- What Agent as Principal is and why a durable `agent_id` is better than treating an M2M client's own credentials as the agent's identity.
- How the M2M confidential client performs OBO token exchange, preserving the user's **sub** through the agent boundary while carrying the agent's `agent_id` as `act.sub`.
- How a distinct scope per tool enforces least-privilege and enables **WWW-Authenticate** step-up hints for clients.

<br>

<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    Why we're building this
  </summary>

Without a defined trust boundary, every agent runtime connecting to your MCP server becomes an implicit authorization decision made by whoever wrote the agent, not by your platform. A new agent framework means a new security review. A compromised client has no scope boundary. And an audit log entry that says "agent called tool" tells you nothing about which employee was responsible, or which agent was acting.

The commercial consequence is direct. Agent-as-Principal identity and PRM/AS discovery (Protected Resource Metadata and Authorization Server Metadata, covered later in this module) let a client discover and connect to your server on its own. That safely opens your MCP server to trusted partners without custom onboarding on either side—so you reach new customers and revenue through standardization, not one-off integration friction.

The trust boundary is standardized to a spec rather than hardcoded to one agent framework. You ship a new runtime or model without rearchitecting security, so you're never trapped by today's choices as the ecosystem moves. An agent carries a distinct, auditable, and revocable identity — its `agent_id` — independent of the M2M client credentials that happen to authenticate it today. A compromised or forged client becomes a contained incident on one identity's permissions rather than a lateral movement vector across your whole platform.

</details>

<br>

<details>
  <summary style='font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  user-select: none;'>
    Premise
  </summary>


The first-party Nexus agent connects with a durable identity via Agent as Principal and uses an M2M client, linked to that agent record, to exchange user tokens for MCP-scoped tokens.

Third-party integrations discover the server through PRM and AS metadata and connect without any configuration on their side.

All of them must present a valid token, and when they do, OBO token exchange carries the employee's identity through the agent boundary to every tool call downstream — and now also carries the agent's own `agent_id` as `act.sub`.

**MCP (Model Context Protocol)** is a standard surface for advertising tools. With Auth0 in front of it, every tool call is bearer-authenticated against a resource server that enforces FGA, Token Vault, and scope checks.

**The agent is simply a client.** You can swap it, add a second one, or run Claude Agent SDK alongside a custom loop, while the guardrails live permanently on the MCP server regardless of which agent you connect.

> [!NOTE]
> Auth0's **Auth for MCP** went GA on April 29, 2026 as part of the Auth for AI Agents (A4AA) product line.
>
> It follows the MCP authorization spec (revision 2025-11-25) and layers it on top of OAuth 2.1 so any conformant MCP client can discover and call your tools with the user's actual identity.
>
> Product overview: [auth0.com/ai](https://auth0.com/ai).

> [!IMPORTANT]
> **Agent as Principal is an Early Access feature** ([auth0.com/docs/ai-agents-mcp/agent-as-principal](https://auth0.com/docs/ai-agents-mcp/agent-as-principal)). It may not be enabled on your lab tenant by default — if the **Agents** section isn't visible in your Dashboard, contact your lab facilitator or Auth0 Support to have it enabled.
>
> If it isn't available in your session, skip Part B below and go straight to Part C. The rest of the module — OBO token exchange, PRM/AS discovery, per-tool scope enforcement — works exactly the same without it. You'll simply be missing the `act.sub`/`sub_profile` claims on the exchanged token and the second verification check.

</details>

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

The Provision Resources section already registered the MCP API and Backend API resource servers for you.

Your tenant already has:

- **The MCP API (resource server)**: `https://devcamp-mcp-server` (RS256), with one coarse scope, `chat:send`, which proves the user can access the Nexus chat interface.
- **The Nexus Backend API (resource server)**: `https://devcamp-docagent-api` (RS256), with the four fine-grained per-tool scopes the OBO exchange targets:
  - `mcp:docs:search`: search the document knowledge base
  - `mcp:docs:read`: retrieve a specific document
  - `mcp:crm:log`: log activity to the CRM via Token Vault
  - `mcp:docs:share`: share a document externally (CIBA-gated)

- **The Nexus SPA application**: your browser app for user login, already configured for your Codespace URL.

The Nexus Backend API was also provisioned with `agent_subject_claims` set to `"auth0-v1"`, opting it into `sub_profile`/`act.sub` claims automatically once the M2M client below is linked to an agent record. There's nothing to toggle for this — it's already set.

**Two things aren't provisioned for you.** You create both manually in this module. Your only manual Dashboard steps are below.

## Dashboard steps

> [!NOTE]
> **Two things, two purposes:**
> - **Agent record (Agent as Principal)**: the agent's durable Auth0 identity, a first-class object with its own `agent_id`. This identity is what shows up in the exchanged token's `act.sub` claim and in Auth0 logs — independent of whichever M2M client happens to authenticate it.
> - **M2M confidential app**: performs the actual OBO token exchange server-side. It is authorized against both the MCP API (the audience it exchanges from) and the Nexus Backend API (the audience it exchanges into, where the four per-tool scopes live). Once linked to the agent record, its exchanged tokens carry the agent's `agent_id`.

### Part B: Register the agent as a first-class Auth0 identity

> [!IMPORTANT]
> **Agent as Principal is an Early Access feature.** If you don't see an **Agents** item in the Dashboard's left nav, it isn't enabled on your lab tenant. Skip this Part and go straight to **Part C** — the rest of the module works identically, you'll just be missing the `act.sub`/`sub_profile` claims and the second verification check below.

**Step 1: Create the agent record**

1. Auth0 Dashboard → **Agents** → **Create New Agent**
2. Name it exactly `Nexus Agent (DevCamp)` — the in-app verifier looks this up by name
3. Click **Create**

*You should see: the new agent record with a generated **Agent ID** in the form `agt_...`.*

> [!NOTE]
> Screenshot placeholders: this section needs new screenshots from a live Early-Access tenant (Agents list, Create Agent form, and the created agent's detail view). None are included yet.

**Step 2: Note the Agent ID**

Copy the **agt_...** value somewhere handy — you'll confirm it shows up as `act.sub` on the exchanged token later in this module, once the M2M client is linked to it in Part C.

### Part C: Create the M2M client for OBO token exchange

The OBO exchange takes a token scoped to the MCP API (the user's login audience) and exchanges it for one scoped to the Nexus Backend API (where the four per-tool scopes live).

The client that performs this exchange needs to have access on **both** resource servers: the MCP API it exchanges *from*, and the Backend API it exchanges *into*.

**Step 1: Create the M2M client**

1. Auth0 Dashboard → **Applications → APIs → Nexus MCP Server**
2. Click **Add Application**
3. Name it `docagent-mcp-obo`

**Step 2: Confirm scopes on both APIs**

Creating the client from the Nexus MCP Server's Applications tab authorizes it there automatically.

You can confirm it also has access on the Nexus Backend API, since that's the API that actually holds the four per-tool scopes the OBO exchange targets:

- **Nexus MCP Server**: `docagent-mcp-obo` should already be authorized for `chat:send` for **User-delegated Access**.
- **Nexus Backend API**: Auth0 Dashboard → **Applications → APIs → Nexus Backend API → Applications tab**
  - confirm `docagent-mcp-obo` is listed with all four **mcp:\*** scopes granted for **user-delegated access**:
    - `mcp:docs:search`
    - `mcp:docs:read`
    - `mcp:crm:log`
    - `mcp:docs:share`

This shows the scopes a *user's* token can carry through this client, as opposed to scopes the client would use to act as itself.

Both APIs default to Application Access Policy "All apps allowed," so every scope is granted automatically the moment the client exists. There's nothing to individually toggle yet.

*Verify: `docagent-mcp-obo` is listed in the Applications tab of both APIs, with its scopes granted on each.*

![docagent-mcp-obo API Access tab with all four mcp:* scopes granted](images/01-obo-api-access-scopes.png)

> [!IMPORTANT]
> **Enable On-Behalf-Of Token Exchange**
>
> This toggle is a security posture choice and must be opted in explicitly. It is not enabled by default.
>
> 1. On Auth0 Dashboard → **Applications → Applications → docagent-mcp-obo → Settings**
> 2. Scroll to the **Token Exchange** section
>
> *You should see: the Token Exchange section with the On-Behalf-Of toggle off.*
>
> 3. Toggle on **On-Behalf-Of Token Exchange** → **Save**
>
> ![Token Exchange section with On-Behalf-Of Token Exchange toggled on](images/01-obo-token-exchange-enabled.png)
>
> Until this is enabled, the OBO exchange returns a **403** and every tool call will fail.

**Step 3: Link the M2M client to the agent record**

*Skip this step if you skipped Part B (Early Access not enabled on your tenant).*

1. Auth0 Dashboard → **Agents** → **Nexus Agent (DevCamp)** → **Applications** tab
2. Click **Add Application**
3. Select `docagent-mcp-obo` and confirm

*You should see: `docagent-mcp-obo` listed under the agent's Applications tab. Under the hood this is a `PATCH /api/v2/clients/{id}` call setting `agent_id` to the agent's `agt_...` value.*

> [!NOTE]
> Screenshot placeholder: this step needs a screenshot of the Agent's Applications tab with `docagent-mcp-obo` added.

**Step 4: Add the M2M credentials to `.env`**

From the `docagent-mcp-obo` application settings, copy the **Client ID** and **Client Secret**. Open `demo-app/.env` and add:

```
AUTH0_OBO_CLIENT_ID=<client-id-from-dashboard>
AUTH0_OBO_CLIENT_SECRET=<client-secret-from-dashboard>
```

**Step 5: Restart the app**

If the app doesn't auto-refresh, stop the running app (`Ctrl+C`) and restart:

```bash
npm run dev
```

The MCP client is now configured and can perform OBO token exchanges.

> [!CAUTION]
> **Do not log in yet.** *Every agent action has an owner* walks you through logging in for the first time.

## Code steps

> [!NOTE]
> This code is already implemented in the demo-app. The steps below are a structured walk-through. Open each file in your editor as you go. **You are not writing new code in this module.**

### Part B: Agent as Principal claims

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

which sets `agent_subject_claims: "auth0-v1"` on the resource server via the Management API. Once `docagent-mcp-obo` is linked to the `Nexus Agent (DevCamp)` record (Part C above), every OBO-exchanged token targeting this API carries the agent's `agent_id` as `act.sub`.

You can see this directly: **server/mcp/server.js** logs the full decoded token payload on every tool call. After completing Part C above, make a tool call and look for the `act` claim in that log line — its `sub` will equal the `agt_...` value from Part B.

### Part C: Protected Resource Metadata (PRM, RFC 9728)

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

### Part D: Authorization Server Metadata

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

### Part E: OBO token exchange

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

### Part E: route the agent's tool calls through MCP

**server/llm.js**, before triggering, all tools route through **executeTool**:

```js
import { executeTool } from "./tools/registry.js";

// inside processMessage, after the CIBA gate (explained in Module 04):
result = await executeTool(toolName, parameters, user.accessToken);
```

**executeTool** calls **mcpClient.callTool**, which calls **getToken** (the OBO exchange) before every MCP request.

## Checkpoint

Use the **Run Checks** button on the left of the Nexus app page. The in-app verifier confirms these conditions automatically:

- An agent named **Nexus Agent (DevCamp)** exists and is linked (`agent_id`) to `docagent-mcp-obo`. *(Skipped/failing if Agent as Principal isn't enabled on your tenant — see the Early Access note in Part B.)*
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

Every tool call now leaves the agent runtime, crosses a bearer-authenticated boundary, and is evaluated against the user's actual identity on a resource server that enforces scope. The trust boundary moves from the agent backend to the MCP server. That same boundary is where FGA and Token Vault plug in later. This module builds the identity pipe they both depend on, but doesn't wire either one up yet. Concretely, you just walked through the full A4AA "Auth for MCP" pattern:

- **Agent as Principal: durable agent identity.** The agent record gives the agent an `agent_id` that survives M2M client credential rotation. It shows up as `act.sub` on every OBO-exchanged token once the client is linked, and as `event.agent` in Actions at token-issuance time, giving you a real identity to key audit and policy off of, rather than a proxy for "whichever client happened to authenticate." Multi-hop delegation preserves this through nested `act` claims.
- **M2M client: confidential OBO exchanger.** The M2M client is authorized against both the MCP API and the Backend API, and performs token exchanges with its own credentials. The issued token preserves the **sub** from the user's token, so FGA and Token Vault evaluate identity against the human rather than the agent — and now also carries the agent's `agent_id` alongside it.
- **Discovery without config.** RFC 9728 PRM and RFC 8414 AS metadata let a new MCP client point at your server URL and resolve the issuer, scopes, and grant types on its own.
- **Graceful step-up.** **403 insufficient_scope** tells the client exactly which scope is missing, so the next OBO exchange can request it and retry.

Why this matters beyond the lab:

- **Opex.** Multiple agents (Claude Agent SDK, custom runtime, a future mobile client) inherit one authorization engine from one MCP server. You eliminate the burden of maintaining separate auth logic across each client.
- **GTM.** A resource server with PRM, scope enforcement, a durable agent identity, and a verified M2M exchanger is what a procurement team wants to see in the security questionnaire. It shortens the review cycle from months to weeks.

</details>

### Further reading

- Agent as Principal (Early Access): [auth0.com/docs/ai-agents-mcp/agent-as-principal](https://auth0.com/docs/ai-agents-mcp/agent-as-principal)
- Auth for AI Agents product overview: [auth0.com/ai](https://auth0.com/ai)
- MCP authorization spec (2025-11-25): [modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)
- RFC 9728 Protected Resource Metadata, RFC 8414 AS Metadata, RFC 8693 Token Exchange, RFC 8707 Resource Indicators

#### <span style="font-variant: small-caps">Congrats!</span>

*You've completed this module.*

You've successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      Registered the agent as a first-class Auth0 identity (Agent as Principal) and linked it to the M2M client;
  </li>
  <li style="list-style-type:'✅ '">
      Created an M2M confidential client from the MCP API resource server screen, authorized it on the Backend API, and enabled Token Exchange;
  </li>
  <li style="list-style-type:'✅ '">
      Understood how RFC 9728 and RFC 8414 discovery documents enable zero-config client integration;
  </li>
  <li style="list-style-type:'✅ '">
      Confirmed OBO token exchange preserves the user's <b>sub</b> all the way to tool execution.
  </li>
</ul>

The MCP server now has a trust boundary: it validates every caller and scopes every tool call to a resource and an identity. The next step is making sure that identity belongs to a verified employee, not just a token. *Every agent action has an owner* wires that up.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>




