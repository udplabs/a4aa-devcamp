# Securing AI Agents with Auth0 — DevCamp (A4AA)

A hands-on workshop that takes a working B2B wholesale quote agent (**Z-Merchant**, built for the fictional retailer **RetailZero**) and secures it end-to-end with **Auth0 for AI Agents (A4AA)**. You wire up user authentication, Token Vault for third-party credentials, and the full **Auth for MCP** stack across four modules. Fine-grained authorization (FGA) runs as a live demo against real Okta FGA, and asynchronous consent (CIBA) is available as an optional bonus.

The chat UI ships pre-built. Every line of code you write is on the identity and authorization layer. Your Auth0 tenant is provisioned for you when you launch, so there is no dashboard setup to do by hand.

## Why this lab exists

RetailZero's wholesale channel runs on a deal desk. Every bulk quote burns salaried rep time; every non-standard discount adds a round trip with finance. Z-Merchant exists to compress that cycle: draft the quote, notify triage, commit final terms. This workshop is how you make Z-Merchant safe to ship to production.

Framed another way: you are reducing operational expense on the deal-desk workflow while accelerating go-to-market for every downstream AI workflow that inherits the same identity plumbing.

## What you'll build

| Module | Title | Primitive | Outcome |
|---|--------|-----------|---------|
| 02 | User Authentication | Auth0 SPA + API, `express-oauth2-jwt-bearer` | Rep logs in, JWT validated on every API call |
| 03 | Fine-Grained Authorization (live demo) | Real Okta FGA, relationship-based access model | Reps read and commit only on accounts they own or manage. Enforced live against a real FGA store and witnessed, not coded |
| 04 | Token Vault | Per-rep federated credentials for Google + Slack | Agent calls downstream APIs with the rep's identity, refreshed automatically |
| 05 | Auth for MCP | RFC 9728 + RFC 8414 + RFC 8693 + RFC 8707 + CIMD | MCP server becomes the trust boundary; agent runtime is just a client |
| Bonus | Async Authorization (CIBA) | Client-Initiated Backchannel Authentication + Auth0 Guardian push | Non-standard quote commits require out-of-band rep approval with a binding message |

Modules 00 and 01 cover platform orientation and environment setup. Module 03 is the one piece you watch rather than write. FGA is provisioned and enforced live against real Okta FGA, so you see the allow and deny decisions land without touching the authorization code. A closing end-to-end run takes one deal through every control at once.

See [`OUTLINE.md`](./OUTLINE.md) for the detailed module breakdown and [`lab-guide/`](./lab-guide/) for the step-by-step instructions.

## Repository layout

```
devcamp-a4aa/
├── README.md                     ← you are here
├── OUTLINE.md                    ← full workshop outline, lab-by-lab
├── OUTLINE-plain.md              ← same content, no tables (for printing)
├── RETAILZERO-ABSTRACT.md        ← one-page business framing
├── RETAILZERO-STORY.md           ← long-form narrative / instructor notes
│
├── lab-guide/                    ← step-by-step participant guides
│   ├── overview.md               ← landing page (what you'll do)
│   ├── introduction.md           ← mission briefing (read during kickoff)
│   ├── 00-welcome.md                          ← Module 00 (platform orientation)
│   ├── 01-prerequisites.md                    ← Module 01 (environment setup)
│   ├── 02-user-authentication.md              ← Module 02
│   ├── 03-fine-grained-authorization.md       ← Module 03 (FGA live demo, witnessed)
│   ├── 04-token-vault.md                      ← Module 04
│   ├── 05-auth-for-mcp.md                      ← Module 05 (keystone)
│   ├── 06-bonus-async-authorization-ciba.md   ← Bonus (CIBA)
│   ├── 07-end-to-end.md                        ← closing end-to-end run
│   └── conclusion.md             ← wrap-up (what you shipped, next steps)
│
├── starter/                      ← workshop starting point (what participants edit)
├── starter-test/                 ← stripped-down harness for rapid iteration
├── solution/                     ← reference implementation (complete)
└── presentation/                 ← slides / supporting material
```

### `starter/`, `starter-test/`, `solution/` share the same shape

