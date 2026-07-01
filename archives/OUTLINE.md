# Securing AI Agents with Auth0, Workshop Outline

> A hands-on DevCamp workshop securing RetailZero's Z-Merchant, a B2B wholesale quote agent, end-to-end with Auth0. You will implement user auth, CIBA, FGA, Token Vault, and a full Auth-for-MCP stack. The chat UI ships pre-built so participants focus entirely on the security and identity layers.

---

## Business Context

RetailZero's wholesale channel runs on the deal desk. Every bulk quote costs hours of salaried rep time, and every non-standard discount adds a round trip with finance. Z-Merchant is the agent RetailZero built to compress that cycle: it drafts the quote, pings triage, and commits final terms. This workshop is how you make Z-Merchant safe to ship. The architecture reduces operational expense by cutting quote-to-close time, and accelerates go-to-market for every downstream AI workflow that follows.

---

## Two Pillars

| Pillar | Labs | Focus |
|--------|------|-------|
| **Auth0 for AI Agents** | Labs 1 to 4 | User auth, async consent (CIBA), per-account access (FGA), third-party credentials (Token Vault) |
| **Auth for MCP** | Lab 5 | API registration, Protected Resource Metadata (RFC 9728), Authorization Server Metadata, CIMD, On-Behalf-Of token exchange with RFC 8707 resource indicator, per-tool scope enforcement |

Lab 6 is an end-to-end integration test that exercises every pillar together on the Z-Merchant workflow.

---

## Architecture

```
Browser (React)  ->  Express API  ->  MCP Server (:3001)
   |                    |                 |
  Auth0              Auth0             Auth0
  Login             JWT Verify       Token Validation
                    CIBA              CIMD
                    FGA               Protected Resource Metadata
                    Token Vault ->    Authorization Server Metadata
                         |            On-Behalf-Of + resource=
                         v            Per-tool scope enforcement
                   Third-Party Mock
                   (:3002)
                   Google Docs + Slack
```

Everything runs locally. Google and Slack are simulated against a mock on port 3002 so the lab is offline-runnable.

---

## Lab-by-Lab Outline

### Lab 1, User Authentication

**Premise:** The Z-Merchant UI works but has no identity layer. Until a rep logs in, the agent has no idea whose accounts it is supposed to see. Add authentication from first login through JWT-protected API calls.

**Objectives:**
- Configure an Auth0 SPA application and a RetailZero API (resource server).
- Wire Auth0Provider into the React app.
- Implement login, logout, and the auth gate so unauthenticated reps land on the login screen.
- Add JWT validation middleware to Express using `express-oauth2-jwt-bearer`.
- Send access tokens from the frontend and extract user context (sub, email, scopes) server-side.

**Key Files:**
| Starter | What Changes |
|---------|--------------|
| `src/auth/Auth0Provider.tsx` | Auth0 React provider configuration |
| `src/main.tsx` | Wrap app in Auth0Provider |
| `src/App.tsx` | Auth gate (login screen vs. chat) |
| `server/middleware/auth.ts` | JWT validation middleware |
| `server/index.ts` | Apply `validateAccessToken` to `/api/chat` |
| `src/hooks/useChat.ts` | Attach `Authorization: Bearer` header |

**Checkpoint:**
- Unauthenticated reps see the Login Screen, not the chat.
- Login redirects through Auth0 Universal Login and back.
- Chat works with a valid token. Raw `fetch` without a token returns 401.
- Server console logs `Authenticated request from user: auth0|...`.

---

### Lab 2, Async Authorization (CIBA)

**Premise:** Committing a quote with a non-standard discount or off-policy payment terms cannot be a one-click action inside the agent. It requires a fresh, out-of-band approval from the rep, with the exact terms signed into the approval prompt.

**Objectives:**
- Understand why CIBA is the right primitive for high-stakes agent actions.
- Implement a CIBA authorization request, polling loop, and approval or denial handling.
- Build a binding message from quote parameters so the rep sees exactly what they are approving.
- Only execute `commit_quote_terms` after CIBA approval lands.

