// =============================================================
// CIBA -- Bonus: Client-Initiated Backchannel Authentication
//
// High-risk tools (share_document with external recipients
// non-standard payment terms) require out-of-band rep approval
// before they execute. This is the Auth0 A4AA async authorization
// pattern: the agent pauses, the rep gets a push notification on
// their device, and only after approval does the commit land.
//
// Flow:
//   1. llm.js / simulator.js detects a non-standard commit and
//      calls initiateCIBA() instead of running the tool directly.
//   2. initiateCIBA() POSTs to Auth0 /bc-authorize (live) or
//      stores a pending request in-memory (simulation).
//   3. The backend returns { pendingCIBA: { authReqId, bindingMessage } }
//      to the frontend, which starts polling /api/ciba/status/:id.
//   4. The rep approves on their Guardian device (live) or via
//      POST /api/ciba/approve/:id (simulation). The poll resolves,
//      the frontend re-sends the original message, and the commit runs.
//
//   - LIVE: when the resolved tenant has a provisioned CIBA client
//     (deploymentData.ciba_client_id), initiate hits Auth0
//     /bc-authorize and status polls /oauth/token. The rep approves
//     the push on their enrolled Guardian device.
//   - SIMULATED: otherwise, an in-memory request store is approved
//     or denied via the demo's /api/ciba/{approve,deny} endpoints so
//     the lab runs offline.
//
// Bonus lab orientation:
//   - buildDocShareBindingMessage(): constructs the human-readable
//     message the rep sees on their device -- this is what makes the
//     approval record meaningful ("Approve 25% discount + net-60 on
//     share "Q3 Roadmap" with vendor@acme.com?" vs. generic).
//   - initiateCIBA(): the entry point. Called from llm.js / simulator.js
//     after the non-standard-terms check fires.
//   - checkCIBAStatus(): called by the frontend poll. Returns "pending",
//     "approved" (with a token), or "denied".
// =============================================================

const CIBA_GRANT = "urn:openid:params:grant-type:ciba";

// In-memory store for CIBA requests. Live requests also stash the
// minimal Auth0 context needed to poll for completion.
const cibaRequests = new Map();

function generateAuthReqId() {
  return `ciba_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function cibaClient(tenant) {
  const dd = tenant?.deploymentData;
  if (!dd?.ciba_client_id || !tenant?.domain) return null;
  return { domain: tenant.domain, clientId: dd.ciba_client_id, clientSecret: dd.ciba_client_secret };
}

export async function initiateCIBA(
  userId,
  userEmail,
  toolName,
  scope,
  bindingMessage = "",
  tenant
) {
  const message = bindingMessage || `Approve use of ${toolName}`;
  const live = cibaClient(tenant);

  if (live) {
    // login_hint identifies the rep to push to. Auth0 accepts an
    // iss_sub-formatted JSON hint resolved against the tenant issuer.
    const loginHint = JSON.stringify({
      format: "iss_sub",
      iss: tenant.issuer,
      sub: userId,
    });
    const body = new URLSearchParams({
      client_id: live.clientId,
      scope: `openid ${scope}`.trim(),
      binding_message: message,
      login_hint: loginHint,
    });
    if (live.clientSecret) body.set("client_secret", live.clientSecret);

    const res = await fetch(`https://${live.domain}/bc-authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new Error(`CIBA /bc-authorize failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    cibaRequests.set(data.auth_req_id, {
      userId,
      toolName,
      status: "pending",
      authReqId: data.auth_req_id,
      bindingMessage: message,
      createdAt: Date.now(),
      live,
    });
    console.log(`[CIBA] (live) auth_req_id=${data.auth_req_id} for ${userEmail} tool=${toolName}`);
    return {
      authReqId: data.auth_req_id,
      expiresIn: data.expires_in ?? 300,
      interval: data.interval ?? 5,
      bindingMessage: message,
    };
  }

  // Simulation
  const authReqId = generateAuthReqId();
  cibaRequests.set(authReqId, {
    userId,
    toolName,
    status: "pending",
    authReqId,
    bindingMessage: message,
    createdAt: Date.now(),
  });

  console.log(`[CIBA] Authorization request initiated:`);
  console.log(`  auth_req_id: ${authReqId}`);
  console.log(`  user: ${userEmail} (${userId})`);
  console.log(`  tool: ${toolName}`);
  console.log(`  scope: ${scope}`);
  console.log(`  binding_message: ${message}`);
  console.log(`  Approve at: POST /api/ciba/approve/${authReqId}`);

  return { authReqId, expiresIn: 300, interval: 5, bindingMessage: message };
}

