# Nexus (A4AA): demo.okta.com deploy

This is the Nexus devcamp lab's application code, repackaged so a single deployment serves many demos on **demo.okta.com**. Creating a demo instance auto-provisions the entire Auth0 footprint through lifecycle hooks, and the running app pulls its per-tenant config at runtime. This is the only living copy of the app — there is no separate starter/solution tree; participants read [`../lab-guide/`](../lab-guide/) and inspect this codebase directly.

The business case is straightforward: one running image with zero manual dashboard setup per demo removes per-demo provisioning overhead and lets an SE spin up a fully-configured Nexus demo in minutes rather than an afternoon, reducing operational costs and accelerating go-to-market directly.

An earlier local-dev iteration of this workshop (separate `starter/`/`solution/` trees under a different use case) has been retired to [`../archives/`](../archives/) and is no longer maintained.

## Multi-tenant design

| Concern | Behavior |
|---|---|
| Tenancy | Multi-tenant by subdomain, one deployment serves many demos |
| Frontend Auth0 config | Fetched at runtime from `GET /api/config` per tenant |
| API + MCP JWT validation | Per-tenant validator selected from the resolved issuer + audience |
| Auth0 objects | Auto-provisioned by the CREATE hook |
| CIBA / FGA / Token Vault | Live Auth0 when provisioned, in-memory simulation as fallback |
| Serving | `npm run dev` locally; `build` + `start` and a Dockerfile for single-host production serving |

## Architecture

### Tenant resolution and runtime config

```
Browser (https://nexus-demo.your-host)
   │  GET /api/config
   ▼
Express  ── tenantResolver.middleware() ──► extract "nexus-demo" from subdomain
   │                                          │
   │                                          ▼
   │                         GET {DEMO_API_ENDPOINT}/bootstrap/{DEMO_API_APP_ID}/nexus-demo
   │                                          │  (service token via DEMO_API_* creds)
   │                                          ▼
   │                         Tenant { issuer, clientId, deploymentData{...} }  (cached, TTL)
   ▼
/api/config → { domain, clientId, audience }  ► SPA initializes Auth0 for this tenant
```

The SPA fetches `/api/config` on mount (`src/config/runtimeConfig.jsx`) and gates render until it returns, so the same static build initializes Auth0 correctly on every subdomain. The backend and MCP JWT validators are factories keyed on `(issuer, audience)`, and the MCP client resolves its M2M creds and MCP audience from the token's `iss` claim. Nothing is hard-wired to a single tenant.

### Demo platform integration: the hooks

`server/platform/hooks.js` mounts four lifecycle endpoints (registered at `server/index.js` via `app.use(hooksRouter)`):

| Hook | Method + path | Responsibility |
|---|---|---|
| Request | `POST /hooks/request` | Pre-create validation, returns 200 |
| Create | `POST /hooks/create` | Responds 200 immediately, then provisions the Auth0 footprint async and PATCHes `event.callback` with `{ state: "finish", deploymentData }` (or `{ state: "fail" }`) |
| Update | `POST /hooks/update` | Drops the cached tenant so changed settings take effect on next request |
| Destroy | `POST /hooks/destroy` | Best-effort teardown of every provisioned object, then drops the cache |

**What CREATE provisions per tenant** (using `idp.management_credentials` from the customer-identity IDP to get an Auth0 Management API token):

1. **Resource servers**: `https://devcamp-docagent-api` (RBAC on) and `https://devcamp-mcp-server` with scopes `mcp:docs:search`, `mcp:docs:read`, `mcp:crm:log`, `mcp:docs:share`.
2. **M2M client**: Non-interactive app with `client_credentials` and token-exchange grants, granted to the MCP API. This powers the on-behalf-of token exchange in Module 01.
3. **SPA reconfigure**: Sets callbacks, logout URLs, and web origins on the platform-created OIDC app to `https://{demo}.{base}`.
4. **CIBA client**: Regular web app with the `urn:openid:params:grant-type:ciba` grant, granted to the backend API (Module 04).
5. **CRM connection**: A federated OAuth2 connection pointing at the CRM mock (Module 03), created when CRM OAuth credentials are supplied as settings.
6. **FGA store + model**: A per-demo Auth0/Okta FGA store with the document authorization model written (Module 05), created only when FGA credentials are supplied.

