import { createMCPClient } from "../mcp/client";

// =============================================================
// Tool Registry -- RetailZero Z-Merchant (B2B Wholesale Quote)
//
// The agent has four tools. Every tool is executed through the
// MCP server (see ../mcp/server.ts) so Auth0 can enforce audience,
// per-tool scope, and preserve user identity via OBO token
// exchange. CIBA is applied at this layer BEFORE the MCP call
// for high-risk tools.
//
// This ToolDefinition shape is framework-agnostic on purpose so
// ../llm.ts can swap the simulator/OpenAI path for the Claude
// Agent SDK without touching the MCP, Token Vault, FGA, or CIBA
// layers. See the FUTURE comment in ../llm.ts.
// =============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiredScopes: string[];
  riskLevel: "low" | "medium" | "high";
  requiresConsent: boolean;
}

// These tool definitions are pre-built so simulator.ts and llm.ts
// have a stable contract to dispatch against. The lab exercises
// wire up the security layers each tool depends on (FGA in Lab 03,
// Token Vault in Lab 04, MCP in Lab 05, CIBA in Lab 02).
export const toolRegistry: Record<string, ToolDefinition> = {
  get_catalog_and_buyer_tier: {
    name: "get_catalog_and_buyer_tier",
    description:
      "Look up catalog pricing for a SKU and the buyer tier for a wholesale account. FGA-gated: the rep can only read accounts they own or manage.",
    parameters: {
      accountId: { type: "string", required: true },
      sku: { type: "string", required: true },
    },
    requiredScopes: ["mcp:quote:read"],
    riskLevel: "low",
    requiresConsent: false,
  },

  create_google_doc: {
    name: "create_google_doc",
    description:
      "Create a Google Doc (bulk quote draft) in the rep's Google Workspace. Uses Token Vault to mint a short-lived Google access token.",
    parameters: {
      title: { type: "string", required: true },
      body: { type: "string", required: true },
    },
    requiredScopes: ["mcp:docs:create"],
    riskLevel: "medium",
    requiresConsent: false,
  },

  post_slack_triage: {
    name: "post_slack_triage",
    description:
      "Post a summary message to #wholesale-quote-triage in Slack. Uses Token Vault to mint a short-lived Slack token.",
    parameters: {
      channel: { type: "string", required: false },
      summary: { type: "string", required: true },
      docUrl: { type: "string", required: false },
    },
    requiredScopes: ["mcp:slack:post"],
    riskLevel: "medium",
    requiresConsent: false,
  },

  commit_quote_terms: {
    name: "commit_quote_terms",
    description:
      "Commit the final wholesale quote terms to the order system. Requires CIBA approval when the discount exceeds 20% or terms are non-standard.",
    parameters: {
      accountId: { type: "string", required: true },
      quoteId: { type: "string", required: true },
      discountPercent: { type: "number", required: true },
      paymentTerms: { type: "string", required: false },
    },
    requiredScopes: ["mcp:quote:commit"],
    riskLevel: "high",
    requiresConsent: true,
  },
};

export function getToolsForDisplay(): Array<{
  name: string;
  description: string;
}> {
  return Object.values(toolRegistry).map((t) => ({
    name: t.name,
    description: t.description,
  }));
}

// =============================================================
// LAB 05: route tool execution through MCP
//
// The finished implementation calls the MCP client, which:
//   1. Performs OBO token exchange with `resource=` audience param
//   2. Presents the exchanged token to the MCP server
//   3. The MCP server validates audience + per-tool scope
//
// Reference solution (after Lab 05 is complete):
//   const mcpClient = createMCPClient();
//   const result = await mcpClient.callTool(toolName, parameters, userAccessToken || "");
//   return result;
// =============================================================
const mcpClient = createMCPClient();

export async function executeTool(
  toolName: string,
  parameters: Record<string, any>,
  userAccessToken?: string
): Promise<any> {
  console.log(`[Tools] Executing via MCP: ${toolName}`, parameters);

  // TODO(lab-05): replace this with `await mcpClient.callTool(...)` once
  // the MCP client + server are implemented.
  void mcpClient;
  void userAccessToken;
  throw new Error(`Tool execution not implemented: ${toolName} (see Lab 05)`);
}
