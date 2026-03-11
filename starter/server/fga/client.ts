// =============================================================
// LAB 3: Implement the FGA Client
// See: lab-guide/03-fine-grained-authorization.md - Step 2
//
// This module handles:
// 1. Writing relationship tuples
// 2. Checking access (with computed relations)
// 3. Seeding initial tuples for a user
// 4. Listing accessible documents
// 5. Getting a document with access check
//
// Implement the following:
// - writeTuple(user, relation, object)
// - checkAccess(userId, relation, object)
// - seedTuplesForUser(userId)
// - listAccessibleDocuments(userId)
// - getDocumentWithAccessCheck(userId, documentId)
// =============================================================

import { DOCUMENTS } from "./model";

/**
 * Write a relationship tuple.
 * TODO: Implement
 */
export function writeTuple(
  user: string,
  relation: string,
  object: string
): void {
  // TODO: Store the tuple, avoiding duplicates
}

/**
 * Check if a user has a specific relation to an object.
 * TODO: Implement - handle computed relations (can_view, can_edit)
 */
export function checkAccess(
  userId: string,
  relation: string,
  object: string
): boolean {
  return false;
}

/**
 * Seed initial authorization tuples for a user.
 * TODO: Implement - give the user access to some documents but not others
 */
export function seedTuplesForUser(userId: string): void {
  // TODO: Write tuples for the user
}

/**
 * List all documents the user can access.
 * TODO: Implement
 */
export function listAccessibleDocuments(
  userId: string
): Array<{
  id: string;
  title: string;
  classification: string;
  relation: string;
}> {
  return [];
}

/**
 * Get a document's content if the user has access.
 * TODO: Implement
 */
export function getDocumentWithAccessCheck(
  userId: string,
  documentId: string
): {
  authorized: boolean;
  document?: (typeof DOCUMENTS)[string];
  relation?: string;
} {
  return { authorized: false };
}
