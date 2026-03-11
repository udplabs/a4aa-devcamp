// =============================================================
// LAB 4: Implement the Token Vault
// See: lab-guide/04-token-vault.md - Step 1
//
// This module handles:
// 1. Storing third-party OAuth tokens keyed by (userId, provider)
// 2. Retrieving tokens (with automatic refresh on expiry)
// 3. Removing tokens (unlinking accounts)
// 4. Listing linked providers
//
// Implement:
// - storeToken(userId, provider, accessToken, refreshToken, expiresIn, scopes)
// - getToken(userId, provider) — returns token or null, refreshes if expired
// - removeToken(userId, provider)
// - listLinkedProviders(userId)
// - seedVaultForUser(userId)
// =============================================================

/**
 * Store a third-party token in the vault.
 * TODO: Implement
 */
export function storeToken(
  userId: string,
  provider: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scopes: string[]
): void {
  // TODO: Store in the in-memory vault
}

/**
 * Retrieve a valid token from the vault.
 * If expired, simulate a token refresh.
 * TODO: Implement
 */
export async function getToken(
  userId: string,
  provider: string
): Promise<{ token: string; provider: string } | null> {
  return null;
}

/**
 * Remove a token from the vault (unlink account).
 * TODO: Implement
 */
export function removeToken(userId: string, provider: string): boolean {
  return false;
}

/**
 * List all linked providers for a user.
 * TODO: Implement
 */
export function listLinkedProviders(
  userId: string
): Array<{ provider: string; scopes: string[]; expiresAt: number }> {
  return [];
}

/**
 * Seed a simulated third-party connection for a user.
 * TODO: Implement
 */
export function seedVaultForUser(userId: string): void {
  // TODO: Store a simulated "file-storage" token for the user
}
