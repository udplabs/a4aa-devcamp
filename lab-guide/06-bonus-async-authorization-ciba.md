# Bonus: Async Authorization (CIBA)

> [!NOTE]
> This is the optional bonus module. The four core modules take Z-Merchant to production-ready; this one adds a human in the loop for the actions that cost money. The delivered workshop runs it live against Auth0 Guardian push, with an in-memory approve / deny fallback for anyone who skips device enrollment.

## Prerequisites

- You completed the four core modules (**02** through **05**), so Z-Merchant already authenticates the rep, authorizes with FGA, vaults credentials, and routes every tool call through the secured MCP server. CIBA adds a device-level approval gate on top.
- For the live path: the Auth0 Guardian app installed (see **Module 01**) and the test rep enrolled. Skipping enrollment is fine; the in-memory fallback runs the same flow offline.

## Premise

A rep drafts a quote for Acme at 25% discount with net-60 payment terms. Both of those are outside RetailZero's standard playbook. Z-Merchant should not commit that deal without the rep actively saying yes on their device.

CIBA (Client-Initiated Backchannel Authentication) is the flow for that. The agent backend initiates an authorization request with a human-readable binding message, the rep's device surfaces a push notification, the rep approves, and only then does the commit land.

## Objectives

- Configure the CIBA grant type in Auth0.
- Detect non-standard quote terms on the backend (`discount > 20%` or `paymentTerms != net-30`).
- Build a binding message from the quote parameters so the rep sees what they are approving.
- Initiate a CIBA request, poll for approval, and gate the commit on the result.
- Wire the frontend to show the pending approval state with the binding message.

## What's provisioned for you

The CREATE hook provisions a CIBA client on your tenant (a regular web app with the `urn:openid:params:grant-type:ciba` grant, authorized against the backend API), so the backchannel grant is wired without any dashboard work. The one step the hook cannot do for you is device enrollment: the test rep enrolling an Auth0 Guardian push device is a manual runtime step.

- **Live path:** with a Guardian-enrolled rep, a non-standard commit triggers a real `/bc-authorize` request and the rep approves the push on their device.
- **Fallback:** without enrollment, the app falls back to an in-memory approve / deny via `/api/ciba/*` with the same state machine, so you can run the full flow offline.

> [!NOTE]
> Self-hosting `starter/`? Enable the CIBA grant on your tenant (**Settings > Advanced > OAuth**) and on the M2M app you create in **Module 05** (**Advanced Settings > Grant Types > CIBA**). The in-memory simulator below covers approval if you skip device enrollment.

## Code Steps

The starter ships a simulator for CIBA so you can run the full flow offline. The state machine mirrors Auth0's: `pending` -> `approved | denied`, 300-second expiry.

### Step 1: implement the CIBA middleware

`server/middleware/ciba.ts` -- fill in each stub:

```ts
import { randomBytes } from "crypto";

interface CIBARequest {
  authReqId: string;
  userId: string;
  userEmail: string;
  toolName: string;
  scope: string;
  bindingMessage: string;
  status: "pending" | "approved" | "denied";
  createdAt: number;
  expiresAt: number;
}

const requests = new Map<string, CIBARequest>();

export async function initiateCIBA(userId, userEmail, toolName, scope, bindingMessage = "") {
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

Same file, `buildQuoteCommitBindingMessage`:

```ts
export function buildQuoteCommitBindingMessage(params) {
  const { accountId, discountPercent, paymentTerms } = params;
  const parts = [];
  if (typeof discountPercent === "number" && discountPercent > 20) {
    parts.push(`${discountPercent}% discount`);
  }
  if (paymentTerms && paymentTerms !== "net-30") {
    parts.push(paymentTerms);
  }
  const terms = parts.length ? parts.join(", ") : "non-standard terms";
  return `Approve ${terms} on quote for ${accountId}?`;
}
```

### Step 3: gate the commit in the LLM path

`server/llm.ts` -- before calling the tool:

```ts
import { initiateCIBA, buildQuoteCommitBindingMessage } from "./middleware/ciba";

