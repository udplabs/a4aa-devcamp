// =============================================================
// LAB 02: Implement CIBA (Client-Initiated Backchannel Authentication)
// See: lab-guide/02-async-authorization-ciba.md
//
// This module handles:
//   1. Initiating CIBA authorization requests with a binding message
//      built from the quote parameters (so the rep sees exactly what
//      they are approving on their device).
//   2. Polling for approval status.
//   3. Approving or denying requests (simulated via /api/ciba/*).
//
// You will implement:
//   - initiateCIBA(userId, email, toolName, scope, bindingMessage)
//   - checkCIBAStatus(authReqId)
//   - approveCIBA(authReqId)
//   - denyCIBA(authReqId)
//   - listPendingCIBA()
//   - buildQuoteCommitBindingMessage(params)
// =============================================================

// TODO(lab-02): replace these stubs with the full implementation.
// The finished version is in solution/server/middleware/ciba.ts and
// mirrors the Auth0 CIBA flow: generate an auth_req_id, store the
// binding message, expire after 300s.

export async function initiateCIBA(
  userId: string,
  userEmail: string,
  toolName: string,
  scope: string,
  bindingMessage: string = ""
): Promise<{ authReqId: string; expiresIn: number; interval: number; bindingMessage: string }> {
  void userId;
  void userEmail;
  void toolName;
  void scope;
  void bindingMessage;
  throw new Error("initiateCIBA not implemented - see Lab 02");
}

export function checkCIBAStatus(
  authReqId: string
): { status: "pending" | "approved" | "denied"; token?: string; bindingMessage?: string } {
  void authReqId;
  throw new Error("checkCIBAStatus not implemented - see Lab 02");
}

export function approveCIBA(authReqId: string): boolean {
  void authReqId;
  return false;
}

export function denyCIBA(authReqId: string): boolean {
  void authReqId;
  return false;
}

export function listPendingCIBA(): Array<{
  authReqId: string;
  userId: string;
  toolName: string;
  bindingMessage: string;
  createdAt: number;
}> {
  return [];
}

// TODO(lab-02): render the commit-quote approval prompt. Example:
//   "Approve 25% discount + net-60 terms on quote for acme?"
// The binding message is what the rep sees on their device before
// approving, so it must name the account + the non-standard terms.
export function buildQuoteCommitBindingMessage(params: {
  accountId: string;
  discountPercent?: number;
  paymentTerms?: string;
}): string {
  void params;
  return "Approve non-standard terms?";
}
