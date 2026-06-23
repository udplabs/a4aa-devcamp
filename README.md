# Securing AI Agents with Auth0: DevCamp (A4AA)

A hands-on workshop that takes a working enterprise document assistant (**Nexus**) and secures its MCP server end-to-end with **Auth0 for AI Agents (A4AA)**. You wire up user authentication, Token Vault for CRM credentials, and the full **Auth for MCP** stack across five modules. Fine-grained authorization (FGA) runs as a live demo against real Okta FGA.

The chat UI ships pre-built. Every line of code you write is on the identity and authorization layer. Your Auth0 tenant is provisioned for you when you launch, so there is no dashboard setup to do by hand.

## Why this lab exists

Nexus exposes four tools through an MCP server: document search, document retrieval, CRM logging, and external sharing. Multiple agents and clients call those tools on behalf of company employees. The server works. What it cannot do is tell those clients apart, prove which employee any of them is acting for, or enforce any policy downstream. This workshop closes that identity gap and takes the MCP server from an open platform to a production-ready deployment.

Framed commercially: you are reducing operational expense through automated credential lifecycle management and a single authorization engine, while accelerating go-to-market by producing the audit trail and access controls that enterprise procurement requires.

## What you'll build

| Module | Title | Primitive | Outcome |
|---|--------|-----------|---------|
| 01 | Auth for MCP | RFC 9728 + RFC 8414 + RFC 8693 + RFC 8707 + CIMD | MCP server becomes the trust boundary; every tool call is bearer-authenticated and OBO-scoped to the employee |
| 02 | User Authentication | Auth0 Universal Login, `express-oauth2-jwt-bearer` | Employee logs in, JWT `sub` flows to every downstream tool call |
| 03 | Token Vault | Per-user federated CRM credentials | Agent calls the CRM with the employee's identity, refreshed automatically, never held in agent memory |
| 04 | Async Authorization (CIBA) | Client-Initiated Backchannel Authentication + Auth0 Guardian push | External document shares require out-of-band employee approval with a binding message |
| 05 | Fine-Grained Authorization (live demo) | Real Okta FGA, relationship-based access model | Employees read and share only the documents they are authorized to access, enforced live at the data boundary |

Module 00 covers environment setup and tenant provisioning. Module 05 is the one piece you watch rather than write — FGA is provisioned and enforced live against a real Okta FGA store, so you see allow and deny decisions land without touching the authorization code. A closing end-to-end run takes one document request through every control at once.

See [`lab-guide/`](./lab-guide/) for the step-by-step participant instructions.

## Repository layout

```
devcamp-a4aa/
├── README.md                     ← you are here
│
├── lab-guide/                    ← step-by-step participant guides
│   ├── overview.md               ← landing page (what you'll do)
│   ├── introduction.md           ← mission briefing (read during kickoff)
│   ├── 00-prerequisites.md       ← Module 00 (environment setup + tenant provisioning)
│   ├── 01-auth-for-mcp.md        ← Module 01 (keystone)
│   ├── 02-user-authentication.md ← Module 02
│   ├── 03-token-vault.md         ← Module 03
│   ├── 04-ciba.md                ← Module 04
│   ├── 05-fine-grained-authorization.md ← Module 05 (FGA live demo, witnessed)
│   ├── 06-end-to-end.md          ← closing end-to-end run
│   └── conclusion.md             ← wrap-up (what you shipped, next steps)
│
├── demo-app/                     ← platform-integrated deploy (demo.okta.com)
├── starter/                      ← workshop starting point (what participants edit)
├── solution/                     ← reference implementation (complete)
└── presentation/                 ← slides / supporting material
```

### `starter/` and `solution/` share the same shape

```
starter/
├── .env.example                  ← template for local env vars
├── package.json                  ← npm run dev starts everything
├── vite.config.js
│
├── server/                       ← Express backend (Node + JS)
│   ├── index.js                  ← API server on :3000
│   ├── llm.js                    ← OpenAI tool-calling loop (OpenAI-compatible SDK)
│   ├── simulator.js              ← pattern-matching fallback when no API key
│   │
│   ├── llm/
│   │   ├── prompts.js            ← system prompt for Nexus
│   │   └── tools.js              ← tool schemas exposed to the model
│   │
│   ├── middleware/
│   │   ├── auth.js               ← [Module 02] JWT validation
│   │   └── ciba.js               ← [Module 04] CIBA initiate / poll / approve
│   │
│   ├── fga/
│   │   ├── model.js              ← [Module 05] relationship model + seed data
│   │   └── client.js             ← [Module 05] canReadDocument, canShareDocument
│   │
│   ├── token-vault/
│   │   ├── vault.js              ← [Module 03] per-user CRM credential store
│   │   └── third-party-api.js    ← [Module 03] mock CRM API (:3002)
│   │
│   ├── mcp/
│   │   ├── server.js             ← [Module 01] MCP server on :3001
│   │   ├── client.js             ← [Module 01] OBO token exchange (RFC 8693 + RFC 8707)
│   │   └── metadata.js           ← [Module 01] PRM (RFC 9728) + AS metadata (RFC 8414)
│   │
│   └── routes/
│       └── guide.js              ← serves the in-app lab guide
│
└── src/                          ← React frontend (Vite + JS)
    ├── App.jsx                   ← auth gate, layout shell
    ├── main.jsx                  ← Auth0Provider wiring
    ├── auth/
    │   └── Auth0Provider.jsx     ← [Module 02] Auth0 React provider config
    ├── components/
    │   ├── Chat.jsx              ← chat surface
    │   ├── Message.jsx           ← user / assistant bubbles
    │   ├── ToolApproval.jsx      ← CIBA binding-message card
    │   ├── LoginScreen.jsx       ← pre-auth landing screen
    │   ├── SetupBanner.jsx       ← environment setup screen
    │   └── ProvisionPanel.jsx    ← Auth0 resource provisioning screen
    └── hooks/
        └── useChat.js            ← chat state + CIBA polling
```

