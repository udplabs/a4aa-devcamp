// =============================================================
// LAB 05: Build the Auth0-secured MCP Server
// See: lab-guide/05-auth-for-mcp.md
//
// Every tool Z-Merchant invokes passes through here. Auth0 secures
// the MCP server via:
//   - JWT validation (audience = MCP_AUTH0_AUDIENCE)
//   - Per-tool scope enforcement
//   - Protected Resource Metadata (RFC 9728) at /.well-known
//   - Authorization Server Metadata at /.well-known
//
// User identity is preserved via OBO token exchange (see ./client.ts).
// The `sub` claim in the incoming MCP token is the rep's user id,
// which this file uses for FGA checks and Token Vault lookups.
// =============================================================

import express from "express";
import { findAvailablePort } from "../utils/port";
// TODO(lab-05): once the FGA client and Token Vault are in place,
// import them here and wire each tool handler to them:
// import { canReadAccount, canCommitQuote, getAccount, getCatalogEntry, seedTuplesForUser } from "../fga/client";
// import { getToken, seedVaultForUser } from "../token-vault/vault";

const app = express();
app.use(express.json());

// TODO(lab-05, Part E): add JWT validation middleware. Example:
//   import { auth } from "express-oauth2-jwt-bearer";
//   const validateMCPToken = auth({
//     issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
//     audience: process.env.MCP_AUTH0_AUDIENCE,
//   });

// TODO(lab-05, Part C): mount /.well-known/oauth-protected-resource
// app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);

// TODO(lab-05, Part D): mount /.well-known/oauth-authorization-server
// and return issuer, authorization_endpoint, token_endpoint, jwks_uri,
// scopes_supported, grant_types_supported, client_registration_types_supported.

// Pre-built: tool catalog (what MCP advertises over tools/list). The
// attendee wires up the handlers in executeToolLogic below.
const TOOLS = [
  {
    name: "get_catalog_and_buyer_tier",
    description:
      "Look up catalog pricing for a SKU and the buyer tier for a wholesale account. FGA-gated by account ownership.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        sku: { type: "string" },
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

// TODO(lab-05): protect this route with validateMCPToken.
app.get("/mcp/tools", (_req, res) => {
  res.json({ tools: TOOLS });
});

// TODO(lab-05): protect this route with validateMCPToken, then enforce
// per-tool scope on `payload.scope` before calling executeToolLogic.
app.post("/mcp/tools/call", async (req, res) => {
  const { name, arguments: args } = req.body;
  const payload = (req as any).auth?.payload || {};
  const userSub: string = payload.sub || "anonymous";

  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return res.status(404).json({ error: `Unknown tool: ${name}` });
  }

  try {
    const result = await executeToolLogic(name, args, userSub);
    res.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// TODO(lab-03 + lab-04 + lab-05): implement each case.
//   get_catalog_and_buyer_tier -> canReadAccount(userSub, accountId) then
//     return the account + SKU with tiered price.
//   create_google_doc          -> getToken(userSub, "google"), then POST
//     http://localhost:THIRD_PARTY_API_PORT/google/docs.
//   post_slack_triage          -> getToken(userSub, "slack"), then POST
//     http://localhost:THIRD_PARTY_API_PORT/slack/chat.postMessage.
//   commit_quote_terms         -> canCommitQuote(userSub, accountId) then
//     return { committed: { ... } }.
async function executeToolLogic(name: string, _args: any, _userSub: string): Promise<any> {
  throw new Error(`Tool ${name} not implemented (see Labs 03/04/05)`);
}

export async function startMCPServer() {
  const preferredPort = parseInt(process.env.MCP_SERVER_PORT || "3001");
  const port = await findAvailablePort(preferredPort, "MCP Server");
  app.listen(port, () => {
    console.log(`[MCP Server] Running on http://localhost:${port}`);
  });
}

export default app;
