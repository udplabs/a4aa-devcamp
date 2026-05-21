// =============================================================
// LAB 03: Implement the FGA client (simulated)
// See: lab-guide/03-fine-grained-authorization.md
//
// This module owns the relationship-tuple store for the RetailZero
// wholesale account graph. In production this is backed by the
// Auth0 FGA service; here it is an in-memory array so the lab
// runs offline.
//
// You will implement:
//   - writeTuple(user, relation, object)
//   - canReadAccount(userId, accountId)   -- owner OR team manager/member
//   - canCommitQuote(userId, accountId)   -- owner OR team manager only
//   - seedTuplesForUser(userId, email?)   -- demo tuples branched by email
// =============================================================

import { ACCOUNTS, CATALOG } from "./model";

interface FGATuple {
  user: string;     // user:alice, team:team-west
  relation: string; // owner, manager, member, owning_team, reader
  object: string;   // account:acme, team:team-west, catalog:default
}

const tupleStore: FGATuple[] = [];

// TODO(lab-03): write (user, relation, object) to the store, avoiding duplicates.
export function writeTuple(user: string, relation: string, object: string): void {
  void user;
  void relation;
  void object;
}

// TODO(lab-03): return true when userId owns accountId OR is a manager/member
// of any team that owns accountId. Log the decision for the audit trail.
export function canReadAccount(userId: string, accountId: string): boolean {
  void userId;
  void accountId;
  return false;
}

// TODO(lab-03): return true when userId owns accountId OR manages a team
// that owns accountId. Members-only (non-manager) cannot commit.
export function canCommitQuote(userId: string, accountId: string): boolean {
  void userId;
  void accountId;
  return false;
}

const seededUsers = new Set<string>();

// TODO(lab-03): seed demo tuples the first time we see a user.
// Branch by email so attendees can demonstrate the FGA differentiation:
//   email starts with "alice" -> owner of account:acme, account:globex
//   email starts with "bob"   -> member of team:team-west; team-west owning_team account:initech
//   any other email           -> default to owner of acme + globex so demo prompts work
// Every authenticated rep also gets reader catalog:default.
// (account:stark is intentionally never seeded -> FGA deny case)
export function seedTuplesForUser(userId: string, email?: string): void {
  if (seededUsers.has(userId)) return;
  seededUsers.add(userId);
  void email;
}

// Pre-built helpers (used by the MCP server after access checks).
export function getAccount(accountId: string) {
  return ACCOUNTS[accountId] || null;
}

export function getCatalogEntry(sku: string) {
  return CATALOG[sku] || null;
}

export function listAccountsForUser(userId: string): Array<{
  id: string;
  name: string;
  tier: string;
  segment: string;
  relation: string;
}> {
  const result: Array<{ id: string; name: string; tier: string; segment: string; relation: string }> = [];
  for (const [accountId, account] of Object.entries(ACCOUNTS)) {
    if (canReadAccount(userId, accountId)) {
      result.push({
        id: accountId,
        name: account.name,
        tier: account.tier,
        segment: account.segment,
        relation: "via tuple",
      });
    }
  }
  return result;
}
