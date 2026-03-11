import {
  getDocumentWithAccessCheck,
  listAccessibleDocuments,
  seedTuplesForUser,
} from "../fga/client";
import { DOCUMENTS } from "../fga/model";

const seededUsers = new Set<string>();

function ensureSeeded(userId: string) {
  if (!seededUsers.has(userId)) {
    seedTuplesForUser(userId);
    seededUsers.add(userId);
  }
}

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