Every id, secret, audience, store id, and connection name is assembled into `deploymentData` and PATCHed back to the platform. At runtime the resolver bootstraps that `deploymentData` and the live FGA, Token Vault, and CIBA modules read from it.

Each optional step is wrapped in a `safe()` helper, so a missing upstream credential logs a warning and falls back to simulation rather than aborting the entire creation process.

### Prerequisites the hook cannot auto-create

The CREATE hook generates everything that lives inside Auth0. Three dependencies live outside it and must be supplied as **demo component settings** (or env for local runs):

- **FGA credentials**: Auth0/Okta FGA is a separate product and API (`*.fga.dev`), not the Auth0 Management API. Supply `FGA_API_URL`, `FGA_API_AUDIENCE`, `FGA_API_TOKEN_ISSUER`, `FGA_CLIENT_ID`, `FGA_CLIENT_SECRET` so the hook can create a per-demo store.
- **CRM OAuth app**: A real upstream OAuth2 registration for the CRM connection. Supply `CRM_CLIENT_ID` and `CRM_CLIENT_SECRET` so the hook can create the federated connection.
- **CIBA Guardian enrollment**: The client and grant are provisioned automatically, but the test employee enrolling a push device remains a manual runtime step.

Also verify the demo tenant has the **token exchange** feature enabled, since Module 01 OBO depends on it.

## Repository layout

```
demo-app/
├── README.md                     ← you are here
├── Dockerfile                    ← single-host production image
├── .env.sample                   ← all platform + local vars, documented
├── package.json                  ← dev / build / start scripts
│
├── scripts/
│   ├── find-port.js              ← auto-selects free ports at startup
│   ├── test-hooks.js             ← manual hook payload tester
│   └── test-provision.js         ← manual provisioning smoke test
│
├── server/
│   ├── index.js                  ← API :3000, mounts hooks + tenant middleware + /api/config + static SPA
│   ├── llm.js                    ← OpenAI tool-calling loop, tenant-threaded
│   ├── simulator.js              ← pattern-matching fallback when no API key
│   │
│   ├── platform/                 ← demo.okta.com integration
│   │   ├── hooks.js              ← request / create / update / destroy lifecycle
│   │   ├── auth0Management.js    ← Management API helpers (resource servers, clients, grants, connections)
│   │   ├── fgaProvision.js       ← per-demo FGA store + model creation
│   │   ├── provision.js          ← single-tenant provisioning (non-platform path)
│   │   ├── tenant.js             ← Tenant model + deploymentData shape
│   │   ├── tenantResolver.js     ← subdomain → bootstrap → cached Tenant, Express middleware
│   │   └── jwt.js                ← per-(issuer,audience) JWT validator cache + token decode helpers
│   │
│   ├── middleware/
│   │   ├── auth.js               ← [Module 02] per-tenant JWT validation
│   │   ├── agent-auth.js         ← [Module 01] MCP bearer token validation
│   │   └── ciba.js               ← [Module 04] live /bc-authorize + poll, simulation fallback
│   │
│   ├── fga/
│   │   ├── model.js              ← [Module 05] document relationship model (sim) + FGA_AUTH_MODEL (live)
│   │   └── client.js             ← [Module 05] live OpenFGA checks, simulation fallback
│   │
│   ├── token-vault/
│   │   └── vault.js              ← [Module 03] live federated CRM token exchange, simulation fallback
│   │
│   ├── crm/
│   │   └── app.js                ← mock CRM OAuth2 server + activities API (:3002)
│   │
│   ├── mcp/
│   │   ├── server.js             ← [Module 01] MCP server :3001, per-tenant token validation + scope enforcement
│   │   ├── client.js             ← [Module 01] OBO token exchange, per-tenant M2M creds from token iss
│   │   ├── cimd.js               ← [Module 01] Client ID Metadata Document endpoint
│   │   ├── metadata.js           ← [Module 01] PRM (RFC 9728) + AS metadata (RFC 8414)
│   │   └── toolLog.js            ← structured tool call event log (streamed to the UI)
│   │
│   ├── tools/
│   │   └── registry.js           ← framework-agnostic tool definitions shared by llm.js + simulator.js
│   │
│   ├── utils/
│   │   └── port.js               ← port resolution helper
│   │
│   └── routes/guide.js           ← serves the in-app lab guide markdown
│
└── src/                          ← React frontend (Vite + JS)
    ├── App.jsx                   ← auth gate, layout shell, setup orchestration
    ├── main.jsx                  ← RuntimeConfigProvider → Auth0Provider → App
    ├── config/runtimeConfig.jsx  ← fetches /api/config, gates render
    ├── auth/Auth0Provider.jsx    ← consumes runtime config (no VITE_AUTH0_* at build time)
    ├── components/
    │   ├── Chat.jsx              ← chat surface
    │   ├── Message.jsx           ← user / assistant message bubbles
    │   ├── ToolApproval.jsx      ← CIBA binding-message approval card
    │   ├── ToolLogs.jsx          ← live tool call event panel
    │   ├── ToolTester.jsx        ← manual tool testing UI
    │   ├── MCPStatus.jsx         ← MCP server connection status indicator
    │   ├── LabGuide.jsx          ← in-app lab guide viewer
    │   ├── LoginScreen.jsx       ← pre-auth landing screen
    │   ├── SetupBanner.jsx       ← environment variable setup screen
    │   └── ProvisionPanel.jsx    ← Auth0 resource provisioning screen
    └── hooks/useChat.js          ← chat state + CIBA polling, uses runtime audience
```

