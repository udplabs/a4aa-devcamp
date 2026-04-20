# Lab Overview

## Securing AI Agents with Auth0

In this lab, you will secure an AI chat assistant that simulates an LLM-powered travel concierge. The assistant can answer questions and call tools (weather lookup, calendar check, email send, document retrieval, external file access) on behalf of authenticated users. You will implement identity and authorization at every layer using Auth0.

The chat UI ships pre-built — your focus is entirely on the security and identity layers.

---

## What You'll Learn

### Auth0 for AI Agents (Labs 1–4)
1. **User Authentication** — Authenticate users with Auth0, validate JWTs, pass user context to the agent
2. **Async Authorization (CIBA)** — Use Client-Initiated Backchannel Authentication for sensitive agent actions
3. **Fine Grained Authorization (FGA)** — Relationship-based access control for document-level permissions
4. **Token Vault** — Securely store and manage third-party OAuth tokens for agent access

### Auth for MCP (Lab 5)
5. **MCP Authentication** — API registration, Protected Resource Metadata (RFC 9728), Dynamic Client Registration, Resource Indicators (RFC 8707), and OAuth 2.0 token validation

---

## Architecture

```
Browser (React)  →  Express API  →  MCP Server
   ↕                    ↕                ↕
  Auth0              Auth0            Auth0
  Login             JWT Verify      Token Validation
                    CIBA             DCR
                    FGA              Protected Resource Metadata
                    Token Vault      Resource Indicators
```

---

## Project Structure

```
app/
├── index.html              # HTML shell
├── package.json            # Dependencies
├── vite.config.ts          # Vite + proxy config
├── .env                    # Auth0 configuration
├── src/
│   ├── main.tsx            # React entrypoint
│   ├── App.tsx             # Root component with auth gate
│   ├── auth/
│   │   └── Auth0Provider.tsx   # Auth0 React provider
│   ├── components/
│   │   ├── Chat.tsx            # Main chat interface (pre-built)
│   │   ├── Message.tsx         # Individual message bubble (pre-built)
│   │   ├── ToolApproval.tsx    # Consent dialog for tool calls
│   │   └── LoginScreen.tsx     # Pre-auth landing page (pre-built)
│   ├── hooks/
│   │   └── useChat.ts          # Chat state management
│   └── styles/
│       └── index.css           # Styles (pre-built)
└── server/
    ├── index.ts                # Express server entrypoint
    ├── simulator.ts            # Simulated LLM logic
    ├── middleware/
    │   ├── auth.ts             # JWT validation middleware
    │   └── ciba.ts             # CIBA authorization logic
    ├── fga/
    │   ├── model.ts            # FGA authorization model
    │   └── client.ts           # FGA client + access checks
    ├── token-vault/
    │   ├── vault.ts            # Token storage + retrieval
    │   └── third-party-api.ts  # Simulated third-party API
    ├── tools/
    │   ├── registry.ts         # Tool definitions + permissions
    │   ├── documents.ts        # Document retrieval (FGA-protected)
    │   └── external-files.ts   # External file access (Token Vault)
    └── mcp/
        ├── server.ts           # MCP server
        ├── client.ts           # MCP client
        ├── metadata.ts         # Protected Resource Metadata
        └── dcr.ts              # Dynamic Client Registration
```

---

## What's Pre-Built

The following components are fully implemented in the starter code and require no modification:

- **Chat UI** -- `Chat.tsx`, `Message.tsx`, `LoginScreen.tsx` (complete interface)
- **Styles** -- `index.css` (all styling)
- **Basic Express server** -- `/api/chat` endpoint (no auth)
- **AI Responses** -- When `OPENAI_API_KEY` is set in your `.env`, the agent uses OpenAI for natural language responses with real tool calling. Without a key, it falls back to a pattern-matching simulator. Either way, the security layers you build are identical.
- **Pattern-matching fallback** -- `simulator.ts` handles responses when no API key is configured

---

## What You'll Build

| Lab | What You Implement |
|-----|--------------------|
| 1 | Auth0 SPA config, Auth0Provider, login/logout, auth gate, JWT middleware, access tokens |
| 2 | CIBA authorization request, polling loop, out-of-band approval, tool gating |
| 3 | FGA model, authorization tuples, per-document access checks, document tool |
| 4 | Token vault store/retrieve, simulated third-party API, external files tool |
| 5 | DCR flow, API registration, PRM endpoint, resource indicators, MCP token validation |
| 6 | End-to-end integration test across all layers |

---

## Labs

| # | Title | Focus |
|---|-------|-------|
| 1 | [User Authentication](./01-user-authentication.md) | Auth0 SPA login, JWT validation, user context in agent |
| 2 | [Async Authorization (CIBA)](./02-async-authorization-ciba.md) | Backchannel consent for sensitive agent actions |
| 3 | [Fine Grained Authorization](./03-fine-grained-authorization.md) | FGA for document-level access control |
| 4 | [Token Vault](./04-token-vault.md) | Third-party API access via stored OAuth tokens |
| 5 | [Auth for MCP](./05-auth-for-mcp.md) | DCR, API registration, PRM, resource indicators, token validation |
| 6 | [End-to-End](./06-end-to-end.md) | Full integration test across all layers |
