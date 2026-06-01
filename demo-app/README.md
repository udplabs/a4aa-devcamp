# Z-Merchant (A4AA) — demo.okta.com deploy

> Note: this README uses no em dashes by house style.

This is the **platform-integrated deploy copy** of the RetailZero Z-Merchant lab. It is the same six-lab Auth0 for AI Agents app as [`../solution/`](../solution/), repackaged so a single deployment serves many demos on **demo.okta.com**. Creating a demo instance auto-provisions the entire Auth0 footprint through lifecycle hooks, and the running app pulls its per-tenant config at runtime.

The business case is simple: one running image, zero manual dashboard setup per demo. That removes the per-demo provisioning toil (operational expense) and lets an SE spin up a fully-wired demo in minutes instead of an afternoon (go-to-market speed).

`../solution/` and `../starter/` are unchanged. Work here only when you are deploying to the demo platform.

## How this differs from `solution/`

| Concern | `solution/` | `demo-app/` (this copy) |
|---|---|---|
| Tenancy | Single tenant, one `.env` | Multi-tenant by subdomain, one deployment serves many demos |
| Frontend Auth0 config | Baked at Vite build time (`VITE_AUTH0_*`) | Fetched at runtime from `GET /api/config` per tenant |
| API + MCP JWT validation | Built once at module load | Per-tenant validator selected from the resolved issuer + audience |
| Auth0 objects | Created by hand in the dashboard | Auto-provisioned by the CREATE hook |
| CIBA / FGA / Token Vault | Simulated in memory | Live Auth0 when provisioned, simulation as fallback |
| Serving | `npm run dev` only | Adds `build` + `start` and a Dockerfile for single-host serving |

## Architecture

### Tenant resolution and runtime config

```
Browser (https://acme-demo.your-host)
   │  GET /api/config
   ▼
Express  ── tenantResolver.middleware() ──► extract "acme-demo" from subdomain
   │                                          │
   │                                          ▼
   │                         GET {DEMO_API_ENDPOINT}/bootstrap/{DEMO_API_APP_ID}/acme-demo
   │                                          │  (service token via DEMO_API_* creds)
   │                                          ▼
   │                         Tenant { issuer, clientId, deploymentData{...} }  (cached, TTL)
   ▼
/api/config → { domain, clientId, audience }  ► SPA initializes Auth0 for this tenant
```

The SPA fetches `/api/config` on mount (`src/config/runtimeConfig.tsx`) and gates render until it returns, so the same static build initializes Auth0 correctly on every subdomain. The backend and MCP JWT validators are factories keyed on `(issuer, audience)`, and the MCP client resolves its M2M creds + MCP audience from the token's `iss` claim. Nothing is hard-wired to a single tenant.

### Demo platform integration: the hooks

`server/platform/hooks.ts` mounts four lifecycle endpoints (registered at `server/index.ts` via `app.use(hooksRouter)`):

| Hook | Method + path | Responsibility |
|---|---|---|
| Request | `POST /hooks/request` | Pre-create validation, returns 200 |
| Create | `POST /hooks/create` | Responds 200 immediately, then provisions the Auth0 footprint async and PATCHes `event.callback` with `{ state: "finish", deploymentData }` (or `{ state: "fail" }`) |
| Update | `POST /hooks/update` | Drops the cached tenant so changed settings take effect on next request |
| Destroy | `POST /hooks/destroy` | Best-effort teardown of every provisioned object, then drops the cache |

**What CREATE provisions per tenant** (using `idp.management_credentials` from the customer-identity IDP to get an Auth0 Management API token):

1. **Resource servers** — `https://devcamp-retailzero-api` (RBAC on) and `https://devcamp-mcp-server` with scopes `mcp:quote:read`, `mcp:docs:create`, `mcp:slack:post`, `mcp:quote:commit`.
2. **M2M client** — non-interactive app with `client_credentials` + token-exchange grants, granted to the MCP API. This powers the on-behalf-of token exchange in Lab 5.
3. **SPA reconfigure** — sets callbacks, logout URLs, and web origins on the platform-created OIDC app to `https://{demo}.{base}`.
4. **CIBA client** — regular web app with the `urn:openid:params:grant-type:ciba` grant, granted to the backend API (Lab 2).
5. **Token Vault connections** — Google + Slack federated connections (Lab 4), created only when upstream OAuth creds are supplied as settings.
6. **FGA store + model** — a per-demo Auth0/Okta FGA store with the authorization model written (Lab 3), created only when FGA creds are supplied.

Every id, secret, audience, store id, and connection name is assembled into `deploymentData` and PATCHed back to the platform. At runtime the resolver bootstraps that `deploymentData` and the live FGA / Token Vault / CIBA modules read from it.

