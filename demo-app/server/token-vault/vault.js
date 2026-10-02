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
//     (deploymentData.vault_connections[provider]). The access token
//     exchange with Token Vault is performed by the Custom API client
//     linked to the API in the subject token's `aud` -- Auth0 rejects
//     the exchange from any other client:
//       aud = Nexus MCP Server -> the MCP server's own client
//                                (MCP_SERVER_CLIENT_ID, provisioned)
//       aud = Nexus Agent API  -> docagent-mcp-obo (AUTH0_OBO_CLIENT_ID)
//     So a tool call from ANY agent -- Nexus via OBO, or Acme via its
//     own login -- is exchanged by the MCP server with the token it
//     validated, and the MCP server never needs a token it didn't
//     receive as its bearer.
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

import { decodeUnverified } from "../platform/jwt.js";

// Thrown when Auth0 explicitly rejects the federated-connection token
// exchange (e.g. the connection is set to "Authentication only" and
// isn't enabled for API access). Distinct from "live path not usable
// in this environment" (missing config/localhost), which should fall
// back to simulation instead of denying.
export class TokenVaultAccessDeniedError extends Error {}

const vault = new Map();

// Auth0 federated-connection access tokens, cached per user+provider.
const liveTokens = new Map();

const FEDERATED_TOKEN_TYPE =
  "http://auth0.com/oauth/token-type/federated-connection-access-token";
// Auth0-specific grant type for federated-connection token exchange (Token Vault).
// Distinct from the RFC 8693 OBO grant used for MCP token exchange.
const TOKEN_EXCHANGE_GRANT =
  "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token";

function vaultKey(userId, provider) {
  return `${userId}:${provider}`;
}

// Resolve the provisioned connection name for a provider, or null
// when this tenant has no federated connection for it.
function audiences(token) {
  const aud = decodeUnverified(token)?.aud;
  return (Array.isArray(aud) ? aud : [aud]).filter(Boolean).map((a) => a.replace(/\/$/, ""));
}

// Pick the Custom API client that is allowed to exchange this token.
function exchangerFor(tenant, subjectToken) {
  const dd = tenant?.deploymentData || {};
  const auds = audiences(subjectToken);
  const mcpResource = (tenant?.mcpResource || process.env.AUTH0_TOOL_AUDIENCE || "").replace(/\/$/, "");
  const agentApi = (tenant?.agentAudience || process.env.AUTH0_AUDIENCE || "").replace(/\/$/, "");
  if (mcpResource && auds.includes(mcpResource)) {
    const clientId = dd.mcp_server_client_id || process.env.MCP_SERVER_CLIENT_ID;
    const clientSecret = dd.mcp_server_client_secret || process.env.MCP_SERVER_CLIENT_SECRET;
    return clientId ? { clientId, clientSecret, label: "nexus-mcp-server" } : null;
  }
  if (agentApi && auds.includes(agentApi)) {
    const clientId = dd.m2m_client_id || process.env.AUTH0_OBO_CLIENT_ID;
    const clientSecret = dd.m2m_client_secret || process.env.AUTH0_OBO_CLIENT_SECRET;
    return clientId ? { clientId, clientSecret, label: "docagent-mcp-obo" } : null;
  }
  return null;
}

// Callers pass either a raw Auth0 access token, or (from the MCP server)
// { token, fallbackToken } -- the validated bearer plus, optionally, a
// first-party subject token the MCP server has already verified.
function normalizeSubject(subject) {
  if (!subject) return { token: null, fallbackToken: null };
  if (typeof subject === "string") return { token: subject, fallbackToken: null };
  return { token: subject.token || null, fallbackToken: subject.fallbackToken || null };
}

function connectionFor(tenant, provider) {
  const conns = tenant?.deploymentData.vault_connections;
  if (!conns) return null;
  return conns[provider] || null;
}

// Exchange the rep's access token for a federated-connection token
// via Auth0 Token Vault. Returns null when the live path is not
// usable (missing config/token) so the caller falls back to sim.
async function getLiveToken(userId, provider, tenant, userAccessToken) {
  const connection = connectionFor(tenant, provider);
  const exchanger = userAccessToken ? exchangerFor(tenant, userAccessToken) : null;
  if (!connection || !userAccessToken || !tenant?.domain || !exchanger) {
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
        client_id: exchanger.clientId,
        client_secret: exchanger.clientSecret,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[Token Vault] (live) exchange failed for ${provider}: ${response.status} ${body}`);
      // Auth0 rejects this exchange when the connection isn't enabled for
      // API access (e.g. set to "Authentication only"). That's a real
      // deny, not a "live path unavailable" signal -- don't swallow it
      // into a fallback that would silently succeed via simulation.
      throw new TokenVaultAccessDeniedError(
        `Federated token exchange denied for ${provider}: ${response.status} ${body}`
      );
    }

    const data = await response.json();
    const expiresAt = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
    liveTokens.set(cacheKey, { token: data.access_token, expiresAt });
    console.log(`[Token Vault] (live) federated token for ${userId} @ ${provider} (exchanged by ${exchanger.label})`);
    return { token: data.access_token, provider };
  } catch (err) {
    if (err instanceof TokenVaultAccessDeniedError) throw err;
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

export async function getToken(userId, provider, tenant, subject) {
  const { token, fallbackToken } = normalizeSubject(subject);
  // Prefer the live federated-connection exchange when provisioned.
  let live;
  try {
    live = await getLiveToken(userId, provider, tenant, token);
  } catch (err) {
    // Auth0 may refuse a subject token that already carries an `act`
    // delegation chain (both agents' tokens do, once linked to an Agent
    // record). If the MCP server verified a first-party fallback token
    // (see validatedNexusSubjectToken in mcp/server.js), retry with it.
    if (!(err instanceof TokenVaultAccessDeniedError) || !fallbackToken) throw err;
    console.warn(`[Token Vault] bearer exchange refused for ${provider}; retrying with verified first-party subject token`);
    live = await getLiveToken(userId, provider, tenant, fallbackToken);
  }
  // No client able to exchange the bearer (e.g. MCP_SERVER_CLIENT_ID unset
  // on a tenant provisioned before this client existed).
  if (!live && fallbackToken) {
    live = await getLiveToken(userId, provider, tenant, fallbackToken);
  }
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
export async function seedVaultForUser(userId, tenant, subject) {
  const userAccessToken = normalizeSubject(subject).token;
  const hasLiveCrm = !!connectionFor(tenant, "crm");
  if (!(hasLiveCrm && userAccessToken)) {
    storeToken(
      userId,
      "crm",
      `crm_access_${userId}_${Date.now()}`,
      `crm_refresh_${userId}`,
      3600,
      ["crm:activities:write"]
    );
  }
}
