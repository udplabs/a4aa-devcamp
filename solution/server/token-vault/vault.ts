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

export function storeToken(
  userId: string,
  provider: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scopes: string[]
): void {
  const key = vaultKey(userId, provider);
  vault.set(key, {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    provider,
    scopes,
  });
  console.log(`[Token Vault] Stored token for ${userId} @ ${provider}`);
}

export async function getToken(
  userId: string,
  provider: string
): Promise<{ token: string; provider: string } | null> {
  const key = vaultKey(userId, provider);
  const entry = vault.get(key);

  if (!entry) {
    console.log(`[Token Vault] No token found for ${userId} @ ${provider}`);
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    console.log(`[Token Vault] Token expired for ${userId} @ ${provider}, refreshing...`);
    const newToken = `refreshed_${provider}_${Date.now()}`;
    entry.accessToken = newToken;
    entry.expiresAt = Date.now() + 3600 * 1000;
    console.log(`[Token Vault] Token refreshed for ${userId} @ ${provider}`);
  }

  return {
    token: entry.accessToken,
    provider: entry.provider,
  };
}

export function removeToken(userId: string, provider: string): boolean {
  const key = vaultKey(userId, provider);
  const existed = vault.has(key);
  vault.delete(key);
  if (existed) {
    console.log(`[Token Vault] Removed token for ${userId} @ ${provider}`);
  }
  return existed;
}

export function listLinkedProviders(userId: string): Array<{
  provider: string;
  scopes: string[];
  expiresAt: number;
}> {
  const results: Array<{ provider: string; scopes: string[]; expiresAt: number }> = [];

  for (const [key, entry] of vault.entries()) {
    if (key.startsWith(`${userId}:`)) {
      results.push({
        provider: entry.provider,
        scopes: entry.scopes,
        expiresAt: entry.expiresAt,
      });
    }
  }

  return results;
}

export function seedVaultForUser(userId: string): void {
  storeToken(
    userId,
    "file-storage",
    `fs_access_${userId}_${Date.now()}`,
    `fs_refresh_${userId}`,
    3600,
    ["files:read", "files:list"]
  );
}