Each optional step is wrapped in a `safe()` helper, so a missing upstream credential logs a warning and falls back to simulation rather than aborting the whole create.

### Prerequisites the hook cannot auto-create

The CREATE hook generates everything that lives inside Auth0. Three dependencies live outside it and must be supplied as **demo component settings** (or env for local runs):

- **FGA credentials** — Auth0/Okta FGA is a separate product and API (`*.fga.dev`), not the Auth0 Management API. Supply `FGA_API_URL`, `FGA_API_AUDIENCE`, `FGA_API_TOKEN_ISSUER`, `FGA_CLIENT_ID`, `FGA_CLIENT_SECRET`. The hook creates a per-demo store with these.
- **Google + Slack OAuth apps** — real upstream registrations. Supply `GOOGLE_CLIENT_ID/SECRET` and `SLACK_CLIENT_ID/SECRET` so the hook can create the federated connections.
- **CIBA Guardian enrollment** — the client and grant are provisioned, but the test rep enrolling a push device is a manual runtime step.

Also verify the demo tenant has the **token exchange** feature enabled, since Lab 5 OBO depends on it.

## Repository layout

```
demo-app/
├── README.md                     ← you are here
├── Dockerfile                    ← single-host production image
├── .env.sample                   ← all platform + local vars, documented
├── package.json                  ← dev / build / start scripts
│
├── server/
│   ├── index.ts                  ← API :3000, mounts hooks + tenant middleware + /api/config + static SPA
│   ├── llm.ts / simulator.ts     ← agent runtime (real LLM or pattern matcher), tenant-threaded
│   │
│   ├── platform/                 ← demo.okta.com integration (new in this copy)
│   │   ├── hooks.ts              ← request / create / update / destroy lifecycle
│   │   ├── auth0Management.ts    ← Management API helpers (resource servers, clients, grants, connections)
│   │   ├── fgaProvision.ts       ← per-demo FGA store + model creation
│   │   ├── tenant.ts             ← Tenant model + DeploymentData shape
│   │   ├── tenantResolver.ts     ← subdomain → bootstrap → cached Tenant, Express middleware
│   │   └── jwt.ts                ← per-(issuer,audience) JWT validator cache + token decode helpers
│   │
│   ├── middleware/
│   │   ├── auth.ts               ← [Lab 1] per-tenant JWT validation
│   │   └── ciba.ts               ← [Lab 2] live /bc-authorize + poll, simulation fallback
│   │
│   ├── fga/
│   │   ├── model.ts              ← [Lab 3] relationship model (sim) + FGA_AUTH_MODEL (live)
│   │   └── client.ts             ← [Lab 3] live OpenFGA checks, simulation fallback
│   │
│   ├── token-vault/
│   │   ├── vault.ts              ← [Lab 4] live federated-connection token exchange, simulation fallback
│   │   └── third-party-api.ts    ← [Lab 4] mock Google Docs + Slack (:3002)
│   │
│   ├── mcp/
│   │   ├── server.ts             ← [Lab 5] MCP server :3001, per-tenant token validation + scope enforcement
│   │   ├── client.ts             ← [Lab 5] OBO token exchange, per-tenant M2M creds from token iss
│   │   └── metadata.ts           ← [Lab 5] PRM (RFC 9728) + AS metadata (RFC 8414)
│   │
│   └── routes/guide.ts           ← serves the in-app lab guide
│
└── src/                          ← React frontend (Vite + TS)
    ├── main.tsx                  ← RuntimeConfigProvider → Auth0Provider → App
    ├── config/runtimeConfig.tsx  ← fetches /api/config, gates render
    ├── auth/Auth0Provider.tsx    ← consumes runtime config (no VITE_AUTH0_* at build time)
    └── hooks/useChat.ts          ← chat state + CIBA polling, uses runtime audience
```

## Running

### Local single-tenant (no platform)

Leave `DEMO_API_*` unset and fill the `AUTH0_*` values in `.env`. The resolver detects the platform is disabled and the app falls back to env config.

```bash
cp .env.sample .env
# fill in AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, AUTH0_AUDIENCE, etc.
npm install
npm run dev
```

`npm run dev` boots Vite (frontend) plus the Express API on :3000, the MCP server on :3001, and the third-party mock on :3002. Without an `OPENAI_API_KEY` the agent uses the deterministic pattern-matching simulator.

### Multi-tenant on demo.okta.com

