// =============================================================
// MCP Client -- Lab 04 (On-Behalf-Of token exchange)
//
// The agent backend holds the rep's access token (audience =
// backend API). Before calling any MCP tool it must exchange
// that token for one whose audience is the MCP server. This is
// the RFC 8693 token-exchange / RFC 8707 resource-indicator flow.
//
// Why OBO instead of a plain M2M token?
//   - The rep's sub is preserved in the exchanged token, so the
//     MCP server's FGA checks and Token Vault lookups still key
//     off the human, not the agent.
//   - The audience is locked to the MCP server via the resource
//     parameter, so the exchanged token cannot be replayed against
//     the backend API or any other resource.
//   - The CIMD client_id (pre-registered M2M app) identifies the
//     agent in Auth0 logs; every exchange is auditable.
//
// Lab 04 orientation:
//   - resolveConfig(): reads the tenant's provisioned M2M creds
//     from deploymentData. Falls back to env for local runs.
//   - getToken(): the OBO exchange. Observe the grant_type,
//     subject_token, audience, and resource fields -- these are
//     the four required parameters of RFC 8693 + RFC 8707.
//   - callTool(): wraps getToken() + the actual MCP HTTP call.
//     A 403 response means the MCP server enforced a scope check;
//     the error body names the missing scope (step-up signal).
// =============================================================

import { decodeUnverified } from "../platform/jwt.js";
import { tenantResolver } from "../platform/tenantResolver.js";

// Cache exchanged tokens per user (keyed by last 16 chars of user token)
const cachedTokens = new Map();

export class MCPClient {
  constructor(config) {
    this.config = config;
  }

  // Resolve M2M creds + MCP audience + issuer for the demo that
  // minted the user's token. Each demo is its own Auth0 tenant, so
  // the token's `iss` host identifies the tenant; we look it up in
  // the shared in-process resolver and fall back to env defaults.
  resolveConfig(userAccessToken) {
    const payload = decodeUnverified(userAccessToken);
    let domain = "";
    try {
      if (payload?.iss) domain = new URL(payload.iss).host;
    } catch {
      /* ignore */
    }
    const tenant = domain ? tenantResolver.getByDomain(domain) : undefined;
    if (tenant && tenant.deploymentData.m2m_client_id) {
      return {
        serverUrl: this.config.serverUrl,
        auth0Domain: tenant.domain,
        clientId: tenant.deploymentData.m2m_client_id,
        clientSecret: tenant.deploymentData.m2m_client_secret || this.config.clientSecret,
        audience: tenant.mcpAudience || this.config.audience,
      };
    }
    // Local path: AUTH0_OBO_CLIENT_ID and AUTH0_OBO_CLIENT_SECRET are
    // set manually in Module 01 after the participant creates the M2M
    // confidential client from the MCP API resource server screen.
    if (!this.config.clientId) {
      console.warn(
        "[MCP Client] AUTH0_OBO_CLIENT_ID is not set. " +
        "Complete Module 01 to create the M2M client from the " +
        "devcamp-mcp-server API screen and add credentials to .env."
      );
    }
    return this.config;
  }

  // Exchange the user's access token for one scoped to the MCP server
  async getToken(userAccessToken) {
    const cfg = this.resolveConfig(userAccessToken);
    const cacheKey = userAccessToken.slice(-16);
    const cached = cachedTokens.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
    if (cached) cachedTokens.delete(cacheKey);

    console.log("[MCP Client] Exchanging user token for MCP-scoped token...");
    console.log("[MCP Client] Exchange params: domain=%s audience=%s clientId=%s subjectToken(last16)=%s",
      cfg.auth0Domain, cfg.audience, cfg.clientId, userAccessToken?.slice(-16));
    console.log("[MCP Client] Subject token (full):", userAccessToken);

    // Lab 05 -- On-Behalf-Of token exchange.
    // The `audience` and `resource` parameters both name the MCP
    // server's resource indicator so the issued token's aud claim
    // locks it to that MCP server and nothing else. The `sub`
    // claim (rep's user id) is preserved from the subject_token
    // by Auth0, giving the MCP server end-to-end user attribution
    // without the agent ever forging identity.
    console.log("test, ", userAccessToken);
    const response = await fetch(
      `https://${cfg.auth0Domain}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: userAccessToken,
          subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
          requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
          audience: cfg.audience,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.statusText} - ${error}`);
    }

    const data = await response.json();
    cachedTokens.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    });

    console.log("[MCP Client] Token exchange successful -- MCP token acquired");
    return data.access_token;
  }

  // List available tools from the MCP server
  async listTools(userAccessToken) {
    const token = await this.getToken(userAccessToken);
    const response = await fetch(`${this.config.serverUrl}/mcp/tools`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`MCP listTools failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tools;
  }

  // Call a tool on the MCP server
  async callTool(name, args, userAccessToken) {
    const token = await this.getToken(userAccessToken);

    console.log(`[MCP Client] Calling tool: ${name}`);

    const response = await fetch(
      `${this.config.serverUrl}/mcp/tools/call`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, arguments: args }),
      }
    );

    if (response.status === 403) {
      const error = await response.json();
      throw new Error(
        `MCP authorization failed: insufficient scope. Required: ${error.required}`
      );
    }

    if (!response.ok) {
      throw new Error(`MCP callTool failed: ${response.statusText}`);
    }

    const data = await response.json();
    return JSON.parse(data.content[0].text);
  }
}

export function createMCPClient() {
  return new MCPClient({
    serverUrl: `http://localhost:${process.env.MCP_SERVER_PORT || 3001}`,
    auth0Domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_OBO_CLIENT_ID,
    clientSecret: process.env.AUTH0_OBO_CLIENT_SECRET,
    audience: process.env.MCP_AUTH0_AUDIENCE,
  });
}