## Running

### Local single-tenant (no platform)

Leave `DEMO_API_*` unset and fill the `AUTH0_*` values in `.env`. The resolver detects that the platform is disabled and the app falls back to environment-based configuration.

```bash
cp .env.sample .env
# fill in AUTH0_DOMAIN, AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET
npm install
npm run dev
```

`npm run dev` boots Vite (frontend) plus the Express API on :3000, the MCP server on :3001, and the CRM mock on :3002. Without an `OPENAI_API_KEY` the agent uses the deterministic pattern-matching simulator.

### Multi-tenant on demo.okta.com

1. Register the component in demo.okta.com (Library → Component, type Application). Point its hooks at `{base}/hooks/{request,create,update,destroy}`, require a **Customer Identity** IDP, and mark it **multi-tenant aware**.
2. Add the external prerequisites as component settings: FGA credentials, CRM OAuth credentials, and `OPENAI_API_KEY` if you want real LLM responses.
3. Set the platform service vars in the deployment env: `BASE_URI`, `DEMO_API_APP_ID`, `DEMO_API_CLIENT_ID`, `DEMO_API_CLIENT_SECRET`, `DEMO_API_ENDPOINT`, `DEMO_API_TOKEN_ENDPOINT`, `DEMO_API_AUDIENCE`.
4. Build and serve as one host (see Production below).

Creating a demo triggers the CREATE hook, which provisions the Auth0 footprint and reports `deploymentData` back to the platform. Launching the demo serves the SPA on the demo subdomain, which bootstraps its configuration from `/api/config`.

### Environment variables

Every variable is documented in [`.env.sample`](./.env.sample). The short version:

