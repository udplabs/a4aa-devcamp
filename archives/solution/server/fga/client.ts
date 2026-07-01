// =============================================================
// FGA client (simulated) -- Lab 03
//
// Simple tuple store modelling the RetailZero wholesale account
// graph. In production this is backed by the Auth0 FGA service;
// here it is an in-memory array so the lab runs offline.
// =============================================================

import { ACCOUNTS, CATALOG } from "./model";

interface FGATuple {
  user: string;    // e.g. user:alice, team:team-west
  relation: string; // e.g. owner, manager, member, owning_team, reader
  object: string;   // e.g. account:acme, team:team-west, catalog:default
}

const tupleStore: FGATuple[] = [];

export function writeTuple(user: string, relation: string, object: string): void {
  const exists = tupleStore.some(
    (t) => t.user === user && t.relation === relation && t.object === object
  );
  if (!exists) {
    tupleStore.push({ user, relation, object });
    console.log(`[FGA] Tuple: ${user} is ${relation} of ${object}`);
  }
}

// ---- Check helpers ----------------------------------------------

function hasDirect(user: string, relation: string, object: string): boolean {
  return tupleStore.some(
    (t) => t.user === user && t.relation === relation && t.object === object
  );
}

function teamsUserIsMemberOf(userKey: string, role: "manager" | "member"): string[] {
  return tupleStore
    .filter((t) => t.user === userKey && t.relation === role && t.object.startsWith("team:"))
    .map((t) => t.object);
}

function owningTeamsOfAccount(object: string): string[] {
  return tupleStore
    .filter((t) => t.relation === "owning_team" && t.object === object)
    .map((t) => t.user);
}

// can_read_account: rep owns account, OR is manager/member of a team that owns it
export function canReadAccount(userId: string, accountId: string): boolean {
  const userKey = `user:${userId}`;
  const objectKey = `account:${accountId}`;

  if (hasDirect(userKey, "owner", objectKey)) {
    return logDecision(userKey, "can_read", objectKey, true);
  }
  const managedTeams = teamsUserIsMemberOf(userKey, "manager");
  const memberTeams = teamsUserIsMemberOf(userKey, "member");
  const owningTeams = owningTeamsOfAccount(objectKey);

  const viaTeam = owningTeams.some(
    (t) => managedTeams.includes(t) || memberTeams.includes(t)
  );

  return logDecision(userKey, "can_read", objectKey, viaTeam);
}

// can_commit_quote: rep owns account, OR manages a team that owns it
export function canCommitQuote(userId: string, accountId: string): boolean {
  const userKey = `user:${userId}`;
  const objectKey = `account:${accountId}`;

  if (hasDirect(userKey, "owner", objectKey)) {
    return logDecision(userKey, "can_commit", objectKey, true);
  }
  const managedTeams = teamsUserIsMemberOf(userKey, "manager");
  const owningTeams = owningTeamsOfAccount(objectKey);
  const viaManager = owningTeams.some((t) => managedTeams.includes(t));

  return logDecision(userKey, "can_commit", objectKey, viaManager);
}

function logDecision(
  user: string,
  relation: string,
  object: string,
  allow: boolean
): boolean {
  console.log(
    `[FGA] Check: ${user} ${relation} ${object} -> ${allow ? "ALLOWED" : "DENIED"}`
  );
  return allow;
}

// ---- Seeding & reads --------------------------------------------

const seededUsers = new Set<string>();

// Seed demo tuples branched by email so the FGA differentiation is visible:
//   alice@... -> direct owner of acme + globex (read + commit both)
//   bob@...   -> member (not manager) of team-west which owns initech
//                (read initech via team membership; cannot commit)
//   any other authenticated rep -> owner of acme + globex (default for demo)
// Every authenticated rep also gets reader catalog:default.
// account:stark is intentionally never seeded -> good FGA deny case.
export function seedTuplesForUser(userId: string, email?: string): void {
  if (seededUsers.has(userId)) return;
  console.log(`[FGA] Seeding tuples for user: ${userId} (email=${email || "n/a"})`);

  // Every authenticated rep can read the catalog.
  writeTuple(`user:${userId}`, "reader", "catalog:default");

  if (email?.startsWith("alice")) {
    writeTuple(`user:${userId}`, "owner", "account:acme");
    writeTuple(`user:${userId}`, "owner", "account:globex");
  } else if (email?.startsWith("bob")) {
    writeTuple(`user:${userId}`, "member", "team:team-west");
    writeTuple("team:team-west", "owning_team", "account:initech");
  } else {
    writeTuple(`user:${userId}`, "owner", "account:acme");
    writeTuple(`user:${userId}`, "owner", "account:globex");
  }

  seededUsers.add(userId);
}

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
      const userKey = `user:${userId}`;
      const objectKey = `account:${accountId}`;
      const direct = tupleStore.find(
        (t) => t.user === userKey && t.object === objectKey
      );
      result.push({
        id: accountId,
        name: account.name,
        tier: account.tier,
        segment: account.segment,
        relation: direct ? direct.relation : "via team",
      });
    }
  }
  return result;
}
