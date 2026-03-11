// =============================================================
// LAB 3: Define tool permission levels
// See: lab-guide/03-protect-the-api.md - Step 1
//
// Each tool has:
// - requiredScopes: what OAuth scopes the user/agent needs
// - riskLevel: low / medium / high
// - requiresConsent: whether the agent must ask the user first
// =============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiredScopes: string[];
  riskLevel: "low" | "medium" | "high";
  requiresConsent: boolean;
}

// LAB 3: Fill in the tool registry
export const toolRegistry: Record<string, ToolDefinition> = {
  // TODO: Define get_weather (low risk, no consent)
  // TODO: Define get_calendar (medium risk, no consent)
  // TODO: Define send_email (high risk, requires consent)
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
// LAB 4: Replace this with MCP client calls
// For now, tools execute locally
// =============================================================
export async function executeTool(
  toolName: string,
  parameters: Record<string, any>
): Promise<any> {
  console.log(`Executing tool: ${toolName}`, parameters);
  // This will be replaced with MCP client calls in Lab 4
  throw new Error(`Tool execution not implemented: ${toolName}`);
}
