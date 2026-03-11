// =============================================================
// LAB 2: Define tool permission levels (used by CIBA flow)
// LAB 3: Add document tools (FGA)
// LAB 4: Add external files tool (Token Vault)
// LAB 5: Replace local execution with MCP client calls
//
// Each tool has:
// - requiredScopes: what OAuth scopes the user/agent needs
// - riskLevel: low / medium / high
// - requiresConsent: whether the agent must ask the user first (triggers CIBA)
// =============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiredScopes: string[];
  riskLevel: "low" | "medium" | "high";
  requiresConsent: boolean;
}

// TODO: Fill in the tool registry with tool definitions
export const toolRegistry: Record<string, ToolDefinition> = {
  // TODO: Define get_weather (low risk, no consent)
  // TODO: Define get_calendar (medium risk, no consent)
  // TODO: Define send_email (high risk, requires consent → triggers CIBA)
  // TODO (Lab 3): Define get_document, list_documents
  // TODO (Lab 4): Define get_external_files
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
// LAB 5: Replace this with MCP client calls
// For now, tools execute locally
// =============================================================
export async function executeTool(
  toolName: string,
  parameters: Record<string, any>
): Promise<any> {
  console.log(`Executing tool: ${toolName}`, parameters);
  // This will be replaced with MCP client calls in Lab 5
  throw new Error(`Tool execution not implemented: ${toolName}`);
}
