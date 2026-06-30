// =============================================================
// MCP Server (Auth0-secured) -- Lab 04
//
// The trust boundary. Every tool call Nexus makes
// arrives here as an authenticated HTTP request, never as a raw
// function call. Auth0 secures this server via:
//
//   - JWT validation: tokens must have audience = MCP_AUTH0_AUDIENCE.
//     Tokens issued for the backend API are rejected here -- the
//     OBO exchange in client.js mints a separate MCP-scoped token.
//   - Per-tool scope enforcement: each tool has a requiredScope.
//     A 403 with { error: "Insufficient scope", required: "..." }
//     tells a compliant MCP client exactly which scope to re-request.
//   - RFC 9728 PRM: /.well-known/oauth-protected-resource tells any
//     compliant MCP client which AS issues tokens for this server.
//   - RFC 8414 AS Metadata: /.well-known/oauth-authorization-server
//     advertises the token endpoint, JWKS, and supported grants.
//
// User identity (sub) is preserved across the OBO exchange
// (see server/mcp/client.js). FGA checks and Token Vault lookups
// below key off that sub -- the user, not the agent.
//
// Lab 04 orientation:
//   - validateMCPToken: the per-request JWT verifier. Note how it
//     decodes the token's `iss` to resolve the tenant, not a static
//     env var -- this is what makes it multi-tenant.
//   - TOOLS array: each entry declares a requiredScope. Add a new
//     tool here and the scope check is automatic.
//   - executeToolLogic: where FGA checks (canReadDocument,
//     canShareDocument) and Token Vault calls (getToken) happen.
//     The sub in the MCP token is the user's real identity --
//     that is the key invariant to observe.
// =============================================================

import express from "express";
import { protectedResourceMetadata } from "./metadata.js";
import { getClientMetadata } from "./cimd.js";
import { findAvailablePort } from "../utils/port.js";
import { getJwtValidator, decodeUnverified, bearerFromHeader } from "../platform/jwt.js";
import { tenantResolver } from "../platform/tenantResolver.js";
import {
  canReadDocument,
  canShareDocument,
  getDocument,
  seedTuplesForUser,
  DOCUMENTS,
} from "../fga/client.js";
import { getToken, seedVaultForUser } from "../token-vault/vault.js";
import { addLog } from "./toolLog.js";

const app = express();
app.use(express.json());

// OAuth 2.0 token validation -- validates OBO-issued backend API tokens.
// The MCP server accepts tokens with audience = AUTH0_TOOL_AUDIENCE
// (the backend/tool API), which are minted by docagent-mcp-obo via OBO
// from the user's MCP token. Per-tool scopes on those tokens enforce
// least-privilege at the tool boundary.
const validateMCPToken = (req, res, next) => {
  const token = bearerFromHeader(req);
  const payload = token ? decodeUnverified(token) : null;
  let issuer = `https://${process.env.AUTH0_DOMAIN}`;
  let audience = process.env.AUTH0_TOOL_AUDIENCE || "";

  if (payload?.iss) {
    try {
      const tenant = tenantResolver.getByDomain(new URL(payload.iss).host);
      if (tenant) {
        issuer = tenant.issuer;
        // Use deploymentData.backend_audience directly — backendAudience getter
        // falls back to AUTH0_AUDIENCE which now points to the MCP server, not the tool API.
        audience = process.env.AUTH0_TOOL_AUDIENCE || audience;
        req.tenant = tenant;
      }
    } catch {
      /* fall back to env */
    }
  }
  return getJwtValidator(issuer, audience)(req, res, next);
};

// RFC 9728: Protected Resource Metadata
app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);

// CIMD: the URL of this endpoint IS the agent's client_id.
// Participants register the Nexus agent in Auth0 by providing this
// URL; Auth0 creates the application with the URL as client_id.
app.get("/.well-known/client-metadata", (req, res) => {
  res.json(getClientMetadata(req));
});

