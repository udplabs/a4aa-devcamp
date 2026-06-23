// =============================================================
// Token Vault -- Lab 03
//
// Per-user federated credentials for the CRM. The MCP server calls
// getToken(userId, provider) right before hitting the CRM API so
// upstream credentials never sit in agent memory or appear
// in LLM prompts.
//
// Why Token Vault matters:
//   - No shared bot token: every API call carries the rep's own
//     credential, so audit logs identify the human, not "the bot".
//   - No long-lived secrets in the agent: the MCP server exchanges
//     the rep's Auth0 access token for a short-lived federated
//     token on each call. Revoke the connection, the agent loses
//     access immediately.
//   - Automatic refresh: Auth0 handles token refresh -- the agent
//     never sees the refresh token.
//
// Paths:
//   - LIVE: the tenant has provisioned federated connections
//     (deploymentData.vault_connections[provider]). The M2M client
//     exchanges the rep's bearer token with Auth0 Token Vault to
//     get a short-lived federated-connection access token.
//   - SIMULATED: in-memory Map mints fake tokens so the lab runs
//     offline without real Google / Slack OAuth apps.
//
// Lab 03 orientation:
//   - getToken(userId, provider): call this in MCP tool handlers
//     before hitting Google / Slack. It picks live vs. simulated
//     automatically based on the tenant config.
//   - seedVaultForUser(): called by the MCP server on first tool
//     invocation. No-op when live connections are provisioned.
//   - storeToken / removeToken / listLinkedProviders: back the
//     /api/vault/* REST endpoints for the link/unlink UI.
// =============================================================

const vault = new Map();

// Auth0 federated-connection access tokens, cached per user+provider.
const liveTokens = new Map();

const FEDERATED_TOKEN_TYPE =
  "http://auth0.com/oauth/token-type/federated-connection-access-token";
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";

function vaultKey(userId, provider) {
  return `${userId}:${provider}`;
}

// Resolve the provisioned connection name for a provider, or null
// when this tenant has no federated connection for it.
function connectionFor(tenant, provider) {
  const conns = tenant?.deploymentData.vault_connections;
  if (!conns) return null;
  if (provider === "crm") return conns.crm || null;
  return null;
}

// Exchange the rep's access token for a federated-connection token
// via Auth0 Token Vault. Returns null when the live path is not
// usable (missing config/token) so the caller falls back to sim.
async function getLiveToken(userId, provider, tenant, userAccessToken) {
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
  } catch (err) {
    console.error(`[Token Vault] (live) exchange error for ${provider}: ${err.message}`);
    return null;
  }
}

export function storeToken(userId, provider, accessToken, refreshToken, expiresIn, scopes) {
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

export async function getToken(userId, provider, tenant, userAccessToken) {
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

export function removeToken(userId, provider) {
  const key = vaultKey(userId, provider);
  const existed = vault.has(key);
  vault.delete(key);
  if (existed) {
    console.log(`[Token Vault] Removed token for ${userId} @ ${provider}`);
  }
  return existed;
}

export function listLinkedProviders(userId) {
  const results = [];

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
export async function seedVaultForUser(userId, tenant, userAccessToken) {
  const hasLive = !!connectionFor(tenant, "crm");
  if (hasLive && userAccessToken) {
    return;
  }

  storeToken(
    userId,
    "crm",
    `crm_access_${userId}_${Date.now()}`,
    `crm_refresh_${userId}`,
    3600,
    ["crm:activities:write"]
  );
}
