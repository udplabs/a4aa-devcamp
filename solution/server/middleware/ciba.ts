// In-memory store for CIBA requests (simulated)
const cibaRequests = new Map<string, {
  userId: string;
  toolName: string;
  status: "pending" | "approved" | "denied";
  authReqId: string;
  bindingMessage: string;
  createdAt: number;
}>();

function generateAuthReqId(): string {
  return `ciba_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export async function initiateCIBA(
  userId: string,
  userEmail: string,
  toolName: string,
  scope: string,
  bindingMessage: string = ""
): Promise<{ authReqId: string; expiresIn: number; interval: number; bindingMessage: string }> {
  const authReqId = generateAuthReqId();
  const message = bindingMessage || `Approve use of ${toolName}`;

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

  return {
    authReqId,
    expiresIn: 300,
    interval: 5,
    bindingMessage: message,
  };
}

export function checkCIBAStatus(
  authReqId: string
): { status: "pending" | "approved" | "denied"; token?: string; bindingMessage?: string } {
  const request = cibaRequests.get(authReqId);

  if (!request) {
    return { status: "denied" };
  }

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

export function approveCIBA(authReqId: string): boolean {
  const request = cibaRequests.get(authReqId);
  if (!request || request.status !== "pending") {
    return false;
  }
  request.status = "approved";
  console.log(`[CIBA] Request ${authReqId} APPROVED`);
  return true;
}

export function denyCIBA(authReqId: string): boolean {
  const request = cibaRequests.get(authReqId);
  if (!request || request.status !== "pending") {
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