**Which tree do I work in?**

- **`starter/`** is the main workshop path. Pick this if you're running the labs end to end.
- **`solution/`** is the reference implementation. Treat as a read-only answer key. If you get stuck, diff against it rather than copy-paste.
- **`demo-app/`** is the platform-integrated deploy used on demo.okta.com. Work here only when deploying to the demo platform.

## Setup

### Prerequisites

- Node 20+
- An Auth0 tenant (free dev tenant works)
- Optional: an OpenAI API key or LiteLLM proxy for real LLM responses. Without one, the server falls back to a deterministic pattern-matching simulator.

### First-time setup

```bash
cd starter
cp .env.example .env.local
npm install
npm run dev
```

`npm run dev` boots:

- **:5173** — Vite dev server for the React app
- **:3000** — Express API
- **:3001** — MCP server (once Module 01 is wired up)
- **:3002** — CRM mock (once Module 03 is wired up)

### Environment variables

All vars live in `starter/.env.example`. The short version:

| Group | Vars |
|---|---|
| Frontend (Vite) | `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` |
| Backend | `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `PORT` |
| MCP (Module 01) | `MCP_SERVER_PORT`, `MCP_AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID_M2M`, `AUTH0_CLIENT_SECRET_M2M` |
| CIBA (Module 04) | `AUTH0_CIBA_CLIENT_ID`, `AUTH0_CIBA_CLIENT_SECRET` |
| CRM mock (Module 03) | `THIRD_PARTY_API_PORT` |
| LLM | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, optional `LLM_MODEL` |

`.env`, `.env.local`, and `.env.*` are all gitignored. Only `.env.example` is tracked. Don't commit real credentials.

### LLM configuration

The server uses the OpenAI SDK, which speaks any OpenAI-compatible endpoint via `baseURL`. Three common setups:

1. **OpenAI directly**: Set `OPENAI_API_KEY=sk-...` and leave the other two unset. Defaults to `gpt-4o-mini`.
2. **LiteLLM proxy (or Azure, Ollama, anything compatible)**: Set all three:
   ```
   OPENAI_API_KEY=<virtual-key>
   OPENAI_BASE_URL=https://your-proxy.example.com/v1
   LLM_MODEL=claude-sonnet-4-6
   ```
3. **No key**: Server uses the pattern-matching simulator. Labs still work end to end; responses are canned.

## Running the labs

Each module in `lab-guide/` is self-contained. The in-app lab guide (toggle via the **Lab guide** button in the UI) renders the same markdown with code-copy affordances. Follow them in order; every module builds on the previous one.

Typical loop:

1. Open `lab-guide/0X-...md`.
2. Make the edits it calls for in `starter/`.
3. Hit the Checkpoint at the bottom of the guide to verify.
4. Move to the next module.

## Demo users

The starter seeds two employees with intentionally different document access so the FGA live demo (Module 05) has something to bite on:

| User | Access | What they can do |
|---|---|---|
| `alice@docagent.demo` | Engineering team member; editor on `q3-roadmap` | Read and share all engineering docs; denied on HR and executive documents |
| `bob@docagent.demo` | All-company viewer only | Read handbook and security policy; denied on engineering, HR, and executive documents |

Confidential documents (`compensation-q3`, `board-deck-q3`) are intentionally unseeded for all demo users to produce clean deny paths.

## What's real vs. simulated

The delivered workshop runs on the platform-integrated `demo-app/` build, where each tenant's Auth0 footprint is provisioned automatically on launch. Against that footprint the previously-simulated controls run live, with an in-memory fallback so the app still runs offline.

| Component | Status |
|---|---|
| Auth0 login, JWT validation, OAuth flows | **Real** |
| MCP protocol, OBO token exchange, audience enforcement | **Real** |
| Per-tenant provisioning (SPA, APIs, M2M, CRM connection) | **Real**, automatic on launch via the `demo-app/` CREATE hook |
| FGA | **Live** against a real Okta FGA store provisioned per tenant. Witnessed as a live demo (Module 05); in-memory tuples as fallback |
| CIBA | **Real** via Auth0 Guardian push; in-memory approve/deny as fallback for anyone who skips device enrollment |
| Token Vault | **Live** when a CRM federated connection is provisioned for the tenant; in-memory mint and refresh as fallback |
| CRM API | Mocked on `:3002` |
| LLM | Real if key is set, simulator otherwise |

## Further reading

- [`demo-app/README.md`](./demo-app/README.md) — platform integration guide for demo.okta.com deployments
- [Auth0 for AI Agents overview](https://auth0.com/ai)
- [MCP authorization spec (2025-11-25)](https://modelcontextprotocol.io/specification)
- RFC 9728 (Protected Resource Metadata), RFC 8414 (AS Metadata), RFC 8693 (Token Exchange), RFC 8707 (Resource Indicators)
