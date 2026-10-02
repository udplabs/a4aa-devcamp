// =============================================================
// MCP Server (Auth0-secured) -- Modules 02 and 03
//
// The trust boundary. Every agent that calls a tool -- the
// first-party Nexus agent and the third-party Acme agent alike --
// arrives here as an HTTP request carrying an Auth0 access token,
// and gets exactly the same treatment:
//
//   - Discovery (RFC 9728): /.well-known/oauth-protected-resource
//     names this server's resource identifier and its authorization
//     server (Auth0). A 401 carries
//       WWW-Authenticate: Bearer resource_metadata="..."
//     so a client that only knows the URL can find its way to Auth0.
//   - Audience (RFC 8707): the token's `aud` must equal this server's
//     resource identifier (AUTH0_TOOL_AUDIENCE). Tokens for any other
//     API are rejected -- this server never accepts or passes through
//     tokens issued for someone else.
//   - Per-tool scope: each tool declares a requiredScope. A missing
//     scope returns 403 with
//       WWW-Authenticate: Bearer error="insufficient_scope", scope="..."
//     which tells the client exactly what to step up to.
//   - Identity: `sub` is always the employee. `act.sub` names the agent
//     acting for them (Agent as Principal) -- nested for Nexus's OBO
//     exchange, single-level for Acme's direct login -- and `client_id`
//     names the OAuth client (for Acme, its CIMD URL).
//
// FGA checks and Token Vault lookups below key off `sub` -- the user,
// not the agent. Token Vault exchanges use this server's OWN Custom
// API client (see ../token-vault/vault.js), never the caller's.
// =============================================================

import express from "express";
import {
  protectedResourceMetadata,
  resourceMetadataUrl,
  mcpResource,
} from "./metadata.js";
import { findAvailablePort } from "../utils/port.js";
import { getJwtValidator, decodeUnverified, bearerFromHeader, verifyJwt } from "../platform/jwt.js";
import { tenantResolver } from "../platform/tenantResolver.js";
import {
  canReadDocument,
  canShareDocument,
  getDocument,
  seedTuplesForUser,
  DOCUMENTS,
} from "../fga/client.js";
import { getToken, seedVaultForUser, TokenVaultAccessDeniedError } from "../token-vault/vault.js";
import { addLog } from "./toolLog.js";
import { wrongPortFallback } from "../utils/wrongPortPage.js";

const app = express();
app.use(express.json());

// search_documents matches on individual words from the query rather
// than the whole phrase; these common words are filtered out so they
// don't dilute the match (e.g. "we", "have" would otherwise count as
// "significant" terms just by being longer than 2 characters).
const SEARCH_STOPWORDS = new Set([
  "the", "a", "an", "on", "in", "of", "for", "we", "have", "everything",
  "about", "our", "find", "show", "me", "get", "and", "to", "with",
]);

// OAuth 2.1 resource-server token validation. Signature, issuer, expiry,
// and -- the MCP-specific part -- audience = this server's resource
// identifier. The issuer is looked up from the (unverified) `iss` only to
// pick which known tenant's keys to verify against; an unknown issuer
// falls back to the env tenant and fails signature verification.
const validateMCPToken = (req, res, next) => {
  const token = bearerFromHeader(req);
  const payload = token ? decodeUnverified(token) : null;
  let issuer = `https://${process.env.AUTH0_DOMAIN}/`;
  let audience = mcpResource();

  if (payload?.iss) {
    try {
      const tenant = tenantResolver.getByDomain(new URL(payload.iss).host);
      if (tenant) {
        issuer = tenant.issuer;
        audience = (tenant.mcpResource || audience).replace(/\/$/, "");
        req.tenant = tenant;
      }
    } catch {
      /* fall back to env */
    }
  }
  return getJwtValidator(issuer, audience)(req, res, next);
};

// RFC 9728: Protected Resource Metadata. Served at the root well-known
// path because the resource identifier is this server's origin. There is
// deliberately no /.well-known/oauth-authorization-server here: the
// authorization server (Auth0) publishes its own metadata.
app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);

// Who is calling? `sub` is the user; `act` (Agent as Principal) is the
// delegation chain, outermost actor first; client_id/azp is the OAuth
// client (for a CIMD client, its CIMD URL).
function describeCaller(payload) {
  const chain = [];
  for (let a = payload.act; a; a = a.act) {
    chain.push({ sub: a.sub, client_id: a.client_id, sub_profile: a.sub_profile });
  }
  const outer = chain[0];
  return {
    sub: payload.sub,
    client_id: payload.client_id || payload.azp,
    client_profile: payload.client_profile,
    agent: outer && (outer.sub_profile === "ai_agent" || String(outer.sub || "").startsWith("agt_"))
      ? outer.sub
      : null,
    act_chain: chain,
  };
}

