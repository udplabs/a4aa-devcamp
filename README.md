# Securing AI Agents with Auth0: DevCamp (A4AA)

A hands-on workshop that takes a working enterprise document assistant (**Nexus**) and secures its MCP server end-to-end with **Auth0 for AI Agents (A4AA)**. You wire up user authentication, Token Vault for CRM credentials, and the full **Auth for MCP** stack across five modules. Fine-grained authorization (FGA) runs as a live demo against real Okta FGA.

The chat UI ships pre-built. Every line of code you write is on the identity and authorization layer. Your Auth0 tenant is provisioned for you when you launch, so there is no dashboard setup to do by hand beyond the specific toggles each module calls out.

## Why this lab exists

Nexus exposes four tools through an MCP server: document search, document retrieval, CRM logging, and external sharing. Multiple agents and clients call those tools on behalf of company employees. The server works. What it cannot do is tell those clients apart, prove which employee any of them is acting for, or enforce any policy downstream. This workshop closes that identity gap and takes the MCP server from an open platform to a production-ready deployment.

## What you'll build

| Module | Title | Primitive | Outcome |
|---|--------|-----------|---------|
| 01 | Auth for MCP | RFC 9728 + RFC 8414 + RFC 8693 + RFC 8707 + CIMD | MCP server becomes the trust boundary; every tool call is bearer-authenticated and OBO-scoped to the employee |
| 02 | User Authentication | Auth0 Universal Login, `express-oauth2-jwt-bearer` | Employee logs in, JWT `sub` flows to every downstream tool call |
| 03 | Token Vault | Per-user federated CRM credentials | Agent calls the CRM with the employee's identity, refreshed automatically, never held in agent memory |
| 04 | Async Authorization (CIBA) | Client-Initiated Backchannel Authentication + Auth0 Guardian push | External document shares require out-of-band employee approval with a binding message |
| 05 | Fine-Grained Authorization (live demo) | Real Okta FGA, relationship-based access model | Employees read and share only the documents they are authorized to access, enforced live at the data boundary |

Module 00 covers environment setup and tenant provisioning. Module 05 is the one piece you watch rather than write — FGA is provisioned and enforced live against a real Okta FGA store, so you see allow and deny decisions land without touching the authorization code. A closing end-to-end run (Module 06) takes one document request through every control at once.

See [`lab-guide/`](./lab-guide/) for the step-by-step participant instructions.

## Repository layout

```
devcamp-a4aa/
├── README.md                     ← you are here
│
├── lab-guide/                    ← step-by-step participant guides
│   ├── overview.md               ← landing page (what you'll do)
│   ├── introduction.md           ← mission briefing (read during kickoff)
│   ├── images/                   ← Dashboard screenshots referenced by the guides
│   ├── 00-prerequisites.md       ← Module 00 (environment setup + tenant provisioning)
│   ├── 01-auth-for-mcp.md        ← Module 01 (keystone)
│   ├── 02-user-authentication.md ← Module 02
│   ├── 03-token-vault.md         ← Module 03
│   ├── 04-ciba.md                ← Module 04
│   ├── 05-fine-grained-authorization.md ← Module 05 (FGA live demo, witnessed)
│   ├── 06-end-to-end.md          ← closing end-to-end run
│   └── conclusion.md             ← wrap-up (what you shipped, next steps)
│
├── demo-app/                     ← the application: platform-integrated deploy (demo.okta.com)
└── mock-crm-service/             ← standalone CRM OAuth2 mock, deployable to Vercel (Module 03 upstream)
```

There is a single living application tree: **`demo-app/`**. It serves both local single-tenant runs (for development or self-hosting) and multi-tenant demo.okta.com deployments from the same codebase. Participants work directly against `demo-app/`, guided by `lab-guide/`.

### `demo-app/`

The Nexus application: Express API + MCP server + React frontend, with per-tenant provisioning hooks for demo.okta.com. See [`demo-app/README.md`](./demo-app/README.md) for the full architecture, environment variables, and local vs. platform running instructions.

### `mock-crm-service/`

A standalone, Vercel-deployable mock CRM OAuth2 server and activities API. `demo-app/` also has its own in-process CRM mock (`server/crm/app.js`, used for local/Codespace runs on `:3002`); `mock-crm-service/` is the externally-hosted alternative referenced as the "real upstream OAuth2 registration" in `demo-app/README.md` for deployments that need the CRM connection to point at a separately running service rather than a co-located process.

## Setup

### Prerequisites

- Node 20+
- An Auth0 tenant (free dev tenant works)
- Optional: an OpenAI API key or LiteLLM proxy for real LLM responses. Without one, the server falls back to a deterministic pattern-matching simulator.

### First-time setup (local, single-tenant)

```bash
cd demo-app
cp .env.sample .env
npm install
npm run dev
```

`npm run dev` boots:

- **:5173** — Vite dev server for the React app
- **:3000** — Express API
- **:3001** — MCP server
- **:3002** — CRM mock

See [`demo-app/README.md`](./demo-app/README.md) for the full environment variable reference, multi-tenant demo.okta.com setup, and production/Docker instructions.

## Running the labs

Each module in `lab-guide/` is self-contained. The in-app lab guide (toggle via the **Lab guide** button in the UI) renders the same markdown with code-copy affordances. Follow them in order; every module builds on the previous one.

Typical loop:

1. Open `lab-guide/0X-...md`.
2. Make the Dashboard/code changes it calls for.
3. Hit the Checkpoint at the bottom of the guide to verify.
4. Move to the next module.

## Demo users

Two employees are seeded with intentionally different document access so the FGA live demo (Module 05) has something to bite on:

| User | Access | What they can do |
|---|---|---|
| `alice@docagent.demo` | Engineering team member; editor on `q3-roadmap` and `product-spec-v2` | Read and share all engineering docs; denied on HR and executive documents |
| `bob@docagent.demo` | All-company viewer only | Read handbook and security policy; denied on engineering, HR, and executive documents |

Confidential documents (`compensation-q3`, `board-deck-q3`) are intentionally unseeded for all demo users to produce clean deny paths.

## What's real vs. simulated

Each tenant's Auth0 footprint is provisioned automatically on launch (`demo-app/`'s CREATE hook, or the local single-tenant provisioning path). Against that footprint, previously-simulated controls run live, with an in-memory fallback so the app still runs offline.

| Component | Status |
|---|---|
| Auth0 login, JWT validation, OAuth flows | **Real** |
| MCP protocol, OBO token exchange, audience enforcement | **Real** |
| Per-tenant provisioning (SPA, APIs, M2M, CRM connection) | **Real**, automatic on launch |
| FGA | **Live** against a real Okta FGA store provisioned per tenant. Witnessed as a live demo (Module 05); in-memory tuples as fallback |
| CIBA | **Real** via Auth0 Guardian push; in-memory approve/deny as fallback for anyone who skips device enrollment |
| Token Vault | **Live** when a CRM federated connection is provisioned for the tenant; in-memory mint and refresh as fallback |
| CRM API | Mocked on `:3002` (or via `mock-crm-service/` when deployed separately) |
| LLM | Real if key is set, simulator otherwise |

## Further reading

- [`demo-app/README.md`](./demo-app/README.md) — application architecture, environment variables, platform integration
- [Auth0 for AI Agents overview](https://auth0.com/ai)
- [MCP authorization spec (2025-11-25)](https://modelcontextprotocol.io/specification)
- RFC 9728 (Protected Resource Metadata), RFC 8414 (AS Metadata), RFC 8693 (Token Exchange), RFC 8707 (Resource Indicators)