| Group | Vars |
|---|---|
| Ports | `PORT`, `MCP_SERVER_PORT`, `THIRD_PARTY_API_PORT` |
| Platform (multi-tenant) | `BASE_URI`, `DEMO_API_APP_ID`, `DEMO_API_CLIENT_ID`, `DEMO_API_CLIENT_SECRET`, `DEMO_API_ENDPOINT`, `DEMO_API_TOKEN_ENDPOINT`, `DEMO_API_AUDIENCE`, `TENANT_TTL_MS` |
| Resource servers | `BACKEND_API_IDENTIFIER`, `MCP_API_IDENTIFIER` |
| Local Auth0 (single-tenant) | `AUTH0_DOMAIN`, `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET`, `AUTH0_AUDIENCE`, `MCP_AUTH0_AUDIENCE`, `AUTH0_OBO_CLIENT_ID`, `AUTH0_OBO_CLIENT_SECRET`, `AUTH0_CIBA_CLIENT_ID`, `AUTH0_CIBA_CLIENT_SECRET` |
| FGA (Module 05) | `FGA_API_URL`, `FGA_API_AUDIENCE`, `FGA_API_TOKEN_ISSUER`, `FGA_CLIENT_ID`, `FGA_CLIENT_SECRET` |
| CRM connection (Module 03) | `CRM_CLIENT_ID`, `CRM_CLIENT_SECRET` |
| LLM | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL` |

`.env*` is gitignored; only `.env.sample` is tracked. Note that `deploymentData` carries secrets (M2M secret, FGA credentials), which is acceptable for the demo platform but important to understand.

## What's live vs. simulated

This deployment runs each previously-simulated module against real Auth0 when the tenant carries the matching provisioned configuration, and gracefully falls back to in-memory simulation otherwise so the app continues to run offline.

| Component | Live when... | Fallback |
|---|---|---|
| Auth0 login, JWT validation, OBO token exchange | Always (real) | n/a |
| FGA | Tenant has `fga_store_id` + credentials | In-memory document tuples |
| Token Vault | Tenant has a CRM federated connection + employee access token | In-memory mint + refresh |
| CIBA | Tenant has `ciba_client_id` | In-memory approve/deny via `/api/ciba/*` |
| CRM API | Mocked on :3002 | same |
| LLM | `OPENAI_API_KEY` set | Pattern-matching simulator |

## Production and Docker

```bash
npm run build      # vite build → dist/
npm run start      # serves dist/ + /api + MCP + CRM mock on one host
```

When `dist/` exists, `server/index.js` serves the static SPA with a fallback that excludes `/api` and `/hooks`. The MCP server and CRM mock run on internal localhost ports within the same process; the OBO token audience isolates tenants regardless of port.

The multi-stage `Dockerfile` builds the SPA and runs the server via `node`:

```bash
docker build -t nexus-a4aa .
docker run -p 3000:3000 --env-file .env nexus-a4aa
```

## Verifying the integration

1. **Local hook test**: Set `DEMO_API_*`, POST a sample CREATE payload to `/hooks/create`, and confirm the Management API objects are created and the callback PATCH carries a complete `deploymentData`.
2. **Runtime config**: Hit `GET /api/config` for a demo subdomain and confirm it returns that tenant's `domain`, `clientId`, and `audience`.
3. **End-to-end**: Create a demo on demo.okta.com, launch it, then verify login (SPA), `/api/chat` JWT validation, MCP OBO exchange (Module 01), FGA allow/deny (Module 05), a Token Vault CRM call (Module 03), and CIBA approve/deny (Module 04).
4. **Lifecycle**: Trigger UPDATE (cache clears, new settings apply) and DESTROY (provisioned objects removed).

## Further reading

- [`../README.md`](../README.md) — workshop overview and the five modules
- [`../lab-guide/`](../lab-guide/) — step-by-step participant guides
- [Auth0 for AI Agents](https://auth0.com/ai)
- RFC 9728 (Protected Resource Metadata), RFC 8414 (AS Metadata), RFC 8693 (Token Exchange), RFC 8707 (Resource Indicators)
