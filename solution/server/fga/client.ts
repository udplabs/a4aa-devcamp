import { DOCUMENTS } from "./model";

interface FGATuple {
  user: string;
  relation: string;
  object: string;
}

const tupleStore: FGATuple[] = [];

export function writeTuple(user: string, relation: string, object: string): void {
  const exists = tupleStore.some(
    (t) => t.user === user && t.relation === relation && t.object === object
  );
  if (!exists) {
    tupleStore.push({ user, relation, object });
    console.log(`[FGA] Tuple written: ${user} is ${relation} of ${object}`);
  }
}

export function checkAccess(userId: string, relation: string, object: string): boolean {
  const userKey = `user:${userId}`;

  let relationsToCheck: string[];
  if (relation === "can_view") {
    relationsToCheck = ["viewer", "editor", "owner"];
  } else if (relation === "can_edit") {
    relationsToCheck = ["editor", "owner"];
  } else {
    relationsToCheck = [relation];
  }

  const hasAccess = tupleStore.some(
    (t) =>
      t.user === userKey &&
      relationsToCheck.includes(t.relation) &&
      t.object === object
  );

  console.log(
    `[FGA] Check: ${userKey} ${relation} ${object} → ${hasAccess ? "ALLOWED" : "DENIED"}`
  );

  return hasAccess;
}

export function seedTuplesForUser(userId: string): void {
  console.log(`[FGA] Seeding tuples for user: ${userId}`);
  writeTuple(userId, "viewer", "document:project-roadmap");
  writeTuple(userId, "editor", "document:budget-2025");
  writeTuple(userId, "viewer", "document:team-handbook");
  // No relation to classified-report — access will be denied
}

export function listAccessibleDocuments(userId: string): Array<{
  id: string;
  title: string;
  classification: string;
  relation: string;
}> {
  const userKey = `user:${userId}`;
  const accessible: Array<{
    id: string;
    title: string;
    classification: string;
    relation: string;
  }> = [];

  for (const [docId, doc] of Object.entries(DOCUMENTS)) {
    const objectKey = `document:${docId}`;
    const tuple = tupleStore.find(
      (t) => t.user === userKey && t.object === objectKey
    );
    if (tuple) {
      accessible.push({
        id: docId,
        title: doc.title,
        classification: doc.classification,
        relation: tuple.relation,
      });
    }
  }

  return accessible;
}

export function getDocumentWithAccessCheck(
  userId: string,
  documentId: string
): { authorized: boolean; document?: typeof DOCUMENTS[string]; relation?: string } {
  const objectKey = `document:${documentId}`;
  const hasAccess = checkAccess(userId, "can_view", objectKey);

  if (!hasAccess) {
    return { authorized: false };
  }

  const doc = DOCUMENTS[documentId];
  if (!doc) {
    return { authorized: false };
  }

  const userKey = `user:${userId}`;
  const tuple = tupleStore.find(
    (t) => t.user === userKey && t.object === objectKey
  );

  return {
    authorized: true,
    document: doc,
    relation: tuple?.relation,
  };
}
