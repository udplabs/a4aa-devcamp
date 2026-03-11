# Lab 2: Async Authorization via CIBA

## Objectives

- Understand CIBA (Client-Initiated Backchannel Authentication) and why it matters for agents
- Configure CIBA grant type in Auth0
- Implement a CIBA authorization request from the agent backend
- Build the polling loop that waits for user approval
- Handle approval/denial responses
- Execute the tool only after CIBA approval

---

## Premise

The agent can now chat with authenticated users. But when it tries to do something sensitive (like send an email), it needs explicit user consent obtained **asynchronously** via CIBA — not a simple in-app dialog.

CIBA separates the "consumption device" (the agent) from the "authentication device" (the user's phone or browser). The agent initiates an authorization request, and the user approves on a different channel.

---

## Concept: Why CIBA?

In a traditional consent flow, the user clicks "Approve" in the same app. But with AI agents:

- The agent may act autonomously or in a background process
- The user might not be looking at the agent's UI
- A push notification or separate approval is more appropriate

CIBA enables this:

```
Agent Backend                          Auth0                         User's Device
     │                                   │                                │
     │── POST /bc-authorize ────────────▶│                                │
     │   (login_hint + scope)            │── Push notification ─────────▶│
     │◀── { auth_req_id, interval } ─────│                                │
     │                                   │                                │
     │── Poll /oauth/token ─────────────▶│                                │
     │◀── { error: "authorization_pending" }                              │
     │                                   │                   User approves│
     │── Poll /oauth/token ─────────────▶│◀──────────────────────────────│
     │◀── { access_token } ──────────────│                                │
     │                                   │                                │
     ▼ Execute tool with token
```

---

## Step 1: Configure CIBA in Auth0

1. In the Auth0 Dashboard, go to **Applications > Applications > Create Application**
2. Choose **Machine to Machine** and name it `DevCamp CIBA Agent`
3. Authorize it for the `DevCamp AI API` with the `email:send` scope
4. In the application **Settings**, go to **Advanced Settings > Grant Types**
5. Enable **Client-Initiated Backchannel Authentication (CIBA)**
6. Note the **Client ID** and **Client Secret**

> **Note:** CIBA requires an Auth0 Enterprise plan in production. For this lab, we simulate the approval endpoint.

---

## Step 2: Update Environment Variables

Add the CIBA configuration to your `.env`:

```
# Existing vars...

# CIBA (Lab 2)
AUTH0_CIBA_CLIENT_ID=your-ciba-client-id
AUTH0_CIBA_CLIENT_SECRET=your-ciba-client-secret
```

---

## Step 3: Implement the CIBA Middleware

Create `server/middleware/ciba.ts`:

```typescript
// In-memory store for CIBA requests (simulated)
const cibaRequests = new Map<string, {
  userId: string;
  toolName: string;
  status: "pending" | "approved" | "denied";
  authReqId: string;
  createdAt: number;
}>();

// Generate a unique auth request ID
function generateAuthReqId(): string {
  return `ciba_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Initiate a CIBA authorization request.
 *
 * In production, this would POST to Auth0's /bc-authorize endpoint.
 * For the lab, we simulate it with an in-memory store and a manual
 * approval endpoint.
 */
export async function initiateCIBA(
  userId: string,
  userEmail: string,
  toolName: string,
  scope: string
): Promise<{ authReqId: string; expiresIn: number; interval: number }> {
  const authReqId = generateAuthReqId();

  // Store the pending request
  cibaRequests.set(authReqId, {
    userId,
    toolName,
    status: "pending",
    authReqId,
    createdAt: Date.now(),
  });

  console.log(`[CIBA] Authorization request initiated:`);
  console.log(`  auth_req_id: ${authReqId}`);
  console.log(`  user: ${userEmail} (${userId})`);
  console.log(`  tool: ${toolName}`);
  console.log(`  scope: ${scope}`);
  console.log(`  Approve at: POST /api/ciba/approve/${authReqId}`);

  // In production, Auth0 would send a push notification to the user.
  // Here we return the auth_req_id so the approval can be done manually.
  return {
    authReqId,
    expiresIn: 300, // 5 minutes
    interval: 5,    // poll every 5 seconds
  };
}

/**
 * Check the status of a CIBA request (polling).
 *
 * In production, this would POST to Auth0's /oauth/token endpoint
 * with grant_type=urn:openid:params:grant-type:ciba.
 */
export function checkCIBAStatus(
  authReqId: string
): { status: "pending" | "approved" | "denied"; token?: string } {
  const request = cibaRequests.get(authReqId);

  if (!request) {
    return { status: "denied" };
  }

  // Check expiry (5 minutes)
  if (Date.now() - request.createdAt > 300_000) {
    cibaRequests.delete(authReqId);
    return { status: "denied" };
  }

  if (request.status === "approved") {
    // In production, Auth0 returns a real access token here.
    // We return a simulated scoped token.
    cibaRequests.delete(authReqId);
    return {
      status: "approved",
      token: `ciba_token_${request.userId}_${request.toolName}_${Date.now()}`,
    };
  }

  if (request.status === "denied") {
    cibaRequests.delete(authReqId);
    return { status: "denied" };
  }

  return { status: "pending" };
}

/**
 * Approve a CIBA request (simulates user action on their device).
 */
export function approveCIBA(authReqId: string): boolean {
  const request = cibaRequests.get(authReqId);
  if (!request || request.status !== "pending") {
    return false;
  }
  request.status = "approved";
  console.log(`[CIBA] Request ${authReqId} APPROVED`);
  return true;
}

/**
 * Deny a CIBA request (simulates user action on their device).
 */
export function denyCIBA(authReqId: string): boolean {
  const request = cibaRequests.get(authReqId);
  if (!request || request.status !== "pending") {
    return false;
  }
  request.status = "denied";
  console.log(`[CIBA] Request ${authReqId} DENIED`);
  return true;
}

/**
 * List all pending CIBA requests (for the approval UI).
 */
export function listPendingCIBA(): Array<{
  authReqId: string;
  userId: string;
  toolName: string;
  createdAt: number;
}> {
  return Array.from(cibaRequests.values())
    .filter((r) => r.status === "pending")
    .map(({ authReqId, userId, toolName, createdAt }) => ({
      authReqId,
      userId,
      toolName,
      createdAt,
    }));
}
```

---

## Step 4: Add CIBA Endpoints to the Server

Open `server/index.ts` and add the CIBA routes:

```typescript
import {
  initiateCIBA,
  checkCIBAStatus,
  approveCIBA,
  denyCIBA,
  listPendingCIBA,
} from "./middleware/ciba";

// Initiate a CIBA authorization request
app.post("/api/ciba/initiate", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  const { toolName, scope } = req.body;

  const result = await initiateCIBA(user.sub, user.email || "", toolName, scope);
  res.json(result);
});

