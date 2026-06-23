import { createMCPClient } from "../mcp/client.js";

// =============================================================
// Tool Registry -- Nexus (Company Knowledge Assistant)
//
// The agent has four tools. Every tool is executed through the
// MCP server (see ../mcp/server.js) so Auth0 can enforce audience,
// per-tool scope, and preserve user identity via OBO token
// exchange. CIBA is applied at this layer BEFORE the MCP call
// for high-risk tools -- see ../middleware/agent-auth.js.
//
// This tool shape is framework-agnostic on purpose so
// ../llm.js can swap the simulator/OpenAI path for the Claude
// Agent SDK without touching the MCP, Token Vault, FGA, or CIBA
// layers. See the FUTURE comment in ../llm.js.
// =============================================================

export const toolRegistry = {
  search_documents: {
    name: "search_documents",
    description:
      "Search the company knowledge base. Returns only documents the authenticated user is authorized to read. FGA-gated: confidential documents are filtered out for unauthorized users.",
    parameters: {
      query: { type: "string", required: true },
    },
    requiredScopes: ["mcp:docs:search"],
    riskLevel: "low",
    requiresConsent: false,
  },

  get_document: {
    name: "get_document",
    description:
      "Retrieve the full content of a specific document by ID. FGA-gated: returns an access denied error if the user does not have read permission.",
    parameters: {
      documentId: { type: "string", required: true },
    },
    requiredScopes: ["mcp:docs:read"],
    riskLevel: "low",
    requiresConsent: false,
  },

  log_crm_activity: {
    name: "log_crm_activity",
    description:
      "Log a document activity event to the connected CRM. Uses Token Vault to mint a short-lived CRM credential scoped to this user — the activity record shows the user, not a shared service account.",
    parameters: {
      action:        { type: "string", required: true },
      documentId:    { type: "string", required: true },
      documentTitle: { type: "string", required: false },
      notes:         { type: "string", required: false },
    },
    requiredScopes: ["mcp:crm:log"],
    riskLevel: "medium",
    requiresConsent: false,
  },

  share_document: {
    name: "share_document",
    description:
      "Share a document with an external recipient. Requires CIBA approval on the user's device — external sharing is irreversible and subject to data policy.",
    parameters: {
      documentId:     { type: "string", required: true },
      documentTitle:  { type: "string", required: false },
      recipientEmail: { type: "string", required: true },
    },
    requiredScopes: ["mcp:docs:share"],
    riskLevel: "high",
    requiresConsent: true,
  },
};

export function getToolsForDisplay() {
  return Object.values(toolRegistry).map((t) => ({
    name: t.name,
    description: t.description,
  }));
}

const mcpClient = createMCPClient();

export async function executeTool(toolName, parameters, userAccessToken) {
  console.log(`[Tools] Executing via MCP: ${toolName}`, parameters);

  try {
    const result = await mcpClient.callTool(toolName, parameters, userAccessToken || "");
    console.log(`[Tools] MCP result:`, result);
    return result;
  } catch (error) {
    console.error(`[Tools] MCP execution failed: ${error.message}`);
    throw error;
  }
}
