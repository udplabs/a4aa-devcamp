# Lab 3: Fine Grained Authorization

## Objectives

- Understand Auth0 FGA and the relationship-based authorization model
- Define an FGA authorization model (document, user, viewer/editor relationships)
- Write authorization tuples (e.g., "user X is a viewer of document Y")
- Add FGA checks to the agent before returning document data
- Handle authorized vs. unauthorized document access gracefully

---

## Premise

The agent can retrieve documents for the user. But not every user should see every document. Auth0 FGA provides **relationship-based access control** at the document level — a different model from scope-based auth, which controls per-action access.

---

## Concept: FGA vs Scope-Based Auth

| | Scope-Based (RBAC) | FGA (ReBAC) |
|---|---|---|
| **Controls** | What actions a user can take | What objects a user can access |
| **Example** | "User has `docs:read` scope" | "User is a viewer of document X" |
| **Granularity** | Per-action | Per-object |
| **Use case** | API permissions | Document/resource-level access |

FGA uses a relationship model:
- `user:alice` is a `viewer` of `document:project-roadmap`
- `user:bob` is an `editor` of `document:budget-2025`
- `user:alice` has **no relation** to `document:classified-report`

---

## Step 1: Define the FGA Model

Create `server/fga/model.ts`:

```typescript
/**
 * FGA Authorization Model
 *
 * Defines the types and relations for document access control.
 * In production, this model is defined in the Auth0 FGA dashboard.
 * For this lab, we simulate it in-memory.
 */
export const FGA_MODEL = {
  type_definitions: [
    {
      type: "user",
    },
    {
      type: "document",
      relations: {
        viewer: { directly_related: ["user"] },
        editor: { directly_related: ["user"] },
        owner: { directly_related: ["user"] },
        // can_view is a computed relation: viewer OR editor OR owner
        can_view: { union: ["viewer", "editor", "owner"] },
        // can_edit is a computed relation: editor OR owner
        can_edit: { union: ["editor", "owner"] },
      },
    },
  ],
};

/**
 * Document data store (simulated).
 */
export const DOCUMENTS: Record<string, { title: string; content: string; classification: string }> = {
  "project-roadmap": {
    title: "Project Roadmap 2025",
    content: "Q1: Launch auth module. Q2: Add CIBA support. Q3: FGA integration. Q4: Token Vault release.",
    classification: "internal",
  },
  "budget-2025": {
    title: "Budget 2025",
    content: "Total budget: $2.4M. Engineering: $1.2M. Marketing: $600K. Operations: $600K.",
    classification: "confidential",
  },
  "classified-report": {
    title: "Classified Security Report",
    content: "REDACTED — This document contains sensitive security findings.",
    classification: "restricted",
  },
  "team-handbook": {
    title: "Team Handbook",
    content: "Welcome to the team! Here are our values, processes, and guidelines for working together.",
    classification: "public",
  },
};
```

---

## Step 2: Implement the FGA Client

Create `server/fga/client.ts`:

```typescript
import { DOCUMENTS } from "./model";

/**
 * In-memory FGA tuple store.
 *
 * Each tuple represents a relationship: (user, relation, object)
 * In production, these are stored in Auth0 FGA.
 */
interface FGATuple {
  user: string;
  relation: string;
  object: string;
}

const tupleStore: FGATuple[] = [];

/**
 * Write a relationship tuple.
 */
export function writeTuple(user: string, relation: string, object: string): void {
  // Avoid duplicates
  const exists = tupleStore.some(
    (t) => t.user === user && t.relation === relation && t.object === object
  );
  if (!exists) {
    tupleStore.push({ user, relation, object });
    console.log(`[FGA] Tuple written: ${user} is ${relation} of ${object}`);
  }
}

/**
 * Check if a user has a specific relation to an object.
 * Handles computed relations (can_view = viewer OR editor OR owner).
 */
export function checkAccess(
  userId: string,
  relation: string,
  object: string
): boolean {
  const userKey = `user:${userId}`;

  // For computed relations, expand to base relations
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

/**
 * Seed initial authorization tuples for a user.
 * Call this when a user first authenticates to set up their document access.
 */
export function seedTuplesForUser(userId: string): void {
  console.log(`[FGA] Seeding tuples for user: ${userId}`);

  // User can view the project roadmap
  writeTuple(userId, "viewer", "document:project-roadmap");

  // User can edit the budget
  writeTuple(userId, "editor", "document:budget-2025");

  // User can view the team handbook
  writeTuple(userId, "viewer", "document:team-handbook");

  // User has NO relation to classified-report — access will be denied
}

/**
 * List all documents the user can access.
 */
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

/**
 * Get a document's content if the user has access.
 */
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

  // Find the user's relation for display
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
```

---

## Step 3: Create the Document Tool

Create `server/tools/documents.ts`:

