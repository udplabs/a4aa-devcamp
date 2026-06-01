// =============================================================
// Token Vault -- Lab 04
//
// Per-user federated connection tokens. The MCP server calls
// getToken(userId, provider) right before hitting a third-party
// API, so upstream credentials never sit in agent memory or in
// LLM prompts.
//
//   - LIVE: when the resolved tenant has a provisioned federated
//     connection (deploymentData.vault_connections[provider]) and
//     we hold the rep's access token, we exchange it with Auth0
//     Token Vault for a short-lived federated-connection access
//     token (the rep links Google/Slack once via the connection).
//   - SIMULATED: otherwise, an in-memory Map mints fake tokens so
//     the lab runs offline.
//
// The in-memory link/unlink/list helpers back the demo's
// /api/vault/* endpoints and stay simulation-only.
// =============================================================

import type { Tenant } from "../platform/tenant";

interface VaultEntry {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  provider: string;
  scopes: string[];
}

const vault = new Map<string, VaultEntry>();

// Auth0 federated-connection access tokens, cached per user+provider.
const liveTokens = new Map<string, { token: string; expiresAt: number }>();

const FEDERATED_TOKEN_TYPE =
  "http://auth0.com/oauth/token-type/federated-connection-access-token";
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";

function vaultKey(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

// Resolve the provisioned connection name for a provider, or null
// when this tenant has no federated connection for it.
function connectionFor(tenant: Tenant | undefined, provider: string): string | null {
  const conns = tenant?.deploymentData.vault_connections;
  if (!conns) return null;
  if (provider === "google") return conns.google || null;
  if (provider === "slack") return conns.slack || null;
  return null;
}

// Exchange the rep's access token for a federated-connection token
// via Auth0 Token Vault. Returns null when the live path is not
// usable (missing config/token) so the caller falls back to sim.
async function getLiveToken(
  userId: string,
  provider: string,
  tenant?: Tenant,
  userAccessToken?: string
): Promise<{ token: string; provider: string } | null> {
  const connection = connectionFor(tenant, provider);
  const dd = tenant?.deploymentData;
  if (!connection || !userAccessToken || !tenant?.domain || !dd?.m2m_client_id) {
    return null;
  }

  const cacheKey = vaultKey(userId, provider);
  const cached = liveTokens.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return { token: cached.token, provider };
  }

  try {
    const response = await fetch(`https://${tenant.domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: TOKEN_EXCHANGE_GRANT,
        subject_token: userAccessToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
        requested_token_type: FEDERATED_TOKEN_TYPE,
        connection,
        client_id: dd.m2m_client_id,
        client_secret: dd.m2m_client_secret,
      }),
    });

    if (!response.ok) {
      console.error(
        `[Token Vault] (live) exchange failed for ${provider}: ${response.status} ${await response.text()}`
      );
      return null;
    }

    const data = await response.json();
    const expiresAt = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
    liveTokens.set(cacheKey, { token: data.access_token, expiresAt });
    console.log(`[Token Vault] (live) federated token for ${userId} @ ${provider}`);
    return { token: data.access_token, provider };
  } catch (err: any) {
    console.error(`[Token Vault] (live) exchange error for ${provider}: ${err.message}`);
    return null;
  }
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
  provider: string,
  tenant?: Tenant,
  userAccessToken?: string
): Promise<{ token: string; provider: string } | null> {
  // Prefer the live federated-connection exchange when provisioned.
  const live = await getLiveToken(userId, provider, tenant, userAccessToken);
  if (live) return live;

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

// Seed federated credentials for a demo user. When the tenant has
// live federated connections provisioned, real tokens are fetched
// on demand via Token Vault, so seeding is a no-op. Otherwise we
// seed the in-memory simulation so the lab runs offline.
export async function seedVaultForUser(
  userId: string,
  tenant?: Tenant,
  userAccessToken?: string
): Promise<void> {
  const hasLive =
    !!connectionFor(tenant, "google") || !!connectionFor(tenant, "slack");
  if (hasLive && userAccessToken) {
    return;
  }

  storeToken(
    userId,
    "google",
    `google_access_${userId}_${Date.now()}`,
    `google_refresh_${userId}`,
    3600,
    [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file",
    ]
  );

  storeToken(
    userId,
    "slack",
    `slack_access_${userId}_${Date.now()}`,
    `slack_refresh_${userId}`,
    3600,
    ["chat:write", "channels:read"]
  );
}