// First-party fallback for Token Vault (see ../token-vault/vault.js).
// Only used if Auth0 refuses to exchange the bearer itself. The Nexus
// backend may attach the user's original Nexus Agent API token in
// X-Nexus-Subject-Token. It is NOT trusted on presentation: it must
// verify against the tenant's keys with aud = Nexus Agent API, belong
// to the same user as the bearer, and have been issued to a client that
// appears in the bearer's own `act` delegation chain -- i.e. it is
// provably the token the bearer was exchanged from.
async function validatedNexusSubjectToken(req, bearerPayload) {
  if (process.env.TOKEN_VAULT_FIRST_PARTY_FALLBACK === "false") return null;
  const raw = req.headers["x-nexus-subject-token"];
  if (typeof raw !== "string" || !raw) return null;
  const tenant = req.tenant;
  const issuer = tenant?.issuer || `https://${process.env.AUTH0_DOMAIN}/`;
  const agentAudience = tenant?.agentAudience || process.env.AUTH0_AUDIENCE;
  try {
    const inner = await verifyJwt(raw, issuer, agentAudience);
    if (inner.sub !== bearerPayload.sub) return null;
    const innerClient = inner.client_id || inner.azp;
    const chainClients = [];
    for (let a = bearerPayload.act; a; a = a.act) chainClients.push(a.client_id, a.sub);
    if (!innerClient || !chainClients.includes(innerClient)) return null;
    return raw;
  } catch {
    return null;
  }
}

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
  {
    name: "check_github_identity",
    description:
      "Verify the connected GitHub account by calling the GitHub API as the user. Uses Token Vault to mint a short-lived GitHub credential scoped to this user — proves the per-user federated token works, same pattern as log_crm_activity but against a built-in social connection instead of a custom OAuth2 one.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    requiredScope: "mcp:github:read",
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
  // The only token this server uses is the one it just validated.
  const bearerToken = bearerFromHeader(req);
  const caller = describeCaller(payload);

  console.log(
    `[MCP Server] Tool call: ${name}, sub=${userSub}, client_id=${caller.client_id}, scopes=${tokenScopes.join(",")}`
  );
  console.log(`[MCP Server] Full token payload:`, JSON.stringify(payload));
  if (payload.act?.sub) {
    console.log(`[MCP Server] Acting agent (act.sub): ${payload.act.sub} (delegation depth ${caller.act_chain.length})`);
  } else {
    console.log("[MCP Server] No act claim -- client is not linked to an Agent record");
  }

  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return res.status(404).json({ error: `Unknown tool: ${name}` });
  }

  // Per-tool scope enforcement (MCP "Scope Challenge Handling").
  // A 403 here means the token was not issued with the scope this tool
  // needs -- for Nexus, the OBO grant lacks it; for Acme, the admin's
  // reviewed grant doesn't include it. The WWW-Authenticate challenge
  // tells a compliant MCP client exactly which scope to step up to.
  if (!tokenScopes.includes(tool.requiredScope)) {
    console.log(
      `[MCP Server] DENIED -- required=${tool.requiredScope}, have=${tokenScopes.join(",")}`
    );
    addLog({ tool: name, userSub, caller, args, result: { error: "insufficient_scope", required: tool.requiredScope }, status: "denied" });
    res.set(
      "WWW-Authenticate",
      `Bearer error="insufficient_scope", scope="${tool.requiredScope}", resource_metadata="${resourceMetadataUrl(req)}", error_description="This tool requires ${tool.requiredScope}"`
    );
    return res.status(403).json({
      error: "Insufficient scope",
      required: tool.requiredScope,
      provided: tokenScopes,
    });
  }

  try {
    // Seed demo FGA tuples + vault entries on first call per user.
    const vaultSubject = {
      token: bearerToken,
      fallbackToken: await validatedNexusSubjectToken(req, payload),
    };
    await seedTuplesForUser(userSub, userEmail, tenant);
    await seedVaultForUser(userSub, tenant, vaultSubject);

    const result = await executeToolLogic(name, args, userSub, tenant, vaultSubject);
    console.log(`[MCP Server] Tool ${name} executed`);
    addLog({ tool: name, userSub, caller, args, result, status: "success" });
    res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (err) {
    console.error(`[MCP Server] Tool ${name} failed: ${err.message}`);
    addLog({ tool: name, userSub, caller, args, result: { error: err.message }, status: "error" });
    res.status(500).json({ error: err.message });
  }
});

