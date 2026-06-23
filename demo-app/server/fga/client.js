// =============================================================
// FGA client -- Nexus document authorization
//
// Two-mode authorization client for the company knowledge graph:
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
import { DOCUMENTS } from "./model.js";

export { DOCUMENTS };

// ---- Live FGA client (per store) --------------------------------

const liveClients = new Map();

function liveFgaForTenant(tenant) {
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

const tupleStore = [];

export async function writeTuple(user, relation, object, tenant) {
  const live = liveFgaForTenant(tenant);
  if (live) {
    try {
      await live.write({ writes: [{ user, relation, object }] });
      console.log(`[FGA] (live) Tuple: ${user} is ${relation} of ${object}`);
    } catch (err) {
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

function hasDirect(user, relation, object) {
  return tupleStore.some(
    (t) => t.user === user && t.relation === relation && t.object === object
  );
}

function departmentsUserIsMemberOf(userKey) {
  return tupleStore
    .filter((t) => t.user === userKey && t.relation === "member" && t.object.startsWith("department:"))
    .map((t) => t.object);
}

function departmentsWithViewerOnDoc(docKey) {
  return tupleStore
    .filter((t) => t.relation === "viewer" && t.object === docKey && t.user.startsWith("department:"))
    .map((t) => t.user);
}

function simCanRead(userKey, docKey) {
  if (hasDirect(userKey, "owner", docKey)) return true;
  if (hasDirect(userKey, "editor", docKey)) return true;
  if (hasDirect(userKey, "viewer", docKey)) return true;
  // via department membership
  const userDepts = departmentsUserIsMemberOf(userKey);
  const docDepts = departmentsWithViewerOnDoc(docKey);
  return userDepts.some((d) => docDepts.includes(d));
}

function simCanShare(userKey, docKey) {
  return hasDirect(userKey, "owner", docKey) || hasDirect(userKey, "editor", docKey);
}

async function liveCheck(client, userKey, relation, objectKey) {
  const { allowed } = await client.check({
    user: userKey,
    relation,
    object: objectKey,
  });
  return !!allowed;
}

// can_read_document: user has viewer/editor/owner, or is member of a
// department that has viewer on this document.
export async function canReadDocument(userId, docId, tenant) {
  const userKey = `user:${userId}`;
  const objectKey = `document:${docId}`;
  const live = liveFgaForTenant(tenant);
  const allow = live
    ? await liveCheck(live, userKey, "can_read", objectKey)
    : simCanRead(userKey, objectKey);
  return logDecision(userKey, "can_read", objectKey, allow);
}

// can_share_document: user has editor or owner on this document.
export async function canShareDocument(userId, docId, tenant) {
  const userKey = `user:${userId}`;
  const objectKey = `document:${docId}`;
  const live = liveFgaForTenant(tenant);
  const allow = live
    ? await liveCheck(live, userKey, "can_share", objectKey)
    : simCanShare(userKey, objectKey);
  return logDecision(userKey, "can_share", objectKey, allow);
}

function logDecision(user, relation, object, allow) {
  console.log(
    `[FGA] Check: ${user} ${relation} ${object} -> ${allow ? "ALLOWED" : "DENIED"}`
  );
  return allow;
}

// ---- Seeding & reads --------------------------------------------

const seededUsers = new Set();

// Seed demo tuples branched by email so the FGA differentiation is visible:
//   alice@... -> engineering dept member (reads all-company + engineering docs, can share)
//   bob@...   -> all-company docs only (denied on engineering/hr/executive)
//   any other -> same as alice (default for demo)
// hr and executive docs are never seeded -> always a FGA deny case.
export async function seedTuplesForUser(userId, email, tenant) {
  if (seededUsers.has(userId)) return;
  console.log(`[FGA] Seeding tuples for user: ${userId} (email=${email || "n/a"})`);

  // All users: viewer on all-company docs
  await writeTuple(`user:${userId}`, "viewer", "document:handbook", tenant);
  await writeTuple(`user:${userId}`, "viewer", "document:security-policy", tenant);

  // Department viewer tuples (seeded once, not per-user)
  await writeTuple("department:engineering", "viewer", "document:q3-roadmap", tenant);
  await writeTuple("department:engineering", "viewer", "document:product-spec-v2", tenant);

  if (email?.startsWith("bob")) {
    // bob: all-company only, no engineering access
  } else {
    // alice + everyone else: engineering dept member (reads + can share engineering docs)
    await writeTuple(`user:${userId}`, "member", "department:engineering", tenant);
    await writeTuple(`user:${userId}`, "editor", "document:q3-roadmap", tenant);
    await writeTuple(`user:${userId}`, "editor", "document:product-spec-v2", tenant);
  }

  // compensation-q3 and board-deck-q3 intentionally never seeded -> FGA deny

  seededUsers.add(userId);
}

export function getDocument(docId) {
  return DOCUMENTS.find((d) => d.id === docId) || null;
}

export async function listDocumentsForUser(userId, tenant) {
  const result = [];
  for (const doc of DOCUMENTS) {
    if (await canReadDocument(userId, doc.id, tenant)) {
      result.push({ id: doc.id, title: doc.title, department: doc.department, classification: doc.classification });
    }
  }
  return result;
}