**Key Files:**
| Starter | What Changes |
|---------|--------------|
| `server/middleware/ciba.ts` | CIBA initiate, poll, approve, deny, list pending (simulated) plus binding message helper |
| `server/index.ts` | CIBA routes (`/api/ciba/*`) |
| `server/simulator.ts` and `server/llm.ts` | Route `commit_quote_terms` through the CIBA gate |
| `src/hooks/useChat.ts` | Poll CIBA status after a `pendingCIBA` response |
| `src/components/ToolApproval.tsx` | Render the binding message |

**Checkpoint:**
- "Commit the Acme quote at 25% discount, net-60" triggers the CIBA waiting state.
- `curl -X POST /api/ciba/approve/<auth_req_id>` approves and the agent completes the commit.
- `curl -X POST /api/ciba/deny/<auth_req_id>` denies and the agent reports "Approval denied."

---

### Lab 3, Fine Grained Authorization (FGA)

**Premise:** Reps only see the accounts they own or manage. A rep cannot quote an account outside their book, and an unassigned account cannot be touched by anyone. Enforce this at the data boundary, not in the prompt.

**Objectives:**
- Define an FGA authorization model for the wholesale account graph (user owns account, user manages team, team owns account).
- Seed relationship tuples for the demo reps.
- Implement `canReadAccount` and `canCommitQuote` checks.
- Wire the checks into `get_catalog_and_buyer_tier` and `commit_quote_terms` on the MCP server.

**Key Files:**
| Starter | What Changes |
|---------|--------------|
| `server/fga/model.ts` | FGA model plus wholesale account + catalog seed |
| `server/fga/client.ts` | Tuple store, `canReadAccount`, `canCommitQuote`, `seedTuplesForUser` |
| `server/mcp/server.ts` | Call the FGA checks inside the tool handlers |

**Checkpoint:**
- "Quote SKU-WX-42 for Acme" (alice owns acme) returns the tier price.
- "Quote SKU-WX-42 for Initech" (alice manages team-west, team-west owns initech) also works.
- "Quote SKU-WX-42 for Stark" returns an FGA deny (stark is unassigned).

---

### Lab 4, Token Vault

**Premise:** To draft a quote Z-Merchant has to write a Google Doc. To triage, it has to post in Slack. Both require per-rep OAuth credentials. Token Vault stores those credentials, refreshes them automatically, and hands the agent a short-lived, scoped token for exactly one downstream call.

**Objectives:**
- Register `google` and `slack` providers with the right scopes.
- Seed per-rep tokens on first access.
- Build the mock third-party API on port 3002 that validates the vaulted bearer.
- Wire `create_google_doc` and `post_slack_triage` tool bodies to mint a token and call the mock.

**Key Files:**
| Starter | What Changes |
|---------|--------------|
| `server/token-vault/vault.ts` | Provider registration, store, retrieve, refresh |
| `server/token-vault/third-party-api.ts` | Mock Google Docs + Slack endpoints |
| `server/mcp/server.ts` | Tool handlers for `create_google_doc` and `post_slack_triage` |
| `server/index.ts` | `/api/vault/link` and `/api/vault/providers` |

**Checkpoint:**
- "Draft the Acme bulk quote" creates a mock Google Doc and returns the URL.
- "Post to deal-desk triage" creates a mock Slack message with a permalink.
- Server logs show vault retrieval, then the outbound call to `:3002`.
- `curl http://localhost:3002/google/docs` without a bearer returns 401.

---

### Lab 5, Auth for MCP

**Premise:** Z-Merchant's tools run on a separate MCP server. This lab secures that server with the full Auth-for-MCP stack in one multi-part walkthrough. This is the keystone of the workshop.