```typescript
import {
  getDocumentWithAccessCheck,
  listAccessibleDocuments,
  seedTuplesForUser,
} from "../fga/client";
import { DOCUMENTS } from "../fga/model";

// Track which users have been seeded
const seededUsers = new Set<string>();

function ensureSeeded(userId: string) {
  if (!seededUsers.has(userId)) {
    seedTuplesForUser(userId);
    seededUsers.add(userId);
  }
}

/**
 * Get a specific document, checking FGA access.
 */
export function getDocument(
  userId: string,
  documentId: string
): { success: boolean; document?: any; error?: string } {
  ensureSeeded(userId);

  const result = getDocumentWithAccessCheck(userId, documentId);

  if (!result.authorized) {
    return {
      success: false,
      error: `Access denied. You don't have permission to view "${documentId}".`,
    };
  }

  return {
    success: true,
    document: {
      id: documentId,
      ...result.document,
      yourAccess: result.relation,
    },
  };
}

/**
 * List all documents the user can access.
 */
export function listDocuments(userId: string): {
  success: boolean;
  documents: Array<{ id: string; title: string; classification: string; relation: string }>;
  totalDocuments: number;
} {
  ensureSeeded(userId);

  const accessible = listAccessibleDocuments(userId);

  return {
    success: true,
    documents: accessible,
    totalDocuments: Object.keys(DOCUMENTS).length,
  };
}
```

---

## Step 4: Register the Document Tool

Open `server/tools/registry.ts` and add the document tools:

```typescript
get_document: {
  name: "get_document",
  description: "Retrieve a specific document by ID",
  parameters: { documentId: { type: "string", required: true } },
  requiredScopes: ["tools:read"],
  riskLevel: "medium",
  requiresConsent: false,
},

list_documents: {
  name: "list_documents",
  description: "List all documents you have access to",
  parameters: {},
  requiredScopes: ["tools:read"],
  riskLevel: "low",
  requiresConsent: false,
},
```

---

## Step 5: Update the Simulator

Open `server/simulator.ts` and add document intent detection and response formatting.

Add to the `detectIntent` function:

```typescript
if (lower.includes("document") || lower.includes("roadmap") || lower.includes("budget") || lower.includes("report") || lower.includes("handbook")) {
  // Try to detect a specific document
  if (lower.includes("roadmap") || lower.includes("project")) {
    return { toolName: "get_document", parameters: { documentId: "project-roadmap" } };
  }
  if (lower.includes("budget")) {
    return { toolName: "get_document", parameters: { documentId: "budget-2025" } };
  }
  if (lower.includes("classified") || lower.includes("security report")) {
    return { toolName: "get_document", parameters: { documentId: "classified-report" } };
  }
  if (lower.includes("handbook")) {
    return { toolName: "get_document", parameters: { documentId: "team-handbook" } };
  }
  // Generic "show me documents"
  return { toolName: "list_documents", parameters: {} };
}
```

Add to the `formatToolResponse` function:

```typescript
case "get_document":
  if (!result.success) {
    return `**Access Denied:** ${result.error}`;
  }
  return `**${result.document.title}** (${result.document.classification})\nYour access: *${result.document.yourAccess}*\n\n${result.document.content}`;

case "list_documents":
  if (result.documents.length === 0) {
    return "You don't have access to any documents.";
  }
  const docList = result.documents
    .map((d: any) => `- **${d.title}** (${d.classification}) — ${d.relation}`)
    .join("\n");
  return `You have access to ${result.documents.length} of ${result.totalDocuments} documents:\n${docList}`;
```

Update the tool execution to call the document functions:

```typescript
import { getDocument, listDocuments } from "./tools/documents";

// In the tool execution section:
case "get_document":
  return getDocument(user.sub, parameters.documentId);
case "list_documents":
  return listDocuments(user.sub);
```

---

## Step 6: Test the FGA Flow

### Test 1: List Documents
Send: **"What documents do I have access to?"**

Expected: List showing 3 documents (project-roadmap, budget-2025, team-handbook) but NOT classified-report.

### Test 2: Access an Allowed Document
Send: **"Show me the project roadmap"**

Expected: Document content displayed with your access level (viewer).

### Test 3: Access a Denied Document
Send: **"Show me the classified report"**

Expected: "Access Denied. You don't have permission to view classified-report."

### Test 4: Edit-Level Access
Send: **"Show me the budget"**

Expected: Document content displayed with access level "editor".

---

## Understanding the FGA Flow

```
User: "Show me the classified report"
  │
  ▼
Agent: detectIntent() → get_document { documentId: "classified-report" }
  │
  ▼
Agent: getDocument(userId, "classified-report")
  │
  ▼
FGA: checkAccess("user:auth0|abc123", "can_view", "document:classified-report")
  │
  ├── Check tuples for viewer → NOT FOUND
  ├── Check tuples for editor → NOT FOUND
  └── Check tuples for owner  → NOT FOUND
  │
  ▼
Result: DENIED → "Access denied"
```

---

## Checkpoint

At this point you have:
- [x] FGA authorization model defined
- [x] Relationship tuples seeded per user
- [x] FGA access checks before returning documents
- [x] Document retrieval tool registered
- [x] Authorized access returns document content
- [x] Unauthorized access returns a clear denial

---

**Next: [Lab 4 — Token Vault](./04-token-vault.md)**
