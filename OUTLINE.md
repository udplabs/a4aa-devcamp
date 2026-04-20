# Securing AI Agents with Auth0 — Workshop Outline

> A hands-on DevCamp workshop securing an AI travel concierge (Voyager) end-to-end with Auth0 — from user login through CIBA, FGA, Token Vault, and MCP authorization. The chat UI is pre-built; participants focus entirely on the security and identity layers.

---

## Two Pillars

| Pillar | Labs | Focus |
|--------|------|-------|
| **Auth0 for AI Agents** | Labs 1–4 | User auth, async consent (CIBA), per-object access (FGA), third-party credentials (Token Vault) |
| **Auth for MCP** | Lab 5 | API registration, Protected Resource Metadata (RFC 9728), CIMD, On-Behalf-Of Token Exchange, token validation |

Lab 6 is an end-to-end integration test that exercises all layers together.

---

## Architecture

```
Browser (React)  →  Express API  →  MCP Server (:3001)
   ↕                    ↕                ↕
  Auth0              Auth0            Auth0
  Login             JWT Verify      Token Validation
                    CIBA             CIMD
                    FGA              Protected Resource Metadata
                    Token Vault →    Token Exchange
                         ↓
                   Third-Party File
                   Storage API (:3002)
```

---

## Lab-by-Lab Outline

### Lab 1 — User Authentication

**Premise:** The chat UI works but has no identity layer. Add authentication from login to JWT-protected API calls.

**Objectives:**
- Configure an Auth0 SPA application and API (resource server)
- Wire `Auth0Provider` into the React app
- Implement login/logout and gate the chat behind authentication
- Add JWT validation middleware to Express
- Send access tokens from the frontend and extract user context (`sub`, `email`, `scopes`)

**Key Files:**
| Starter | What Changes |
|---------|-------------|
| `src/auth/Auth0Provider.tsx` | Auth0 React provider configuration |
| `src/main.tsx` | Wrap app in `Auth0Provider` |
| `src/App.tsx` | Auth gate (login screen vs. chat) |
| `server/middleware/auth.ts` | JWT validation with `express-oauth2-jwt-bearer` |
| `server/index.ts` | Apply `validateAccessToken` to `/api/chat` |
| `src/hooks/useChat.ts` | Attach `Authorization: Bearer` header |

**Checkpoint:**
- Unauthenticated users see the Login Screen, not the chat
- Login redirects through Auth0 Universal Login and back
- Chat messages work with a valid token; raw `fetch` without a token returns 401
- Server console logs `Authenticated request from user: auth0|...`

---

### Lab 2 — Async Authorization (CIBA)

**Premise:** Sensitive tools (e.g., send email) need explicit user consent obtained asynchronously via CIBA — not a simple in-app dialog.

**Objectives:**
- Understand Client-Initiated Backchannel Authentication and why it matters for agents
- Implement a CIBA authorization request, polling loop, and approval/denial handling
- Execute the tool only after out-of-band CIBA approval

**Key Files:**
| Starter | What Changes |
|---------|-------------|
| `server/middleware/ciba.ts` | CIBA initiate, poll, approve, deny, list pending (simulated) |
| `server/index.ts` | CIBA routes (`/api/ciba/*`) |
| `server/simulator.ts` | Trigger CIBA for consent-required tools |
| `src/hooks/useChat.ts` | CIBA polling state + `pollCIBAStatus` |
| `src/components/Chat.tsx` | "Out-of-Band Approval Required" UI |

**Checkpoint:**
- "Send a booking confirmation to my email" triggers the CIBA waiting state
- `curl -X POST /api/ciba/approve/<auth_req_id>` approves; tool then executes
- `curl -X POST /api/ciba/deny/<auth_req_id>` denies; chat shows "Authorization was denied"

---

### Lab 3 — Fine Grained Authorization (FGA)

**Premise:** Not every user should see every document. FGA provides relationship-based access control at the document level.

**Objectives:**
- Define an FGA authorization model (document, user, viewer/editor/owner relationships)
- Write authorization tuples and seed per-user access
- Add FGA checks before returning document data
- Handle authorized vs. unauthorized access gracefully

**Key Files:**
| Starter | What Changes |
|---------|-------------|
| `server/fga/model.ts` | FGA model + simulated document store |
| `server/fga/client.ts` | Tuple store, `checkAccess`, `seedTuplesForUser`, `listAccessibleDocuments` |
| `server/tools/documents.ts` | `getDocument` / `listDocuments` with FGA gating |
| `server/tools/registry.ts` | Register `get_document`, `list_documents` |
| `server/simulator.ts` | Intent detection + response formatting for documents |

**Checkpoint:**
- "What documents do I have access to?" → 3 of 4 documents listed
- "Show me the project roadmap" → content displayed (viewer)
- "Show me the classified report" → "Access denied"

---

### Lab 4 — Token Vault

**Premise:** The agent needs to call a third-party File Storage API on behalf of the user. Token Vault stores and manages the user's third-party OAuth credentials.

**Objectives:**
- Implement a token vault that stores credentials per `(userId, provider)`
- Build a simulated third-party File Storage API
- Create a tool that retrieves a vaulted token and calls the external API
- Handle token refresh and expiration