**Objectives:**
- **Part A, API Registration.** Register the MCP server as an Auth0 API. Audience `https://devcamp-mcp-server`, RS256 signing, per-tool scopes: `mcp:quote:read`, `mcp:docs:create`, `mcp:slack:post`, `mcp:quote:commit`.
- **Part B, Client ID Metadata (CIMD).** Pre-register the agent client (`ai-agent-retailzero`) in Auth0. Allow-list the four scopes. No dynamic client registration; every client that reaches the MCP server is known in advance.
- **Part C, Protected Resource Metadata (RFC 9728).** Implement `GET /.well-known/oauth-protected-resource` so clients can discover the auth requirements of the MCP server.
- **Part D, Authorization Server Metadata.** Implement `GET /.well-known/oauth-authorization-server` so clients can discover Auth0's endpoints without hard-coding them.
- **Part E, On-Behalf-Of Token Exchange.** Exchange the rep's access token for an MCP-audience token using `urn:ietf:params:oauth:grant-type:token-exchange`, passing both `audience=` and the RFC 8707 `resource=` parameter. The rep's `sub` claim is preserved.
- **Part F, Per-Tool Scope Enforcement.** On the MCP server, each tool handler checks the token's scopes before executing.

**Key Files:**
| Starter | What Changes |
|---------|--------------|
| `server/mcp/metadata.ts` | PRM + Authorization Server Metadata endpoints |
| `server/mcp/cimd.ts` | Client ID Metadata module |
| `server/mcp/client.ts` | OBO token exchange with `resource=` audience parameter |
| `server/mcp/server.ts` | Audience validation, per-tool scope enforcement |

**Checkpoint:**
- `curl /.well-known/oauth-protected-resource` returns the metadata JSON.
- `curl /mcp/tools` without a token returns 401.
- Agent flow end-to-end succeeds: logs show OBO exchange, `aud=https://devcamp-mcp-server` enforced, per-tool scope checked on every call.

---

### Lab 6, End-to-End Integration Test

**Premise:** Verify the complete auth chain across every layer by running through eight scenarios on the Z-Merchant workflow.

**Test Scenarios:**
| # | Scenario | Protection Exercised |
|---|----------|---------------------|
| 1 | Unauthenticated rep goes to Login Screen | Auth0 Universal Login + auth gate |
| 2 | "Quote SKU-WX-42 for Acme" returns tier price | JWT + OBO + FGA allow |
| 3 | "Quote SKU-WX-42 for Stark" returns deny | FGA deny |
| 4 | "Draft the Acme bulk quote" creates Google Doc | Token Vault -> Google |
| 5 | "Post to deal-desk triage" creates Slack message | Token Vault -> Slack |
| 6 | "Commit the Acme quote at 15% discount, net-30" | Direct commit (no CIBA required) |
| 7 | "Commit the Acme quote at 25% discount, net-60" | CIBA gate, approve via curl, flow completes |
| 8 | Direct MCP call with forged token | Token validation returns 401 |

---

## What's Simulated vs. Real

| Component | Status | Notes |
|-----------|--------|-------|
| Auth0 login | **Real** | Real Auth0 tenant |
| JWT validation | **Real** | Real tokens, real `express-oauth2-jwt-bearer` |
| CIBA flow | **Simulated** | In-memory store plus curl approval; no Guardian push |
| FGA model | **Simulated** | In-memory relationship tuples |
| Token Vault | **Simulated** | In-memory store, scoped mint, refresh |
| Google Docs + Slack | **Simulated** | Local mock on `:3002` |
| LLM | **Optional real** | OpenAI if `OPENAI_API_KEY` is set; otherwise a pattern-matching simulator |
| MCP protocol | **Real** | Actual HTTP endpoints + OAuth token flow |
| Auth for MCP | **Real** | Real OAuth 2.0 token validation, audience enforcement, scope checks |

---

## Future Compatibility: Claude Agent SDK

The tool registry (`server/tools/registry.ts`) is framework-agnostic. `server/llm.ts` is the only file that talks to the model provider. Swapping OpenAI for the Claude Agent SDK is a single-file change: rewrite the body of `processMessage()` to drive a Claude tool-use loop. The MCP layer, Token Vault, FGA, and CIBA middleware do not need to change.
