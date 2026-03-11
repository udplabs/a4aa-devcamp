// =============================================================
// LAB 3: Define the FGA Authorization Model
// See: lab-guide/03-fine-grained-authorization.md - Step 1
//
// Define:
// - FGA_MODEL with type definitions for 'user' and 'document'
// - DOCUMENTS data store with sample documents
// =============================================================

/**
 * FGA Authorization Model
 * TODO: Define type definitions for user and document types
 * with relations: viewer, editor, owner, can_view, can_edit
 */
export const FGA_MODEL = {
  type_definitions: [],
};

/**
 * Document data store (simulated).
 * TODO: Add sample documents with title, content, and classification
 */
export const DOCUMENTS: Record<
  string,
  { title: string; content: string; classification: string }
> = {};
