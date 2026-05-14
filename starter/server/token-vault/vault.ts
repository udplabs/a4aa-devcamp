// =============================================================
// LAB 04: Implement the Token Vault (simulated)
// See: lab-guide/04-token-vault.md
//
// Per-user federated connection store for Google Workspace and
// Slack. Short-lived access tokens are minted on demand and
// refreshed transparently when expired. The MCP server calls
// getToken(userId, provider) right before calling the third-party
// API so credentials never sit in agent memory or prompts.
//
// In production this is backed by Auth0 Token Vault; here it is
// an in-memory Map so the lab runs offline.
// =============================================================

interface VaultEntry {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  provider: string;
  scopes: string[];
}

const vault = new Map<string, VaultEntry>();

function vaultKey(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

// TODO(lab-04): store a vault entry keyed by (userId, provider).
// Compute expiresAt from expiresIn (seconds).
export function storeToken(
  userId: string,
  provider: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scopes: string[]
): void {
  void userId;
  void provider;
  void accessToken;
  void refreshToken;
  void expiresIn;
  void scopes;
}

// TODO(lab-04): return the active token for (userId, provider).
// If expired, simulate a refresh by swapping in a new token prefixed
// with `refreshed_${provider}_` and extending expiresAt.
// Return null when no entry exists.
export async function getToken(
  userId: string,
  provider: string
): Promise<{ token: string; provider: string } | null> {
  void userId;
  void provider;
  return null;
}

// TODO(lab-04): remove a vault entry. Return true if something was removed.
export function removeToken(userId: string, provider: string): boolean {
  void userId;
  void provider;
  return false;
}

// TODO(lab-04): list every linked provider for userId.
export function listLinkedProviders(userId: string): Array<{
  provider: string;
  scopes: string[];
  expiresAt: number;
}> {
  void userId;
  return [];
}

// TODO(lab-04): seed demo google + slack tokens for userId.
// google scopes: documents + drive.file
// slack scopes: chat:write + channels:read
// Without this seeding the create_google_doc and post_slack_triage
// tools have no credentials to mint.
export function seedVaultForUser(userId: string): void {
  void userId;
}
