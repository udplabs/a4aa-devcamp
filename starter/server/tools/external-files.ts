// =============================================================
// LAB 4: Create the External Files Tool
// See: lab-guide/04-token-vault.md - Step 3
//
// Implement:
// - getExternalFiles(userId) — retrieves vaulted token, calls third-party API
// - getLinkedProviders(userId) — lists connected providers
// =============================================================

/**
 * Get files from the external File Storage API using a vaulted token.
 * TODO: Implement
 */
export async function getExternalFiles(userId: string): Promise<{
  success: boolean;
  files?: any[];
  error?: string;
}> {
  return {
    success: false,
    error: "getExternalFiles not implemented - see Lab 4",
  };
}

/**
 * Get linked provider status for a user.
 * TODO: Implement
 */
export function getLinkedProviders(
  userId: string
): Array<{
  provider: string;
  scopes: string[];
  connected: boolean;
}> {
  return [];
}