1. Register the component in demo.okta.com (Library → Component, type Application). Point its hooks at `{base}/hooks/{request,create,update,destroy}`, require a **Customer Identity** IDP, and mark it **multi-tenant aware**.
2. Add the external prerequisites as component settings: FGA creds, Google/Slack OAuth creds, and `OPENAI_API_KEY` if you want real LLM responses.
3. Set the platform service vars in the deployment env: `BASE_URI`, `DEMO_API_APP_ID`, `DEMO_API_CLIENT_ID`, `DEMO_API_CLIENT_SECRET`, `DEMO_API_ENDPOINT`, `DEMO_API_TOKEN_ENDPOINT`, `DEMO_API_AUDIENCE`.
4. Build and serve as one host (see Production below).

Creating a demo then triggers the CREATE hook, which provisions the footprint and reports `deploymentData` back. Launching the demo serves the SPA on the demo subdomain, which bootstraps its config from `/api/config`.

### Environment variables

Every variable is documented in [`.env.sample`](./.env.sample). The short version:

| Group | Vars |
|---|---|
| Ports | `PORT`, `MCP_SERVER_PORT`, `THIRD_PARTY_API_PORT` |
| Platform (multi-tenant) | `BASE_URI`, `DEMO_API_APP_ID`, `DEMO_API_CLIENT_ID`, `DEMO_API_CLIENT_SECRET`, `DEMO_API_ENDPOINT`, `DEMO_API_TOKEN_ENDPOINT`, `DEMO_API_AUDIENCE`, `TENANT_TTL_MS` |
| Resource servers | `BACKEND_API_IDENTIFIER`, `MCP_API_IDENTIFIER` |
| Local Auth0 (single-tenant) | `AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE`, `MCP_AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID_M2M`, `AUTH0_CLIENT_SECRET_M2M`, `AUTH0_CIBA_CLIENT_ID`, `AUTH0_CIBA_CLIENT_SECRET` |
| FGA (Lab 3) | `FGA_API_URL`, `FGA_API_AUDIENCE`, `FGA_API_TOKEN_ISSUER`, `FGA_CLIENT_ID`, `FGA_CLIENT_SECRET` |
| Token Vault (Lab 4) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` |
| LLM | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL` |

`.env*` is gitignored; only `.env.sample` is tracked. Note that `deploymentData` carries secrets (M2M secret, FGA creds), which is acceptable for the demo platform but worth knowing.

## What's live vs. simulated

This copy runs each previously-simulated module against real Auth0 **when the tenant carries the matching provisioned config**, and falls back to the in-memory simulation otherwise so the app still runs offline.

| Component | Live when... | Fallback |
|---|---|---|
| Auth0 login, JWT validation, OBO token exchange | Always (real) | n/a |
| FGA | Tenant has `fga_store_id` + creds | In-memory tuples |
| Token Vault | Tenant has a federated connection + rep access token | In-memory mint + refresh |
| CIBA | Tenant has `ciba_client_id` | In-memory approve/deny via `/api/ciba/*` |
| Google Docs + Slack | Mocked on :3002 | same |
| LLM | `OPENAI_API_KEY` set | Pattern-matching simulator |

## Production and Docker

```bash
npm run build      # tsc + vite build → dist/
npm run start      # serves dist/ + /api + MCP + third-party on one host
```

When `dist/` exists, `server/index.ts` serves the static SPA with a fallback that excludes `/api` and `/hooks`. The MCP server and third-party mock run on internal localhost ports in the same process; the OBO token audience isolates tenants regardless of port.

The multi-stage `Dockerfile` builds the SPA and runs the TypeScript server via `tsx`:

```bash
docker build -t zmerchant-a4aa .
docker run -p 3000:3000 --env-file .env zmerchant-a4aa
```

## Verifying the integration

1. **Local hook test** — set `DEMO_API_*`, POST a sample CREATE payload to `/hooks/create`, and confirm the Management API objects are created and the callback PATCH carries a complete `deploymentData`.
2. **Runtime config** — hit `GET /api/config` for a demo subdomain and confirm it returns that tenant's `domain`, `clientId`, and `audience`.
3. **End-to-end** — create a demo on demo.okta.com, launch it, then verify login (SPA), `/api/chat` JWT validation, MCP OBO exchange (Lab 5), FGA allow/deny (Lab 3), a Token Vault federated call (Lab 4), and CIBA approve/deny (Lab 2).
4. **Lifecycle** — trigger UPDATE (cache clears, new settings apply) and DESTROY (provisioned objects removed).

## Further reading

- [`../README.md`](../README.md) — workshop overview and the six labs
- [`../lab-guide/`](../lab-guide/) — step-by-step participant guides
- [Auth0 for AI Agents](https://auth0.com/ai)
- RFC 9728 (Protected Resource Metadata), RFC 8414 (AS Metadata), RFC 8693 (Token Exchange), RFC 8707 (Resource Indicators)