// Poll for CIBA status
app.get("/api/ciba/status/:authReqId", validateAccessToken, (req, res) => {
  const result = checkCIBAStatus(req.params.authReqId);
  res.json(result);
});

// Simulated approval endpoint (user approves on their "device")
// In production, this would be handled by Auth0's push notification flow.
app.post("/api/ciba/approve/:authReqId", (req, res) => {
  const success = approveCIBA(req.params.authReqId);
  res.json({ approved: success });
});

// Simulated denial endpoint
app.post("/api/ciba/deny/:authReqId", (req, res) => {
  const success = denyCIBA(req.params.authReqId);
  res.json({ denied: success });
});

// List pending requests (for the approval page)
app.get("/api/ciba/pending", (req, res) => {
  res.json(listPendingCIBA());
});
```

---

## Step 5: Update the Simulator to Use CIBA

Open `server/simulator.ts`. For tools that require consent (like `send_email`), trigger the CIBA flow instead of simple in-app consent.

Update the section where consent-required tools are handled:

```typescript
if (authResult.requiresConsent) {
  // Initiate CIBA instead of returning a simple consent dialog
  const cibaResult = await initiateCIBA(
    user.sub,
    user.email || "",
    intent.toolName,
    tool.requiredScopes.join(" ")
  );

  return {
    message: `I need to send an email on your behalf. This requires your approval via a secure out-of-band channel.\n\n**Waiting for approval...** Check your device or approve at the approval endpoint.`,
    pendingCIBA: {
      authReqId: cibaResult.authReqId,
      toolName: intent.toolName,
      expiresIn: cibaResult.expiresIn,
      interval: cibaResult.interval,
    },
  };
}
```

Add `initiateCIBA` to the imports:

```typescript
import { initiateCIBA } from "./middleware/ciba";
```

And update the `LLMResponse` interface to include:

```typescript
pendingCIBA?: {
  authReqId: string;
  toolName: string;
  expiresIn: number;
  interval: number;
};
```

---

## Step 6: Update the Frontend to Handle CIBA

Open `src/hooks/useChat.ts` and add CIBA polling support:

```typescript
const [pendingCIBA, setPendingCIBA] = useState<{
  authReqId: string;
  toolName: string;
} | null>(null);
```

In the `sendMessage` function, after receiving the response data:

```typescript
if (data.pendingCIBA) {
  setPendingCIBA({
    authReqId: data.pendingCIBA.authReqId,
    toolName: data.pendingCIBA.toolName,
  });

  // Start polling for CIBA approval
  pollCIBAStatus(data.pendingCIBA.authReqId, data.pendingCIBA.toolName, content);
}
```

Add the polling function:

```typescript
const pollCIBAStatus = async (
  authReqId: string,
  toolName: string,
  originalMessage: string
) => {
  const token = await getAccessTokenSilently({
    authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
  });

  const poll = setInterval(async () => {
    try {
      const response = await fetch(`/api/ciba/status/${authReqId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (data.status === "approved") {
        clearInterval(poll);
        setPendingCIBA(null);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Approval received. Executing ${toolName}...` },
        ]);
        // Re-send the original message — CIBA token is now available
        await sendMessage(originalMessage);
      } else if (data.status === "denied") {
        clearInterval(poll);
        setPendingCIBA(null);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Authorization was denied. The ${toolName} action has been cancelled.` },
        ]);
      }
      // If "pending", keep polling
    } catch {
      clearInterval(poll);
      setPendingCIBA(null);
    }
  }, 5000); // poll every 5 seconds
};
```

Return `pendingCIBA` from the hook:

```typescript
return { messages, sendMessage, isLoading, pendingApproval, handleApproval, pendingCIBA };
```

---

## Step 7: Update the ToolApproval Component

Open `src/components/ToolApproval.tsx`. When a CIBA flow is active, show a "Waiting for approval on your device..." state instead of Approve/Deny buttons.

In `Chat.tsx`, add after the existing `pendingApproval` block:

```tsx
{pendingCIBA && (
  <div className="tool-approval">
    <div className="tool-approval-card">
      <div className="tool-approval-header">
        <span className="tool-approval-icon">&#128274;</span>
        <h3>Out-of-Band Approval Required</h3>
      </div>
      <p>
        The agent needs approval to execute <code>{pendingCIBA.toolName}</code>.
        A notification has been sent to your device.
      </p>
      <div className="tool-details">
        <div className="tool-detail-row">
          <strong>Request ID:</strong> <code>{pendingCIBA.authReqId}</code>
        </div>
        <div className="tool-detail-row">
          <strong>Status:</strong> Waiting for approval...
        </div>
      </div>
      <div className="typing-indicator" style={{ justifyContent: "center", padding: "8px 0" }}>
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </div>
)}
```

---

## Step 8: Test the CIBA Flow

### Test 1: Trigger CIBA

1. Log in and send: **"Send a booking confirmation to my email"**
2. The agent should show the "Out-of-Band Approval Required" state
3. The server logs should show the `auth_req_id`

### Test 2: Approve via Simulated Device

In a separate terminal, approve the request:

```bash
# Get the auth_req_id from the server logs or the UI
curl -X POST http://localhost:3000/api/ciba/approve/<auth_req_id>
```

Or open a new browser tab and navigate to view pending requests:

```bash
curl http://localhost:3000/api/ciba/pending
```

### Test 3: Verify Execution

After approval:
1. The polling detects the approval
2. The agent executes the email tool
3. A confirmation message appears in the chat

### Test 4: Test Denial

1. Send another email request
2. Deny it:

```bash
curl -X POST http://localhost:3000/api/ciba/deny/<auth_req_id>
```

3. The chat should show "Authorization was denied"

---

## Understanding the CIBA Flow

```
User: "Send a booking confirmation"
  │
  ▼
Agent: detectIntent() → send_email
  │
  ▼
Agent: checkToolAuthorization() → requires consent
  │
  ▼
Agent: initiateCIBA() → returns auth_req_id
  │
  ├──▶ Frontend: Shows "Waiting for approval..."
  │    Starts polling /api/ciba/status/{auth_req_id} every 5s
  │
  ├──▶ User: Approves on "device" (POST /api/ciba/approve/{auth_req_id})
  │
  ▼
Polling detects "approved"
  │
  ▼
Agent re-executes → Tool runs → Result returned
```

---

## Checkpoint

At this point you have:
- [x] CIBA authorization flow configured
- [x] Agent initiates backchannel auth requests for sensitive tools
- [x] Polling loop in the frontend waits for approval
- [x] Simulated out-of-band approval endpoint
- [x] Tool executes only after CIBA approval

---

**Next: [Lab 3 — Fine Grained Authorization](./03-fine-grained-authorization.md)**
