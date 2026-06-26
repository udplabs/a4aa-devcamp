# Module 04: Async Authorization (CIBA)

## Objective *(~20 min)*

Not every tool call should execute without confirmation. This module wires CIBA (Client-Initiated Backchannel Authentication) so that irreversible actions — specifically, sharing a document with an external recipient — require explicit employee approval on their own device before they execute.

In this module you will:

- Understand how `share_document` triggers CIBA before calling the MCP server.
- See how the binding message ties the push notification to the exact action being approved.
- Observe the in-memory approve/deny fallback vs. the live Guardian push path.

### Why we're building this

Fully automated irreversible actions, like sharing a confidential document with an external recipient, represent one of the highest-risk categories of AI agent behavior. Without a human approval gate, a single compromised session or a mistyped email address sends sensitive data outside the organization with no recourse.

The commercial consequence: compliance teams at enterprise customers block AI agent deployments that can execute irreversible external actions without an audit trail. CIBA turns a blocked feature into an approved one. Every external share produces a timestamped, device-bound approval record that satisfies the audit requirement. That is the difference between a feature that reaches production and one that dies in security review.

## Prerequisites

- You completed **Modules 01–03**. Nexus already authenticates the user, vaults credentials, and routes every tool call through the secured MCP server. CIBA adds a device-level approval gate on top of that.
- For the live path: the Auth0 Guardian app installed (see **Module 00**) and your user account enrolled. Skipping enrollment is fine; the in-memory fallback runs the same flow offline.

## Premise

A user wants to share a sensitive document with an external email address. External sharing is irreversible and subject to data policy, so Nexus should not execute that action without the user actively confirming on their own device.

The agent backend initiates an authorization request with a human-readable binding message. The user's device surfaces a push notification. The user approves, and only then does the share execute.

## What's provisioned for you

Provision Resources created a CIBA client on your tenant (`docagent-ciba-codespace`) — a confidential regular web app with the `urn:openid:params:grant-type:ciba` grant already enabled, authorized against the backend API and the MCP API for `mcp:docs:share`. There are no required Dashboard steps to complete this module.

> [!NOTE]
> CIBA is configured at the **application level** only. There is no tenant-level CIBA toggle in Auth0. The provisioned client already has everything set.

**Device enrollment** is required for the live push path. If you skip it, the in-memory fallback runs the complete flow offline — all checkpoint steps work either way.

To enroll your device for the live path:

1. In the Auth0 Dashboard, go to **Security → Multi-factor Auth** and ensure Guardian is enabled.
2. Log in to Nexus as `alice@docagent.demo`.
3. On next login, Auth0 will prompt to enroll a second factor. Open the Guardian app and scan the QR code shown.
4. Once enrolled, triggering a document share sends a real push notification to your device.

> [!TIP]
> Most participants skip enrollment and use the in-memory fallback — it runs the same approval flow without device setup overhead. Only enroll if you have a spare few minutes and want to see the Guardian push in action.

> [!NOTE]
> Self-hosting `starter/`? Create a confidential Regular Web Application, add the `urn:openid:params:grant-type:ciba` grant in **Advanced Settings → Grant Types**, and authorize it against your backend and MCP APIs. The in-memory simulator below covers approval if you skip device enrollment.

## Code Steps

> [!NOTE]
> This code is already implemented in the demo-app. The steps below walk you through the implementation — open each file in your editor as you go. You are not writing new code in this module.

The CIBA simulator runs the full flow offline. The state machine mirrors Auth0's: `pending` → `approved | denied`, 300-second expiry.

### Step 1: the CIBA middleware

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

### Step 2: the binding message

Same file, `buildDocShareBindingMessage`:

```js
export function buildDocShareBindingMessage(params) {
  const title = params.documentTitle || params.documentId || "document";
  const recipient = params.recipientEmail || "external recipient";
  return `Nexus: share "${title}" with ${recipient} — approve?`;
}
```

The binding message is human-readable and surfaces exactly what the user is approving (title and recipient) in the push notification on their device.

### Step 3: the `share_document` gate in the LLM path

`server/llm.js` — when the authorization check returns `requiresConsent: true` for `share_document`, the gate fires before the tool reaches the MCP server:

```js
// checkToolAuthorization returns { authorized, requiresConsent, cibaInfo }
// when share_document is detected and no approval is in place yet.
const authResult = await checkToolAuthorization(user.sub, user.scope, toolName);

if (!authResult.authorized && authResult.requiresConsent) {
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

The same gate runs in `server/simulator.js` so the in-memory fallback also requires CIBA approval before the share executes.

### Step 4: the CIBA endpoints

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

### Step 5: the frontend poll

`src/hooks/useChat.js` — `startPolling` checks `/api/ciba/status/:authReqId` when `data.pendingCIBA` comes back. The binding message surfaces in the pending card (wired in `Chat.jsx`).

## Checkpoint

**Step 1 — Verify setup.** Use the **Run Checks** button at the bottom of this page. The in-app verifier confirms the CIBA grant is active on your provisioned CIBA client.

**Step 2 — Run the demo scenario.**

1. Prompt Nexus: *"Share the Q3 roadmap with external@partner.com."*
2. The response includes a **Device Approval Required** card: `Nexus: share "Q3 Product Roadmap" with external@partner.com — approve?`
3. In the terminal, run `curl http://localhost:3000/api/ciba/pending` to see the pending request and copy the `authReqId`.
4. Approve it: `curl -X POST http://localhost:3000/api/ciba/approve/<authReqId>`
5. The UI updates and the share executes.

> [!TIP]
> The approval window is 300 seconds. If you initiate a share and do nothing, `/api/ciba/status/:id` returns `denied` after 5 minutes and the share is silently aborted.

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

Irreversible actions are now gated. The final control — document-level access enforcement — has been running silently throughout. Module 05 shows you what it looks like in action.

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