```
starter/
├── .env.example                  ← template for local env vars
├── package.json                  ← npm run dev starts everything
├── vite.config.ts
├── tsconfig.json
│
├── public/
│   └── fonts/                    ← Auth0 Aeonik typeface
│
├── scripts/
│   └── find-port.ts              ← auto-selects free ports
│
├── server/                       ← Express backend (Node + TS)
│   ├── index.ts                  ← API server on :3000
│   ├── llm.ts                    ← OpenAI tool-calling loop (OpenAI-compatible SDK)
│   ├── simulator.ts              ← pattern-matching fallback when no API key
│   ├── lab-status.ts             ← detects which labs are wired up
│   │
│   ├── llm/
│   │   ├── prompts.ts            ← system prompt for Z-Merchant
│   │   └── tools.ts              ← tool schemas exposed to the model
│   │
│   ├── middleware/
│   │   ├── auth.ts               ← [Lab 1] JWT validation
│   │   └── ciba.ts               ← [Lab 2] CIBA initiate / poll / approve
│   │
│   ├── fga/
│   │   ├── model.ts              ← [Lab 3] relationship model + seed data
│   │   └── client.ts             ← [Lab 3] canReadAccount, canCommitQuote
│   │
│   ├── token-vault/
│   │   ├── vault.ts              ← [Lab 4] per-rep credential store
│   │   └── third-party-api.ts    ← [Lab 4] mock Google Docs + Slack (:3002)
│   │
│   ├── mcp/
│   │   ├── server.ts             ← [Lab 5] MCP server on :3001
│   │   ├── client.ts             ← [Lab 5] OBO token exchange (RFC 8693 + RFC 8707)
│   │   └── metadata.ts           ← [Lab 5] PRM (RFC 9728) + AS metadata (RFC 8414)
│   │
│   ├── tools/
│   │   └── registry.ts           ← framework-agnostic tool definitions
│   │
│   └── routes/
│       └── guide.ts              ← serves the in-app lab guide
│
└── src/                          ← React frontend (Vite + TS)
    ├── App.tsx                   ← auth gate, layout shell
    ├── main.tsx                  ← Auth0Provider wiring
    ├── auth/
    │   └── Auth0Provider.tsx     ← [Lab 1] Auth0 React provider config
    ├── components/
    │   ├── Chat.tsx              ← chat surface
    │   ├── Message.tsx           ← user / assistant bubbles
    │   ├── ToolApproval.tsx      ← CIBA binding-message card
    │   ├── LoginScreen.tsx
    │   ├── LabGuide.tsx          ← floating progress pill
    │   └── LabGuideViewer.tsx    ← in-app markdown renderer for lab-guide/
    ├── hooks/
    │   └── useChat.ts            ← chat state + CIBA polling
    └── styles/
        └── index.css             ← glass design system, Auth0 palette
```

**Which tree do I work in?**

- **`starter/`** is the main workshop path. Pick this if you're running the labs end to end.
- **`starter-test/`** is a leaner harness the authors use to iterate on UI and tooling without rebuilding the full auth surface each time. Missing a few pieces (third-party mock, CIBA endpoints) by design.
- **`solution/`** is the reference implementation. Treat as a read-only answer key. If you get stuck, diff against it rather than copy-paste.

## Setup

### Prerequisites

- Node 20+
- An Auth0 tenant (free dev tenant works)
- Optional: an OpenAI API key or LiteLLM proxy for real LLM responses. Without one, the server falls back to a deterministic pattern-matching simulator.

### First-time setup

```bash
cd starter
cp .env.example .env.local        # or .env; Vite loads both
npm install
npm run dev
```

`npm run dev` boots:

- **:5173** — Vite dev server for the React app
- **:3000** — Express API
- **:3001** — MCP server (once Lab 5 is wired up)
- **:3002** — Third-party mock (once Lab 4 is wired up)

### Environment variables

All vars live in `starter/.env.example` (copy to `.env.local`). The short version:

| Group | Vars |
|---|---|
| Frontend (Vite) | `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` |
| Backend | `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `PORT` |
| CIBA (Lab 2) | `AUTH0_CIBA_CLIENT_ID`, `AUTH0_CIBA_CLIENT_SECRET` |
| MCP (Lab 5) | `MCP_SERVER_PORT`, `MCP_AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID_M2M`, `AUTH0_CLIENT_SECRET_M2M` |
| Token Vault mock (Lab 4) | `THIRD_PARTY_API_PORT` |
| LLM | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, optional `LLM_MODEL` |

`.env`, `.env.local`, and `.env.*` are all gitignored. Only `.env.example` is tracked. Don't commit real credentials.

### LLM configuration

The server uses the OpenAI SDK, which speaks any OpenAI-compatible endpoint via `baseURL`. Three common setups:

1. **OpenAI directly** — set `OPENAI_API_KEY=sk-...`, leave the other two unset. Defaults to `gpt-4o-mini`.
2. **LiteLLM proxy (or Azure / Ollama / anything compatible)** — set all three:
   ```
   OPENAI_API_KEY=<virtual-key>
   OPENAI_BASE_URL=https://your-proxy.example.com/v1
   LLM_MODEL=claude-opus-4-6
   ```
3. **No key** — server uses the pattern-matching simulator. Labs still work end to end; responses are canned.

## Running the labs

Each lab in `lab-guide/` is self-contained. The in-app lab guide (toggle via the `Lab guide` button in the UI) renders the same markdown with code-copy affordances. Follow them in order; every lab builds on the previous one.

Typical loop:

1. Open `lab-guide/0X-...md`.
2. Make the edits it calls for in `starter/`.
3. Hit the Checkpoint at the bottom of the guide to verify.
4. Move to the next lab.

## Demo users

The starter seeds two reps with intentionally different access so the FGA live demo (Module 03) has something to bite on:

| User | Books | What they can do |
|---|---|---|
| `alice@retailzero.demo` | Owns `acme` and `globex`; not on team-west | Read and commit on Acme + Globex |
| `bob@retailzero.demo` | Manages `team-west`, which owns `initech` | Read Initech through team-west; cannot commit on Acme |

`stark` is intentionally unassigned to test deny paths.

## What's real vs. simulated

The delivered workshop runs on the platform-integrated `demo-app/` build, where each tenant's Auth0 footprint is provisioned automatically on launch. Against that footprint the previously-simulated controls run live, with an in-memory fallback so the app still runs offline.

| Component | Status |
|---|---|
| Auth0 login, JWT validation, OAuth flows | **Real** |
| MCP protocol, token exchange, audience enforcement | **Real** |
| Per-tenant provisioning (SPA, APIs, M2M, connections) | **Real**, automatic on launch via the `demo-app/` CREATE hook |
| FGA | **Live** against a real Okta FGA store provisioned per tenant. Shown as a witnessed demo (Module 03); in-memory tuples as fallback |
| CIBA | **Real** via Auth0 Guardian push (optional bonus); in-memory approve/deny as fallback for anyone who skips device enrollment |
| Token Vault | **Live** when a federated connection is provisioned for the tenant; in-memory mint + refresh as fallback |
| Google Docs + Slack | Mocked on `:3002` |
| LLM | Real if key is set, simulator otherwise |

The fallbacks preserve the API shape of the real services, so `starter/` and `solution/` still run end to end offline and every line of code you write is code you'd write against production Auth0. The self-contained live Token Vault path (a mock OAuth2 provider registered as a custom social connection, so the federated exchange runs without external Google or Slack apps) is the documented target and not yet wired in.

## Further reading

- [`OUTLINE.md`](./OUTLINE.md) — full lab-by-lab outline with objectives, files, and checkpoints
- [`RETAILZERO-ABSTRACT.md`](./RETAILZERO-ABSTRACT.md) — one-page business framing
- [`RETAILZERO-STORY.md`](./RETAILZERO-STORY.md) — long-form narrative
- [Auth0 for AI Agents overview](https://auth0.com/ai)
- [MCP authorization spec (2025-11-25)](https://modelcontextprotocol.io/specification)
- RFC 9728 (Protected Resource Metadata), RFC 8414 (AS Metadata), RFC 8693 (Token Exchange), RFC 8707 (Resource Indicators)
