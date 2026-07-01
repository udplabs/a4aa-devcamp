# Lab Overview: What We're Building

---

## The Application

A **protected AI chat assistant** (Voyager — travel concierge) that:

1. Authenticates users via Auth0 (User Auth)
2. Requires out-of-band approval for sensitive actions (CIBA)
3. Controls document access per-user (FGA)
4. Accesses third-party APIs with stored credentials (Token Vault)
5. Serves tools through a protected MCP server (Auth for MCP)

**The chat UI is pre-built.** You focus entirely on the security and identity layers.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │              React Chat Interface (pre-built)      │  │
│  │                                                    │  │
│  │   ┌──────────┐  ┌────────────┐  ┌──────────────┐ │  │
│  │   │  Login   │  │  Message   │  │    CIBA      │ │  │
│  │   │  Screen  │  │  Thread    │  │   Status     │ │  │
│  │   └──────────┘  └────────────┘  └──────────────┘ │  │
│  │              @auth0/auth0-react                    │  │
│  └──────────────────────┬────────────────────────────┘  │
│                          │ Access Token                   │
└──────────────────────────┼───────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Express    │
                    │  API Server │
                    ├─────────────┤
                    │ JWT Verify  │ ← Lab 1: User Authentication
                    ├─────────────┤
                    │ CIBA Auth   │ ← Lab 2: Async Authorization
                    ├─────────────┤
                    │ FGA Checks  │ ← Lab 3: Fine Grained Authorization
                    ├─────────────┤
                    │ Token Vault │ ← Lab 4: Third-Party Access
                    ├─────────────┤        ┌──────────────┐
                    │ MCP Client  │───────▶│ Third-Party  │
                    └──────┬──────┘        │ File Storage │
                           │               │ API (:3002)  │
                    ┌──────▼──────┐        └──────────────┘
                    │ MCP Server  │
                    │   (:3001)   │ ← Lab 5: Auth for MCP
                    ├─────────────┤
                    │ PRM (9728)  │
                    │ CIMD        │
                    │ Token Valid. │
                    │ Scope Check │
                    └─────────────┘
```

---

## Lab Progression

### Lab 1: User Authentication
**Start:** Pre-built chat UI, no auth
**End:** Auth0 login, JWT-protected API, user context in agent

### Lab 2: Async Authorization (CIBA)
**Start:** Tools execute without consent
**End:** Sensitive tools require CIBA out-of-band approval

### Lab 3: Fine Grained Authorization (FGA)
**Start:** No document access control
**End:** Per-document authorization via FGA relationship model

### Lab 4: Token Vault
**Start:** No third-party API access
**End:** Agent accesses external File Storage API with vaulted tokens

### Lab 5: Auth for MCP
**Start:** MCP server with no auth
**End:** Full MCP auth: CIMD, PRM, on-behalf-of token exchange, scope enforcement

### Lab 6: End-to-End Test
Run through all 8 test scenarios to verify every protection layer.

---

## What's Simulated vs. Real

| Component | Real or Simulated? | Why? |
|-----------|-------------------|------|
| Auth0 login | **Real** | Real Auth0 tenant |
| JWT validation | **Real** | Real tokens, real validation |
| CIBA flow | **Simulated** | No push notifications in a lab; manual approval endpoint |
| FGA model | **Simulated** | In-memory tuples instead of Auth0 FGA dashboard |
| Token Vault | **Simulated** | In-memory store instead of managed vault |
| Third-party API | **Simulated** | Local Express server instead of real Google/Dropbox |
| LLM | **Simulated** | No API key needed; focus is on auth |
| MCP protocol | **Real** | Actual HTTP endpoints + token flow |
| Auth for MCP | **Real** | Real OAuth 2.0 token validation |

---

## Let's Build It

Open your starter project and proceed to **Lab 1: User Authentication**.
