// =============================================================
// FGA client -- Lab 03
//
// Two-mode authorization client for the RetailZero wholesale
// account graph:
//
//   - LIVE: when the resolved tenant carries a provisioned FGA
//     store (deploymentData.fga_store_id + creds), checks and
//     tuple writes go to Auth0/Okta FGA via @openfga/sdk.
//   - SIMULATED: otherwise (local dev, no platform), an in-memory
//     tuple store models the same graph so the lab runs offline.
//
// The check functions accept an optional Tenant. Callers in the
// MCP server resolve the tenant from the incoming token's issuer
// and pass it through, so the same code path serves every demo.
// =============================================================

import { OpenFgaClient, CredentialsMethod } from "@openfga/sdk";
import { ACCOUNTS, CATALOG } from "./model";
import type { Tenant } from "../platform/tenant";

interface FGATuple {
  user: string; // e.g. user:alice, team:team-west
  relation: string; // e.g. owner, manager, member, owning_team, reader
  object: string; // e.g. account:acme, team:team-west, catalog:default
}

// ---- Live FGA client (per store) --------------------------------

const liveClients = new Map<string, OpenFgaClient>();

// Build (and cache) a store-scoped OpenFGA client for a tenant, or
// null when the tenant has no provisioned FGA store -> simulation.
function liveFgaForTenant(tenant?: Tenant): OpenFgaClient | null {
  const dd = tenant?.deploymentData;
  if (
    !dd?.fga_store_id ||
    !dd.fga_api_url ||
    !dd.fga_api_token_issuer ||
    !dd.fga_api_audience ||
    !dd.fga_client_id ||
    !dd.fga_client_secret
  ) {
    return null;
  }
  const cached = liveClients.get(dd.fga_store_id);
  if (cached) return cached;

  const client = new OpenFgaClient({
    apiUrl: dd.fga_api_url,
    storeId: dd.fga_store_id,
    authorizationModelId: dd.fga_model_id,
    credentials: {
      method: CredentialsMethod.ClientCredentials,
      config: {
        apiTokenIssuer: dd.fga_api_token_issuer,
        apiAudience: dd.fga_api_audience,
        clientId: dd.fga_client_id,
        clientSecret: dd.fga_client_secret,
      },
    },
  });
  liveClients.set(dd.fga_store_id, client);
  return client;
}

// ---- Simulated tuple store --------------------------------------

const tupleStore: FGATuple[] = [];

export async function writeTuple(
  user: string,
  relation: string,
  object: string,
  tenant?: Tenant
): Promise<void> {
  const live = liveFgaForTenant(tenant);
  if (live) {
    try {
      await live.write({ writes: [{ user, relation, object }] });
      console.log(`[FGA] (live) Tuple: ${user} is ${relation} of ${object}`);
    } catch (err: any) {
      // Tuple may already exist -- FGA rejects duplicate writes.
      if (!/already exists/i.test(err?.message || "")) {
        console.error(`[FGA] (live) write failed: ${err.message}`);
      }
    }
    return;
  }

  const exists = tupleStore.some(
    (t) => t.user === user && t.relation === relation && t.object === object
  );
  if (!exists) {
    tupleStore.push({ user, relation, object });
    console.log(`[FGA] Tuple: ${user} is ${relation} of ${object}`);
  }
}

// ---- Simulated check helpers ------------------------------------

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

function simCanRead(userKey: string, objectKey: string): boolean {
  if (hasDirect(userKey, "owner", objectKey)) return true;
  const managedTeams = teamsUserIsMemberOf(userKey, "manager");
  const memberTeams = teamsUserIsMemberOf(userKey, "member");
  const owningTeams = owningTeamsOfAccount(objectKey);
  return owningTeams.some((t) => managedTeams.includes(t) || memberTeams.includes(t));
}

function simCanCommit(userKey: string, objectKey: string): boolean {
  if (hasDirect(userKey, "owner", objectKey)) return true;
  const managedTeams = teamsUserIsMemberOf(userKey, "manager");
  const owningTeams = owningTeamsOfAccount(objectKey);
  return owningTeams.some((t) => managedTeams.includes(t));
}

async function liveCheck(
  client: OpenFgaClient,
  userKey: string,
  relation: "can_read" | "can_commit",
  objectKey: string
): Promise<boolean> {
  const { allowed } = await client.check({
    user: userKey,
    relation,
    object: objectKey,
  });
  return !!allowed;
}

// can_read_account: rep owns account, OR is manager/member of a team that owns it
export async function canReadAccount(
  userId: string,
  accountId: string,
  tenant?: Tenant
): Promise<boolean> {
  const userKey = `user:${userId}`;
  const objectKey = `account:${accountId}`;
  const live = liveFgaForTenant(tenant);
  const allow = live
    ? await liveCheck(live, userKey, "can_read", objectKey)
    : simCanRead(userKey, objectKey);
  return logDecision(userKey, "can_read", objectKey, allow);
}

// can_commit_quote: rep owns account, OR manages a team that owns it
export async function canCommitQuote(
  userId: string,
  accountId: string,
  tenant?: Tenant
): Promise<boolean> {
  const userKey = `user:${userId}`;
  const objectKey = `account:${accountId}`;
  const live = liveFgaForTenant(tenant);
  const allow = live
    ? await liveCheck(live, userKey, "can_commit", objectKey)
    : simCanCommit(userKey, objectKey);
  return logDecision(userKey, "can_commit", objectKey, allow);
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
export async function seedTuplesForUser(
  userId: string,
  email?: string,
  tenant?: Tenant
): Promise<void> {
  if (seededUsers.has(userId)) return;
  console.log(`[FGA] Seeding tuples for user: ${userId} (email=${email || "n/a"})`);

  await writeTuple(`user:${userId}`, "reader", "catalog:default", tenant);

  if (email?.startsWith("alice")) {
    await writeTuple(`user:${userId}`, "owner", "account:acme", tenant);
    await writeTuple(`user:${userId}`, "owner", "account:globex", tenant);
  } else if (email?.startsWith("bob")) {
    await writeTuple(`user:${userId}`, "member", "team:team-west", tenant);
    await writeTuple("team:team-west", "owning_team", "account:initech", tenant);
  } else {
    await writeTuple(`user:${userId}`, "owner", "account:acme", tenant);
    await writeTuple(`user:${userId}`, "owner", "account:globex", tenant);
  }

  seededUsers.add(userId);
}

export function getAccount(accountId: string) {
  return ACCOUNTS[accountId] || null;
}

export function getCatalogEntry(sku: string) {
  return CATALOG[sku] || null;
}

export async function listAccountsForUser(
  userId: string,
  tenant?: Tenant
): Promise<Array<{
  id: string;
  name: string;
  tier: string;
  segment: string;
  relation: string;
}>> {
  const result: Array<{ id: string; name: string; tier: string; segment: string; relation: string }> = [];
  for (const [accountId, account] of Object.entries(ACCOUNTS)) {
    if (await canReadAccount(userId, accountId, tenant)) {
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
