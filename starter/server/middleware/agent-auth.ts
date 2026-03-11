// =============================================================
// LAB 2: Implement agent authorization
// See: lab-guide/02-async-authorization-ciba.md
//
// This module handles:
// 1. Checking if a tool requires user consent
// 2. Storing/checking consent records
// 3. Returning authorization results
//
// Implement the following:
// - hasUserConsented(userId, toolName) → boolean
// - recordConsent(userId, toolName) → void
// - revokeConsent(userId, toolName) → void
// - checkToolAuthorization(userId, scopes, toolName) → AuthorizationResult
// =============================================================

import { toolRegistry, ToolDefinition } from "../tools/registry";

// In-memory consent store (use a real DB in production)
const consentStore = new Map<string, Set<string>>();

export function hasUserConsented(userId: string, toolName: string): boolean {
  // TODO: Implement - check the consentStore
  return false;
}

export function recordConsent(userId: string, toolName: string): void {
  // TODO: Implement - add to consentStore
}

export function revokeConsent(userId: string, toolName: string): void {
  // TODO: Implement - remove from consentStore
}

export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  requiresConsent?: boolean;
  tool?: ToolDefinition;
  consentDetails?: {
    toolName: string;
    description: string;
    requiredScopes: string[];
    riskLevel: string;
  };
}

export function checkToolAuthorization(
  userId: string,
  userScopes: string[],
  toolName: string
): AuthorizationResult {
  // TODO: Implement
  // 1. Look up tool in toolRegistry
  // 2. Check if user has required scopes
  // 3. If tool requires consent, check if user has consented
  // 4. Return appropriate AuthorizationResult
  return { authorized: true };
}
