// =============================================================
// MCP Client -- Module 02 (On-Behalf-Of token exchange)
//
// The Nexus agent's backend holds the employee's access token for
// the Nexus Agent API (the audience the SPA logs in for). Before it
// can call any MCP tool it exchanges that token for one whose
// audience is the Nexus MCP Server -- the RFC 8693 On-Behalf-Of
// token exchange.
//
// Why OBO instead of a plain client-credentials token?
//   - The employee's `sub` is preserved in the exchanged token, so the
//     MCP server's FGA checks and Token Vault lookups still key off
//     the human, not the agent.
//   - The `audience` locks the new token to the MCP server, so it
//     can't be replayed against the Nexus Agent API or anything else.
//   - The exchanging client (nexus-agent-obo) is a Custom API client
//     linked to the Nexus Agent API and to the "Nexus Agent (DevCamp)"
//     Agent record, so the issued token carries
//       act.sub     = agt_...            (the agent)
//       act.act.sub = the SPA's client   (where the request started)
//     and every exchange is attributable to the agent in Auth0 logs.
//
// Note: OBO takes Auth0's `audience` parameter. The RFC 8707
// `resource` parameter belongs to authorization-code flows -- see
// the third-party Acme agent in ../acme/app.js.
//
// Module 02 orientation:
//   - resolveConfig(): the OBO client's credentials + target audience.
//   - getToken(): the OBO exchange, requesting only the scope the tool
//     being called needs (least privilege per call).
//   - callTool(): getToken() + the MCP HTTP call. A 403 carries a
//     WWW-Authenticate insufficient_scope challenge naming the scope.
// =============================================================

import { createHash } from "crypto";
import { decodeUnverified } from "../platform/jwt.js";
import { tenantResolver } from "../platform/tenantResolver.js";
import { TOOLS } from "./server.js";

// Exchanged tokens, keyed by (hash of the full subject token, scope).
const cachedTokens = new Map();

function cacheKeyFor(userAccessToken, scope) {
  return `${createHash("sha256").update(userAccessToken).digest("hex")}:${scope}`;
}

function scopeForTool(name) {
  return TOOLS.find((t) => t.name === name)?.requiredScope;
}

export class MCPClient {
  constructor(config) {
    this.config = config;
  }

  // Resolve the OBO client creds + MCP server audience for the tenant
  // that minted the user's token (looked up by the token's `iss`), with
  // env defaults for local single-tenant runs.
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
        audience: tenant.mcpResource || this.config.audience,
      };
    }
    // Env fallback: re-read env vars at call time so hot-reloaded values
    // are picked up without restarting the server.
    if (!this.config.clientId && !process.env.AUTH0_OBO_CLIENT_ID) {
      console.warn(
        "[MCP Client] AUTH0_OBO_CLIENT_ID is not set. " +
        "Complete Module 02: create nexus-agent-obo from the Nexus Agent API " +
        "screen (APIs → Nexus Agent API → Add Application) and add its credentials to .env."
      );
    }
    return {
      ...this.config,
      auth0Domain: process.env.AUTH0_DOMAIN || this.config.auth0Domain,
      audience: process.env.AUTH0_TOOL_AUDIENCE || this.config.audience,
      clientId: process.env.AUTH0_OBO_CLIENT_ID || this.config.clientId,
      clientSecret: process.env.AUTH0_OBO_CLIENT_SECRET || this.config.clientSecret,
    };
  }

  // Exchange the user's Nexus Agent API token for an MCP server token
  // carrying `scope`.
  async getToken(userAccessToken, scope) {
    const cfg = this.resolveConfig(userAccessToken);
    const cacheKey = cacheKeyFor(userAccessToken, scope);
    const cached = cachedTokens.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
    if (cached) cachedTokens.delete(cacheKey);

    console.log(`[MCP Client] OBO exchange: clientId=${cfg.clientId} audience=${cfg.audience} scope=${scope}`);

    // On-Behalf-Of token exchange (RFC 8693). Auth0 validates the
    // subject_token against the API nexus-agent-obo is linked to (the
    // Nexus Agent API), keeps the user as `sub`, and adds the agent as
    // the outermost `act`.
    const response = await fetch(`https://${cfg.auth0Domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: userAccessToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        audience: cfg.audience,
        scope,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.statusText} - ${error}`);
    }

    const data = await response.json();
    // Cap the cache TTL well under the token's actual lifetime. The lab's
    // negative-test steps (e.g. "Missing scope") change a client's grant
    // live in the Dashboard and expect the *next* tool call to reflect it.
    const cacheTtlMs = Math.max(Math.min(data.expires_in - 60, 300), 0) * 1000;
    cachedTokens.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + cacheTtlMs,
    });

    console.log("[MCP Client] Token exchange successful -- MCP token acquired");
    return data.access_token;
  }

  // List available tools from the MCP server
  async listTools(userAccessToken) {
    const token = await this.getToken(userAccessToken, "mcp:docs:search");
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
    const scope = scopeForTool(name);
    if (!scope) throw new Error(`Unknown tool: ${name}`);
    const token = await this.getToken(userAccessToken, scope);

    console.log(`[MCP Client] Calling tool: ${name}`);

    const response = await fetch(`${this.config.serverUrl}/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, arguments: args }),
    });

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
    // OBO target: the Nexus MCP Server's resource identifier.
    audience: process.env.AUTH0_TOOL_AUDIENCE,
  });
}