**Key Files:**
| Starter | What Changes |
|---------|-------------|
| `server/token-vault/vault.ts` | Store, retrieve, refresh, remove tokens |
| `server/token-vault/third-party-api.ts` | Simulated File Storage API (`:3002`) |
| `server/tools/external-files.ts` | `getExternalFiles` using vaulted tokens |
| `server/tools/registry.ts` | Register `get_external_files` |
| `server/index.ts` | Start third-party API + account linking endpoints |
| `server/simulator.ts` | Intent detection + response formatting for files |

**Checkpoint:**
- "Show my files from storage" → list of 4 files
- Server logs show Token Vault retrieval → third-party API call chain
- `curl http://localhost:3002/api/files` without a token → 401

---

### Lab 5 — Auth for MCP

**Premise:** The agent's tools run on a separate MCP server. This lab secures that server with five capabilities in a single multi-part lab.

**Objectives:**
- **Part A — API Registration:** Register MCP server as an Auth0 API with per-tool scopes (`mcp:weather:read`, `mcp:calendar:read`, `mcp:email:send`, `mcp:documents:read`)
- **Part B — Protected Resource Metadata (RFC 9728):** `GET /.well-known/oauth-protected-resource` advertising auth requirements
- **Part C — Client ID Metadata (CIMD):** MCP clients are pre-configured in Auth0 with metadata describing their identity and capabilities
- **Part D — On-Behalf-Of Token Exchange:** Agent exchanges user's access token for one scoped to the MCP server; user identity flows through
- **Part E — OAuth 2.0 Token Validation:** Every tool call validated with `express-oauth2-jwt-bearer` + per-tool scope enforcement

**Key Files:**
| Starter | What Changes |
|---------|-------------|
| `server/mcp/metadata.ts` | Protected Resource Metadata endpoint |
| `server/mcp/cimd.ts` | Client ID Metadata module |
| `server/mcp/client.ts` | On-behalf-of token exchange, tool execution with user context |
| `server/mcp/server.ts` | Full MCP server: PRM, OAuth metadata, token validation, scope enforcement |

**Checkpoint:**
- `curl /.well-known/oauth-protected-resource` → metadata JSON
- `curl /mcp/tools` without a token → 401
- Chat "What's the weather in Paris?" → MCP token exchange visible in logs

---

### Lab 6 — End-to-End Integration Test

**Premise:** Verify the complete auth chain across all layers by running through 8 scenarios.

**Objectives:**
- Confirm every protection mechanism works independently and together

**Test Scenarios:**
| # | Scenario | Protection Exercised |
|---|----------|---------------------|
| 1 | Unauthenticated user → Login Screen | Auth0 Universal Login + auth gate |
| 2 | Low-risk tool via MCP (weather) | JWT + MCP M2M token |
| 3 | High-risk tool via CIBA (send email) | CIBA backchannel approval |
| 4 | Document retrieval — allowed & denied | FGA relationship checks |
| 5 | Third-party API via Token Vault | Vaulted bearer token |
| 6 | MCP metadata discovery | PRM + OAuth metadata endpoints |
| 7 | Direct MCP attack (no/fake token) | Token validation → 401 |
| 8 | Direct API attack (no/fake token) | JWT validation → 401 |

---

## Presentation Slides Outline

| Deck | File | Topics |
|------|------|--------|
| **00 — Title** | `presentation/00-title.md` | Workshop title, what you'll build, prerequisites, agenda table |
| **01 — Why Identity Matters for AI** | `presentation/01-identity-and-ai.md` | New attack surface, three-layer trust chain, real-world scenarios (with/without CIBA & FGA), three Auth0 products overview |
| **02 — Auth0 AI for Agents** | `presentation/02-auth0-ai-agents.md` | Four use cases: User Auth, CIBA, FGA, Token Vault — with code snippets and architecture diagram |
| **03 — Auth for MCP** | `presentation/03-auth-for-mcp.md` | MCP overview, auth gap, five capabilities (API registration, PRM, CIMD, on-behalf-of token exchange, token validation), combined flow diagram |
| **04 — Lab Overview** | `presentation/04-lab-overview.md` | Voyager app description, full architecture diagram, lab progression (Labs 1–6), simulated vs. real table |

---

## What's Simulated vs. Real

| Component | Status | Notes |
|-----------|--------|-------|
| Auth0 login | **Real** | Real Auth0 tenant |
| JWT validation | **Real** | Real tokens, real `express-oauth2-jwt-bearer` validation |
| CIBA flow | **Simulated** | In-memory store + manual `curl` approval (no push notifications) |
| FGA model | **Simulated** | In-memory tuples instead of Auth0 FGA dashboard |
| Token Vault | **Simulated** | In-memory store instead of managed vault service |
| Third-party API | **Simulated** | Local Express server (`:3002`) instead of real Google/Dropbox |
| LLM | **Simulated** | Pattern-matching `simulator.ts` — no API key needed |
| MCP protocol | **Real** | Actual HTTP endpoints + OAuth token flow |
| Auth for MCP | **Real** | Real OAuth 2.0 token validation on MCP server |
