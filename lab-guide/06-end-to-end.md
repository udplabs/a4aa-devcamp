# Lab 6: End-to-End Integration Test

## Objectives

- Verify the complete authentication and authorization chain across all layers
- Test each protection mechanism independently
- Understand the full security model from user to agent to tool

---

## The Complete Flow

Run through each of these scenarios to confirm everything works.

---

### Scenario 1: Unauthenticated User (User Auth)

1. Open the app in an incognito window
2. You should see the **Login Screen** — not the chat
3. The API is inaccessible without authentication

**What's protecting this:** Auth0 Universal Login + `useAuth0()` hook + auth gate in `App.tsx`

---

### Scenario 2: Low-Risk Tool via MCP (User Auth + MCP)

1. Log in
2. Send: **"What's the weather in Berlin?"**
3. Expected:
   - No approval dialog
   - Weather response appears immediately
   - Server logs show JWT validation + MCP token exchange

**What's protecting this:**
- Frontend → API: Auth0 access token (JWT)
- Agent → Tool: Auto-approved (low risk, no consent required)
- Agent → MCP: M2M client credentials token scoped to MCP server

---

### Scenario 3: High-Risk Tool via CIBA (CIBA)

1. Send: **"Send an email to team@company.com about the project update"**
2. Expected: Out-of-band approval required message appears
3. In a separate terminal, approve the CIBA request:

```bash
# Get the auth_req_id from the server logs
curl -X POST http://localhost:3000/api/ciba/approve/<auth_req_id>
```

4. Expected:
   - Polling detects the approval
   - Agent executes the email tool
   - Confirmation message appears

**What's protecting this:**
- CIBA backchannel authorization — user must approve on a separate device/channel
- Agent cannot execute the tool until CIBA approval is received

---

### Scenario 4: Document Retrieval with FGA (FGA)

1. Send: **"What documents do I have access to?"**
2. Expected: List of 3 documents (project-roadmap, budget-2025, team-handbook)

3. Send: **"Show me the project roadmap"**
4. Expected: Document content displayed with access level "viewer"

5. Send: **"Show me the classified report"**
6. Expected: "Access denied" — FGA check fails

**What's protecting this:**
- FGA relationship-based access control
- Per-document authorization tuples
- `checkAccess()` before returning any document data

---

### Scenario 5: Third-Party API via Token Vault (Token Vault)

1. Send: **"Show my files from storage"**
2. Expected: List of files from the simulated File Storage API

**What's protecting this:**
- Token Vault retrieves stored third-party OAuth token
- Third-party API validates the bearer token
- Agent never sees raw credentials

---

### Scenario 6: MCP Discovery (Auth for MCP)

Test the MCP metadata endpoints:

```bash
# Protected Resource Metadata (RFC 9728)
curl http://localhost:3001/.well-known/oauth-protected-resource | jq .

# OAuth Authorization Server Metadata
curl http://localhost:3001/.well-known/oauth-authorization-server | jq .
```

Both should return metadata that tells MCP clients how to authenticate.

---

### Scenario 7: Direct MCP Attack (Token Validation)

```bash
# No token — should return 401
curl http://localhost:3001/mcp/tools

# Fake token — should return 401
curl -H "Authorization: Bearer fake.token.here" http://localhost:3001/mcp/tools

# Direct tool call without token — should return 401
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"send_email","arguments":{"to":"victim@example.com","subject":"spam","body":"hacked"}}'
```

All should return **401 Unauthorized**.

---

### Scenario 8: Direct API Attack

Open the browser console and try:

```javascript
// No token
fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Send an email" })
}).then(r => console.log("No token:", r.status));

// Fake token
fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer fake.token.here"
  },
  body: JSON.stringify({ message: "Send an email" })
}).then(r => console.log("Fake token:", r.status));
```

Both should return **401 Unauthorized**.

---

## Security Summary

| Attack Vector | Protection | Layer |
|---------------|-----------|-------|
| Unauthenticated chat access | Auth0 Universal Login | Frontend |
| Unauthenticated API call | JWT validation (`express-oauth2-jwt-bearer`) | API |
| Forged/expired token | RS256 signature + JWKS validation | API |
| Sensitive tool without consent | CIBA backchannel authorization | Agent |
| Unauthorized document access | FGA relationship-based checks | Agent |
| Third-party API without credentials | Token Vault managed tokens | Agent |
| Direct MCP server access | OAuth 2.0 token validation | MCP |
| MCP call without required scope | Per-tool scope enforcement | MCP |
| Unknown MCP client | Dynamic Client Registration | MCP |
| Token reuse across MCP servers | Resource indicators (RFC 8707) | MCP |

---

## What You Built

```
┌──────────────────────────────────────────────────────────────────┐
│                        YOUR APPLICATION                          │
│                                                                  │
│  ┌─────────────────┐     ┌──────────────────────────────────┐   │
│  │   React Chat    │────▶│         Express API               │   │
│  │   Interface     │     │                                    │   │
│  │                 │     │  ┌──────────────────┐             │   │
│  │  • Auth0 Login  │     │  │  JWT Validation  │             │   │
│  │  • Chat UI      │     │  └──────────────────┘             │   │
│  │  • CIBA Status  │     │                                    │   │
│  └─────────────────┘     │  ┌──────────────────┐             │   │
│                          │  │  LLM Simulator   │             │   │
│                          │  └──────────────────┘             │   │
│                          │                                    │   │
│                          │  ┌──────────────────┐             │   │
│                          │  │  CIBA Auth       │             │   │
│                          │  └──────────────────┘             │   │
│                          │                                    │   │
│                          │  ┌──────────────────┐             │   │
│                          │  │  FGA Checks      │             │   │
│                          │  └──────────────────┘             │   │
│                          │                                    │   │
│                          │  ┌──────────────────┐             │   │
│                          │  │  Token Vault     │─────▶ Third-Party API
│                          │  └──────────────────┘      (File Storage)
│                          │                                    │   │
│                          │  ┌──────────────────┐             │   │
│                          │  │  MCP Client      │─────▶ MCP Server
│                          │  │  (M2M + DCR)     │      • PRM (RFC 9728)
│                          │  └──────────────────┘      • Token Validation
│                          └──────────────────────────────────┘   │
│                                                                  │
│                          ┌─────────────────┐                    │
│                          │   Auth0 Tenant  │                    │
│                          │                 │                    │
│                          │ • Users         │                    │
│                          │ • APIs          │                    │
│                          │ • M2M Apps      │                    │
│                          │ • FGA Model     │                    │
│                          │ • CIBA Config   │                    │
│                          │ • Scopes        │                    │
│                          └─────────────────┘                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Cleanup

If you want to clean up your Auth0 tenant:
1. Delete the `DevCamp AI Chat` SPA application
2. Delete the `DevCamp CIBA Agent` M2M application
3. Delete the `DevCamp MCP Client` M2M application
4. Delete the `DevCamp AI API` API
5. Delete the `DevCamp MCP Server` API
6. Delete any test users you created
