// =============================================================
// MCP Server (Auth0-secured) -- Lab 05
//
// Every tool the Z-Merchant agent invokes passes through here.
// Auth0 secures the MCP server via:
//   - JWT validation (audience = MCP_AUTH0_AUDIENCE)
//   - Per-tool scope enforcement
//   - Protected Resource Metadata (RFC 9728) at /.well-known
//   - Authorization Server Metadata at /.well-known
//
// User identity is preserved via OBO token exchange (see
// ../mcp/client.ts). The sub claim in the incoming MCP token is
// the rep's user id, which is what the tool logic below uses for
// FGA checks and Token Vault lookups.
// =============================================================

import express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import { protectedResourceMetadata } from "./metadata";
import { findAvailablePort } from "../utils/port";
import {
  canReadAccount,
  canCommitQuote,
  getAccount,
  getCatalogEntry,
  seedTuplesForUser,
} from "../fga/client";
import { getToken, seedVaultForUser } from "../token-vault/vault";

const app = express();
app.use(express.json());

// OAuth 2.0 token validation -- audience enforcement means only
// tokens minted via OBO with resource=MCP_AUTH0_AUDIENCE are
// accepted (see ../mcp/client.ts).
const validateMCPToken = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  audience: process.env.MCP_AUTH0_AUDIENCE,
});

// RFC 9728: Protected Resource Metadata
app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);

// OAuth 2.0 Authorization Server Metadata
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    authorization_endpoint: `https://${process.env.AUTH0_DOMAIN}/authorize`,
    token_endpoint: `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    jwks_uri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    scopes_supported: [
      "mcp:quote:read",
      "mcp:docs:create",
      "mcp:slack:post",
      "mcp:quote:commit",
    ],
    grant_types_supported: [
      "urn:ietf:params:oauth:grant-type:token-exchange",
    ],
    client_registration_types_supported: ["metadata"],
  });
});

// ---- Tool catalog -------------------------------------------------

const TOOLS = [
  {
    name: "get_catalog_and_buyer_tier",
    description:
      "Look up catalog pricing for a SKU and the buyer tier for a wholesale account. FGA-gated by account ownership.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Wholesale account id, e.g. acme" },
        sku: { type: "string", description: "Catalog SKU, e.g. SKU-WX-42" },
      },
      required: ["accountId", "sku"],
    },
    requiredScope: "mcp:quote:read",
  },
  {
    name: "create_google_doc",
    description:
      "Create a Google Doc in the rep's Workspace. Uses Token Vault to mint a short-lived Google access token.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["title", "body"],
    },
    requiredScope: "mcp:docs:create",
  },
  {
    name: "post_slack_triage",
    description:
      "Post a summary to #wholesale-quote-triage in Slack. Uses Token Vault to mint a short-lived Slack token.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string" },
        summary: { type: "string" },
        docUrl: { type: "string" },
      },
      required: ["summary"],
    },
    requiredScope: "mcp:slack:post",
  },
  {
    name: "commit_quote_terms",
    description:
      "Commit final quote terms to the order system. CIBA-gated at the agent backend when discount > 20% or terms are non-standard.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        quoteId: { type: "string" },
        discountPercent: { type: "number" },
        paymentTerms: { type: "string" },
      },
      required: ["accountId", "quoteId", "discountPercent"],
    },
    requiredScope: "mcp:quote:commit",
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
  const payload = (req as any).auth?.payload || {};
  const userSub: string = payload.sub;
  const userEmail: string | undefined = payload.email;
  const tokenScopes: string[] = (payload.scope || "").split(" ").filter(Boolean);

  console.log(
    `[MCP Server] Tool call: ${name}, sub=${userSub}, scopes=${tokenScopes.join(",")}`
  );

  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return res.status(404).json({ error: `Unknown tool: ${name}` });
  }

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
    seedTuplesForUser(userSub, userEmail);
    seedVaultForUser(userSub);

    const result = await executeToolLogic(name, args, userSub);
    console.log(`[MCP Server] Tool ${name} executed`);
    res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (err: any) {
    console.error(`[MCP Server] Tool ${name} failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

async function executeToolLogic(name: string, args: any, userSub: string): Promise<any> {
  switch (name) {
    case "get_catalog_and_buyer_tier": {
      const { accountId, sku } = args;
      if (!canReadAccount(userSub, accountId)) {
        return {
          success: false,
          error: `Access denied: you do not own or manage account:${accountId}.`,
        };
      }
      const account = getAccount(accountId);
      const catalog = getCatalogEntry(sku);
      if (!account) return { success: false, error: `Account ${accountId} not found.` };
      if (!catalog) return { success: false, error: `SKU ${sku} not found.` };
      return {
        success: true,
        account: { id: accountId, ...account },
        sku: {
          id: sku,
          name: catalog.name,
          listPrice: catalog.listPrice,
          tierPrice: catalog.tierPrice[account.tier],
        },
      };
    }

    case "create_google_doc": {
      const { title, body } = args;
      const tokenResult = await getToken(userSub, "google");
      if (!tokenResult) {
        return {
          success: false,
          error: "No Google Workspace account linked for this rep.",
        };
      }
      const apiPort = process.env.THIRD_PARTY_API_PORT || "3002";
      const response = await fetch(`http://localhost:${apiPort}/google/docs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, body }),
      });
      if (!response.ok) {
        return { success: false, error: `Google Docs API error: ${response.statusText}` };
      }
      const data = await response.json();
      return { success: true, ...data };
    }

    case "post_slack_triage": {
      const channel = args.channel || "#wholesale-quote-triage";
      const { summary, docUrl } = args;
      const tokenResult = await getToken(userSub, "slack");
      if (!tokenResult) {
        return { success: false, error: "No Slack workspace linked for this rep." };
      }
      const text = docUrl ? `${summary}\n\nDoc: ${docUrl}` : summary;
      const apiPort = process.env.THIRD_PARTY_API_PORT || "3002";
      const response = await fetch(`http://localhost:${apiPort}/slack/chat.postMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel, text }),
      });
      if (!response.ok) {
        return { success: false, error: `Slack API error: ${response.statusText}` };
      }
      const data = await response.json();
      return { success: true, ...data };
    }

    case "commit_quote_terms": {
      const { accountId, quoteId, discountPercent, paymentTerms } = args;
      if (!canCommitQuote(userSub, accountId)) {
        return {
          success: false,
          error: `Access denied: you cannot commit quotes for account:${accountId}.`,
        };
      }
      return {
        success: true,
        committed: {
          accountId,
          quoteId,
          discountPercent,
          paymentTerms: paymentTerms || "net-30",
          committedAt: new Date().toISOString(),
          committedBy: userSub,
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

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
