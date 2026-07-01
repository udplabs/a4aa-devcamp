# Auth0 AI for Agents

---

## What Is It?

Auth0 AI for Agents extends Auth0's identity platform to cover **AI agent workflows**. It answers:

> "How does an AI agent prove it's allowed to act on behalf of a specific user — and what can it access?"

---

## Four Use Cases

### 1. User Authentication (Session & Context)

The foundation. The agent needs to know **who** it's acting for.

```typescript
// Frontend: Auth0 SPA login
const { user, getAccessTokenSilently } = useAuth0();

// Backend: JWT validation
app.post("/api/chat", validateAccessToken, (req, res) => {
  const user = extractUser(req); // { sub, email, scopes }
  const response = await processMessage(message, user);
});
```

**What it provides:** User identity, scoped access tokens, session management

---

### 2. Async Authorization (CIBA)

When the agent needs to do something sensitive, it requests **out-of-band approval** from the user.

```
Agent: "I need to send an email on your behalf"
    │
    ▼
Auth0: POST /bc-authorize → Notification to user's device
    │
    ▼
User: Reviews and approves on their phone
    │
    ▼
Agent: Polls /oauth/token → Receives scoped access token
    │
    ▼
Agent: Executes the tool
```

**Key difference from in-app consent:** The user doesn't need to be looking at the agent's UI. Approval happens on a separate device/channel.

**What it provides:** Asynchronous consent, separation of agent and approval device

---

### 3. Fine Grained Authorization (FGA)

Per-object access control using relationships, not just scopes.

```typescript
// Define relationships
writeTuple("user:alice", "viewer", "document:roadmap");
writeTuple("user:alice", "editor", "document:budget");
// No relation to document:classified → access denied

// Check access before returning data
const allowed = checkAccess("user:alice", "can_view", "document:classified");
// → false
```

**FGA model:**
```
type document
  relations
    define viewer: [user]
    define editor: [user]
    define owner: [user]
    define can_view: viewer or editor or owner
```

**What it provides:** Per-document access control, relationship-based authorization

---

### 4. Token Vault

Securely store and manage the user's third-party OAuth credentials.

```
Agent needs to call Google Drive on behalf of Alice:
    │
    ▼
Token Vault: getToken("alice", "google-drive")
    │
    ├── Token found and valid → return it
    └── Token expired → refresh → return new token
    │
    ▼
Agent: Calls Google Drive API with vaulted token
```

**What it provides:** Secure credential storage, automatic refresh, user-keyed access

---

## Architecture Pattern

```
┌──────────────────────────────────────────────────────┐
│                  Your Application                     │
│                                                       │
│  ┌───────────┐    ┌──────────────────────────────┐   │
│  │   Chat    │───▶│         Agent (LLM)          │   │
│  │   UI      │    │                              │   │
│  └───────────┘    │  ┌────────────────────────┐  │   │
│                   │  │  1. User Auth (JWT)     │  │   │
│                   │  │  2. CIBA (async consent)│  │   │
│                   │  │  3. FGA (per-doc access) │  │   │
│                   │  │  4. Token Vault (3P API) │  │   │
│                   │  └────────────────────────┘  │   │
│                   └──────────────┬───────────────┘   │
│                                  │                    │
│                            ┌─────▼─────┐             │
│                            │   Auth0   │             │
│                            │   Tenant  │             │
│                            └───────────┘             │
└──────────────────────────────────────────────────────┘
```

---

## Key Differentiator

Auth0 AI for Agents doesn't replace your agent framework. It **wraps around your tools** to add identity at every layer — from user login to CIBA consent to FGA checks to vaulted third-party credentials.
