// =============================================================
// LAB 3: Create the Document Tool
// See: lab-guide/03-fine-grained-authorization.md - Step 3
//
// Implement:
// - getDocument(userId, documentId) — checks FGA before returning
// - listDocuments(userId) — returns only accessible documents
// =============================================================

/**
 * Get a specific document, checking FGA access.
 * TODO: Implement
 */
export function getDocument(
  userId: string,
  documentId: string
): { success: boolean; document?: any; error?: string } {
  return {
    success: false,
    error: "getDocument not implemented - see Lab 3",
  };
}

/**
 * List all documents the user can access.
 * TODO: Implement
 */
export function listDocuments(userId: string): {
  success: boolean;
  documents: Array<{
    id: string;
    title: string;
    classification: string;
    relation: string;
  }>;
  totalDocuments: number;
} {
  return { success: true, documents: [], totalDocuments: 0 };
}
