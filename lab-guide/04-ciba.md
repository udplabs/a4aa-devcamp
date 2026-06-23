# Module 04: Async Authorization (CIBA)

## Prerequisites

- You completed **Modules 01–03**. Nexus already authenticates the user, vaults credentials, and routes every tool call through the secured MCP server. CIBA adds a device-level approval gate on top of that.
- For the live path: the Auth0 Guardian app installed (see **Module 00**) and your user account enrolled. Skipping enrollment is fine; the in-memory fallback runs the same flow offline.

## Premise

A user wants to share a sensitive document with an external email address. External sharing is irreversible and subject to data policy, so Nexus should not execute that action without the user actively confirming on their own device.

CIBA (Client-Initiated Backchannel Authentication) is the flow for that. The agent backend initiates an authorization request with a human-readable binding message, the user's device surfaces a push notification, the user approves, and only then does the share execute.

## Objectives

- Enable the CIBA grant type at the tenant level in the Auth0 Dashboard (Dashboard step above).
- Understand how `share_document` triggers CIBA before calling the MCP server.
- See how the binding message ties the push notification to the exact action being approved.
- Observe the in-memory approve/deny fallback vs. the live Guardian push path.

### Why we're building this

Fully automated irreversible actions, like sharing a confidential document with an external recipient, represent one of the highest-risk categories of AI agent behavior. Without a human approval gate, a single compromised session or a mistyped email address sends sensitive data outside the organization with no recourse.

The commercial consequence: compliance teams at enterprise customers block AI agent deployments that can execute irreversible external actions without an audit trail. CIBA turns a blocked feature into an approved one; every external share produces a timestamped, device-bound approval record that satisfies the audit requirement. That is the difference between a feature that reaches production and one that dies in security review.

## What's provisioned for you

The CREATE hook provisioned a CIBA client on your tenant (a regular web app with the `urn:openid:params:grant-type:ciba` grant, authorized against the backend API and the MCP API for `mcp:docs:share`). One setting was not automated: you must enable CIBA at the tenant level via the Dashboard.

