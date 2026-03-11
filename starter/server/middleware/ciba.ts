// =============================================================
// LAB 2: Implement CIBA (Client-Initiated Backchannel Authentication)
// See: lab-guide/02-async-authorization-ciba.md - Step 3
//
// This module handles:
// 1. Initiating CIBA authorization requests
// 2. Polling for approval status
// 3. Approving/denying requests (simulated)
//
// Implement the following:
// - initiateCIBA(userId, userEmail, toolName, scope)
// - checkCIBAStatus(authReqId)
// - approveCIBA(authReqId)
// - denyCIBA(authReqId)
// - listPendingCIBA()
// =============================================================

/**
 * Initiate a CIBA authorization request.
 * TODO: Implement - see lab guide for details
 */
export async function initiateCIBA(
  userId: string,
  userEmail: string,
  toolName: string,
  scope: string
): Promise<{ authReqId: string; expiresIn: number; interval: number }> {
  throw new Error("initiateCIBA not implemented - see Lab 2");
}

/**
 * Check the status of a CIBA request (polling).
 * TODO: Implement - see lab guide for details
 */
export function checkCIBAStatus(
  authReqId: string
): { status: "pending" | "approved" | "denied"; token?: string } {
  throw new Error("checkCIBAStatus not implemented - see Lab 2");
}

/**
 * Approve a CIBA request (simulates user action on their device).
 * TODO: Implement - see lab guide for details
 */
export function approveCIBA(authReqId: string): boolean {
  return false;
}

/**
 * Deny a CIBA request.
 * TODO: Implement - see lab guide for details
 */
export function denyCIBA(authReqId: string): boolean {
  return false;
}

/**
 * List all pending CIBA requests.
 * TODO: Implement - see lab guide for details
 */
export function listPendingCIBA(): Array<{
  authReqId: string;
  userId: string;
  toolName: string;
  createdAt: number;
}> {
  return [];
}
