# Securing AI Agents with Auth0 — DevCamp (A4AA)

A hands-on workshop that takes a working B2B wholesale quote agent (**Z-Merchant**, built for the fictional retailer **RetailZero**) and secures it end-to-end with **Auth0 for AI Agents (A4AA)**. You implement user authentication, asynchronous consent (CIBA), fine-grained authorization (FGA), Token Vault for third-party credentials, and the full **Auth for MCP** stack in six progressive labs.

The chat UI ships pre-built. Every line of code you write is on the identity and authorization layer.

## Why this lab exists

RetailZero's wholesale channel runs on a deal desk. Every bulk quote burns salaried rep time; every non-standard discount adds a round trip with finance. Z-Merchant exists to compress that cycle: draft the quote, notify triage, commit final terms. This workshop is how you make Z-Merchant safe to ship to production.

Framed another way: you are reducing operational expense on the deal-desk workflow while accelerating go-to-market for every downstream AI workflow that inherits the same identity plumbing.

## What you'll build

| # | Lab | Primitive | Outcome |
|---|-----|-----------|---------|
| 1 | User Authentication | Auth0 SPA + API, `express-oauth2-jwt-bearer` | Rep logs in, JWT validated on every API call |
| 2 | Async Authorization | CIBA (Client-Initiated Backchannel Authentication) | Non-standard quote commits require out-of-band rep approval with a binding message |
| 3 | Fine-Grained Authorization | Relationship-based access model | Reps can only read and commit on accounts they own or manage |
| 4 | Token Vault | Per-rep federated credentials for Google + Slack | Agent calls downstream APIs with the rep's identity, refreshed automatically |
| 5 | Auth for MCP | RFC 9728 + RFC 8414 + RFC 8693 + RFC 8707 + CIMD | MCP server becomes the trust boundary; agent runtime is just a client |
| 6 | End-to-End | All of the above | Run the full quote workflow through every control in one deal |

See [`OUTLINE.md`](./OUTLINE.md) for the detailed lab-by-lab breakdown and [`lab-guide/`](./lab-guide/) for the step-by-step instructions.

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
│   ├── 00-overview.md            ← workshop intro + environment setup
│   ├── 01-user-authentication.md
│   ├── 02-async-authorization-ciba.md
│   ├── 03-fine-grained-authorization.md
│   ├── 04-token-vault.md
│   ├── 05-auth-for-mcp.md        ← keystone lab
│   └── 06-end-to-end.md
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

The starter seeds two reps with intentionally different access so Lab 3's FGA checks have something to bite on:

| User | Books | What they can do |
|---|---|---|
| `alice@retailzero.demo` | Owns `acme` and `globex`; not on team-west | Read and commit on Acme + Globex |
| `bob@retailzero.demo` | Manages `team-west`, which owns `initech` | Read Initech through team-west; cannot commit on Acme |

`stark` is intentionally unassigned to test deny paths.

## What's real vs. simulated

| Component | Status |
|---|---|
| Auth0 login, JWT validation, OAuth flows | **Real** |
| MCP protocol, token exchange, audience enforcement | **Real** |
| CIBA flow | Simulated (in-memory + curl approval, no Guardian push) |
| FGA | Simulated (in-memory tuples, same API shape as Auth0 FGA) |
| Token Vault | Simulated (in-memory mint + refresh) |
| Google Docs + Slack | Mocked on `:3002` |
| LLM | Real if key is set, simulator otherwise |

The simulations preserve the API shape of the real services so every line of code you write in the labs is code you'd write against production Auth0.

## Further reading

- [`OUTLINE.md`](./OUTLINE.md) — full lab-by-lab outline with objectives, files, and checkpoints
- [`RETAILZERO-ABSTRACT.md`](./RETAILZERO-ABSTRACT.md) — one-page business framing
- [`RETAILZERO-STORY.md`](./RETAILZERO-STORY.md) — long-form narrative
- [Auth0 for AI Agents overview](https://auth0.com/ai)
- [MCP authorization spec (2025-11-25)](https://modelcontextprotocol.io/specification)
- RFC 9728 (Protected Resource Metadata), RFC 8414 (AS Metadata), RFC 8693 (Token Exchange), RFC 8707 (Resource Indicators)
