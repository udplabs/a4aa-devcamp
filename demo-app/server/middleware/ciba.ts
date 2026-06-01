// =============================================================
// CIBA -- Lab 02 (Client-Initiated Backchannel Authentication)
//
// High-risk tools (e.g. commit_quote_terms with a steep discount)
// require out-of-band rep approval before they run.
//
//   - LIVE: when the resolved tenant has a provisioned CIBA client
//     (deploymentData.ciba_client_id), initiate hits Auth0
//     /bc-authorize and status polls /oauth/token. The rep approves
//     the push on their enrolled Guardian device.
//   - SIMULATED: otherwise, an in-memory request store is approved
//     or denied via the demo's /api/ciba/{approve,deny} endpoints so
//     the lab runs offline.
// =============================================================

import type { Tenant } from "../platform/tenant";

const CIBA_GRANT = "urn:openid:params:grant-type:ciba";

// In-memory store for CIBA requests. Live requests also stash the
// minimal Auth0 context needed to poll for completion.
const cibaRequests = new Map<string, {
  userId: string;
  toolName: string;
  status: "pending" | "approved" | "denied";
  authReqId: string;
  bindingMessage: string;
  createdAt: number;
  live?: { domain: string; clientId: string; clientSecret?: string };
}>();

function generateAuthReqId(): string {
  return `ciba_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function cibaClient(tenant?: Tenant): { domain: string; clientId: string; clientSecret?: string } | null {
  const dd = tenant?.deploymentData;
  if (!dd?.ciba_client_id || !tenant?.domain) return null;
  return { domain: tenant.domain, clientId: dd.ciba_client_id, clientSecret: dd.ciba_client_secret };
}

export async function initiateCIBA(
  userId: string,
  userEmail: string,
  toolName: string,
  scope: string,
  bindingMessage: string = "",
  tenant?: Tenant
): Promise<{ authReqId: string; expiresIn: number; interval: number; bindingMessage: string }> {
  const message = bindingMessage || `Approve use of ${toolName}`;
  const live = cibaClient(tenant);

  if (live) {
    // login_hint identifies the rep to push to. Auth0 accepts an
    // iss_sub-formatted JSON hint resolved against the tenant issuer.
    const loginHint = JSON.stringify({
      format: "iss_sub",
      iss: tenant!.issuer,
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

export async function checkCIBAStatus(
  authReqId: string
): Promise<{ status: "pending" | "approved" | "denied"; token?: string; bindingMessage?: string }> {
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
        cibaRequests.delete(authReqId);
        return { status: "approved", token: data.access_token, bindingMessage: request.bindingMessage };
      }
      // authorization_pending / slow_down -> still waiting.
      if (data.error === "authorization_pending" || data.error === "slow_down") {
        return { status: "pending", bindingMessage: request.bindingMessage };
      }
      // access_denied / expired_token / invalid_request -> terminal.
      cibaRequests.delete(authReqId);
      return { status: "denied", bindingMessage: request.bindingMessage };
    } catch (err: any) {
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
    cibaRequests.delete(authReqId);
    return {
      status: "approved",
      token: `ciba_token_${request.userId}_${request.toolName}_${Date.now()}`,
      bindingMessage: request.bindingMessage,
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
export function approveCIBA(authReqId: string): boolean {
  const request = cibaRequests.get(authReqId);
  if (!request || request.live || request.status !== "pending") {
    return false;
  }
  request.status = "approved";
  console.log(`[CIBA] Request ${authReqId} APPROVED`);
  return true;
}

export function denyCIBA(authReqId: string): boolean {
  const request = cibaRequests.get(authReqId);
  if (!request || request.live || request.status !== "pending") {
    return false;
  }
  request.status = "denied";
  console.log(`[CIBA] Request ${authReqId} DENIED`);
  return true;
}

export function listPendingCIBA(): Array<{
  authReqId: string;
  userId: string;
  toolName: string;
  bindingMessage: string;
  createdAt: number;
}> {
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

// Build a human-readable binding message for a CIBA request.
// The rep sees this message on their device before approving.
export function buildQuoteCommitBindingMessage(params: {
  accountId: string;
  discountPercent?: number;
  paymentTerms?: string;
}): string {
  const parts: string[] = [];
  if (typeof params.discountPercent === "number") {
    parts.push(`${params.discountPercent}% discount`);
  }
  if (params.paymentTerms && params.paymentTerms !== "net-30") {
    parts.push(`${params.paymentTerms} terms`);
  }
  const detail = parts.length > 0 ? parts.join(" + ") : "non-standard terms";
  return `Approve ${detail} on quote for ${params.accountId}?`;
}