if (toolName === "commit_quote_terms") {
  const nonStandard =
    (parameters.discountPercent ?? 0) > 20 ||
    (parameters.paymentTerms && parameters.paymentTerms !== "net-30");

  if (nonStandard) {
    const bindingMessage = buildQuoteCommitBindingMessage(parameters);
    const ciba = await initiateCIBA(user.sub, user.email!, toolName, "mcp:quote:commit", bindingMessage);
    return {
      message: `This quote is outside standard terms. Check your device for an approval prompt: "${bindingMessage}"`,
      pendingCIBA: { ...ciba, toolName },
    };
  }
}
```

Do the same in `server/simulator.ts` so the simulator fallback also gates the commit.

### Step 4: add the CIBA endpoints

`server/index.ts`:

```ts
import {
  initiateCIBA, checkCIBAStatus, approveCIBA, denyCIBA,
  listPendingCIBA, buildQuoteCommitBindingMessage,
} from "./middleware/ciba";

app.post("/api/ciba/initiate", validateAccessToken, async (req, res) => {
  const { toolName, scope, parameters } = req.body;
  const user = extractUser(req);
  const bindingMessage =
    toolName === "commit_quote_terms"
      ? buildQuoteCommitBindingMessage(parameters || {})
      : `Approve ${toolName}?`;
  const result = await initiateCIBA(user.sub, user.email, toolName, scope, bindingMessage);
  res.json(result);
});

app.get("/api/ciba/status/:authReqId", (req, res) => {
  res.json(checkCIBAStatus(req.params.authReqId));
});

app.post("/api/ciba/approve/:authReqId", (req, res) => {
  res.json({ ok: approveCIBA(req.params.authReqId) });
});

app.post("/api/ciba/deny/:authReqId", (req, res) => {
  res.json({ ok: denyCIBA(req.params.authReqId) });
});

app.get("/api/ciba/pending", (_req, res) => {
  res.json({ pending: listPendingCIBA() });
});
```

### Step 5: poll from the frontend

`src/hooks/useChat.ts` -- fill in `pollCIBAStatus` and call it when `data.pendingCIBA` comes back. Show the binding message in the pending card (already wired in `Chat.tsx`).

## Checkpoint

> [!IMPORTANT]
> Confirm each of the following before moving on:
>
> 1. Prompt Z-Merchant: *"Commit the Acme Q3 quote at 25% discount net-60."*
> 2. The response should include a **Device Approval Required** card showing `Approve 25% discount, net-60 on quote for acme?`.
> 3. `curl http://localhost:3000/api/ciba/pending` shows the pending request.
> 4. Approve it: `curl -X POST http://localhost:3000/api/ciba/approve/<authReqId>`.
> 5. The UI flips; the commit proceeds.

> [!TIP]
> Negative test: do nothing for 300 seconds, the request auto-expires and the commit aborts.

## What you learned

Tool-level approvals tied to the rep's device turn "agent took an action nobody signed off on" into "rep explicitly approved this margin concession, timestamped, with the exact terms in the approval record." That audit artifact is what lets RetailZero let Z-Merchant commit quotes autonomously at all. Without CIBA, every non-standard quote would still need the manual deal-desk cycle, which is the exact operational expense we are cutting.

#### <span style="font-variant: small-caps">Congrats!</span>

*You have completed this bonus module.*

You should have successfully:

<ul>
  <li style="list-style-type:'✅ ';">
      detected non-standard quote terms before any commit lands;
  </li>
  <li style="list-style-type:'✅ '">
      built a human-readable binding message from the quote parameters;
  </li>
  <li style="list-style-type:'✅ '">
      initiated a CIBA request and gated the commit on the rep's device approval;
  </li>
  <li style="list-style-type:'✅ '">
      produced a timestamped approval record tying the margin concession to the rep.
  </li>
</ul>

#### <span style="font-variant: small-caps">Let's move on to the next module!</span>