// OAuth 2.0 Authorization Server Metadata
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    authorization_endpoint: `https://${process.env.AUTH0_DOMAIN}/authorize`,
    token_endpoint: `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    jwks_uri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    // Per-tool scopes live on the backend/tool API (AUTH0_TOOL_AUDIENCE).
    // OBO exchanges the user's MCP token for a backend API token carrying
    // one of these scopes, which the MCP server then enforces per tool call.
    scopes_supported: [
      "mcp:docs:search",
      "mcp:docs:read",
      "mcp:crm:log",
      "mcp:docs:share",
    ],
    grant_types_supported: [
      "urn:ietf:params:oauth:grant-type:token-exchange",
    ],
    client_registration_types_supported: ["metadata"],
  });
});

// ---- Tool catalog -------------------------------------------------

export const TOOLS = [
  {
    name: "search_documents",
    description:
      "Search the company knowledge base. Returns documents the authenticated user is authorized to read (FGA-gated). Confidential documents are never returned for unauthorized users.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — keywords, topic, or document title" },
      },
      required: ["query"],
    },
    requiredScope: "mcp:docs:search",
  },
  {
    name: "get_document",
    description:
      "Retrieve the full content of a specific document by ID. FGA-gated: returns an error if the user does not have read access.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID, e.g. q3-roadmap" },
      },
      required: ["documentId"],
    },
    requiredScope: "mcp:docs:read",
  },
  {
    name: "log_crm_activity",
    description:
      "Log a document activity event to the connected CRM. Uses Token Vault to mint a short-lived CRM credential scoped to this user — the activity record shows the user, not a shared service account.",
    inputSchema: {
      type: "object",
      properties: {
        action:        { type: "string", description: "Activity type: viewed, shared, updated, or exported" },
        documentId:    { type: "string", description: "ID of the document the activity applies to" },
        documentTitle: { type: "string", description: "Human-readable document title" },
        notes:         { type: "string", description: "Optional notes about the activity" },
      },
      required: ["action", "documentId"],
    },
    requiredScope: "mcp:crm:log",
  },
  {
    name: "share_document",
    description:
      "Share a document with an external recipient. Requires CIBA approval on the user's device before executing — external sharing is irreversible and subject to data policy.",
    inputSchema: {
      type: "object",
      properties: {
        documentId:     { type: "string", description: "Document ID to share" },
        documentTitle:  { type: "string", description: "Human-readable title (for the approval prompt)" },
        recipientEmail: { type: "string", description: "External email address to share with" },
      },
      required: ["documentId", "recipientEmail"],
    },
    requiredScope: "mcp:docs:share",
  },
];

// List available tools (MCP tools/list)
app.get("/mcp/tools", validateMCPToken, (_req, res) => {
  console.log("[MCP Server] Tools list requested");
  res.json({ tools: TOOLS });
});

// Execute a tool (MCP tools/call) -- protected + scope enforcement
app.post("/mcp/tools/call", validateMCPToken, async (req, res) => {
  const { name, arguments: args } = req.body;
  const payload = req.auth?.payload || {};
  const userSub = payload.sub;
  const userEmail = payload.email;
  const tokenScopes = (payload.scope || "").split(" ").filter(Boolean);
  const tenant = req.tenant;
  const userAccessToken = bearerFromHeader(req) || undefined;
  // The OBO token above authenticates this MCP call but carries an `act`
  // claim chain that Token Vault rejects. The original user token (aud:
  // MCP server, no `act`) is what Token Vault needs as subject_token.
  const originalUserToken = req.headers["x-user-token"] || userAccessToken;

  console.log(
    `[MCP Server] Tool call: ${name}, sub=${userSub}, scopes=${tokenScopes.join(",")}`
  );
  console.log(`[MCP Server] Full token payload:`, JSON.stringify(payload));

  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return res.status(404).json({ error: `Unknown tool: ${name}` });
  }

  // Lab 04 -- per-tool scope enforcement.
  // A 403 here means the OBO token was not issued with the scope
  // needed for this tool. A compliant MCP client treats this as
  // a step-up signal and re-requests the missing scope.
  if (!tokenScopes.includes(tool.requiredScope)) {
    console.log(
      `[MCP Server] DENIED -- required=${tool.requiredScope}, have=${tokenScopes.join(",")}`
    );
    return res.status(403).json({
      error: "Insufficient scope",
      required: tool.requiredScope,
      provided: tokenScopes,
    });
  }

  try {
    // Seed demo FGA tuples + vault entries on first call per user.
    await seedTuplesForUser(userSub, userEmail, tenant);
    await seedVaultForUser(userSub, tenant, originalUserToken);

    const result = await executeToolLogic(name, args, userSub, tenant, originalUserToken);
    console.log(`[MCP Server] Tool ${name} executed`);
    addLog({ tool: name, userSub, args, result, status: "success" });
    res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (err) {
    console.error(`[MCP Server] Tool ${name} failed: ${err.message}`);
    addLog({ tool: name, userSub, args, result: { error: err.message }, status: "error" });
    res.status(500).json({ error: err.message });
  }
});

// Lab 04 -- tool execution. userSub here is the user's Auth0 user id
// preserved through the OBO exchange. Every FGA check and Token Vault
// call below keys off the user, not the agent client.
async function executeToolLogic(name, args, userSub, tenant, userAccessToken) {
  switch (name) {
    case "search_documents": {
      const { query } = args;
      const lower = query.toLowerCase();
      // Filter corpus by keyword match, then FGA-filter by user access.
      // The FGA filter is the security layer: the agent only sees what
      // the user is authorized to read, regardless of the query.
      const matches = DOCUMENTS.filter(
        (doc) =>
          doc.title.toLowerCase().includes(lower) ||
          doc.snippet.toLowerCase().includes(lower) ||
          doc.department.toLowerCase().includes(lower) ||
          doc.id.toLowerCase().includes(lower)
      );
      const accessible = [];
      for (const doc of matches) {
        if (await canReadDocument(userSub, doc.id, tenant)) {
          accessible.push({ id: doc.id, title: doc.title, department: doc.department, classification: doc.classification, snippet: doc.snippet });
        }
      }
      return { success: true, query, results: accessible, total: accessible.length };
    }

    case "get_document": {
      const { documentId } = args;
      // Lab 02 (FGA demo) -- canReadDocument checks the real Okta FGA
      // store when provisioned, or the in-memory tuples offline.
      if (!(await canReadDocument(userSub, documentId, tenant))) {
        return {
          success: false,
          error: `Access denied: you do not have read access to document:${documentId}.`,
        };
      }
      const doc = getDocument(documentId);
      if (!doc) return { success: false, error: `Document ${documentId} not found.` };
      return { success: true, document: doc };
    }

    case "log_crm_activity": {
      const { action, documentId, documentTitle, notes } = args;
      // Lab 03 (Token Vault) -- getToken exchanges for a short-lived
      // CRM credential scoped to this user. No shared bot token.
      const tokenResult = await getToken(userSub, "crm", tenant, userAccessToken);
      if (!tokenResult) {
        return {
          success: false,
          error: "No CRM account linked. Ask the user to connect their CRM.",
        };
      }
      const apiBase = process.env.CRM_API_URL ||
        `http://localhost:${process.env.CRM_PORT || 3002}`;
      const response = await fetch(`${apiBase}/crm/activities`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, documentId, documentTitle, notes, userId: userSub }),
      });
      if (!response.ok) {
        return { success: false, error: `CRM API error: ${response.statusText}` };
      }
      const data = await response.json();
      return { success: true, ...data };
    }

    case "share_document": {
      const { documentId, documentTitle, recipientEmail } = args;
      // Lab 02 (FGA demo) -- canShareDocument checks editor/owner relation.
      // A viewer cannot share; only the owner or an editor can.
      if (!(await canShareDocument(userSub, documentId, tenant))) {
        return {
          success: false,
          error: `Access denied: you do not have share permissions for document:${documentId}.`,
        };
      }
      // CIBA approval already confirmed upstream (simulator.js / llm.js)
      // before this tool is invoked. The MCP server records the share.
      console.log(`[MCP Server] Share approved: ${documentId} -> ${recipientEmail}`);
      return {
        success: true,
        shared: {
          documentId,
          documentTitle: documentTitle || documentId,
          recipientEmail,
          sharedAt: new Date().toISOString(),
          sharedBy: userSub,
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// express-oauth2-jwt-bearer sets err.status = 401 on auth failures.
// Without this handler Express would fall back to a 500, breaking the
// Module 01 check that expects a clean 401 from /mcp/tools.
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

export async function startMCPServer() {
  const preferredPort = parseInt(process.env.MCP_SERVER_PORT || "3001");
  const port = await findAvailablePort(preferredPort, "MCP Server");
  app.listen(port, () => {
    console.log(`[MCP Server] Running on http://localhost:${port}`);
    console.log(`[MCP Server] PRM: http://localhost:${port}/.well-known/oauth-protected-resource`);
    console.log(`[MCP Server] OAuth: http://localhost:${port}/.well-known/oauth-authorization-server`);
  });
}

export default app;
