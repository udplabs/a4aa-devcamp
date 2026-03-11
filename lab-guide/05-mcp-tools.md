# Lab 5: End-to-End Integration Test

**Duration:** ~5 minutes

## Objectives

- Verify the complete authentication and authorization chain
- Test each protection layer independently
- Understand the full security model

---

## The Complete Flow

Run through each of these scenarios to confirm everything works:

---

### Scenario 1: Unauthenticated User

1. Open the app in an incognito window
2. You should see the **Login Screen** - not the chat
3. The API is inaccessible without authentication

**What's protecting this:** Auth0 Universal Login + `useAuth0()` hook in the frontend

---

### Scenario 2: Authenticated User + Low-Risk Tool

1. Log in
2. Send: **"What's the weather in Berlin?"**
3. Expected:
   - No approval dialog
   - Weather response appears immediately
   - Server logs show JWT validation + MCP token exchange

**What's protecting this:**
- Frontend → API: Auth0 access token (JWT)
- Agent → Tool: Auto-approved (low risk)
- Agent → MCP: M2M client credentials token

---

### Scenario 3: Authenticated User + High-Risk Tool (Approve)

1. Send: **"Send an email to team@company.com about the project update"**
2. Expected:
   - Tool Approval dialog appears
   - Shows: tool name, risk level (HIGH), required scopes
3. Click **Approve**
4. Expected:
   - Agent re-processes the message
   - Email "sent" confirmation appears
   - Server logs show consent recorded + MCP tool call

**What's protecting this:**
- Frontend → API: Auth0 access token
- Agent → Tool: Consent-required → user approval → consent recorded
- Agent → MCP: M2M token with `mcp:email:send` scope

---

### Scenario 4: Authenticated User + High-Risk Tool (Deny)

1. Send: **"Email the whole company about free pizza"**
2. When the approval dialog appears, click **Deny**
3. Expected:
   - Agent acknowledges the denial
   - No email is sent
   - No MCP call is made

**What's protecting this:** Agent authorization - the tool is never called

---

### Scenario 5: Direct API Attack

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

### Scenario 6: Direct MCP Server Attack

```bash
# No token
curl -X POST http://localhost:3001/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"send_email","arguments":{"to":"victim@example.com","subject":"spam","body":"hacked"}}'

# Should return 401
```

---

## Security Summary

| Attack Vector | Protection | Layer |
|---------------|-----------|-------|
| Unauthenticated chat access | Auth0 Universal Login | Frontend |
| Unauthenticated API call | JWT validation (`express-oauth2-jwt-bearer`) | API |
| Forged/expired token | RS256 signature + JWKS validation | API |
| Agent executes sensitive tool without consent | Tool authorization + consent flow | Agent |
| Direct MCP server access | OAuth 2.0 token validation | MCP |
| MCP call without required scope | Per-tool scope enforcement | MCP |

---

## What You Built

```
┌──────────────────────────────────────────────────────┐
│                    YOUR APPLICATION                    │
│                                                        │
│  ┌─────────────────┐     ┌──────────────────────┐    │
│  │   React Chat    │────▶│    Express API        │    │
│  │   Interface     │     │                        │    │
│  │                 │     │  ┌──────────────────┐  │    │
│  │  • Auth0 Login  │     │  │  JWT Validation  │  │    │
│  │  • Chat UI      │     │  └──────────────────┘  │    │
│  │  • Tool Consent │     │                        │    │
│  └─────────────────┘     │  ┌──────────────────┐  │    │
│                          │  │  LLM Simulator   │  │    │
│                          │  └──────────────────┘  │    │
│                          │                        │    │
│                          │  ┌──────────────────┐  │    │
│                          │  │  Agent Auth      │──┼───▶ MCP Server
│                          │  │  (Consent Flow)  │  │    │  • OAuth 2.0
│                          │  └──────────────────┘  │    │  • Tool Scopes
│                          │                        │    │  • Weather
│                          │  ┌──────────────────┐  │    │  • Calendar
│                          │  │  MCP Client      │──┼───▶│  • Email
│                          │  │  (M2M Tokens)    │  │    │
│                          │  └──────────────────┘  │    │
│                          └──────────────────────┘    │
│                                                        │
│                     ┌─────────────┐                    │
│                     │   Auth0     │                    │
│                     │   Tenant    │                    │
│                     │             │                    │
│                     │ • Users     │                    │
│                     │ • APIs      │                    │
│                     │ • M2M Apps  │                    │
│                     │ • Scopes    │                    │
│                     └─────────────┘                    │
└──────────────────────────────────────────────────────┘
```

---

## Next Steps (Beyond This Lab)

1. **Replace the simulated LLM** with a real model (OpenAI, Anthropic, etc.) - the auth layer stays the same
2. **Add more MCP servers** - each with their own API registration and scopes
3. **Implement CIBA** (Client-Initiated Backchannel Authentication) for async consent via push notification instead of in-app dialog
4. **Add RBAC** - different users get different tool access based on their roles
5. **Audit logging** - Auth0 Logs + Actions for monitoring agent behavior
6. **Dynamic client registration** - allow new MCP clients to register automatically

---

## Cleanup

If you want to clean up your Auth0 tenant:
1. Delete the `DevCamp AI Chat` application
2. Delete the `DevCamp AI API` API
3. Delete the `DevCamp MCP Server` API
4. Delete the M2M application
5. Delete any test users you created