export async function checkCIBAStatus(authReqId) {
  const request = cibaRequests.get(authReqId);

  if (!request) {
    return { status: "denied" };
  }

  // Live: poll Auth0 /oauth/token with the CIBA grant.
  if (request.live) {
    try {
      const body = new URLSearchParams({
        grant_type: CIBA_GRANT,
        auth_req_id: authReqId,
        client_id: request.live.clientId,
      });
      if (request.live.clientSecret) body.set("client_secret", request.live.clientSecret);

      const res = await fetch(`https://${request.live.domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await res.json();

      if (res.ok && data.access_token) {
        // Return userId + toolName so the status endpoint can record consent
        // and ungate the re-sent commit (see index.js /api/ciba/status handler).
        const { userId, toolName, bindingMessage } = request;
        cibaRequests.delete(authReqId);
        return { status: "approved", token: data.access_token, bindingMessage, userId, toolName };
      }
      // authorization_pending / slow_down -> still waiting.
      if (data.error === "authorization_pending" || data.error === "slow_down") {
        return { status: "pending", bindingMessage: request.bindingMessage };
      }
      // access_denied / expired_token / invalid_request -> terminal.
      cibaRequests.delete(authReqId);
      return { status: "denied", bindingMessage: request.bindingMessage };
    } catch (err) {
      console.error(`[CIBA] (live) poll error: ${err.message}`);
      return { status: "pending", bindingMessage: request.bindingMessage };
    }
  }

  // Simulation
  if (Date.now() - request.createdAt > 300_000) {
    cibaRequests.delete(authReqId);
    return { status: "denied" };
  }

  if (request.status === "approved") {
    const { userId, toolName, bindingMessage } = request;
    cibaRequests.delete(authReqId);
    // Return userId + toolName so the status endpoint can record consent
    // and ungate the re-sent commit (see index.js /api/ciba/status handler).
    return {
      status: "approved",
      token: `ciba_token_${userId}_${toolName}_${Date.now()}`,
      bindingMessage,
      userId,
      toolName,
    };
  }

  if (request.status === "denied") {
    cibaRequests.delete(authReqId);
    return { status: "denied", bindingMessage: request.bindingMessage };
  }

  return { status: "pending", bindingMessage: request.bindingMessage };
}

// Approve/deny only apply to simulated requests; live approval
// happens on the rep's Guardian device.
export function approveCIBA(authReqId) {
  const request = cibaRequests.get(authReqId);
  if (!request || request.live || request.status !== "pending") {
    return false;
  }
  request.status = "approved";
  console.log(`[CIBA] Request ${authReqId} APPROVED`);
  return true;
}

export function denyCIBA(authReqId) {
  const request = cibaRequests.get(authReqId);
  if (!request || request.live || request.status !== "pending") {
    return false;
  }
  request.status = "denied";
  console.log(`[CIBA] Request ${authReqId} DENIED`);
  return true;
}

export function listPendingCIBA() {
  return Array.from(cibaRequests.values())
    .filter((r) => r.status === "pending")
    .map(({ authReqId, userId, toolName, bindingMessage, createdAt }) => ({
      authReqId,
      userId,
      toolName,
      bindingMessage,
      createdAt,
    }));
}

// Bonus CIBA -- build a human-readable binding message.
// This is the string the rep reads on their Auth0 Guardian push
// notification. "Approve 25% discount + net-60 terms on quote
// for acme?" is much safer than a generic "Approve action?".
// A meaningful binding message turns the push into a real
// authorization record, not just a rubber-stamp tap.
export function buildDocShareBindingMessage(params) {
  const title = params.documentTitle || params.documentId || "document";
  const recipient = params.recipientEmail || "external recipient";
  return `Nexus: share "${title}" with ${recipient} — approve?`;
}