// Tool execution. userSub is the user's Auth0 user id -- preserved through
// Nexus's OBO exchange, and the direct subject of Acme's login. Every FGA
// check and Token Vault call below keys off the user, not the agent.
async function executeToolLogic(name, args, userSub, tenant, vaultSubject) {
  switch (name) {
    case "search_documents": {
      const { query } = args;
      const lower = query.toLowerCase();
      // Filter corpus by keyword match, then FGA-filter by user access.
      // The FGA filter is the security layer: the agent only sees what
      // the user is authorized to read, regardless of the query.
      // Match on individual significant words, not the whole query
      // string -- a natural-language phrase like "everything we have
      // on the Q3 roadmap" should still hit a short doc title/snippet.
      const terms = lower
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !SEARCH_STOPWORDS.has(w));
      const matches = DOCUMENTS.filter((doc) => {
        const haystack = `${doc.title} ${doc.snippet} ${doc.department} ${doc.id}`.toLowerCase();
        return terms.length === 0 ? haystack.includes(lower) : terms.some((t) => haystack.includes(t));
      });
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
      let tokenResult;
      try {
        tokenResult = await getToken(userSub, "crm", tenant, vaultSubject);
      } catch (err) {
        if (err instanceof TokenVaultAccessDeniedError) {
          return {
            success: false,
            error: `Token Vault refused the CRM exchange: ${err.message}. Check that the CRM connection's Purpose includes Connected Accounts for Token Vault and that the user has connected their CRM account.`,
          };
        }
        throw err;
      }
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

    case "check_github_identity": {
      // Lab 04/05 (Token Vault) -- same getToken(userSub, provider, ...)
      // call as log_crm_activity, just against the built-in GitHub social
      // connection instead of the custom CRM OAuth2 one.
      let tokenResult;
      try {
        tokenResult = await getToken(userSub, "github", tenant, vaultSubject);
      } catch (err) {
        if (err instanceof TokenVaultAccessDeniedError) {
          return {
            success: false,
            error: `Token Vault refused the GitHub exchange: ${err.message}. Check that the GitHub connection's Purpose includes Connected Accounts for Token Vault and that the user has connected their GitHub account.`,
          };
        }
        throw err;
      }
      if (!tokenResult) {
        return {
          success: false,
          error: "No GitHub account linked. Ask the user to connect their GitHub account.",
        };
      }
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          "User-Agent": "nexus-devcamp",
        },
      });
      if (!response.ok) {
        return { success: false, error: `GitHub API error: ${response.statusText}` };
      }
      const data = await response.json();
      return { success: true, login: data.login, id: data.id };
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

// Anyone hitting this port directly in a browser (e.g. a mis-clicked
// Codespaces port-forward toast) gets a themed notice instead of a bare
// 404 -- the real app is Vite on 5173.
app.get(
  "*",
  wrongPortFallback(
    "Nexus MCP server",
    "This server exposes tools to the agent over a bearer-authenticated API."
  )
);

// express-oauth2-jwt-bearer sets err.status = 401 on auth failures.
// Per the MCP authorization spec (RFC 9728 §5.1), a 401 must point the
// client at this server's Protected Resource Metadata so it can discover
// the authorization server without any prior configuration.
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status === 401) {
    const parts = [`resource_metadata="${resourceMetadataUrl(req)}"`];
    // No credentials at all -> bare challenge; a bad token -> invalid_token.
    if (bearerFromHeader(req)) {
      parts.unshift('error="invalid_token"');
      parts.push(`error_description="${String(err.message || "invalid token").replace(/"/g, "'")}"`);
    }
    res.set("WWW-Authenticate", `Bearer ${parts.join(", ")}`);
  }
  res.status(status).json({ error: err.message || "Internal server error" });
});

export async function startMCPServer() {
  const preferredPort = parseInt(process.env.MCP_SERVER_PORT || "3001");
  const port = await findAvailablePort(preferredPort, "MCP Server");
  app.listen(port, () => {
    console.log(`[MCP Server] Running on http://localhost:${port}`);
    console.log(`[MCP Server] PRM: http://localhost:${port}/.well-known/oauth-protected-resource`);
    console.log(`[MCP Server] Resource identifier: ${mcpResource() || "(AUTH0_TOOL_AUDIENCE not set)"}`);
  });
}

export default app;