> [!IMPORTANT]
> **Dashboard Step: Enable CIBA at the tenant level**
>
> 1. Auth0 Dashboard → **Settings → Advanced**
>
> *[Screenshot: Settings → Advanced page scrolled to the Grant Types section, with CIBA visible but not yet enabled]*
>
> 2. Scroll to **Grant Types** → enable **CIBA** → **Save**
>
> *[Screenshot: The same section with the CIBA toggle enabled and the Save button highlighted]*
>
> 3. Verify: **Applications → docagent-ciba-`{{demoName}}`** → **Advanced Settings → Grant Types** → confirm **CIBA** is checked
>
> *[Screenshot: The CIBA client's Advanced Settings → Grant Types tab showing the CIBA grant type checked]*
>
> Without this toggle, the app falls back to an in-memory approve/deny simulation with the same state machine and UI — the full flow runs, but no real push fires. Enable it and `POST /bc-authorize` triggers a real Guardian push notification to any enrolled device.

**Device enrollment** remains a manual runtime step: you (as the test user) must enroll in Auth0 Guardian to receive the push. If you skip enrollment, the in-memory fallback covers the complete flow offline.

- **Live path:** with a Guardian-enrolled user, `share_document` triggers a real `/bc-authorize` request and the push arrives on the user's device.
- **Fallback:** without enrollment, the app falls back to an in-memory approve/deny via `/api/ciba/*` with the same state machine, so you can run the full flow offline.

> [!NOTE]
> Self-hosting `starter/`? Enable the CIBA grant on your tenant (**Settings → Advanced → Grant Types**) and on the CIBA client you create (**Advanced Settings → Grant Types → CIBA**). The in-memory simulator below covers approval if you skip device enrollment.

## Code Steps

The starter ships a simulator for CIBA so you can run the full flow offline. The state machine mirrors Auth0's: `pending` → `approved | denied`, 300-second expiry.

### Step 1: implement the CIBA middleware

`server/middleware/ciba.js`:

```js
import { randomBytes } from "crypto";

const requests = new Map();

export async function initiateCIBA(userId, userEmail, toolName, scope, bindingMessage = "", tenant = null) {
  const authReqId = randomBytes(16).toString("hex");
  const now = Date.now();
  requests.set(authReqId, {
    authReqId, userId, userEmail, toolName, scope, bindingMessage,
    status: "pending",
    createdAt: now,
    expiresAt: now + 300_000,
  });
  console.log(`[CIBA] initiated ${authReqId} for ${userId} :: ${bindingMessage}`);
  return { authReqId, expiresIn: 300, interval: 2, bindingMessage };
}

export function checkCIBAStatus(authReqId) {
  const req = requests.get(authReqId);
  if (!req) return { status: "denied" };
  if (Date.now() > req.expiresAt) return { status: "denied" };
  return {
    status: req.status,
    bindingMessage: req.bindingMessage,
    token: req.status === "approved" ? `mock-ciba-${authReqId}` : undefined,
  };
}

export function approveCIBA(authReqId) {
  const req = requests.get(authReqId);
  if (!req) return false;
  req.status = "approved";
  return true;
}

export function denyCIBA(authReqId) {
  const req = requests.get(authReqId);
  if (!req) return false;
  req.status = "denied";
  return true;
}

export function listPendingCIBA() {
  return Array.from(requests.values())
    .filter((r) => r.status === "pending")
    .map(({ authReqId, userId, toolName, bindingMessage, createdAt }) => ({
      authReqId, userId, toolName, bindingMessage, createdAt,
    }));
}
```

### Step 2: build the binding message

Same file, `buildDocShareBindingMessage`:

```js
export function buildDocShareBindingMessage(params) {
  const title = params.documentTitle || params.documentId || "document";
  const recipient = params.recipientEmail || "external recipient";
  return `Nexus: share "${title}" with ${recipient} — approve?`;
}
```

The binding message is human-readable and surfaces exactly what the user is approving (title and recipient) in the push notification on their device.

### Step 3: gate `share_document` in the LLM path

`server/llm.js` — before calling the tool:

```js
import { initiateCIBA, buildDocShareBindingMessage } from "./middleware/ciba.js";

if (toolName === "share_document") {
  const bindingMessage = buildDocShareBindingMessage({
    documentTitle: parameters.documentTitle,
    recipientEmail: parameters.recipientEmail,
  });
  const ciba = await initiateCIBA(user.sub, user.email, toolName, "mcp:docs:share", bindingMessage, tenant);
  return {
    message: `External sharing requires your approval. Check your device: "${bindingMessage}"`,
    pendingCIBA: { ...ciba, toolName },
  };
}
```

Do the same in `server/simulator.js` so the simulator fallback also gates the share.

### Step 4: add the CIBA endpoints

`server/index.js`:

```js
import {
  initiateCIBA, checkCIBAStatus, approveCIBA, denyCIBA, listPendingCIBA,
} from "./middleware/ciba.js";

// The binding message is built upstream (in llm.js / simulator.js) and
// forwarded in the request body so this endpoint stays generic.
app.post("/api/ciba/initiate", validateAccessToken, async (req, res) => {
  const user = extractUser(req);
  const { toolName, scope, bindingMessage } = req.body;
  const result = await initiateCIBA(
    user.sub, user.email || "", toolName, scope, bindingMessage, req.tenant
  );
  res.json(result);
});

app.get("/api/ciba/status/:authReqId", validateAccessToken, async (req, res) => {
  res.json(await checkCIBAStatus(req.params.authReqId));
});

app.post("/api/ciba/approve/:authReqId", (req, res) => {
  const success = approveCIBA(req.params.authReqId);
  res.json({ approved: success });
});

app.post("/api/ciba/deny/:authReqId", (req, res) => {
  const success = denyCIBA(req.params.authReqId);
  res.json({ denied: success });
});

app.get("/api/ciba/pending", (_req, res) => {
  res.json(listPendingCIBA());
});
```

### Step 5: poll from the frontend

`src/hooks/useChat.js` — `startPolling` checks `/api/ciba/status/:authReqId` when `data.pendingCIBA` comes back. The binding message surfaces in the pending card (wired in `Chat.jsx`).

## Checkpoint

> [!IMPORTANT]
> Confirm each of the following before moving on:
>
> 1. Prompt Nexus: *"Share the Q3 roadmap with external@partner.com."*
> 2. The response should include a **Device Approval Required** card showing `Nexus: share "Q3 Product Roadmap" with external@partner.com — approve?`.
> 3. `curl http://localhost:3000/api/ciba/pending` shows the pending request.
> 4. Approve it: `curl -X POST http://localhost:3000/api/ciba/approve/<authReqId>`.
> 5. The UI flips; the share executes.

> [!TIP]
> Negative test: do nothing for 300 seconds, the request auto-expires and the share is aborted.

## What you learned

Tool-level approvals tied to the user's device turn "agent shared a document nobody signed off on" into "user explicitly approved this share action, timestamped, with the exact document and recipient in the approval record." That audit artifact is what makes irreversible external sharing safe to automate at all. Without CIBA, every external share would require a manual review cycle, which defeats the point of having an agent do it.

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this module.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      identified <code>share_document</code> as an irreversible action requiring out-of-band approval;
  </li>
  <li style="list-style-type:'✅ '">
      built a human-readable binding message from the document title and recipient email;
  </li>
  <li style="list-style-type:'✅ '">
      initiated a CIBA request and gated the share on the user's device approval;
  </li>
  <li style="list-style-type:'✅ '">
      produced a timestamped approval record tying the external share to the authenticated user.
  </li>
</ul>

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
